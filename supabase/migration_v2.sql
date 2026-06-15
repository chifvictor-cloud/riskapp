-- =====================
-- MIGRATION V2: Matchmaking + Points + RPC Functions
-- =====================

-- Add points to profiles
alter table public.profiles
  add column if not exists points integer default 0 not null;

-- Enable realtime on key tables
alter publication supabase_realtime add table tournaments;
alter publication supabase_realtime add table tournament_participants;
alter publication supabase_realtime add table matches;

-- Allow authenticated users to update tournament player count (needed for join flow)
-- We use SECURITY DEFINER functions instead of relaxing RLS

-- =====================
-- FUNCTION: create_tournament
-- Creates a tournament and auto-joins the creator as player 1
-- =====================
create or replace function public.create_tournament(
  p_entry_fee numeric,
  p_game_mode text
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id uuid;
  v_tournament_id uuid;
  v_prize_pool numeric;
  v_title text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if p_game_mode not in ('No Build', 'Construcción', 'Zero Build') then
    return jsonb_build_object('error', 'invalid_format');
  end if;

  if p_entry_fee not in (20, 50, 100, 200, 500, 1000) then
    return jsonb_build_object('error', 'invalid_entry_fee');
  end if;

  if (select balance from profiles where id = v_user_id) < p_entry_fee then
    return jsonb_build_object('error', 'insufficient_balance');
  end if;

  v_prize_pool := p_entry_fee * 2;
  v_title := p_game_mode || ' · $' || p_entry_fee::text || ' MXN';

  insert into tournaments (title, game_mode, entry_fee, prize_pool, max_players, current_players, status, created_by)
  values (v_title, p_game_mode, p_entry_fee, v_prize_pool, 2, 1, 'open', v_user_id)
  returning id into v_tournament_id;

  insert into tournament_participants (tournament_id, player_id, status)
  values (v_tournament_id, v_user_id, 'registered');

  update profiles set balance = balance - p_entry_fee where id = v_user_id;

  insert into transactions (user_id, type, amount, status, reference_id, description)
  values (v_user_id, 'entry_fee', p_entry_fee, 'completed', v_tournament_id,
          'Entrada: ' || v_title);

  return jsonb_build_object('success', true, 'tournament_id', v_tournament_id);
end;
$$;

-- =====================
-- FUNCTION: join_tournament
-- Joins a player to an existing open tournament. If the tournament
-- reaches max_players, creates a match and starts the tournament.
-- =====================
create or replace function public.join_tournament(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_tournament tournaments%rowtype;
  v_user_id    uuid;
  v_match_id   uuid;
  v_player1_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- Lock the row to prevent race conditions
  select * into v_tournament from tournaments where id = p_tournament_id for update;

  if not found then
    return jsonb_build_object('error', 'tournament_not_found');
  end if;

  if v_tournament.status != 'open' then
    return jsonb_build_object('error', 'tournament_not_open');
  end if;

  if v_tournament.current_players >= v_tournament.max_players then
    return jsonb_build_object('error', 'tournament_full');
  end if;

  if exists (
    select 1 from tournament_participants
    where tournament_id = p_tournament_id and player_id = v_user_id
  ) then
    return jsonb_build_object('error', 'already_joined');
  end if;

  -- Can't play against yourself
  if v_tournament.created_by = v_user_id then
    return jsonb_build_object('error', 'cannot_join_own');
  end if;

  if (select balance from profiles where id = v_user_id) < v_tournament.entry_fee then
    return jsonb_build_object('error', 'insufficient_balance');
  end if;

  -- Deduct entry fee
  update profiles set balance = balance - v_tournament.entry_fee where id = v_user_id;

  insert into transactions (user_id, type, amount, status, reference_id, description)
  values (v_user_id, 'entry_fee', v_tournament.entry_fee, 'completed', p_tournament_id,
          'Entrada: ' || v_tournament.title);

  -- Insert participant
  insert into tournament_participants (tournament_id, player_id, status)
  values (p_tournament_id, v_user_id, 'registered');

  -- Increment player count
  update tournaments
  set current_players = current_players + 1
  where id = p_tournament_id;

  -- If now full → matchmake
  if v_tournament.current_players + 1 >= v_tournament.max_players then
    select player_id into v_player1_id
    from tournament_participants
    where tournament_id = p_tournament_id
    order by joined_at
    limit 1;

    insert into matches (tournament_id, player1_id, player2_id, status)
    values (p_tournament_id, v_player1_id, v_user_id, 'in_progress')
    returning id into v_match_id;

    update tournaments
    set status = 'in_progress'
    where id = p_tournament_id;

    update tournament_participants
    set status = 'playing'
    where tournament_id = p_tournament_id;

    return jsonb_build_object('success', true, 'matched', true, 'match_id', v_match_id);
  end if;

  return jsonb_build_object('success', true, 'matched', false);
end;
$$;

-- =====================
-- FUNCTION: report_match_result
-- Reports the winner of a match. Awards prize and updates stats.
-- =====================
create or replace function public.report_match_result(p_match_id uuid, p_winner_id uuid)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_match      matches%rowtype;
  v_user_id    uuid;
  v_loser_id   uuid;
  v_prize_pool numeric;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  select * into v_match from matches where id = p_match_id;

  if not found then
    return jsonb_build_object('error', 'match_not_found');
  end if;

  if v_match.status != 'in_progress' then
    return jsonb_build_object('error', 'match_not_active');
  end if;

  if v_user_id != v_match.player1_id and v_user_id != v_match.player2_id then
    return jsonb_build_object('error', 'not_a_participant');
  end if;

  if p_winner_id != v_match.player1_id and p_winner_id != v_match.player2_id then
    return jsonb_build_object('error', 'invalid_winner');
  end if;

  v_loser_id := case when p_winner_id = v_match.player1_id
                     then v_match.player2_id
                     else v_match.player1_id end;

  -- Get prize pool
  select prize_pool into v_prize_pool from tournaments where id = v_match.tournament_id;

  -- Update match
  update matches
  set winner_id = p_winner_id, status = 'completed', played_at = now()
  where id = p_match_id;

  -- Award prize to winner
  update profiles
  set balance        = balance + v_prize_pool,
      total_earnings = total_earnings + v_prize_pool,
      wins           = wins + 1,
      points         = points + 10
  where id = p_winner_id;

  -- Update loser stats
  update profiles
  set losses = losses + 1,
      points = points + 2
  where id = v_loser_id;

  insert into transactions (user_id, type, amount, status, reference_id, description)
  values (p_winner_id, 'prize', v_prize_pool, 'completed', v_match.tournament_id, 'Premio ganado');

  -- Close tournament
  update tournaments
  set status = 'completed', winner_id = p_winner_id
  where id = v_match.tournament_id;

  update tournament_participants
  set status = 'winner'
  where tournament_id = v_match.tournament_id and player_id = p_winner_id;

  update tournament_participants
  set status = 'eliminated'
  where tournament_id = v_match.tournament_id and player_id = v_loser_id;

  return jsonb_build_object('success', true, 'prize', v_prize_pool);
end;
$$;
