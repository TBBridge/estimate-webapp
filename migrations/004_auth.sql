-- Phase 1: サーバーサイド認証の基盤（追加のみ・破壊的変更なし）
--
-- 既存の system_users.password / agencies.login_password（平文）はこの段階では触らず、
-- Phase 2 で「次回ログイン成功時に bcrypt ハッシュへ遅延移行」する。
-- Phase 2 では dual-write で平文も維持し、Phase 3 で平文を空文字化する。

-- パスワードハッシュ列（NULL 可。Phase 2 のログイン成功時に書き込まれる）
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE agencies     ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- 移行完了タイムスタンプ（観測用）
ALTER TABLE system_users ADD COLUMN IF NOT EXISTS password_migrated_at TIMESTAMPTZ;
ALTER TABLE agencies     ADD COLUMN IF NOT EXISTS password_migrated_at TIMESTAMPTZ;

-- system_users.role の値域を制約（admin / approver のみ）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'system_users_role_check'
  ) THEN
    ALTER TABLE system_users
      ADD CONSTRAINT system_users_role_check
      CHECK (role IN ('admin', 'approver'));
  END IF;
END $$;

-- セッション失効リスト（logout 時のみ INSERT。期限切れ行は Cron で削除）
CREATE TABLE IF NOT EXISTS session_revocations (
  jti        TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_session_revocations_expires
  ON session_revocations(expires_at);

-- ログイン試行ログ（Phase 4 のレート制限で利用）
CREATE TABLE IF NOT EXISTS login_attempts (
  id           BIGSERIAL PRIMARY KEY,
  email        TEXT,
  ip           TEXT,
  success      BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time
  ON login_attempts(ip, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_attempts_email_time
  ON login_attempts(email, attempted_at DESC);
