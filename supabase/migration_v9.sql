-- migration_v9.sql — Manual withdrawal review: admin RLS + RPCs

-- Admins can read all transactions (bypasses the user-only RLS from v8)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'transactions_admin'
  ) THEN
    CREATE POLICY transactions_admin ON transactions
      FOR SELECT USING (
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;
END $$;

-- Admin: mark withdrawal as paid
CREATE OR REPLACE FUNCTION admin_complete_withdrawal(p_tx_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  UPDATE transactions
    SET status = 'completed'
  WHERE id = p_tx_id AND type = 'withdrawal' AND status = 'pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;
END;
$$;

-- Admin: reject withdrawal — restore player balance, mark as failed
CREATE OR REPLACE FUNCTION admin_reject_withdrawal(p_tx_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_admin boolean;
  v_user_id  uuid;
  v_amount   numeric;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = auth.uid();
  IF NOT COALESCE(v_is_admin, false) THEN RAISE EXCEPTION 'not_authorized'; END IF;

  SELECT user_id, amount INTO v_user_id, v_amount
  FROM transactions
  WHERE id = p_tx_id AND type = 'withdrawal' AND status = 'pending';

  IF NOT FOUND THEN RAISE EXCEPTION 'withdrawal_not_found'; END IF;

  UPDATE transactions SET status = 'failed' WHERE id = p_tx_id;
  UPDATE profiles    SET balance = balance + v_amount WHERE id = v_user_id;
END;
$$;
