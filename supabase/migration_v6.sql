-- migration_v6.sql — Spectators, monetization, sponsors, store
-- Idempotent: uses IF NOT EXISTS / CREATE OR REPLACE throughout

-- ── NEW COLUMNS ──────────────────────────────────────────────────────────────

ALTER TABLE tournaments
  ADD COLUMN IF NOT EXISTS is_creator boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS stream_url text,
  ADD COLUMN IF NOT EXISTS chat_pot_enabled boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS chat_pot_amount numeric(10,2) DEFAULT 0 NOT NULL;

ALTER TABLE matches
  ADD COLUMN IF NOT EXISTS spectator_count int DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS sponsor_id uuid REFERENCES profiles(id);

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_vip boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS vip_expires_at timestamptz;

-- ── NEW TABLES ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS spectator_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  voted_for uuid REFERENCES profiles(id),
  joined_at timestamptz DEFAULT now() NOT NULL,
  left_at timestamptz,
  points_earned int DEFAULT 0 NOT NULL,
  UNIQUE(match_id, user_id)
);

CREATE TABLE IF NOT EXISTS spectator_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid REFERENCES matches(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 200),
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS sponsors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES tournaments(id) ON DELETE CASCADE NOT NULL,
  player_id uuid REFERENCES profiles(id) NOT NULL,
  sponsor_id uuid REFERENCES profiles(id) NOT NULL,
  amount numeric(10,2) NOT NULL,
  status text DEFAULT 'active' NOT NULL CHECK (status IN ('active','won','lost')),
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(tournament_id, player_id)
);

CREATE TABLE IF NOT EXISTS store_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text NOT NULL CHECK (category IN ('fortnite','tarjetas','merch')),
  points_cost int NOT NULL CHECK (points_cost > 0),
  image_url text,
  stock int,
  is_active boolean DEFAULT true NOT NULL,
  sort_order int DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS store_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  product_id uuid REFERENCES store_products(id) NOT NULL,
  points_spent int NOT NULL,
  status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending','fulfilled','cancelled')),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE spectator_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE spectator_chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE sponsors ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_redemptions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='spectator_sessions' AND policyname='spectator_sessions_read') THEN
    CREATE POLICY spectator_sessions_read ON spectator_sessions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='spectator_sessions' AND policyname='spectator_sessions_own') THEN
    CREATE POLICY spectator_sessions_own ON spectator_sessions FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='spectator_chat_messages' AND policyname='chat_read') THEN
    CREATE POLICY chat_read ON spectator_chat_messages FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='spectator_chat_messages' AND policyname='chat_insert') THEN
    CREATE POLICY chat_insert ON spectator_chat_messages FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='sponsors' AND policyname='sponsors_read') THEN
    CREATE POLICY sponsors_read ON sponsors FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='store_products' AND policyname='store_products_read') THEN
    CREATE POLICY store_products_read ON store_products FOR SELECT USING (is_active = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='store_redemptions' AND policyname='store_redemptions_own') THEN
    CREATE POLICY store_redemptions_own ON store_redemptions FOR ALL USING (auth.uid() = user_id);
  END IF;
END $$;

-- ── SEED PRODUCTS ─────────────────────────────────────────────────────────────

INSERT INTO store_products (name, description, category, points_cost, stock, sort_order) VALUES
  ('1,000 Pavos Fortnite', 'Código de 1,000 V-Bucks para Fortnite', 'fortnite', 5000, 10, 1),
  ('Skin Rara Fortnite', 'Código de skin rara aleatoria', 'fortnite', 8000, 5, 2),
  ('Tarjeta Amazon $100', 'Gift card Amazon MXN $100', 'tarjetas', 12000, 20, 3),
  ('Tarjeta MercadoLibre $100', 'Gift card MercadoLibre $100 MXN', 'tarjetas', 12000, 20, 4),
  ('Camiseta Risk Gaming', 'Playera oficial Risk Gaming talla a elegir', 'merch', 15000, null, 5),
  ('Hoodie Risk Gaming', 'Sudadera premium Risk Gaming', 'merch', 25000, null, 6)
ON CONFLICT DO NOTHING;

-- ── RPCs ──────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION join_spectate(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO spectator_sessions(match_id, user_id)
  VALUES (p_match_id, auth.uid())
  ON CONFLICT (match_id, user_id) DO UPDATE SET left_at = NULL;

  UPDATE matches
  SET spectator_count = (
    SELECT COUNT(*) FROM spectator_sessions
    WHERE match_id = p_match_id AND left_at IS NULL
  )
  WHERE id = p_match_id;
END;
$$;

CREATE OR REPLACE FUNCTION leave_spectate(p_match_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE spectator_sessions
  SET left_at = now(),
      points_earned = CASE WHEN points_earned < 10 THEN points_earned + 10 ELSE points_earned END
  WHERE match_id = p_match_id AND user_id = auth.uid() AND left_at IS NULL;

  IF FOUND THEN
    UPDATE profiles SET points = points + 10 WHERE id = auth.uid();
    UPDATE matches
    SET spectator_count = (
      SELECT COUNT(*) FROM spectator_sessions
      WHERE match_id = p_match_id AND left_at IS NULL
    )
    WHERE id = p_match_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION vote_for_player(p_match_id uuid, p_voted_for uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE spectator_sessions
  SET voted_for = p_voted_for
  WHERE match_id = p_match_id AND user_id = auth.uid();
END;
$$;

CREATE OR REPLACE FUNCTION award_correct_prediction(p_match_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_match matches;
  v_session spectator_sessions;
BEGIN
  SELECT * INTO v_match FROM matches WHERE id = p_match_id;
  IF NOT FOUND OR v_match.winner_id IS NULL THEN RETURN false; END IF;

  SELECT * INTO v_session FROM spectator_sessions
  WHERE match_id = p_match_id AND user_id = auth.uid();
  IF NOT FOUND THEN RETURN false; END IF;

  IF v_session.voted_for = v_match.winner_id AND v_session.points_earned < 50 THEN
    UPDATE spectator_sessions
    SET points_earned = points_earned + 50
    WHERE match_id = p_match_id AND user_id = auth.uid();
    UPDATE profiles SET points = points + 50 WHERE id = auth.uid();
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION send_chat_message(p_match_id uuid, p_content text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM spectator_chat_messages
    WHERE match_id = p_match_id AND user_id = auth.uid()
      AND created_at > now() - interval '2 seconds'
  ) THEN
    RAISE EXCEPTION 'rate_limit';
  END IF;

  INSERT INTO spectator_chat_messages(match_id, user_id, content)
  VALUES (p_match_id, auth.uid(), trim(p_content))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION sponsor_player(p_tournament_id uuid, p_player_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tournament tournaments;
  v_sponsor_balance numeric;
BEGIN
  SELECT * INTO v_tournament FROM tournaments WHERE id = p_tournament_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'tournament_not_found'; END IF;
  IF v_tournament.status != 'open' THEN RAISE EXCEPTION 'tournament_not_open'; END IF;
  IF v_tournament.created_by = auth.uid() THEN RAISE EXCEPTION 'cannot_sponsor_own'; END IF;

  IF EXISTS (SELECT 1 FROM sponsors WHERE tournament_id = p_tournament_id AND player_id = p_player_id) THEN
    RAISE EXCEPTION 'already_sponsored';
  END IF;

  SELECT balance INTO v_sponsor_balance FROM profiles WHERE id = auth.uid();
  IF v_sponsor_balance < v_tournament.entry_fee THEN RAISE EXCEPTION 'insufficient_balance'; END IF;

  UPDATE profiles SET balance = balance - v_tournament.entry_fee WHERE id = auth.uid();

  INSERT INTO sponsors(tournament_id, player_id, sponsor_id, amount)
  VALUES (p_tournament_id, p_player_id, auth.uid(), v_tournament.entry_fee);
END;
$$;

CREATE OR REPLACE FUNCTION redeem_product(p_product_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_product store_products;
  v_user_points int;
  v_redemption_id uuid;
BEGIN
  SELECT * INTO v_product FROM store_products WHERE id = p_product_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_not_found'; END IF;
  IF v_product.stock IS NOT NULL AND v_product.stock <= 0 THEN RAISE EXCEPTION 'out_of_stock'; END IF;

  SELECT points INTO v_user_points FROM profiles WHERE id = auth.uid();
  IF v_user_points < v_product.points_cost THEN RAISE EXCEPTION 'insufficient_points'; END IF;

  UPDATE profiles SET points = points - v_product.points_cost WHERE id = auth.uid();

  IF v_product.stock IS NOT NULL THEN
    UPDATE store_products SET stock = stock - 1 WHERE id = p_product_id;
  END IF;

  INSERT INTO store_redemptions(user_id, product_id, points_spent)
  VALUES (auth.uid(), p_product_id, v_product.points_cost)
  RETURNING id INTO v_redemption_id;

  RETURN v_redemption_id;
END;
$$;

-- ── REALTIME ──────────────────────────────────────────────────────────────────

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE spectator_sessions;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE spectator_chat_messages;
EXCEPTION WHEN others THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE sponsors;
EXCEPTION WHEN others THEN NULL; END $$;
