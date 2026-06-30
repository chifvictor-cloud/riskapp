-- migration_v12.sql — CAPA 3B: conectar resolve_bets al flujo de resultado
-- NO ejecutar directamente — revisar antes de aplicar en Supabase.
--
-- Problema resuelto:
--   resolve_bets (v10) exige que el llamador sea admin.
--   submit_match_result lo llaman jugadores normales → falla.
--
-- Solución: extraer la lógica de reparto a resolve_bets_internal (sin check de
-- admin). Las funciones SECURITY DEFINER que ya validaron al ganador la llaman
-- directamente. resolve_bets pública conserva el check de admin y delega en ella.
--
-- Cambios en este archivo:
--   1. CREATE resolve_bets_internal   — lógica pura, sin check de admin
--   2. REPLACE resolve_bets           — solo verifica admin, luego delega
--   3. REPLACE submit_match_result    — agrega PERFORM resolve_bets_internal
--                                       tras el UPDATE status='completed'
--   4. REPLACE admin_resolve_dispute  — agrega PERFORM resolve_bets_internal
--                                       tras el UPDATE status='completed'


-- ── 1. resolve_bets_internal ──────────────────────────────────────────────────
-- Toda la lógica de reparto pari-mutuel sin check de admin.
-- Solo la invocan funciones SECURITY DEFINER que ya garantizaron la legitimidad
-- del ganador (submit_match_result, admin_resolve_dispute, resolve_bets).
-- Se conserva la validación de que p_winner_id pertenece al match como
-- guardia de integridad de datos.

CREATE OR REPLACE FUNCTION resolve_bets_internal(p_match_id uuid, p_winner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total_pot         int;
  v_winner_bets_total int;
  v_winner_pot        int;
BEGIN
  -- Guardia: p_winner_id debe ser jugador del match
  IF NOT EXISTS (
    SELECT 1 FROM matches
    WHERE id = p_match_id
      AND (player1_id = p_winner_id OR player2_id = p_winner_id)
  ) THEN
    RAISE EXCEPTION 'invalid_match_or_winner';
  END IF;

  -- Pozo total de apuestas abiertas
  SELECT COALESCE(SUM(amount), 0) INTO v_total_pot
  FROM match_bets WHERE match_id = p_match_id AND status = 'open';

  -- Sin apuestas → nada que liquidar (idempotente)
  IF v_total_pot = 0 THEN
    RETURN jsonb_build_object('success', true, 'pot', 0, 'settled', 0);
  END IF;

  -- Total apostado al ganador
  SELECT COALESCE(SUM(amount), 0) INTO v_winner_bets_total
  FROM match_bets
  WHERE match_id = p_match_id AND status = 'open' AND bet_on = p_winner_id;

  -- ── CASO: nadie apostó al ganador → devolver todo ──────────────────────────
  IF v_winner_bets_total = 0 THEN
    UPDATE profiles p
    SET    points = p.points + mb.amount
    FROM   match_bets mb
    WHERE  mb.match_id = p_match_id
      AND  mb.status   = 'open'
      AND  mb.user_id  = p.id;

    UPDATE match_bets
    SET    status = 'refunded', payout = amount
    WHERE  match_id = p_match_id AND status = 'open';

    RETURN jsonb_build_object(
      'success', true,
      'result',  'refunded_no_winner_bets',
      'pot',     v_total_pot
    );
  END IF;

  -- ── CASO NORMAL: repartir pozo ─────────────────────────────────────────────
  -- Pozo neto tras rake 5% (floor integer division → dust queda en plataforma)
  v_winner_pot := v_total_pot - (v_total_pot * 5 / 100);

  -- Pagar ganadores: payout_i = floor(amount_i * winner_pot / winner_bets_total)
  UPDATE profiles p
  SET    points = p.points + (mb.amount * v_winner_pot / v_winner_bets_total)
  FROM   match_bets mb
  WHERE  mb.match_id = p_match_id
    AND  mb.status   = 'open'
    AND  mb.bet_on   = p_winner_id
    AND  mb.user_id  = p.id;

  UPDATE match_bets
  SET    status = 'won',
         payout = (amount * v_winner_pot / v_winner_bets_total)
  WHERE  match_id = p_match_id AND status = 'open' AND bet_on = p_winner_id;

  -- Marcar perdedores (los que quedan en 'open')
  UPDATE match_bets
  SET    status = 'lost', payout = 0
  WHERE  match_id = p_match_id AND status = 'open';

  RETURN jsonb_build_object(
    'success',           true,
    'pot',               v_total_pot,
    'rake',              v_total_pot * 5 / 100,
    'winner_pot',        v_winner_pot,
    'winner_bets_total', v_winner_bets_total
  );
END;
$$;


-- ── 2. resolve_bets (wrapper público) ────────────────────────────────────────
-- Sin cambios en la firma ni en el comportamiento observable.
-- ÚNICO cambio: la lógica de reparto se mueve a resolve_bets_internal;
-- esta función ahora solo verifica admin y delega.

CREATE OR REPLACE FUNCTION resolve_bets(p_match_id uuid, p_winner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  -- Solo admins pueden invocar esta función directamente
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN resolve_bets_internal(p_match_id, p_winner_id);
END;
$$;


-- ── 3. submit_match_result ────────────────────────────────────────────────────
-- ÚNICO CAMBIO respecto a v5: línea marcada con "← CAPA 3B".
-- Se agrega PERFORM resolve_bets_internal(...) inmediatamente después del UPDATE
-- que fija status='completed' y winner_id, antes de pagar el prize_pool.
-- Orden deliberado: las apuestas se liquidan ANTES de acreditar el premio del
-- torneo, así ambas operaciones quedan en la misma transacción atómica.

CREATE OR REPLACE FUNCTION public.submit_match_result(
  p_match_id         uuid,
  p_claimed_winner   uuid,
  p_screenshot_url   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id           uuid;
  v_match             matches%ROWTYPE;
  v_other_claim       uuid;
  v_agreed_winner_id  uuid;
  v_loser_id          uuid;
  v_prize_pool        numeric;
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

    UPDATE matches
    SET status    = 'completed',
        winner_id = v_agreed_winner_id,
        played_at = now()
    WHERE id = p_match_id;

    PERFORM resolve_bets_internal(p_match_id, v_agreed_winner_id); -- ← CAPA 3B

    UPDATE profiles
    SET balance        = balance + v_prize_pool,
        total_earnings = total_earnings + v_prize_pool,
        wins           = wins + 1,
        points         = points + 10
    WHERE id = v_agreed_winner_id;

    UPDATE profiles
    SET losses = losses + 1,
        points = points + 2
    WHERE id = v_loser_id;

    INSERT INTO transactions (user_id, type, amount, status, reference_id, description)
    VALUES (v_agreed_winner_id, 'prize', v_prize_pool, 'completed', v_match.tournament_id, 'Premio ganado');

    UPDATE tournaments
    SET status    = 'completed',
        winner_id = v_agreed_winner_id
    WHERE id = v_match.tournament_id;

    UPDATE tournament_participants
    SET status = 'winner' WHERE tournament_id = v_match.tournament_id AND player_id = v_agreed_winner_id;
    UPDATE tournament_participants
    SET status = 'eliminated' WHERE tournament_id = v_match.tournament_id AND player_id = v_loser_id;

    RETURN jsonb_build_object('success', true, 'result_status', 'completed', 'winner_id', v_agreed_winner_id);
  ELSE
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    RETURN jsonb_build_object('success', true, 'result_status', 'disputed');
  END IF;
END;
$$;


-- ── 4. admin_resolve_dispute ──────────────────────────────────────────────────
-- ÚNICO CAMBIO respecto a v5: línea marcada con "← CAPA 3B".
-- Las apuestas que quedaron 'open' durante la disputa se liquidan aquí,
-- en la misma transacción en que el admin decide el ganador.

CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(
  p_match_id  uuid,
  p_winner_id uuid,
  p_note      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id    uuid;
  v_is_admin   boolean;
  v_match      matches%ROWTYPE;
  v_loser_id   uuid;
  v_prize_pool numeric;
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
  SET balance        = balance + v_prize_pool,
      total_earnings = total_earnings + v_prize_pool,
      wins           = wins + 1,
      points         = points + 10
  WHERE id = p_winner_id;

  UPDATE profiles
  SET losses = losses + 1,
      points = points + 2
  WHERE id = v_loser_id;

  INSERT INTO transactions (user_id, type, amount, status, reference_id, description)
  VALUES (p_winner_id, 'prize', v_prize_pool, 'completed', v_match.tournament_id, 'Premio (resuelto por admin)');

  UPDATE tournaments
  SET status    = 'completed',
      winner_id = p_winner_id
  WHERE id = v_match.tournament_id;

  UPDATE tournament_participants
  SET status = 'winner' WHERE tournament_id = v_match.tournament_id AND player_id = p_winner_id;
  UPDATE tournament_participants
  SET status = 'eliminated' WHERE tournament_id = v_match.tournament_id AND player_id = v_loser_id;

  RETURN jsonb_build_object('success', true, 'winner_id', p_winner_id, 'prize', v_prize_pool);
END;
$$;
