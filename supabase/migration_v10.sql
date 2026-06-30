-- migration_v10.sql — Sistema de apuestas pari-mutuel (CAPA 1: esquema + funciones)
-- NO ejecutar directamente — revisar antes de aplicar en Supabase.

-- ── TABLA match_bets ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS match_bets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   uuid        NOT NULL REFERENCES matches(id)  ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  bet_on     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount     int         NOT NULL CHECK (amount BETWEEN 10 AND 1000),
  status     text        NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open', 'won', 'lost', 'refunded')),
  payout     int         NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id)
);

-- Índices para las lecturas batch en resolve/refund
CREATE INDEX IF NOT EXISTS match_bets_match_status_idx ON match_bets (match_id, status);
CREATE INDEX IF NOT EXISTS match_bets_match_bet_on_idx  ON match_bets (match_id, bet_on);

ALTER TABLE match_bets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'match_bets' AND policyname = 'match_bets_read'
  ) THEN
    -- Cualquiera puede ver el pozo y quién apostó a quién (datos públicos)
    CREATE POLICY match_bets_read ON match_bets FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'match_bets' AND policyname = 'match_bets_own'
  ) THEN
    -- El usuario solo puede insertar/modificar sus propias apuestas
    -- (en la práctica solo place_bet/resolve_bets/refund_bets, que son SECURITY DEFINER)
    CREATE POLICY match_bets_own ON match_bets FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE match_bets;
EXCEPTION WHEN others THEN NULL; END $$;


-- ── FUNCTION: place_bet ───────────────────────────────────────────────────────
-- Descuenta puntos del usuario e inserta la apuesta, todo atómico.
-- Validaciones: amount [10,1000], match en 'pending', no apuesta duplicada,
--               bet_on es uno de los dos jugadores, puntos suficientes.
--
-- NOTA CAPA 2: actualmente join_tournament crea matches directamente en
-- 'in_progress'. Para que exista una ventana de apuestas, el flujo de
-- matchmaking deberá crear el match en 'pending' y transicionar a
-- 'in_progress' cuando ambos jugadores confirmen que están listos.

CREATE OR REPLACE FUNCTION place_bet(
  p_match_id uuid,
  p_bet_on   uuid,
  p_amount   int
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_match   matches%ROWTYPE;
  v_points  int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Rango de apuesta (también lo garantiza el CHECK, pero da mejor mensaje)
  IF p_amount < 10 OR p_amount > 1000 THEN
    RETURN jsonb_build_object('error', 'invalid_amount');
  END IF;

  -- Bloquear fila del match para atomicidad
  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'match_not_found');
  END IF;

  -- Solo se puede apostar antes de que empiece
  IF v_match.status != 'pending' THEN
    RETURN jsonb_build_object('error', 'match_already_started');
  END IF;

  -- El jugador apostado debe ser participante del match
  IF p_bet_on != v_match.player1_id AND p_bet_on != v_match.player2_id THEN
    RETURN jsonb_build_object('error', 'invalid_bet_target');
  END IF;

  -- Una sola apuesta por usuario por match (refuerza el UNIQUE, mejor error)
  IF EXISTS (
    SELECT 1 FROM match_bets WHERE match_id = p_match_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'already_bet');
  END IF;

  -- Verificar puntos disponibles (FOR UPDATE para evitar race condition)
  SELECT points INTO v_points FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_points < p_amount THEN
    RETURN jsonb_build_object('error', 'insufficient_points');
  END IF;

  -- Descontar puntos e insertar apuesta
  UPDATE profiles SET points = points - p_amount WHERE id = v_user_id;

  INSERT INTO match_bets (match_id, user_id, bet_on, amount)
  VALUES (p_match_id, v_user_id, p_bet_on, p_amount);

  RETURN jsonb_build_object('success', true);
END;
$$;


-- ── FUNCTION: resolve_bets ────────────────────────────────────────────────────
-- Calcula el pozo pari-mutuel, aplica rake 5%, reparte el 95% restante
-- entre quienes apostaron al ganador en proporción a su amount (floor).
-- El "dust" del redondeo queda en la plataforma.
-- Caso especial: si nadie apostó al ganador → devuelve todo (refund total).
-- Idempotente: si no hay bets 'open' en el match, retorna sin hacer nada.

CREATE OR REPLACE FUNCTION resolve_bets(p_match_id uuid, p_winner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_admin          boolean;
  v_total_pot         int;
  v_winner_bets_total int;
  v_winner_pot        int;
BEGIN
  -- Solo admins pueden liquidar apuestas
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- El winner_id debe ser jugador del match
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

  -- Sin apuestas → no hay nada que liquidar
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


-- ── FUNCTION: refund_bets ─────────────────────────────────────────────────────
-- Para cancelaciones o disputas: devuelve el amount original a cada apostador
-- y marca todas las bets del match como 'refunded'. Operación batch, atómica.
-- Idempotente: si no hay bets 'open', retorna count=0 sin error.

CREATE OR REPLACE FUNCTION refund_bets(p_match_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_admin boolean;
  v_count    int;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  -- Contar antes de modificar para el resultado
  SELECT COUNT(*) INTO v_count
  FROM match_bets WHERE match_id = p_match_id AND status = 'open';

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'refunded_count', 0);
  END IF;

  -- Devolver puntos en batch
  UPDATE profiles p
  SET    points = p.points + mb.amount
  FROM   match_bets mb
  WHERE  mb.match_id = p_match_id
    AND  mb.status   = 'open'
    AND  mb.user_id  = p.id;

  -- Marcar como refunded
  UPDATE match_bets
  SET    status = 'refunded', payout = amount
  WHERE  match_id = p_match_id AND status = 'open';

  RETURN jsonb_build_object('success', true, 'refunded_count', v_count);
END;
$$;
