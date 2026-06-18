-- migration_v8.sql — Withdrawals: recipient column, transactions RLS, RPCs

-- Store MP account destination for withdrawal transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS recipient text;

-- RLS: users may only read their own transactions
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'transactions_own'
  ) THEN
    CREATE POLICY transactions_own ON transactions
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Atomic withdrawal: verify balance, deduct, create pending transaction in one TX
CREATE OR REPLACE FUNCTION process_withdrawal(p_amount numeric, p_recipient text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_balance numeric;
  v_tx_id   uuid;
BEGIN
  SELECT balance INTO v_balance FROM profiles WHERE id = auth.uid() FOR UPDATE;
  IF v_balance IS NULL    THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF v_balance < p_amount THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE profiles SET balance = balance - p_amount WHERE id = auth.uid();

  INSERT INTO transactions(user_id, type, amount, status, description, recipient)
  VALUES (auth.uid(), 'withdrawal', p_amount, 'pending', 'Retiro a MercadoPago', p_recipient)
  RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END;
$$;

-- Rollback a failed withdrawal: restore balance and mark transaction failed
CREATE OR REPLACE FUNCTION refund_withdrawal(p_tx_id uuid, p_user_id uuid, p_amount numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE transactions SET status = 'failed'          WHERE id = p_tx_id;
  UPDATE profiles    SET balance = balance + p_amount WHERE id = p_user_id;
END;
$$;
