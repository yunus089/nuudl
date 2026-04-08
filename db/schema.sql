CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE moderation_state AS ENUM ('visible', 'flagged', 'blocked');
CREATE TYPE creator_status AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected');
CREATE TYPE ledger_status AS ENUM ('pending', 'available', 'paid_out');
CREATE TYPE ledger_kind AS ENUM ('topup', 'tip_out', 'tip_in', 'platform_fee', 'plus_purchase', 'payout');
CREATE TYPE report_status AS ENUM ('open', 'reviewed', 'actioned', 'dismissed');

CREATE TABLE cities (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  country_code CHAR(2) NOT NULL,
  centroid GEOGRAPHY(POINT, 4326) NOT NULL,
  is_explorer_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE install_identities (
  id UUID PRIMARY KEY,
  install_key TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  city_id UUID REFERENCES cities(id),
  adult_gate_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  adult_verified BOOLEAN NOT NULL DEFAULT FALSE,
  plus_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE install_sessions (
  id UUID PRIMARY KEY,
  install_identity_id UUID NOT NULL REFERENCES install_identities(id) ON DELETE CASCADE,
  access_token_hash TEXT NOT NULL UNIQUE,
  token_family_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT
);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY,
  install_identity_id UUID NOT NULL REFERENCES install_identities(id) ON DELETE CASCADE,
  install_session_id UUID NOT NULL REFERENCES install_sessions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_family_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  replaced_by_token_id UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT
);

CREATE TABLE channels (
  id UUID PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  city_id UUID REFERENCES cities(id),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_exclusive BOOLEAN NOT NULL DEFAULT FALSE,
  is_adult_only BOOLEAN NOT NULL DEFAULT TRUE,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE posts (
  id UUID PRIMARY KEY,
  city_id UUID NOT NULL REFERENCES cities(id),
  channel_id UUID REFERENCES channels(id),
  install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  body TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  tags TEXT[] NOT NULL DEFAULT '{}',
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  tip_total_cents INTEGER NOT NULL DEFAULT 0,
  can_tip BOOLEAN NOT NULL DEFAULT TRUE,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  moderation moderation_state NOT NULL DEFAULT 'visible',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE replies (
  id UUID PRIMARY KEY,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  body TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  tip_total_cents INTEGER NOT NULL DEFAULT 0,
  can_tip BOOLEAN NOT NULL DEFAULT TRUE,
  moderation moderation_state NOT NULL DEFAULT 'visible',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE votes (
  id UUID PRIMARY KEY,
  install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'reply')),
  target_id UUID NOT NULL,
  value SMALLINT NOT NULL CHECK (value IN (-1, 1)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (install_identity_id, target_type, target_id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE reports (
  id UUID PRIMARY KEY,
  reporter_install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  city_id UUID NOT NULL REFERENCES cities(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'reply', 'chat', 'user', 'channel')),
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  moderation_case_id UUID UNIQUE,
  status report_status NOT NULL DEFAULT 'open',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE creator_applications (
  id UUID PRIMARY KEY,
  install_identity_id UUID NOT NULL UNIQUE REFERENCES install_identities(id),
  display_name TEXT NOT NULL DEFAULT '',
  status creator_status NOT NULL DEFAULT 'draft',
  adult_verified BOOLEAN NOT NULL DEFAULT FALSE,
  kyc_state TEXT NOT NULL DEFAULT 'not_started',
  payout_state TEXT NOT NULL DEFAULT 'not_ready',
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE wallet_balances (
  install_identity_id UUID PRIMARY KEY REFERENCES install_identities(id),
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  available_cents INTEGER NOT NULL DEFAULT 0,
  pending_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_tipped_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_earned_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_paid_out_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY,
  install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  kind ledger_kind NOT NULL,
  status ledger_status NOT NULL DEFAULT 'pending',
  gross_cents INTEGER NOT NULL DEFAULT 0,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  ref_type TEXT NOT NULL,
  ref_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tip_events (
  id UUID PRIMARY KEY,
  sender_install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  recipient_install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'reply')),
  target_id UUID NOT NULL,
  gross_cents INTEGER NOT NULL,
  platform_fee_cents INTEGER NOT NULL,
  creator_net_cents INTEGER NOT NULL,
  status ledger_status NOT NULL DEFAULT 'pending',
  ledger_entry_id UUID REFERENCES ledger_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE moderation_cases (
  id UUID PRIMARY KEY,
  report_id UUID UNIQUE REFERENCES reports(id) ON DELETE SET NULL,
  city_id UUID REFERENCES cities(id),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  resolved_by_admin_id TEXT,
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE moderation_actions (
  id UUID PRIMARY KEY,
  moderation_case_id UUID NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
  admin_identity_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('block', 'flag', 'restore', 'dismiss')),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reports
  ADD CONSTRAINT reports_moderation_case_id_fkey
  FOREIGN KEY (moderation_case_id)
  REFERENCES moderation_cases(id)
  ON DELETE SET NULL;

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('install', 'admin', 'system')),
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  UNIQUE (scope, idempotency_key)
);

CREATE TABLE chat_requests (
  id UUID PRIMARY KEY,
  from_install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  to_install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  post_id UUID REFERENCES posts(id),
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY,
  chat_request_id UUID NOT NULL REFERENCES chat_requests(id) ON DELETE CASCADE,
  sender_install_identity_id UUID NOT NULL REFERENCES install_identities(id),
  body TEXT NOT NULL,
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX posts_city_created_idx ON posts (city_id, created_at DESC);
CREATE INDEX install_sessions_identity_created_idx ON install_sessions (install_identity_id, created_at DESC);
CREATE INDEX install_sessions_status_seen_idx ON install_sessions (status, last_seen_at DESC);
CREATE INDEX refresh_tokens_session_created_idx ON refresh_tokens (install_session_id, created_at DESC);
CREATE INDEX refresh_tokens_family_created_idx ON refresh_tokens (token_family_id, created_at DESC);
CREATE INDEX posts_channel_created_idx ON posts (channel_id, created_at DESC);
CREATE INDEX posts_score_idx ON posts (city_id, score DESC);
CREATE INDEX install_sessions_identity_seen_idx ON install_sessions (install_identity_id, last_seen_at DESC);
CREATE INDEX replies_post_created_idx ON replies (post_id, created_at ASC);
CREATE INDEX notifications_identity_created_idx ON notifications (install_identity_id, created_at DESC);
CREATE INDEX reports_status_created_idx ON reports (status, created_at DESC);
CREATE INDEX reports_city_created_idx ON reports (city_id, created_at DESC);
CREATE INDEX moderation_cases_status_created_idx ON moderation_cases (status, created_at DESC);
CREATE INDEX moderation_actions_case_created_idx ON moderation_actions (moderation_case_id, created_at DESC);
CREATE INDEX audit_logs_entity_created_idx ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX idempotency_keys_scope_created_idx ON idempotency_keys (scope, created_at DESC);
CREATE INDEX ledger_entries_identity_created_idx ON ledger_entries (install_identity_id, created_at DESC);
CREATE INDEX ledger_entries_ref_idx ON ledger_entries (ref_type, ref_id, created_at DESC);
