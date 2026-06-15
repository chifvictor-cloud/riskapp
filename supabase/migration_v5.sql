-- =====================
-- MIGRATION V5: Match result system, disputes, admin panel
-- =====================

-- Add result tracking columns to matches
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS player1_claimed_winner uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS player2_claimed_winner uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS player1_screenshot_url  text,
  ADD COLUMN IF NOT EXISTS player2_screenshot_url  text,
  ADD COLUMN IF NOT EXISTS admin_note              text,
  ADD COLUMN IF NOT EXISTS resolved_by             uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS resolved_at             timestamptz;

-- Add admin flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false NOT NULL;

-- Enable realtime on matches (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE matches;
  END IF;
END $$;

-- =====================
-- STORAGE: match-screenshots bucket
-- =====================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'match-screenshots',
  'match-screenshots',
  true,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload screenshots"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'match-screenshots' AND auth.role() = 'authenticated');

-- Allow authenticated users to update their own screenshots
CREATE POLICY "Users can update own screenshots"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'match-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Public read for screenshots
CREATE POLICY "Screenshots are publicly viewable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'match-screenshots');

-- =====================
-- RLS: matches — allow participants to update their result columns
-- =====================
CREATE POLICY "Participants can update their match result"
  ON public.matches FOR UPDATE
  USING (auth.uid() = player1_id OR auth.uid() = player2_id);

CREATE POLICY "Admin can update any match"
  ON public.matches FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- =====================
-- FUNCTION: submit_match_result
-- Each player calls this once with their claimed winner + screenshot URL.
-- When both agree → auto-pay. When they disagree → 'disputed'.
-- =====================
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

  -- Lock row for atomicity
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

  -- If opponent hasn't reported yet, we're done for now
  IF v_other_claim IS NULL THEN
    RETURN jsonb_build_object('success', true, 'result_status', 'pending_opponent');
  END IF;

  -- Both reported — check if they agree
  IF v_other_claim = p_claimed_winner THEN
    -- Agreement: pay winner and close match
    v_agreed_winner_id := p_claimed_winner;
    v_loser_id := CASE WHEN v_agreed_winner_id = v_match.player1_id
                       THEN v_match.player2_id ELSE v_match.player1_id END;

    SELECT prize_pool INTO v_prize_pool FROM tournaments WHERE id = v_match.tournament_id;

    UPDATE matches
    SET status    = 'completed',
        winner_id = v_agreed_winner_id,
        played_at = now()
    WHERE id = p_match_id;

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
    -- Disagreement: mark disputed
    UPDATE matches SET status = 'disputed' WHERE id = p_match_id;
    RETURN jsonb_build_object('success', true, 'result_status', 'disputed');
  END IF;
END;
$$;

-- =====================
-- FUNCTION: admin_resolve_dispute
-- Admin picks the real winner and pays them.
-- =====================
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

-- =====================
-- To make a user admin, run:
-- UPDATE public.profiles SET is_admin = true WHERE username = 'your_username';
-- =====================
