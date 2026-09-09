CREATE TABLE IF NOT EXISTS customer_users (
  id BIGSERIAL PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS customer_sessions_user_id_idx ON customer_sessions(user_id);
CREATE INDEX IF NOT EXISTS customer_sessions_expires_at_idx ON customer_sessions(expires_at);

CREATE TABLE IF NOT EXISTS customer_addresses (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  details JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_addresses_user_idx ON customer_addresses(user_id);

-- Preview orders only; these do not reserve stock or dispatch a delivery.
CREATE TABLE IF NOT EXISTS customer_preview_orders (
  reference TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  details JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'Confirmed' CHECK (status IN ('Confirmed', 'Preparing', 'Out for Delivery', 'Delivered')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS customer_preview_orders_user_idx ON customer_preview_orders(user_id);
-- Links storefront orders to the authenticated Business Padi owner. Nullable
-- keeps historical preview orders and isolated development databases valid.
ALTER TABLE customer_preview_orders ADD COLUMN IF NOT EXISTS business_user_id UUID;
CREATE INDEX IF NOT EXISTS customer_preview_orders_business_idx
  ON customer_preview_orders(business_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS customer_carts (
  user_id BIGINT PRIMARY KEY REFERENCES customer_users(id) ON DELETE CASCADE,
  items JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS customer_cart_operations (
  user_id BIGINT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  operation_id UUID NOT NULL,
  PRIMARY KEY (user_id, operation_id)
);

-- Separate payment ledger: preview orders can never become paid orders.
CREATE TABLE IF NOT EXISTS customer_payments (
  reference TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES customer_users(id),
  checkout_id UUID NOT NULL,
  email TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo > 0),
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  details JSONB NOT NULL,
  authorization_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  UNIQUE (user_id, checkout_id)
);
CREATE INDEX IF NOT EXISTS customer_payments_user_idx ON customer_payments(user_id);
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS business_user_id UUID;
CREATE INDEX IF NOT EXISTS customer_payments_business_idx
  ON customer_payments(business_user_id, created_at DESC);

-- Delivery progress is separate from the payment ledger. Existing paid orders
-- begin at Confirmed; unpaid orders are still presented as Awaiting payment.
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'Confirmed'
  CHECK (delivery_status IN ('Confirmed', 'Getting a dispatch', 'Out for delivery', 'Delivered'));
