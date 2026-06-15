-- =====================
-- MIGRATION V3: Epic username + updated matchmaking RPCs
-- =====================

-- Add epic_username to tournament_participants
alter table public.tournament_participants
  add column if not exists epic_username text;

-- =====================
-- FUNCTION: create_tournament (v3 — accepts epic_username)
-- =====================
create or replace function public.create_tournament(
  p_entry_fee  numeric,
  p_game_mode  text,
  p_epic_username text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_user_id      uuid;
  v_tournament_id uuid;
  v_prize_pool   numeric;
  v_title        text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  if p_game_mode not in ('No Build', 'Construcción', 'Zero Build') then
    return jsonb_build_object('error', 'invalid_format');
  end if;

  if p_entry_fee not in (20, 50, 100, 150, 200, 300, 500, 1000) then
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

  insert into tournament_participants (tournament_id, player_id, status, epic_username)
  values (v_tournament_id, v_user_id, 'registered', p_epic_username);

  update profiles
  set balance           = balance - p_entry_fee,
      fortnite_username = coalesce(p_epic_username, fortnite_username)
  where id = v_user_id;

  insert into transactions (user_id, type, amount, status, reference_id, description)
  values (v_user_id, 'entry_fee', p_entry_fee, 'completed', v_tournament_id,
          'Entrada: ' || v_title);

  return jsonb_build_object('success', true, 'tournament_id', v_tournament_id);
end;
$$;

-- =====================
-- FUNCTION: join_tournament (v3 — accepts epic_username, returns rival info)
-- =====================
create or replace function public.join_tournament(
  p_tournament_id uuid,
  p_epic_username text default null
)
returns jsonb
language plpgsql
security definer
as $$
declare
  v_tournament    tournaments%rowtype;
  v_user_id       uuid;
  v_match_id      uuid;
  v_player1_id    uuid;
  v_player1_epic  text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('error', 'not_authenticated');
  end if;

  -- Lock row to prevent race conditions
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

  if v_tournament.created_by = v_user_id then
    return jsonb_build_object('error', 'cannot_join_own');
  end if;

  if (select balance from profiles where id = v_user_id) < v_tournament.entry_fee then
    return jsonb_build_object('error', 'insufficient_balance');
  end if;

  -- Deduct and record
  update profiles
  set balance           = balance - v_tournament.entry_fee,
      fortnite_username = coalesce(p_epic_username, fortnite_username)
  where id = v_user_id;

  insert into transactions (user_id, type, amount, status, reference_id, description)
  values (v_user_id, 'entry_fee', v_tournament.entry_fee, 'completed', p_tournament_id,
          'Entrada: ' || v_tournament.title);

  insert into tournament_participants (tournament_id, player_id, status, epic_username)
  values (p_tournament_id, v_user_id, 'registered', p_epic_username);

  update tournaments
  set current_players = current_players + 1
  where id = p_tournament_id;

  -- If now full → matchmake
  if v_tournament.current_players + 1 >= v_tournament.max_players then
    select player_id, epic_username
    into v_player1_id, v_player1_epic
    from tournament_participants
    where tournament_id = p_tournament_id
      and player_id != v_user_id
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

    return jsonb_build_object(
      'success',     true,
      'matched',     true,
      'match_id',    v_match_id,
      'rival_id',    v_player1_id,
      'rival_epic',  v_player1_epic
    );
  end if;

  return jsonb_build_object('success', true, 'matched', false);
end;
$$;
