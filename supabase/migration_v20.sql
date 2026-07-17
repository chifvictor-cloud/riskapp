-- migration_v20.sql — Fix: refund_withdrawal (v8) huérfana y ejecutable por cualquiera
-- ═══════════════════════════════════════════════════════════════════════════
-- HALLAZGO (ALTA): refund_withdrawal(p_tx_id uuid, p_user_id uuid, p_amount
-- numeric) es SECURITY DEFINER, no valida auth.uid() ni is_admin, acepta
-- user_id y monto arbitrarios y hace `balance = balance + p_amount` directo
-- sobre profiles. Como Postgres otorga EXECUTE a PUBLIC por default en
-- funciones nuevas (y v8 nunca lo revocó), cualquier usuario logueado puede
-- acreditarse balance infinito vía rpc('refund_withdrawal', {...}).
-- El balance sale por retiros reales de MercadoPago → fuga de dinero real.
--
-- La función está huérfana: grep en src/ da cero llamadas y ninguna otra
-- función SQL la invoca. El rechazo de retiros ya lo cubre
-- admin_reject_withdrawal (v9), que valida is_admin y restaura el balance de
-- forma segura. → Se ELIMINA, no se parcha (mismo criterio que
-- report_match_result en la Fase 1).
--
-- Envuelto en transacción: si algo falla, no aplica nada.
-- Idempotente: el REVOKE va condicionado a que la función exista (en una
-- re-corrida ya no existe y un REVOKE directo tronaría); el DROP es IF EXISTS.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ══════════════════════════════════════════════════════════════════════════
-- 1. REVOKE primero (cinturón y tirantes: si el DROP fallara por alguna
--    dependencia inesperada, la función queda al menos inejecutable por
--    clientes). Condicionado para mantener la idempotencia.
-- ══════════════════════════════════════════════════════════════════════════
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'refund_withdrawal'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.refund_withdrawal(uuid, uuid, numeric)
      FROM public, anon, authenticated;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════════
-- 2. DROP. Huérfana: sin llamadas en código ni en otras funciones de la DB.
-- ══════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.refund_withdrawal(uuid, uuid, numeric);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN POST-APLICACIÓN (opcional, correr por separado tras el COMMIT):
--
--   -- Debe regresar 0 filas:
--   SELECT proname FROM pg_proc
--   WHERE pronamespace = 'public'::regnamespace
--     AND proname = 'refund_withdrawal';
-- ═══════════════════════════════════════════════════════════════════════════
