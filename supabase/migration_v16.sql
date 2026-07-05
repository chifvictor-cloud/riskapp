-- migration_v16.sql — FASE 1 de endurecimiento de seguridad (9 fixes)
-- Cierra las 5 vulnerabilidades críticas del reporte de Fase 1.
-- NO toca handle_new_user: la versión viva ya no inserta balance (fix
-- colateral de v15, 2026-07-04), así que la fuga del bono de $500 MXN
-- ya está tapada vía el default de la columna. El CHECK 0 lo garantiza.
-- Envuelto en transacción: si algo falla, no aplica nada.

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- CHECK 0 — garantizar que profiles.balance tiene default 0.00
-- handle_new_user ya no inserta balance, por lo que el bono de bienvenida
-- depende 100% de este default. Si alguien lo cambió (v13–v15 no están
-- versionadas), este bloque ABORTA toda la migración con un error claro.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_default text;
BEGIN
  SELECT column_default INTO v_default
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name   = 'profiles'
    AND column_name  = 'balance';

  IF v_default IS NULL OR split_part(v_default, '::', 1)::numeric <> 0 THEN
    RAISE EXCEPTION
      'profiles.balance tiene default % (se esperaba 0.00). Corrige con: ALTER TABLE public.profiles ALTER COLUMN balance SET DEFAULT 0.00; y vuelve a correr v16.',
      coalesce(v_default, 'NULL');
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- FIX 1.1 — profiles: quitar UPDATE amplio, permitir solo columnas de perfil
-- Bloquea: auto-asignarse balance/points/is_admin vía update directo.
-- service_role conserva su grant (webhook de saldo sigue funcionando).
-- ══════════════════════════════════════════════════════════════════════════
REVOKE UPDATE ON public.profiles FROM anon, authenticated;
GRANT  UPDATE (username, display_name, avatar_url, fortnite_username)
       ON public.profiles TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- FIX 1.4 — tournaments: quitar UPDATE amplio, permitir solo columnas cosméticas
-- Bloquea: que el creador infle prize_pool / cambie status / winner_id.
-- Las 3 columnas que escribe createTournament (is_creator, stream_url,
-- chat_pot_enabled) están incluidas → ese flujo no se rompe.
-- ══════════════════════════════════════════════════════════════════════════
REVOKE UPDATE ON public.tournaments FROM anon, authenticated;
GRANT  UPDATE (stream_url, chat_pot_enabled, is_creator, rules, description)
       ON public.tournaments TO authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- FIX 1.2 — match_bets: quitar la policy de ESCRITURA (FOR ALL)
-- Bloquea: insertar apuestas sin pagar puntos / fuera de ventana / inflar amount.
-- Se CONSERVA match_bets_read (SELECT true) porque el pozo en vivo del
-- espectador depende de ella (realtime respeta RLS). Las escrituras siguen
-- solo por place_bet / resolve_bets_internal / refund_bets (SECURITY DEFINER).
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS match_bets_own ON public.match_bets;

-- ══════════════════════════════════════════════════════════════════════════
-- FIX 1.3 — store_redemptions: quitar FOR ALL, dejar solo SELECT propia
-- Bloquea: crear canjes sin gastar puntos / marcarlos 'fulfilled'.
-- Aquí NO había lectura pública, así que sí agregamos SELECT propia para que
-- el usuario siga viendo sus canjes. redeem_product (definer) sigue insertando.
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS store_redemptions_own ON public.store_redemptions;
CREATE POLICY store_redemptions_read_own ON public.store_redemptions
  FOR SELECT USING (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════════
-- FIX 1.6 — spectator_sessions: quitar la policy de ESCRITURA (FOR ALL)
-- Bloquea: setear voted_for tras ver el resultado para farmear puntos.
-- Se CONSERVA spectator_sessions_read (SELECT true) para el conteo de votos.
-- Escrituras solo por join_spectate / leave_spectate / vote_for_player (definer).
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS spectator_sessions_own ON public.spectator_sessions;

-- ══════════════════════════════════════════════════════════════════════════
-- FIX 1.5 — matches: quitar UPDATE de participantes
-- Bloquea: que un jugador setee winner_id/status/betting_closes_at directo.
-- El resultado se reporta solo por submit_match_result (definer).
-- Se conserva "Admin can update any match" y "Matches viewable by everyone".
-- ══════════════════════════════════════════════════════════════════════════
DROP POLICY IF EXISTS "Participants can update their match result" ON public.matches;

-- ══════════════════════════════════════════════════════════════════════════
-- FIX 2.1 — resolve_bets_internal / refund_bets: no invocables por el cliente
-- Bloquea: llamar resolve_bets_internal(match, ganador_elegido) para robar el pozo.
-- Las funciones definer que las usan corren como owner (postgres) → siguen OK.
-- ══════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.resolve_bets_internal(uuid, uuid)
  FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_bets(uuid)
  FROM public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- FIX 2.3 — add_points: no invocable por el cliente, solo service_role
-- Bloquea: rpc('add_points', {user_id: self, pts: 1e9}) para puntos gratis.
-- Firma confirmada contra la BD viva (2026-07-05): add_points(user_id uuid, pts integer).
-- ══════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.add_points(uuid, integer)
  FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.add_points(uuid, integer)
  TO service_role;   -- el webhook lo llama con service_role

-- ══════════════════════════════════════════════════════════════════════════
-- FIX 2.2 — report_match_result: eliminar la función self-winner
-- Bloquea: que un jugador se declare ganador y cobre el premio al instante.
-- Reemplazada en el código por submit_match_result (doble confirmación).
-- Correr DESPUÉS de desplegar el cambio de código que elimina sus llamadas.
-- ══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.report_match_result(uuid, uuid);

COMMIT;
