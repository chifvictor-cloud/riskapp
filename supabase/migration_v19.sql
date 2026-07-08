-- v19_player_frames.sql — Marcos evolutivos de jugador (M1)
-- ═══════════════════════════════════════════════════════════════════════════
-- 5 tiers: Bronze(1) Silver(2) Gold(3) Diamond(4) Legendary(5).
-- Progresión mixta: victorias (umbrales 0/5/20/50/150) o compra con puntos
-- (Silver 1,500 / Gold 5,000 / Diamond 15,000). Bronze y Legendary NO son
-- comprables (purchase_price NULL). La progresión solo sube, nunca baja.
--
-- Contenido:
--   1. Tabla catálogo frame_tiers (+ seed, + RLS de solo lectura).
--   2. Columnas profiles.frame_tier / profiles.frame_unlocked_via.
--      Protegidas de origen: v16 dejó UPDATE por columna en profiles
--      (username, display_name, avatar_url, fortnite_username), así que el
--      cliente NO puede tocar las columnas nuevas por UPDATE directo.
--   3. recalculate_frame_tier(user_id) — cuenta victorias en matches y sube
--      el tier si aplica. Cuenta de matches (no de profiles.wins) porque el
--      trigger dispara en el UPDATE de matches, ANTES de que
--      submit_match_result incremente profiles.wins en la misma transacción.
--   4. Trigger en matches: al pasar a completed con winner_id → recalcula.
--   5. buy_frame_tier(target_tier) — valida saldo y precio, descuenta puntos,
--      marca unlocked_via='purchase'. Permite saltar tiers (los precios son
--      absolutos por tier, no acumulativos).
--   6. Backfill de tiers para usuarios existentes según sus victorias.
--
-- Envuelto en transacción: si algo falla, no aplica nada.
-- Idempotente: re-correrla no cambia el resultado (el seed usa ON CONFLICT
-- DO NOTHING, así que NO pisa precios ajustados a mano después).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- 1 — Catálogo frame_tiers
-- purchase_price NULL = tier no comprable (Bronze es default, Legendary solo
-- por victorias). Precios de arranque, ajustables con UPDATE simple.
-- ══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.frame_tiers (
  tier            int  PRIMARY KEY CHECK (tier BETWEEN 1 AND 5),
  name            text NOT NULL,
  wins_required   int  NOT NULL CHECK (wins_required >= 0),
  purchase_price  int  CHECK (purchase_price > 0)
);

INSERT INTO public.frame_tiers (tier, name, wins_required, purchase_price) VALUES
  (1, 'Bronze',    0,    NULL),
  (2, 'Silver',    5,    1500),
  (3, 'Gold',      20,   5000),
  (4, 'Diamond',   50,   15000),
  (5, 'Legendary', 150,  NULL)
ON CONFLICT (tier) DO NOTHING;

-- Solo lectura para el cliente (la UI necesita nombres/umbrales/precios).
-- Supabase otorga por default privileges ALL a anon/authenticated en tablas
-- nuevas de public → se revoca escritura explícitamente.
ALTER TABLE public.frame_tiers ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES
  ON public.frame_tiers FROM anon, authenticated;
DROP POLICY IF EXISTS frame_tiers_read ON public.frame_tiers;
CREATE POLICY frame_tiers_read ON public.frame_tiers
  FOR SELECT USING (true);

-- ══════════════════════════════════════════════════════════════════════════
-- 2 — Columnas en profiles
-- NOTA idempotencia: si la columna ya existe, IF NOT EXISTS salta el bloque
-- completo (incluidos FK/CHECK) — correcto para re-runs.
-- ══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS frame_tier int NOT NULL DEFAULT 1
    REFERENCES public.frame_tiers(tier);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS frame_unlocked_via text NOT NULL DEFAULT 'wins'
    CHECK (frame_unlocked_via IN ('wins', 'purchase'));

-- ══════════════════════════════════════════════════════════════════════════
-- 3 — recalculate_frame_tier: sube el tier según victorias reales
-- Solo sube (WHERE frame_tier < tier ganado). Si el usuario había COMPRADO
-- un tier y las victorias lo alcanzan pero no lo superan, no se toca nada
-- (mismo tier, unlocked_via se queda en 'purchase'; el marco es el mismo).
-- No invocable por el cliente: solo la llama el trigger (y el SQL editor).
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.recalculate_frame_tier(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_wins        int;
  v_earned_tier int;
BEGIN
  SELECT count(*) INTO v_wins
  FROM matches
  WHERE winner_id = p_user_id AND status = 'completed';

  SELECT max(tier) INTO v_earned_tier
  FROM frame_tiers
  WHERE wins_required <= v_wins;

  UPDATE profiles
  SET frame_tier         = v_earned_tier,
      frame_unlocked_via = 'wins'
  WHERE id = p_user_id
    AND frame_tier < v_earned_tier;   -- ← solo sube, nunca baja
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.recalculate_frame_tier(uuid)
  FROM public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 4 — Trigger en matches: al completarse con ganador → recalcular su tier
-- SECURITY DEFINER en la función de trigger porque un admin puede completar
-- un match vía UPDATE directo (policy "Admin can update any match"); en ese
-- caso el trigger corre como authenticated, que NO tiene EXECUTE sobre
-- recalculate_frame_tier. Como definer (owner postgres) siempre puede.
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.on_match_completed_frame_tier()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM recalculate_frame_tier(NEW.winner_id);
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS matches_frame_tier_on_completed ON public.matches;
CREATE TRIGGER matches_frame_tier_on_completed
  AFTER UPDATE ON public.matches
  FOR EACH ROW
  WHEN (NEW.status = 'completed'
        AND NEW.winner_id IS NOT NULL
        AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.on_match_completed_frame_tier();

-- ══════════════════════════════════════════════════════════════════════════
-- 5 — buy_frame_tier: compra de tier con puntos
-- FOR UPDATE sobre el perfil para evitar doble gasto en llamadas concurrentes
-- (mismo patrón que place_bet). No inserta en transactions: los movimientos
-- de puntos no se registran ahí (su CHECK de type es solo para dinero real).
-- ══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.buy_frame_tier(p_target_tier int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id      uuid;
  v_price        int;
  v_current_tier int;
  v_points       int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  SELECT purchase_price INTO v_price
  FROM frame_tiers WHERE tier = p_target_tier;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'invalid_tier');
  END IF;
  IF v_price IS NULL THEN
    RETURN jsonb_build_object('error', 'tier_not_purchasable');
  END IF;

  SELECT frame_tier, points INTO v_current_tier, v_points
  FROM profiles WHERE id = v_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'profile_not_found');
  END IF;

  IF p_target_tier <= v_current_tier THEN
    RETURN jsonb_build_object('error', 'tier_already_owned');
  END IF;

  IF v_points < v_price THEN
    RETURN jsonb_build_object('error', 'insufficient_points');
  END IF;

  UPDATE profiles
  SET points             = points - v_price,
      frame_tier         = p_target_tier,
      frame_unlocked_via = 'purchase'
  WHERE id = v_user_id;

  RETURN jsonb_build_object(
    'success', true,
    'new_tier', p_target_tier,
    'points_spent', v_price
  );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.buy_frame_tier(int) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.buy_frame_tier(int) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- 6 — Backfill: subir el tier de usuarios existentes según victorias reales
-- Solo sube (new_tier > frame_tier), así que re-correrlo es inocuo y no pisa
-- tiers comprados.
-- ══════════════════════════════════════════════════════════════════════════
UPDATE public.profiles p
SET frame_tier         = sub.earned_tier,
    frame_unlocked_via = 'wins'
FROM (
  SELECT pr.id,
         (SELECT max(ft.tier)
          FROM public.frame_tiers ft
          WHERE ft.wins_required <= coalesce(w.win_count, 0)) AS earned_tier
  FROM public.profiles pr
  LEFT JOIN (
    SELECT winner_id, count(*) AS win_count
    FROM public.matches
    WHERE status = 'completed' AND winner_id IS NOT NULL
    GROUP BY winner_id
  ) w ON w.winner_id = pr.id
) sub
WHERE sub.id = p.id
  AND sub.earned_tier > p.frame_tier;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-APLICACIÓN (opcional, correr por separado tras el COMMIT):
--
--   -- Catálogo sembrado (5 filas, Bronze/Legendary sin precio)
--   SELECT * FROM frame_tiers ORDER BY tier;
--
--   -- Columnas nuevas en profiles con sus defaults
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='profiles'
--     AND column_name IN ('frame_tier','frame_unlocked_via');
--
--   -- El cliente NO debe poder actualizar las columnas nuevas
--   SELECT grantee, column_name
--   FROM information_schema.column_privileges
--   WHERE table_schema='public' AND table_name='profiles'
--     AND privilege_type='UPDATE' AND grantee IN ('anon','authenticated');
--   -- (frame_tier / frame_unlocked_via NO deben aparecer)
--
--   -- Trigger instalado
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgrelid = 'public.matches'::regclass
--     AND tgname = 'matches_frame_tier_on_completed';
--
--   -- Tiers actuales tras el backfill
--   SELECT username, wins, frame_tier, frame_unlocked_via
--   FROM profiles ORDER BY frame_tier DESC, wins DESC;
-- ═══════════════════════════════════════════════════════════════════════════
