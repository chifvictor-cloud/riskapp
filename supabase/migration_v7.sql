-- migration_v7.sql — Add mp_payment_id to transactions for idempotency

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS mp_payment_id text UNIQUE;
