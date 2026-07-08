-- migration_v18.sql — FASE 2, fixes H1 + H2 del reporte de auditoría
-- ═══════════════════════════════════════════════════════════════════════════
-- H1 (ALTA):  make_partner era ejecutable por public/anon/authenticated →
--             cualquiera podía auto-convertirse en "partner" con código de
--             referido. Se cierra revocando EXECUTE a los roles públicos.
-- H2 (MEDIA): 7 funciones SECURITY DEFINER (+ add_points) sin `search_path`
--             fijo → riesgo de search_path injection / warning del linter.
--             Se fija con ALTER FUNCTION (no toca los cuerpos).
--
-- Envuelto en transacción: si algo falla, no aplica nada.
-- Idempotente: re-correrla no cambia el resultado.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- H1 — make_partner: no invocable por el cliente (solo service_role / postgres)
-- Bloquea: rpc('make_partner', {p_email:'yo@x.com'}) para entrar al programa
-- de referidos sin autorización, y de paso el oráculo de enumeración de emails.
--
-- NOTA: NO se añade chequeo interno de auth.uid()/is_admin a propósito. La
-- función no la llama el frontend; sus únicos invocadores legítimos son roles
-- (service_role desde backend, postgres desde el SQL editor), donde auth.uid()
-- es NULL. Un chequeo de sesión rompería ese uso. El REVOKE es la defensa
-- correcta aquí. Si en el futuro un panel de admin necesita llamarla vía JWT,
-- ahí sí se agrega el check de is_admin y se re-otorga EXECUTE a authenticated.
-- ══════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.make_partner(text)
  FROM public, anon, authenticated;

-- ══════════════════════════════════════════════════════════════════════════
-- H2 — Fijar search_path en las funciones SECURITY DEFINER que no lo tenían.
-- ALTER FUNCTION solo cambia el setting; el cuerpo queda idéntico.
-- Valor 'public' para ser consistente con las funciones que ya lo traían
-- (attribute_referral, open_bet_round, propose_moderator, etc.).
-- ══════════════════════════════════════════════════════════════════════════
ALTER FUNCTION public.place_bet(uuid, uuid, integer)            SET search_path TO 'public';
ALTER FUNCTION public.submit_match_result(uuid, uuid, text)     SET search_path TO 'public';
ALTER FUNCTION public.admin_resolve_dispute(uuid, uuid, text)   SET search_path TO 'public';
ALTER FUNCTION public.resolve_bets(uuid, uuid)                  SET search_path TO 'public';
ALTER FUNCTION public.resolve_bets_internal(uuid, uuid)         SET search_path TO 'public';
ALTER FUNCTION public.refund_bets(uuid)                         SET search_path TO 'public';
ALTER FUNCTION public.handle_new_user()                        SET search_path TO 'public';

-- add_points es SECURITY INVOKER (corre como service_role, ya restringida en
-- v16). Se fija igual por consistencia/hardening; riesgo marginal.
ALTER FUNCTION public.add_points(uuid, integer)                SET search_path TO 'public';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-APLICACIÓN (opcional, correr por separado tras el COMMIT):
--
--   -- H1: make_partner ya no debe listar anon/authenticated/PUBLIC en proacl
--   SELECT proname, proacl FROM pg_proc
--   WHERE proname = 'make_partner' AND pronamespace = 'public'::regnamespace;
--
--   -- H2: las 8 funciones deben mostrar search_path=public en proconfig
--   SELECT proname, proconfig FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname IN ('place_bet','submit_match_result','admin_resolve_dispute',
--                     'resolve_bets','resolve_bets_internal','refund_bets',
--                     'handle_new_user','add_points')
--   ORDER BY proname;
-- ═══════════════════════════════════════════════════════════════════════════
