-- migration_v11.sql — CAPA 2: ventana de apuestas con temporizador (90 seg)
-- NO ejecutar directamente — revisar antes de aplicar en Supabase.
--
-- Cambios:
--   1. Agrega betting_closes_at a matches.
--   2. join_tournament setea betting_closes_at = now() + 90s al crear el match.
--   3. place_bet valida por tiempo (now() < betting_closes_at) en lugar de status.
--      El match sigue naciendo en 'in_progress' — el matchmaking no cambia.

-- ── 1. NUEVA COLUMNA ──────────────────────────────────────────────────────────

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS betting_closes_at timestamptz;

-- ── 2. join_tournament — solo cambia el INSERT del match ──────────────────────
-- Copia exacta de migration_v4.sql excepto la línea 163-165:
--   ANTES: INSERT INTO matches (tournament_id, player1_id, player2_id, status)
--          VALUES (p_tournament_id, v_player1_id, v_user_id, 'in_progress')
--   AHORA: añade betting_closes_at = now() + interval '90 seconds'

CREATE OR REPLACE FUNCTION public.join_tournament(
  p_tournament_id uuid,
  p_epic_username text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tournament    tournaments%ROWTYPE;
  v_user_id       uuid;
  v_match_id      uuid;
  v_player1_id    uuid;
  v_player1_epic  text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'tournament_not_found');
  END IF;

  IF v_tournament.status != 'open' THEN
    RETURN jsonb_build_object('error', 'tournament_not_open');
  END IF;

  IF v_tournament.current_players >= v_tournament.max_players THEN
    RETURN jsonb_build_object('error', 'tournament_full');
  END IF;

  IF EXISTS (
    SELECT 1 FROM tournament_participants
    WHERE tournament_id = p_tournament_id AND player_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'already_joined');
  END IF;

  IF v_tournament.created_by = v_user_id THEN
    RETURN jsonb_build_object('error', 'cannot_join_own');
  END IF;

  IF (SELECT balance FROM profiles WHERE id = v_user_id) < v_tournament.entry_fee THEN
    RETURN jsonb_build_object('error', 'insufficient_balance');
  END IF;

  UPDATE profiles
  SET balance           = balance - v_tournament.entry_fee,
      fortnite_username = coalesce(p_epic_username, fortnite_username)
  WHERE id = v_user_id;

  INSERT INTO transactions (user_id, type, amount, status, reference_id, description)
  VALUES (v_user_id, 'entry_fee', v_tournament.entry_fee, 'completed', p_tournament_id,
          'Entrada: ' || v_tournament.title);

  INSERT INTO tournament_participants (tournament_id, player_id, status, epic_username)
  VALUES (p_tournament_id, v_user_id, 'registered', p_epic_username);

  UPDATE tournaments
  SET current_players = current_players + 1
  WHERE id = p_tournament_id;

  IF v_tournament.current_players + 1 >= v_tournament.max_players THEN
    SELECT player_id, epic_username
    INTO v_player1_id, v_player1_epic
    FROM tournament_participants
    WHERE tournament_id = p_tournament_id
      AND player_id != v_user_id
    ORDER BY joined_at
    LIMIT 1;

    -- ── ÚNICA LÍNEA QUE CAMBIA RESPECTO A v4 ────────────────────────────────
    INSERT INTO matches (tournament_id, player1_id, player2_id, status, betting_closes_at)
    VALUES (p_tournament_id, v_player1_id, v_user_id, 'in_progress', now() + interval '90 seconds')
    RETURNING id INTO v_match_id;
    -- ────────────────────────────────────────────────────────────────────────

    UPDATE tournaments
    SET status = 'in_progress'
    WHERE id = p_tournament_id;

    UPDATE tournament_participants
    SET status = 'playing'
    WHERE tournament_id = p_tournament_id;

    RETURN jsonb_build_object(
      'success',    true,
      'matched',    true,
      'match_id',   v_match_id,
      'rival_id',   v_player1_id,
      'rival_epic', v_player1_epic
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'matched', false);
END;
$$;

-- ── 3. place_bet — validación por tiempo en lugar de por status ───────────────
-- ANTES (v10):
--   IF v_match.status != 'pending' THEN
--     RETURN jsonb_build_object('error', 'match_already_started');
--   END IF;
--
-- AHORA:
--   IF v_match.betting_closes_at IS NULL OR now() >= v_match.betting_closes_at THEN
--     RETURN jsonb_build_object('error', 'betting_window_closed');
--   END IF;
--
-- El resto de place_bet es idéntico a v10. El match puede estar en cualquier
-- status (in_progress, pending, etc.) — lo único que importa es el tiempo.
-- Matches anteriores a esta migración tienen betting_closes_at = NULL y por
-- tanto nunca permiten apuestas (rama IS NULL).

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

  IF p_amount < 10 OR p_amount > 1000 THEN
    RETURN jsonb_build_object('error', 'invalid_amount');
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'match_not_found');
  END IF;

  -- Ventana de apuestas: solo se permite mientras now() < betting_closes_at.
  -- Si betting_closes_at es NULL (match sin ventana) o ya expiró → rechazar.
  IF v_match.betting_closes_at IS NULL OR now() >= v_match.betting_closes_at THEN
    RETURN jsonb_build_object('error', 'betting_window_closed');
  END IF;

  IF p_bet_on != v_match.player1_id AND p_bet_on != v_match.player2_id THEN
    RETURN jsonb_build_object('error', 'invalid_bet_target');
  END IF;

  IF EXISTS (
    SELECT 1 FROM match_bets WHERE match_id = p_match_id AND user_id = v_user_id
  ) THEN
    RETURN jsonb_build_object('error', 'already_bet');
  END IF;

  SELECT points INTO v_points FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_points < p_amount THEN
    RETURN jsonb_build_object('error', 'insufficient_points');
  END IF;

  UPDATE profiles SET points = points - p_amount WHERE id = v_user_id;

  INSERT INTO match_bets (match_id, user_id, bet_on, amount)
  VALUES (p_match_id, v_user_id, p_bet_on, p_amount);

  RETURN jsonb_build_object('success', true);
END;
$$;
