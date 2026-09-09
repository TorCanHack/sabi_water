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

-- Cancellation is independent of historical delivery and payment state.
ALTER TABLE customer_preview_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE customer_preview_orders ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE customer_preview_orders ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS cancelled_by UUID;
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS refund_status TEXT NOT NULL DEFAULT 'none'
  CHECK (refund_status IN ('none', 'queued', 'submitting', 'pending', 'processing', 'processed', 'needs-attention', 'failed'));
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS refund_id TEXT;
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS refund_error TEXT;
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS refund_checked_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS customer_payments_refund_queue_idx ON customer_payments(refund_status, refund_checked_at)
  WHERE cancelled_at IS NOT NULL AND status = 'paid' AND refund_status <> 'processed';

-- Wallet balances are isolated by customer and Paystack environment.
ALTER TABLE customer_payments ADD COLUMN IF NOT EXISTS payment_source TEXT NOT NULL DEFAULT 'paystack'
  CHECK (payment_source IN ('paystack', 'wallet'));
CREATE TABLE IF NOT EXISTS customer_wallets (
  user_id BIGINT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  balance_kobo BIGINT NOT NULL DEFAULT 0 CHECK (balance_kobo BETWEEN 0 AND 9007199254740991),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, mode)
);
CREATE TABLE IF NOT EXISTS customer_wallet_topups (
  reference TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES customer_users(id) ON DELETE CASCADE,
  checkout_id UUID NOT NULL,
  email TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo BETWEEN 10000 AND 100000000),
  mode TEXT NOT NULL CHECK (mode IN ('test', 'live')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  authorization_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  UNIQUE (user_id, checkout_id)
);
CREATE INDEX IF NOT EXISTS customer_wallet_topups_user_idx ON customer_wallet_topups(user_id, mode, created_at DESC);
CREATE TABLE IF NOT EXISTS customer_wallet_entries (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  mode TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('topup', 'purchase', 'refund')),
  reference TEXT NOT NULL,
  amount_kobo INTEGER NOT NULL CHECK (amount_kobo <> 0),
  balance_after_kobo BIGINT NOT NULL CHECK (balance_after_kobo BETWEEN 0 AND 9007199254740991),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (user_id, mode) REFERENCES customer_wallets(user_id, mode) ON DELETE CASCADE,
  CHECK ((kind = 'purchase' AND amount_kobo < 0) OR (kind IN ('topup', 'refund') AND amount_kobo > 0)),
  UNIQUE (kind, reference)
);
CREATE INDEX IF NOT EXISTS customer_wallet_entries_user_idx ON customer_wallet_entries(user_id, mode, id DESC);
