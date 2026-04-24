CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE backoffice_role AS ENUM ('owner', 'admin', 'moderator');
CREATE TYPE moderation_state AS ENUM ('visible', 'flagged', 'blocked');
CREATE TYPE creator_status AS ENUM ('draft', 'submitted', 'under_review', 'approved', 'rejected');
CREATE TYPE ledger_status AS ENUM ('pending', 'available', 'paid_out');
CREATE TYPE ledger_kind AS ENUM ('topup', 'tip_out', 'tip_in', 'platform_fee', 'plus_purchase', 'payout');
CREATE TYPE payout_status AS ENUM ('queued', 'processing', 'paid', 'failed', 'held');
CREATE TYPE report_status AS ENUM ('open', 'reviewed', 'actioned', 'dismissed');
CREATE TYPE restriction_type AS ENUM (
  'posting_block',
  'reply_block',
  'vote_block',
  'chat_request_block',
  'geo_switch_block',
  'read_only'
);

CREATE TABLE cities (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  country_code CHAR(2) NOT NULL CHECK (country_code IN ('DE', 'AT', 'CH')),
  centroid GEOGRAPHY(POINT, 4326) NOT NULL,
  is_explorer_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
  email_normalized TEXT NOT NULL UNIQUE,
  email_verified_at TIMESTAMPTZ,
  discoverable BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account_profiles (
  account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  avatar_url TEXT,
  is_creator BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE install_identities (
  id TEXT PRIMARY KEY,
  install_key TEXT NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  account_username TEXT,
  account_display_name TEXT,
  discoverable BOOLEAN NOT NULL DEFAULT FALSE,
  city_id TEXT NOT NULL REFERENCES cities(id),
  city_label TEXT NOT NULL,
  adult_gate_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  adult_verified BOOLEAN NOT NULL DEFAULT FALSE,
  plus_active BOOLEAN NOT NULL DEFAULT FALSE,
  plus JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE account_links (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id) ON DELETE CASCADE,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  unlinked_at TIMESTAMPTZ,
  PRIMARY KEY (account_id, install_identity_id, linked_at)
);

CREATE UNIQUE INDEX account_links_active_install_idx
  ON account_links (install_identity_id)
  WHERE unlinked_at IS NULL;

CREATE TABLE account_login_codes (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL,
  username TEXT NOT NULL,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ
);

CREATE TABLE install_sessions (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  access_token_hash TEXT NOT NULL UNIQUE,
  token_family_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refreshed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT
);

CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id) ON DELETE CASCADE,
  install_session_id TEXT NOT NULL REFERENCES install_sessions(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  token_family_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  replaced_by_token_id TEXT REFERENCES refresh_tokens(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT
);

CREATE TABLE channels (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  city_id TEXT NOT NULL REFERENCES cities(id),
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_exclusive BOOLEAN NOT NULL DEFAULT FALSE,
  is_adult_only BOOLEAN NOT NULL DEFAULT TRUE,
  member_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (city_id, slug)
);

CREATE TABLE account_channel_preferences (
  account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  city_id TEXT NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  favorite_channel_ids TEXT[] NOT NULL DEFAULT '{}',
  joined_channel_ids TEXT[] NOT NULL DEFAULT '{}',
  recent_channel_ids TEXT[] NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (account_id, city_id)
);

CREATE TABLE media_assets (
  id TEXT PRIMARY KEY,
  uploader_install_identity_id TEXT REFERENCES install_identities(id) ON DELETE SET NULL,
  uploader_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image')),
  url TEXT NOT NULL UNIQUE,
  storage_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length >= 0),
  source_file_name TEXT,
  owner_entity_type TEXT,
  owner_entity_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  city_id TEXT NOT NULL REFERENCES cities(id),
  channel_id TEXT REFERENCES channels(id) ON DELETE SET NULL,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  recipient_install_identity_id TEXT REFERENCES install_identities(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  account_username TEXT,
  account_display_name TEXT,
  account_is_creator BOOLEAN NOT NULL DEFAULT FALSE,
  author_label TEXT NOT NULL DEFAULT '',
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
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  recipient_install_identity_id TEXT REFERENCES install_identities(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  account_username TEXT,
  account_display_name TEXT,
  account_is_creator BOOLEAN NOT NULL DEFAULT FALSE,
  author_label TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  tip_total_cents INTEGER NOT NULL DEFAULT 0,
  can_tip BOOLEAN NOT NULL DEFAULT TRUE,
  moderation moderation_state NOT NULL DEFAULT 'visible',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE votes (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  actor_key TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'reply')),
  target_id TEXT NOT NULL,
  value SMALLINT NOT NULL CHECK (value IN (-1, 0, 1)),
  aggregate_score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (actor_key, target_type, target_id)
);

CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT REFERENCES install_identities(id) ON DELETE CASCADE,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('reply', 'vote', 'tip', 'chat_request', 'system', 'moderation')),
  message TEXT NOT NULL,
  target_route TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (install_identity_id IS NOT NULL OR account_id IS NOT NULL)
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  reporter_install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  city_id TEXT NOT NULL REFERENCES cities(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'reply', 'chat', 'user', 'channel')),
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  moderation_case_id TEXT UNIQUE,
  status report_status NOT NULL DEFAULT 'open',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE creator_applications (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  account_username TEXT,
  account_display_name TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  status creator_status NOT NULL DEFAULT 'draft',
  adult_verified BOOLEAN NOT NULL DEFAULT FALSE,
  kyc_state TEXT NOT NULL DEFAULT 'not_started' CHECK (kyc_state IN ('not_started', 'pending', 'verified')),
  payout_state TEXT NOT NULL DEFAULT 'not_ready' CHECK (payout_state IN ('not_ready', 'ready', 'paused')),
  submitted_at TIMESTAMPTZ,
  reviewed_at TIMESTAMPTZ,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE wallet_balances (
  owner_key TEXT PRIMARY KEY,
  install_identity_id TEXT REFERENCES install_identities(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  available_cents INTEGER NOT NULL DEFAULT 0,
  pending_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_tipped_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_earned_cents INTEGER NOT NULL DEFAULT 0,
  lifetime_paid_out_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wallet_topups (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('fake', 'stripe')),
  status TEXT NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed')),
  gross_cents INTEGER NOT NULL CHECK (gross_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ledger_entries (
  id TEXT PRIMARY KEY,
  owner_key TEXT REFERENCES wallet_balances(owner_key) ON DELETE SET NULL,
  install_identity_id TEXT,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  kind ledger_kind NOT NULL,
  status ledger_status NOT NULL DEFAULT 'pending',
  gross_cents INTEGER NOT NULL DEFAULT 0,
  platform_fee_cents INTEGER NOT NULL DEFAULT 0,
  net_cents INTEGER NOT NULL DEFAULT 0,
  ref_type TEXT NOT NULL,
  ref_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE tip_events (
  id TEXT PRIMARY KEY,
  sender_install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  recipient_install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  sender_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  recipient_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('post', 'reply')),
  target_id TEXT NOT NULL,
  gross_cents INTEGER NOT NULL CHECK (gross_cents > 0),
  platform_fee_cents INTEGER NOT NULL CHECK (platform_fee_cents >= 0),
  creator_net_cents INTEGER NOT NULL CHECK (creator_net_cents >= 0),
  status ledger_status NOT NULL DEFAULT 'pending',
  ledger_entry_id TEXT REFERENCES ledger_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payout_accounts (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL CHECK (provider IN ('manual', 'adult_psp')),
  label TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'review_required', 'ready', 'paused')),
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE payouts (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  payout_account_id TEXT NOT NULL REFERENCES payout_accounts(id) ON DELETE RESTRICT,
  status payout_status NOT NULL DEFAULT 'queued',
  gross_cents INTEGER NOT NULL CHECK (gross_cents >= 0),
  fee_cents INTEGER NOT NULL CHECK (fee_cents >= 0),
  net_cents INTEGER NOT NULL CHECK (net_cents >= 0),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

CREATE TABLE feature_flags (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  audience TEXT NOT NULL CHECK (audience IN ('all', 'plus', 'creators', 'admins')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE plus_products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  billing_period TEXT NOT NULL CHECK (billing_period IN ('month')),
  features TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE city_health_snapshots (
  city_id TEXT PRIMARY KEY REFERENCES cities(id) ON DELETE CASCADE,
  live_posts INTEGER NOT NULL DEFAULT 0,
  open_reports INTEGER NOT NULL DEFAULT 0,
  active_creators INTEGER NOT NULL DEFAULT 0,
  wallet_volume_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE moderation_cases (
  id TEXT PRIMARY KEY,
  report_id TEXT UNIQUE REFERENCES reports(id) ON DELETE SET NULL,
  city_id TEXT REFERENCES cities(id),
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'actioned')),
  resolved_by_admin_id TEXT,
  resolution_note TEXT NOT NULL DEFAULT '',
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE reports
  ADD CONSTRAINT reports_moderation_case_id_fkey
  FOREIGN KEY (moderation_case_id)
  REFERENCES moderation_cases(id)
  ON DELETE SET NULL;

CREATE TABLE moderation_actions (
  id TEXT PRIMARY KEY,
  moderation_case_id TEXT NOT NULL REFERENCES moderation_cases(id) ON DELETE CASCADE,
  admin_identity_id TEXT NOT NULL,
  actor_label TEXT NOT NULL DEFAULT '',
  actor_role backoffice_role,
  action TEXT NOT NULL CHECK (
    action IN (
      'dismiss',
      'hide_content',
      'block_content',
      'warn_user',
      'restrict_user',
      'approve_creator',
      'reject_creator',
      'pause_payouts',
      'verify_channel',
      'block',
      'flag',
      'restore'
    )
  ),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE creator_reviews (
  id TEXT PRIMARY KEY,
  creator_application_id TEXT NOT NULL REFERENCES creator_applications(id) ON DELETE CASCADE,
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'request_changes')),
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE backoffice_users (
  id TEXT PRIMARY KEY,
  role backoffice_role NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  disabled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE backoffice_sessions (
  id TEXT PRIMARY KEY,
  backoffice_user_id TEXT NOT NULL REFERENCES backoffice_users(id) ON DELETE CASCADE,
  role_at_issue backoffice_role NOT NULL,
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('loopback_dev_headers', 'trusted_proxy', 'trusted_proxy_session')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT
);

CREATE TABLE backoffice_actions (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_role backoffice_role NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_type TEXT NOT NULL CHECK (actor_type IN ('install', 'admin', 'system')),
  actor_id TEXT NOT NULL,
  actor_role backoffice_role,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  idempotency_key TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE idempotency_keys (
  id TEXT PRIMARY KEY,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  UNIQUE (scope, idempotency_key)
);

CREATE TABLE api_store_snapshots (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_requests (
  id TEXT PRIMARY KEY,
  from_install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  from_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  to_install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  to_account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  post_id TEXT REFERENCES posts(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_messages (
  id TEXT PRIMARY KEY,
  chat_request_id TEXT NOT NULL REFERENCES chat_requests(id) ON DELETE CASCADE,
  sender_install_identity_id TEXT NOT NULL REFERENCES install_identities(id),
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  media JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE TABLE install_security_state (
  install_identity_id TEXT PRIMARY KEY REFERENCES install_identities(id) ON DELETE CASCADE,
  device_risk_score INTEGER NOT NULL DEFAULT 0,
  flagged_at TIMESTAMPTZ,
  restricted_at TIMESTAMPTZ,
  last_geo_city_id TEXT REFERENCES cities(id) ON DELETE SET NULL,
  last_geo_lat DOUBLE PRECISION,
  last_geo_lng DOUBLE PRECISION,
  last_geo_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE install_restrictions (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT NOT NULL REFERENCES install_identities(id) ON DELETE CASCADE,
  type restriction_type NOT NULL,
  reason_code TEXT NOT NULL,
  trigger_source TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE geo_events (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT REFERENCES install_identities(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  city_id TEXT REFERENCES cities(id) ON DELETE SET NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  kind TEXT NOT NULL,
  risk_delta INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE abuse_events (
  id TEXT PRIMARY KEY,
  install_identity_id TEXT REFERENCES install_identities(id) ON DELETE SET NULL,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  ip_hash TEXT,
  route_name TEXT NOT NULL,
  kind TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE rate_limit_counters (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  window_ends_at TIMESTAMPTZ NOT NULL,
  blocked_until TIMESTAMPTZ,
  last_exceeded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX accounts_discoverable_username_idx ON accounts (discoverable, username);
CREATE INDEX account_login_codes_email_created_idx ON account_login_codes (email_normalized, created_at DESC);
CREATE INDEX account_profiles_creator_idx ON account_profiles (is_creator);
CREATE INDEX install_identities_account_idx ON install_identities (account_id);
CREATE INDEX install_sessions_identity_created_idx ON install_sessions (install_identity_id, created_at DESC);
CREATE INDEX install_sessions_status_seen_idx ON install_sessions (status, last_seen_at DESC);
CREATE INDEX install_sessions_account_seen_idx ON install_sessions (account_id, last_seen_at DESC);
CREATE INDEX refresh_tokens_session_created_idx ON refresh_tokens (install_session_id, created_at DESC);
CREATE INDEX refresh_tokens_family_created_idx ON refresh_tokens (token_family_id, created_at DESC);
CREATE INDEX channels_city_slug_idx ON channels (city_id, slug);
CREATE INDEX media_assets_owner_idx ON media_assets (owner_entity_type, owner_entity_id, created_at DESC);
CREATE INDEX posts_city_created_idx ON posts (city_id, created_at DESC);
CREATE INDEX posts_channel_created_idx ON posts (channel_id, created_at DESC);
CREATE INDEX posts_account_created_idx ON posts (account_id, created_at DESC);
CREATE INDEX posts_score_idx ON posts (city_id, score DESC);
CREATE INDEX replies_post_created_idx ON replies (post_id, created_at ASC);
CREATE INDEX replies_account_created_idx ON replies (account_id, created_at DESC);
CREATE INDEX notifications_identity_created_idx ON notifications (install_identity_id, created_at DESC);
CREATE INDEX notifications_account_created_idx ON notifications (account_id, created_at DESC);
CREATE INDEX reports_status_created_idx ON reports (status, created_at DESC);
CREATE INDEX reports_city_created_idx ON reports (city_id, created_at DESC);
CREATE INDEX reports_account_created_idx ON reports (account_id, created_at DESC);
CREATE UNIQUE INDEX creator_applications_install_unique_idx ON creator_applications (install_identity_id);
CREATE UNIQUE INDEX creator_applications_account_unique_idx ON creator_applications (account_id) WHERE account_id IS NOT NULL;
CREATE INDEX wallet_balances_account_idx ON wallet_balances (account_id);
CREATE INDEX wallet_topups_install_created_idx ON wallet_topups (install_identity_id, created_at DESC);
CREATE INDEX wallet_topups_account_created_idx ON wallet_topups (account_id, created_at DESC);
CREATE INDEX ledger_entries_owner_created_idx ON ledger_entries (owner_key, created_at DESC);
CREATE INDEX ledger_entries_account_created_idx ON ledger_entries (account_id, created_at DESC);
CREATE INDEX ledger_entries_ref_idx ON ledger_entries (ref_type, ref_id, created_at DESC);
CREATE INDEX tip_events_sender_account_created_idx ON tip_events (sender_account_id, created_at DESC);
CREATE INDEX tip_events_recipient_account_created_idx ON tip_events (recipient_account_id, created_at DESC);
CREATE INDEX payout_accounts_install_state_idx ON payout_accounts (install_identity_id, state);
CREATE INDEX payout_accounts_account_state_idx ON payout_accounts (account_id, state);
CREATE INDEX payouts_status_requested_idx ON payouts (status, requested_at DESC);
CREATE INDEX payouts_account_requested_idx ON payouts (account_id, requested_at DESC);
CREATE INDEX feature_flags_enabled_audience_idx ON feature_flags (enabled, audience);
CREATE INDEX city_health_snapshots_updated_idx ON city_health_snapshots (updated_at DESC);
CREATE INDEX moderation_cases_status_created_idx ON moderation_cases (status, created_at DESC);
CREATE INDEX moderation_cases_account_created_idx ON moderation_cases (account_id, created_at DESC);
CREATE INDEX moderation_actions_case_created_idx ON moderation_actions (moderation_case_id, created_at DESC);
CREATE INDEX creator_reviews_application_created_idx ON creator_reviews (creator_application_id, created_at DESC);
CREATE INDEX backoffice_actions_entity_created_idx ON backoffice_actions (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_logs_entity_created_idx ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX audit_logs_created_idx ON audit_logs (created_at DESC);
CREATE INDEX idempotency_keys_scope_created_idx ON idempotency_keys (scope, created_at DESC);
CREATE INDEX api_store_snapshots_updated_idx ON api_store_snapshots (updated_at DESC);
CREATE INDEX chat_requests_from_account_created_idx ON chat_requests (from_account_id, created_at DESC);
CREATE INDEX chat_requests_to_account_created_idx ON chat_requests (to_account_id, created_at DESC);
CREATE INDEX chat_messages_request_created_idx ON chat_messages (chat_request_id, created_at DESC);
CREATE INDEX install_restrictions_active_idx ON install_restrictions (install_identity_id, type, ends_at DESC);
CREATE INDEX geo_events_install_created_idx ON geo_events (install_identity_id, created_at DESC);
CREATE INDEX abuse_events_install_created_idx ON abuse_events (install_identity_id, created_at DESC);
CREATE INDEX abuse_events_route_created_idx ON abuse_events (route_name, created_at DESC);
