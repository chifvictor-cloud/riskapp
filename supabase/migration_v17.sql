-- migration_v17.sql — FASE 2: versionar el estado vivo de features sin migración
-- ═══════════════════════════════════════════════════════════════════════════
-- Esta migración es DOCUMENTAL: refleja el estado REAL de la base al 2026-07-05
-- (extraído con pg_get_functiondef / information_schema / pg_indexes / pg_policies).
-- Objetivo: que el repo sea la fuente de verdad de aquí en adelante.
--
-- REGLAS:
--   * 100% idempotente: correrla sobre la base viva no cambia ni rompe nada.
--   * NO destructiva: no hay DROP de datos, no hay REVOKE, no hay ALTER de tipos.
--   * Las funciones se documentan TAL CUAL están vivas hoy, INCLUYENDO sus
--     defectos conocidos (p.ej. falta de `SET search_path`, make_partner sin
--     control de admin). Los FIXES van en v18, no aquí. v17 = foto fiel.
--   * Los grants NO se re-aplican aquí (se gestionan en v16/v18). Solo se anotan.
--
-- Objetos cubiertos:
--   Tablas:    app_settings, bet_rounds, match_moderators
--   Columnas:  profiles.referral_code / referred_by / referral_qualified,
--              match_bets.round_id, y columnas de disputa/moderación en matches
--   Índices:   match_bets_one_per_pool, one_active_marker_per_match, +auxiliares
--   Policies:  match_bets_read, y las SELECT de bet_rounds / match_moderators
--   Funciones: 15 (referidos, moderadores, rondas de apuesta, resolución, etc.)
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1) TABLAS NUEVAS
-- ═══════════════════════════════════════════════════════════════════════════

-- app_settings — configuración global key/value (leída solo desde backend)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key   text  PRIMARY KEY,
  value jsonb NOT NULL
);

-- bet_rounds — rondas extra de apuestas dentro de un match (multi-pozo)
CREATE TABLE IF NOT EXISTS public.bet_rounds (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     uuid        NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  round_number integer     NOT NULL,
  opened_by    uuid        NOT NULL REFERENCES auth.users(id),
  closes_at    timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, round_number)
);

-- match_moderators — moderadores/markers propuestos y aceptados por match
CREATE TABLE IF NOT EXISTS public.match_moderators (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id     uuid        NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id      uuid        NOT NULL REFERENCES auth.users(id),
  role         text        NOT NULL DEFAULT 'marker' CHECK (role IN ('marker','backup')),
  assigned_via text        NOT NULL CHECK (assigned_via IN ('players','streamer','admin')),
  assigned_by  uuid        NOT NULL REFERENCES auth.users(id),
  status       text        NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','active','removed')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, user_id)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2) COLUMNAS NUEVAS EN TABLAS EXISTENTES
-- ═══════════════════════════════════════════════════════════════════════════

-- profiles: sistema de referidos
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_code      text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referred_by        uuid;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS referral_qualified boolean NOT NULL DEFAULT false;

-- profiles: constraints de referidos (ADD CONSTRAINT no soporta IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_referral_code_key') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_referral_code_key UNIQUE (referral_code);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_referred_by_fkey') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_referred_by_fkey FOREIGN KEY (referred_by) REFERENCES public.profiles(id);
  END IF;
END $$;

-- match_bets: columna round_id (NULL = ventana inicial; cada ronda extra su id)
ALTER TABLE public.match_bets ADD COLUMN IF NOT EXISTS round_id uuid;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'match_bets_round_id_fkey') THEN
    ALTER TABLE public.match_bets
      ADD CONSTRAINT match_bets_round_id_fkey FOREIGN KEY (round_id) REFERENCES public.bet_rounds(id);
  END IF;
END $$;

-- matches: columnas de reporte-por-ambos / disputa / moderación / apuestas
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS player1_claimed_winner uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS player2_claimed_winner uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS player1_screenshot_url text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS player2_screenshot_url text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS admin_note             text;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS resolved_by            uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS resolved_at            timestamptz;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS spectator_count        integer NOT NULL DEFAULT 0;
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS sponsor_id             uuid REFERENCES public.profiles(id);
ALTER TABLE public.matches ADD COLUMN IF NOT EXISTS betting_closes_at      timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3) ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════

-- Un solo voto/apuesta por usuario por pozo (round_id NULL → sentinel fijo).
-- Es la defensa dura contra doble-apuesta (place_bet además chequea con EXISTS).
CREATE UNIQUE INDEX IF NOT EXISTS match_bets_one_per_pool
  ON public.match_bets (match_id, user_id, COALESCE(round_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Un solo marker activo por match
CREATE UNIQUE INDEX IF NOT EXISTS one_active_marker_per_match
  ON public.match_moderators (match_id) WHERE (role = 'marker' AND status = 'active');

-- Índices auxiliares de match_bets
CREATE INDEX IF NOT EXISTS match_bets_match_bet_on_idx ON public.match_bets (match_id, bet_on);
CREATE INDEX IF NOT EXISTS match_bets_match_status_idx ON public.match_bets (match_id, status);

-- ═══════════════════════════════════════════════════════════════════════════
-- 4) RLS + POLICIES  (estado vivo; recreación idempotente y atómica)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.app_settings     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bet_rounds       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_moderators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.match_bets       ENABLE ROW LEVEL SECURITY;

-- app_settings: RLS activo y SIN policies → sin acceso vía API (solo definer/service_role).
-- (Intencional: settings se leen server-side. No se crea policy.)

-- bet_rounds: lectura para usuarios logueados; escritura solo vía open_bet_round (definer).
DROP POLICY IF EXISTS "rondas visibles para usuarios logueados" ON public.bet_rounds;
CREATE POLICY "rondas visibles para usuarios logueados" ON public.bet_rounds
  FOR SELECT TO authenticated USING (true);

-- match_moderators: lectura para usuarios logueados; escritura solo vía RPCs (definer).
DROP POLICY IF EXISTS "mods visibles para usuarios logueados" ON public.match_moderators;
CREATE POLICY "mods visibles para usuarios logueados" ON public.match_moderators
  FOR SELECT TO authenticated USING (true);

-- match_bets: lectura pública (el pozo en vivo del espectador depende de ella;
-- realtime respeta RLS). Escritura solo vía place_bet / resolve_bets_internal /
-- refund_bets (definer). La policy de escritura se eliminó en v16.
DROP POLICY IF EXISTS match_bets_read ON public.match_bets;
CREATE POLICY match_bets_read ON public.match_bets
  FOR SELECT USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 5) FUNCIONES  (definiciones EXACTAS del estado vivo — CREATE OR REPLACE)
--    ⚠️ Se documentan CON sus defectos actuales. Los fixes van en v18.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Referidos ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.attribute_referral(p_code text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_partner_id uuid;
  v_created_at timestamptz;
begin
  if auth.uid() is null then
    return json_build_object('error', 'not_authenticated');
  end if;

  -- ★ solo cuentas recién creadas (< 48 h) pueden ser atribuidas
  select created_at into v_created_at from auth.users where id = auth.uid();
  if v_created_at < now() - interval '48 hours' then
    return json_build_object('error', 'account_too_old');
  end if;

  select id into v_partner_id from profiles
  where referral_code = lower(trim(p_code));

  if v_partner_id is null then
    return json_build_object('error', 'invalid_code');
  end if;

  if v_partner_id = auth.uid() then
    return json_build_object('error', 'cannot_refer_self');
  end if;

  update profiles
  set referred_by = v_partner_id
  where id = auth.uid() and referred_by is null;

  if not found then
    return json_build_object('error', 'already_referred');
  end if;

  return json_build_object('success', true);
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_referral_stats()
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select json_build_object(
    'code', (select referral_code from profiles where id = auth.uid()),
    'total_signups', (select count(*) from profiles where referred_by = auth.uid()),
    'qualified', (select count(*) from profiles where referred_by = auth.uid() and referral_qualified)
  );
$function$;

-- ⚠️ make_partner: SIN control de auth/admin (ver reporte v17, hallazgo H1).
CREATE OR REPLACE FUNCTION public.make_partner(p_email text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user_id uuid;
  v_username text;
  v_code text;
begin
  select u.id, p.username into v_user_id, v_username
  from auth.users u join profiles p on p.id = u.id
  where u.email = lower(trim(p_email));

  if v_user_id is null then
    return json_build_object('error', 'user_not_found');
  end if;

  -- código = username limpio (minúsculas, solo letras/números)
  v_code := lower(regexp_replace(v_username, '[^a-zA-Z0-9]', '', 'g'));
  if length(v_code) < 3 then
    v_code := v_code || substr(replace(v_user_id::text, '-', ''), 1, 6);
  end if;

  update profiles set referral_code = v_code where id = v_user_id;
  return json_build_object('success', true, 'code', v_code);
exception
  when unique_violation then
    return json_build_object('error', 'code_taken');
end;
$function$;

-- ── Rondas de apuesta ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.open_bet_round(p_match_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_match matches%rowtype;
  v_next_round integer;
  v_round bet_rounds%rowtype;
begin
  select * into v_match from matches where id = p_match_id;

  if v_match.id is null then
    return json_build_object('error', 'match_not_found');
  end if;

  if auth.uid() is distinct from v_match.player1_id
     and auth.uid() is distinct from v_match.player2_id then
    return json_build_object('error', 'not_authorized');
  end if;

  if v_match.status <> 'in_progress' then
    return json_build_object('error', 'match_not_in_progress');
  end if;

  if exists (
    select 1 from bet_rounds
    where match_id = p_match_id and closes_at > now()
  ) then
    return json_build_object('error', 'round_already_open');
  end if;

  select coalesce(max(round_number), 0) + 1
    into v_next_round
  from bet_rounds where match_id = p_match_id;

  insert into bet_rounds (match_id, round_number, opened_by, closes_at)
  values (p_match_id, v_next_round, auth.uid(), now() + interval '90 seconds')
  returning * into v_round;

  return json_build_object(
    'round_id', v_round.id,
    'round_number', v_round.round_number,
    'closes_at', v_round.closes_at
  );
end;
$function$;

-- ⚠️ place_bet: SECURITY DEFINER SIN `SET search_path` (ver hallazgo H2).
CREATE OR REPLACE FUNCTION public.place_bet(p_match_id uuid, p_bet_on uuid, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_user_id  uuid;
  v_match    matches%ROWTYPE;
  v_points   int;
  v_round_id uuid;
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

  -- Jugadores del match no pueden apostar en su propio match
  IF v_user_id = v_match.player1_id OR v_user_id = v_match.player2_id THEN
    RETURN jsonb_build_object('error', 'players_cannot_bet');
  END IF;

  -- ★ NUEVO: moderadores del match (propuestos o activos) no pueden apostar en él
  IF EXISTS (
    SELECT 1 FROM match_moderators
    WHERE match_id = p_match_id
      AND user_id  = v_user_id
      AND status  <> 'removed'
  ) THEN
    RETURN jsonb_build_object('error', 'mods_cannot_bet');
  END IF;

  SELECT id INTO v_round_id
  FROM bet_rounds
  WHERE match_id = p_match_id AND closes_at > now()
  ORDER BY round_number DESC
  LIMIT 1;

  IF v_round_id IS NULL THEN
    IF v_match.betting_closes_at IS NULL OR now() >= v_match.betting_closes_at THEN
      RETURN jsonb_build_object('error', 'betting_window_closed');
    END IF;
  END IF;

  IF p_bet_on != v_match.player1_id AND p_bet_on != v_match.player2_id THEN
    RETURN jsonb_build_object('error', 'invalid_bet_target');
  END IF;

  IF EXISTS (
    SELECT 1 FROM match_bets
    WHERE match_id = p_match_id
      AND user_id  = v_user_id
      AND round_id IS NOT DISTINCT FROM v_round_id
  ) THEN
    RETURN jsonb_build_object('error', 'already_bet');
  END IF;

  SELECT points INTO v_points FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF v_points < p_amount THEN
    RETURN jsonb_build_object('error', 'insufficient_points');
  END IF;

  UPDATE profiles SET points = points - p_amount WHERE id = v_user_id;

  INSERT INTO match_bets (match_id, user_id, bet_on, amount, round_id)
  VALUES (p_match_id, v_user_id, p_bet_on, p_amount, v_round_id);

  RETURN jsonb_build_object('success', true, 'round_id', v_round_id);
END;
$function$;

-- ── Moderadores ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.propose_moderator(p_match_id uuid, p_mod_email text, p_role text DEFAULT 'marker'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_match matches%rowtype;
  v_mod_id uuid;
begin
  select * into v_match from matches where id = p_match_id;
  if v_match.id is null then
    return json_build_object('error', 'match_not_found');
  end if;

  if auth.uid() is distinct from v_match.player1_id
     and auth.uid() is distinct from v_match.player2_id then
    return json_build_object('error', 'not_authorized');
  end if;

  if v_match.status not in ('pending', 'in_progress') then
    return json_build_object('error', 'match_not_active');
  end if;

  if p_role not in ('marker','backup') then
    return json_build_object('error', 'invalid_role');
  end if;

  select id into v_mod_id from auth.users where email = lower(trim(p_mod_email));
  if v_mod_id is null then
    return json_build_object('error', 'user_not_found');
  end if;

  -- el mod no puede ser jugador del match
  if v_mod_id = v_match.player1_id or v_mod_id = v_match.player2_id then
    return json_build_object('error', 'mod_cannot_be_player');
  end if;

  insert into match_moderators (match_id, user_id, role, assigned_via, assigned_by, status)
  values (p_match_id, v_mod_id, p_role, 'players', auth.uid(), 'proposed');

  return json_build_object('success', true, 'mod_user_id', v_mod_id);
exception
  when unique_violation then
    return json_build_object('error', 'already_proposed');
end;
$function$;

CREATE OR REPLACE FUNCTION public.accept_moderator(p_moderator_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_mod match_moderators%rowtype;
  v_match matches%rowtype;
begin
  select * into v_mod from match_moderators where id = p_moderator_id;
  if v_mod.id is null then
    return json_build_object('error', 'not_found');
  end if;

  if v_mod.status <> 'proposed' then
    return json_build_object('error', 'not_pending');
  end if;

  select * into v_match from matches where id = v_mod.match_id;

  -- solo el jugador que NO lo propuso puede aceptar
  if auth.uid() is distinct from v_match.player1_id
     and auth.uid() is distinct from v_match.player2_id then
    return json_build_object('error', 'not_authorized');
  end if;
  if auth.uid() = v_mod.assigned_by then
    return json_build_object('error', 'cannot_accept_own_proposal');
  end if;

  update match_moderators set status = 'active' where id = p_moderator_id;

  return json_build_object('success', true);
exception
  when unique_violation then
    return json_build_object('error', 'marker_already_active');
end;
$function$;

-- ── Consulta de apuestas del usuario ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_bets()
 RETURNS TABLE(bet_id uuid, match_id uuid, bet_on uuid, amount integer, payout integer, bet_status text, match_status text, winner_id uuid, opponent_label text, created_at timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select
    b.id            as bet_id,
    b.match_id,
    b.bet_on,
    b.amount,
    b.payout,
    case
      when b.status = 'won'      then 'ganada'
      when b.status = 'lost'     then 'perdida'
      when b.status = 'refunded' then 'cancelada'
      when m.status in ('cancelled','canceled','cancelada') then 'cancelada'
      else 'abierta'
    end             as bet_status,
    m.status        as match_status,
    m.winner_id,
    coalesce(
      (select username from profiles p
        where p.id = case when b.bet_on = m.player1_id
                          then m.player2_id else m.player1_id end),
      'rival'
    )               as opponent_label,
    b.created_at
  from match_bets b
  join matches m on m.id = b.match_id
  where b.user_id = auth.uid()
  order by b.created_at desc;
$function$;

-- ── Puntos (INVOKER; EXECUTE restringido a service_role en v16) ──────────────
CREATE OR REPLACE FUNCTION public.add_points(user_id uuid, pts integer)
 RETURNS void
 LANGUAGE sql
AS $function$
  update profiles set points = points + pts where id = user_id;
$function$;

-- ── Resolución de apuestas (multi-pozo) ──────────────────────────────────────
-- ⚠️ resolve_bets_internal / resolve_bets / refund_bets: SECURITY DEFINER SIN
--    `SET search_path` (ver hallazgo H2). EXECUTE ya restringido en v16 para
--    resolve_bets_internal y refund_bets.
CREATE OR REPLACE FUNCTION public.resolve_bets_internal(p_match_id uuid, p_winner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_pool              record;
  v_total_pot         int;
  v_winner_bets_total int;
  v_winner_pot        int;
  v_grand_pot         int := 0;
  v_grand_rake        int := 0;
  v_pools_settled     int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM matches
    WHERE id = p_match_id
      AND (player1_id = p_winner_id OR player2_id = p_winner_id)
  ) THEN
    RAISE EXCEPTION 'invalid_match_or_winner';
  END IF;

  -- Un pozo por round_id (NULL = ventana inicial, cada ronda extra aparte)
  FOR v_pool IN
    SELECT round_id
    FROM match_bets
    WHERE match_id = p_match_id AND status = 'open'
    GROUP BY round_id
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_total_pot
    FROM match_bets
    WHERE match_id = p_match_id AND status = 'open'
      AND round_id IS NOT DISTINCT FROM v_pool.round_id;

    IF v_total_pot = 0 THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_winner_bets_total
    FROM match_bets
    WHERE match_id = p_match_id AND status = 'open'
      AND round_id IS NOT DISTINCT FROM v_pool.round_id
      AND bet_on = p_winner_id;

    IF v_winner_bets_total = 0 THEN
      -- Nadie le atinó en ESTE pozo → devolver este pozo
      UPDATE profiles p
      SET    points = p.points + mb.amount
      FROM   match_bets mb
      WHERE  mb.match_id = p_match_id
        AND  mb.status   = 'open'
        AND  mb.round_id IS NOT DISTINCT FROM v_pool.round_id
        AND  mb.user_id  = p.id;

      UPDATE match_bets
      SET    status = 'refunded', payout = amount
      WHERE  match_id = p_match_id AND status = 'open'
        AND  round_id IS NOT DISTINCT FROM v_pool.round_id;
    ELSE
      v_winner_pot := v_total_pot - (v_total_pot * 5 / 100);
      v_grand_rake := v_grand_rake + (v_total_pot * 5 / 100);

      UPDATE profiles p
      SET    points = p.points + (mb.amount * v_winner_pot / v_winner_bets_total)
      FROM   match_bets mb
      WHERE  mb.match_id = p_match_id
        AND  mb.status   = 'open'
        AND  mb.round_id IS NOT DISTINCT FROM v_pool.round_id
        AND  mb.bet_on   = p_winner_id
        AND  mb.user_id  = p.id;

      UPDATE match_bets
      SET    status = 'won',
             payout = (amount * v_winner_pot / v_winner_bets_total)
      WHERE  match_id = p_match_id AND status = 'open'
        AND  round_id IS NOT DISTINCT FROM v_pool.round_id
        AND  bet_on = p_winner_id;

      UPDATE match_bets
      SET    status = 'lost', payout = 0
      WHERE  match_id = p_match_id AND status = 'open'
        AND  round_id IS NOT DISTINCT FROM v_pool.round_id;
    END IF;

    v_grand_pot := v_grand_pot + v_total_pot;
    v_pools_settled := v_pools_settled + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'pot',     v_grand_pot,
    'rake',    v_grand_rake,
    'pools',   v_pools_settled
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.resolve_bets(p_match_id uuid, p_winner_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.refund_bets(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_is_admin boolean;
  v_count    int;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM match_bets WHERE match_id = p_match_id AND status = 'open';

  IF v_count = 0 THEN
    RETURN jsonb_build_object('success', true, 'refunded_count', 0);
  END IF;

  UPDATE profiles p
  SET    points = p.points + mb.amount
  FROM   match_bets mb
  WHERE  mb.match_id = p_match_id
    AND  mb.status   = 'open'
    AND  mb.user_id  = p.id;

  UPDATE match_bets
  SET    status = 'refunded', payout = amount
  WHERE  match_id = p_match_id AND status = 'open';

  RETURN jsonb_build_object('success', true, 'refunded_count', v_count);
END;
$function$;

-- ── Resultado del match (reporte por ambos jugadores) ────────────────────────
-- ⚠️ submit_match_result: SECURITY DEFINER SIN `SET search_path` (hallazgo H2).
CREATE OR REPLACE FUNCTION public.submit_match_result(p_match_id uuid, p_claimed_winner uuid, p_screenshot_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

-- ── Resolución de disputa por admin ──────────────────────────────────────────
-- ⚠️ admin_resolve_dispute: SECURITY DEFINER SIN `SET search_path` (hallazgo H2).
CREATE OR REPLACE FUNCTION public.admin_resolve_dispute(p_match_id uuid, p_winner_id uuid, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
$function$;

-- ── Trigger de alta de usuario ───────────────────────────────────────────────
-- ⚠️ handle_new_user: SECURITY DEFINER SIN `SET search_path` (hallazgo H2).
-- NO inserta balance → toma el default 0.00 de la columna (fuga del bono tapada
-- desde v15). points = 0. Referencias calificadas con `public.` explícito.
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_base_username text;
  v_final_username text;
  v_suffix int := 0;
BEGIN
  -- 1. base: metadata > local part del email, todo en minúsculas
  v_base_username := lower(coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1)
  ));

  -- 2. dejar solo letras/números/underscore (tu regla de formato)
  v_base_username := regexp_replace(v_base_username, '[^a-z0-9_]', '', 'g');

  -- 3. si quedó vacío tras limpiar, poner algo por default
  if length(v_base_username) = 0 then
    v_base_username := 'user';
  end if;

  -- 4. asegurar unicidad
  v_final_username := v_base_username;
  while exists (select 1 from public.profiles where username = v_final_username) loop
    v_suffix := v_suffix + 1;
    v_final_username := v_base_username || v_suffix::text;
  end loop;

  insert into public.profiles (id, username, display_name, avatar_url, points)
  values (
    new.id,
    v_final_username,
    coalesce(new.raw_user_meta_data->>'full_name', v_final_username),
    new.raw_user_meta_data->>'avatar_url',
    0
  );

  return new;
END;
$function$;

-- Trigger vivo sobre auth.users (idempotente con CREATE OR REPLACE TRIGGER).
CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- NOTA SOBRE GRANTS (no se aplican aquí; documentación)
--   Estado vivo (2026-07-05):
--     * EXECUTE de la mayoría de RPCs: PUBLIC/anon/authenticated (default).
--       Restringidos por v16: add_points, refund_bets, resolve_bets_internal
--       (solo postgres/service_role).
--     * Tablas: anon/authenticated tienen grants amplios por default de Supabase
--       (incluye TRUNCATE/TRIGGER/REFERENCES). El acceso real está gobernado por
--       RLS (habilitado en todas). Ver hallazgos H3/H4 del reporte para el
--       endurecimiento propuesto en v18.
-- ═══════════════════════════════════════════════════════════════════════════
