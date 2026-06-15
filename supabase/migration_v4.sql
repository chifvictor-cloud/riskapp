-- =====================
-- MIGRATION V4: Beta test balance + ensure v3 RPCs are applied
-- =====================

-- Add epic_username to tournament_participants (idempotent)
ALTER TABLE public.tournament_participants
  ADD COLUMN IF NOT EXISTS epic_username text;

-- Give new users $500 MXN test balance on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url, balance)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url',
    500.00
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Give existing users $500 MXN test balance if they have $0
UPDATE public.profiles SET balance = 500.00 WHERE balance = 0;

-- =====================
-- FUNCTION: create_tournament (v4 — idempotent re-apply of v3)
-- =====================
CREATE OR REPLACE FUNCTION public.create_tournament(
  p_entry_fee     numeric,
  p_game_mode     text,
  p_epic_username text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id       uuid;
  v_tournament_id uuid;
  v_prize_pool    numeric;
  v_title         text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  IF p_game_mode NOT IN ('No Build', 'Construcción', 'Zero Build') THEN
    RETURN jsonb_build_object('error', 'invalid_format');
  END IF;

  IF p_entry_fee NOT IN (20, 50, 100, 150, 200, 300, 500, 1000) THEN
    RETURN jsonb_build_object('error', 'invalid_entry_fee');
  END IF;

  IF (SELECT balance FROM profiles WHERE id = v_user_id) < p_entry_fee THEN
    RETURN jsonb_build_object('error', 'insufficient_balance');
  END IF;

  v_prize_pool := p_entry_fee * 2;
  v_title := p_game_mode || ' · $' || p_entry_fee::text || ' MXN';

  INSERT INTO tournaments (title, game_mode, entry_fee, prize_pool, max_players, current_players, status, created_by)
  VALUES (v_title, p_game_mode, p_entry_fee, v_prize_pool, 2, 1, 'open', v_user_id)
  RETURNING id INTO v_tournament_id;

  INSERT INTO tournament_participants (tournament_id, player_id, status, epic_username)
  VALUES (v_tournament_id, v_user_id, 'registered', p_epic_username);

  UPDATE profiles
  SET balance           = balance - p_entry_fee,
      fortnite_username = coalesce(p_epic_username, fortnite_username)
  WHERE id = v_user_id;

  INSERT INTO transactions (user_id, type, amount, status, reference_id, description)
  VALUES (v_user_id, 'entry_fee', p_entry_fee, 'completed', v_tournament_id,
          'Entrada: ' || v_title);

  RETURN jsonb_build_object('success', true, 'tournament_id', v_tournament_id);
END;
$$;

-- =====================
-- FUNCTION: join_tournament (v4 — idempotent re-apply of v3)
-- =====================
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

    INSERT INTO matches (tournament_id, player1_id, player2_id, status)
    VALUES (p_tournament_id, v_player1_id, v_user_id, 'in_progress')
    RETURNING id INTO v_match_id;

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
