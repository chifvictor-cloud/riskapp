-- migration_v21.sql — Rake del 10% en premios de torneos 1v1
-- ═══════════════════════════════════════════════════════════════════════════
-- HOY: submit_match_result y admin_resolve_dispute pagan el 100% del
-- prize_pool al ganador → la plataforma no retiene nada.
--
-- DISEÑO:
--   • El rake se toma AL PAGAR, no al crear el torneo. prize_pool sigue
--     siendo el bruto (entry × 2); no se toca cómo se cobra el entry.
--   • winner_payout = prize_pool − rake_amount
--     rake_amount   = trunc(prize_pool × pct, 2)  ← redondeo HACIA ABAJO:
--     el centavo del redondeo va AL GANADOR. Invariante por construcción:
--     winner_payout + rake_amount = prize_pool (nunca se pierden centavos).
--   • El % vive en UNA sola fuente: app_config['tournament_rake_pct'].
--     Cambiarlo = un UPDATE, sin redeploy:
--       UPDATE app_config SET value = 0.08, updated_at = now()
--       WHERE key = 'tournament_rake_pct';
--   • Rastro contable: transaction type 'rake' (nuevo en el CHECK de
--     transactions.type). Va a nombre del GANADOR porque user_id es NOT NULL
--     y porque contablemente es dinero retenido de SU premio bruto:
--       ledger del ganador:  prize (neto) + rake (retenido) = prize_pool
--       ganancia de RISK:    SELECT sum(amount) FROM transactions
--                            WHERE type = 'rake' AND status = 'completed';
--     El historial de /profile filtra .in('type', [...]) → la fila 'rake'
--     NO aparece en la UI actual; solo la ve el admin (policy v9).
--   • Aplica en AMBOS caminos de pago: submit_match_result (doble
--     confirmación) y admin_resolve_dispute (disputa). Verificado que no
--     existe un tercer camino (el split de sponsor 60/40 es solo texto en
--     la UI, ninguna función SQL paga premio).
--
-- NOTA search_path: v18 fijó `SET search_path TO 'public'` vía ALTER
-- FUNCTION en ambas funciones. CREATE OR REPLACE borra ese proconfig, así
-- que aquí va INLINE en la definición (además cierra el ⚠️ H2 de v17).
-- Los grants existentes (EXECUTE a authenticated) sí sobreviven al REPLACE.
--
-- Idempotente: re-correrla no duplica nada ni pisa el % si Victor ya lo
-- cambió (el seed usa ON CONFLICT DO NOTHING).
-- Envuelto en transacción: si algo falla, no aplica nada.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. Tabla de configuración — fuente única del %
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.app_config (
  key         text PRIMARY KEY,
  value       numeric NOT NULL,
  description text,
  updated_at  timestamptz DEFAULT now() NOT NULL
);

-- Solo lectura/escritura desde SQL Editor o funciones SECURITY DEFINER:
-- RLS activo sin policies + sin grants a clientes.
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_config FROM public, anon, authenticated;

INSERT INTO public.app_config (key, value, description)
VALUES ('tournament_rake_pct', 0.10,
        'Fracción del prize_pool que retiene RISK al pagar un torneo 1v1. Rango válido: [0, 1). Cambiar con UPDATE, sin redeploy.')
ON CONFLICT (key) DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. Helper interno — lee y valida el % (falla CERRADO: si la config está
--    rota, el pago se aborta completo en vez de pagar mal)
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_tournament_rake_pct()
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pct numeric;
BEGIN
  SELECT value INTO v_pct FROM app_config WHERE key = 'tournament_rake_pct';
  IF v_pct IS NULL THEN
    RAISE EXCEPTION 'rake_config_missing: falta app_config[tournament_rake_pct]';
  END IF;
  IF v_pct < 0 OR v_pct >= 1 THEN
    RAISE EXCEPTION 'rake_config_invalid: tournament_rake_pct=% fuera de [0,1)', v_pct;
  END IF;
  RETURN v_pct;
END;
$function$;

-- Interno: nadie lo llama vía rpc(). Dentro de las funciones SECURITY
-- DEFINER corre como owner, que sí tiene EXECUTE.
REVOKE EXECUTE ON FUNCTION public.get_tournament_rake_pct() FROM public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 3. Ampliar el CHECK de transactions.type con 'rake'
--    Se busca el constraint por su DEFINICIÓN (contiene 'deposit'), no por
--    nombre, por si en la DB viva no se llama transactions_type_check.
--    Si la DB viva tuviera tipos extra que este CHECK no lista, el ADD
--    CONSTRAINT falla al validar filas existentes y el BEGIN revierte todo.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_conname text;
BEGIN
  FOR v_conname IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.transactions'::regclass
      AND contype  = 'c'
      AND pg_get_constraintdef(oid) LIKE '%''deposit''%'
  LOOP
    EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', v_conname);
  END LOOP;

  ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_type_check
    CHECK (type IN ('deposit', 'withdrawal', 'entry_fee', 'prize', 'refund', 'rake'));
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 4. submit_match_result — camino normal (doble confirmación)
--    Cambia SOLO la rama de acuerdo: rake antes de acreditar; balance,
--    total_earnings y la transaction 'prize' pasan a NETO; se agrega la
--    transaction 'rake'; el jsonb de retorno desglosa los montos.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.submit_match_result(p_match_id uuid, p_claimed_winner uuid, p_screenshot_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id           uuid;
  v_match             matches%ROWTYPE;
  v_other_claim       uuid;
  v_agreed_winner_id  uuid;
  v_loser_id          uuid;
  v_prize_pool        numeric;
  v_rake_pct          numeric;
  v_rake_amount       numeric;
  v_winner_payout     numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'match_not_found');
  END IF;

  IF v_match.status != 'in_progress' THEN
    RETURN jsonb_build_object('error', 'match_not_active');
  END IF;

  IF v_user_id != v_match.player1_id AND v_user_id != v_match.player2_id THEN
    RETURN jsonb_build_object('error', 'not_a_participant');
  END IF;

  IF p_claimed_winner != v_match.player1_id AND p_claimed_winner != v_match.player2_id THEN
    RETURN jsonb_build_object('error', 'invalid_winner');
  END IF;

  -- Save this player's claim
  IF v_user_id = v_match.player1_id THEN
    IF v_match.player1_claimed_winner IS NOT NULL THEN
      RETURN jsonb_build_object('error', 'already_reported');
    END IF;
    UPDATE matches
    SET player1_claimed_winner = p_claimed_winner,
        player1_screenshot_url = p_screenshot_url
    WHERE id = p_match_id;
    v_other_claim := v_match.player2_claimed_winner;
  ELSE
    IF v_match.player2_claimed_winner IS NOT NULL THEN
      RETURN jsonb_build_object('error', 'already_reported');
    END IF;
    UPDATE matches
    SET player2_claimed_winner = p_claimed_winner,
        player2_screenshot_url = p_screenshot_url
    WHERE id = p_match_id;
    v_other_claim := v_match.player1_claimed_winner;
  END IF;

  IF v_other_claim IS NULL THEN
    RETURN jsonb_build_object('success', true, 'result_status', 'pending_opponent');
  END IF;

  -- Both reported — check if they agree
  IF v_other_claim = p_claimed_winner THEN
    v_agreed_winner_id := p_claimed_winner;
    v_loser_id := CASE WHEN v_agreed_winner_id = v_match.player1_id
                       THEN v_match.player2_id ELSE v_match.player1_id END;

    SELECT prize_pool INTO v_prize_pool FROM tournaments WHERE id = v_match.tournament_id;

    -- Rake: trunc → el centavo del redondeo va al ganador.
    -- Invariante: v_winner_payout + v_rake_amount = v_prize_pool.
    v_rake_pct      := get_tournament_rake_pct();
    v_rake_amount   := trunc(v_prize_pool * v_rake_pct, 2);
    v_winner_payout := v_prize_pool - v_rake_amount;

    UPDATE matches
    SET status    = 'completed',
        winner_id = v_agreed_winner_id,
        played_at = now()
    WHERE id = p_match_id;

    PERFORM resolve_bets_internal(p_match_id, v_agreed_winner_id); -- ← CAPA 3B

    UPDATE profiles
    SET balance        = balance + v_winner_payout,
        total_earnings = total_earnings + v_winner_payout,
        wins           = wins + 1,
        points         = points + 10
    WHERE id = v_agreed_winner_id;

    UPDATE profiles
    SET losses = losses + 1,
        points = points + 2
    WHERE id = v_loser_id;

    INSERT INTO transactions (user_id, type, amount, status, reference_id, description)
    VALUES (v_agreed_winner_id, 'prize', v_winner_payout, 'completed', v_match.tournament_id,
            'Premio ganado (neto de comisión)');

    IF v_rake_amount > 0 THEN
      INSERT INTO transactions (user_id, type, amount, status, reference_id, description)
      VALUES (v_agreed_winner_id, 'rake', v_rake_amount, 'completed', v_match.tournament_id,
              'Comisión de plataforma sobre premio de torneo');
    END IF;

    UPDATE tournaments
    SET status    = 'completed',
        winner_id = v_agreed_winner_id
    WHERE id = v_match.tournament_id;

    UPDATE tournament_participants
    SET status = 'winner' WHERE tournament_id = v_match.tournament_id AND player_id = v_agreed_winner_id;
    UPDATE tournament_participants
    SET status = 'eliminated' WHERE tournament_id = v_match.tournament_id AND player_id = v_loser_id;

    RETURN jsonb_build_object('success', true, 'result_status', 'completed',
                              'winner_id', v_agreed_winner_id,
                              'prize_pool', v_prize_pool,
                              'winner_payout', v_winner_payout,
                              'rake_amount', v_rake_amount);
  ELSE
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    RETURN jsonb_build_object('success', true, 'result_status', 'disputed');
  END IF;
END;
$function$;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. admin_resolve_dispute — camino por disputa. Mismos cambios de rake.
--    El jsonb de retorno conserva la llave 'prize' (la lee
--    src/app/admin/actions.ts) pero ahora es el NETO pagado al ganador.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(p_match_id uuid, p_winner_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id       uuid;
  v_is_admin      boolean;
  v_match         matches%ROWTYPE;
  v_loser_id      uuid;
  v_prize_pool    numeric;
  v_rake_pct      numeric;
  v_rake_amount   numeric;
  v_winner_payout numeric;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = v_user_id;
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'not_authorized');
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'match_not_found');
  END IF;

  IF v_match.status != 'disputed' THEN
    RETURN jsonb_build_object('error', 'match_not_disputed');
  END IF;

  IF p_winner_id != v_match.player1_id AND p_winner_id != v_match.player2_id THEN
    RETURN jsonb_build_object('error', 'invalid_winner');
  END IF;

  v_loser_id := CASE WHEN p_winner_id = v_match.player1_id
                     THEN v_match.player2_id ELSE v_match.player1_id END;

  SELECT prize_pool INTO v_prize_pool FROM tournaments WHERE id = v_match.tournament_id;

  -- Rake: trunc → el centavo del redondeo va al ganador.
  -- Invariante: v_winner_payout + v_rake_amount = v_prize_pool.
  v_rake_pct      := get_tournament_rake_pct();
  v_rake_amount   := trunc(v_prize_pool * v_rake_pct, 2);
  v_winner_payout := v_prize_pool - v_rake_amount;

  UPDATE matches
  SET status      = 'completed',
      winner_id   = p_winner_id,
      admin_note  = p_note,
      resolved_by = v_user_id,
      resolved_at = now(),
      played_at   = now()
  WHERE id = p_match_id;

  PERFORM resolve_bets_internal(p_match_id, p_winner_id); -- ← CAPA 3B

  UPDATE profiles
  SET balance        = balance + v_winner_payout,
      total_earnings = total_earnings + v_winner_payout,
      wins           = wins + 1,
      points         = points + 10
  WHERE id = p_winner_id;

  UPDATE profiles
  SET losses = losses + 1,
      points = points + 2
  WHERE id = v_loser_id;

  INSERT INTO transactions (user_id, type, amount, status, reference_id, description)
  VALUES (p_winner_id, 'prize', v_winner_payout, 'completed', v_match.tournament_id,
          'Premio (resuelto por admin, neto de comisión)');

  IF v_rake_amount > 0 THEN
    INSERT INTO transactions (user_id, type, amount, status, reference_id, description)
    VALUES (p_winner_id, 'rake', v_rake_amount, 'completed', v_match.tournament_id,
            'Comisión de plataforma sobre premio de torneo (disputa)');
  END IF;

  UPDATE tournaments
  SET status    = 'completed',
      winner_id = p_winner_id
  WHERE id = v_match.tournament_id;

  UPDATE tournament_participants
  SET status = 'winner' WHERE tournament_id = v_match.tournament_id AND player_id = p_winner_id;
  UPDATE tournament_participants
  SET status = 'eliminated' WHERE tournament_id = v_match.tournament_id AND player_id = v_loser_id;

  RETURN jsonb_build_object('success', true, 'winner_id', p_winner_id,
                            'prize', v_winner_payout,
                            'prize_pool', v_prize_pool,
                            'winner_payout', v_winner_payout,
                            'rake_amount', v_rake_amount);
END;
$function$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-APLICACIÓN (opcional, correr por separado tras el COMMIT):
--
--   -- 1. Config sembrada en 0.10:
--   SELECT * FROM app_config WHERE key = 'tournament_rake_pct';
--
--   -- 2. CHECK incluye 'rake':
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.transactions'::regclass
--     AND conname = 'transactions_type_check';
--
--   -- 3. search_path fijado en las 3 funciones (debe listar search_path=public):
--   SELECT proname, proconfig FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('submit_match_result','admin_resolve_dispute','get_tournament_rake_pct');
--
--   -- 4. Helper NO ejecutable por clientes (debe dar false, false):
--   SELECT has_function_privilege('anon', 'public.get_tournament_rake_pct()', 'execute'),
--          has_function_privilege('authenticated', 'public.get_tournament_rake_pct()', 'execute');
--
--   -- 5. Tras el primer match pagado, el invariante contable:
--   SELECT t.reference_id AS tournament_id,
--          sum(amount) FILTER (WHERE type = 'prize') AS payout,
--          sum(amount) FILTER (WHERE type = 'rake')  AS rake,
--          (SELECT prize_pool FROM tournaments tt WHERE tt.id = t.reference_id) AS pot
--   FROM transactions t
--   WHERE type IN ('prize', 'rake')
--   GROUP BY t.reference_id;
--
--   -- Ganancia acumulada de RISK:
--   SELECT coalesce(sum(amount), 0) AS ganancia_risk
--   FROM transactions WHERE type = 'rake' AND status = 'completed';
-- ═══════════════════════════════════════════════════════════════════════════
