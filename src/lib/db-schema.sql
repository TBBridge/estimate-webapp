-- =====================================================
-- estimate-webapp: Neon Postgres スキーマ定義
-- Vercel ダッシュボード > Storage > Neon の SQL Editor
-- または psql で実行してください
-- =====================================================

-- 代理店
CREATE TABLE IF NOT EXISTS agencies (
  id             TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  login_password TEXT NOT NULL DEFAULT '',   -- 代理店ログインパスワード（平文: 運用上簡易認証）
  approver_name  TEXT NOT NULL,
  approver_email TEXT NOT NULL,
  created_at     DATE NOT NULL DEFAULT CURRENT_DATE
);

-- スキーマ追加（既存テーブルへの ALTER）
ALTER TABLE agencies ADD COLUMN IF NOT EXISTS login_password TEXT NOT NULL DEFAULT '';

-- 仕切り率（本製品: 代理店 × 製品 × 提供形態）
CREATE TABLE IF NOT EXISTS margin_rates (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id     TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  agency_name   TEXT NOT NULL,
  product_id    TEXT NOT NULL,
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('onprem','subscription','cloud')),
  rate          NUMERIC(5,4) NOT NULL,
  UNIQUE (agency_id, product_id, delivery_type)
);

-- 仕切り率（保守: 代理店 × 製品）
CREATE TABLE IF NOT EXISTS maintenance_rates (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  agency_id   TEXT NOT NULL REFERENCES agencies(id) ON DELETE CASCADE,
  agency_name TEXT NOT NULL,
  product_id  TEXT NOT NULL DEFAULT 'ireporter',
  rate        NUMERIC(5,4) NOT NULL,
  UNIQUE (agency_id, product_id)
);

-- スキーマ追加（既存テーブルへの ALTER）
ALTER TABLE maintenance_rates ADD COLUMN IF NOT EXISTS product_id TEXT NOT NULL DEFAULT 'ireporter';
ALTER TABLE maintenance_rates DROP CONSTRAINT IF EXISTS maintenance_rates_agency_id_key;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'maintenance_rates_agency_id_product_id_key'
  ) THEN
    ALTER TABLE maintenance_rates ADD CONSTRAINT maintenance_rates_agency_id_product_id_key UNIQUE (agency_id, product_id);
  END IF;
END $$;

-- 製品単価（ティア構造を JSONB で保持）
-- tiers: [{ "min_licenses": 5, "price": 35000 }, ...]
CREATE TABLE IF NOT EXISTS unit_prices (
  id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  product_id    TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  delivery_type TEXT NOT NULL CHECK (delivery_type IN ('onprem','subscription','cloud')),
  tiers         JSONB NOT NULL DEFAULT '[]',
  UNIQUE (product_id, delivery_type)
);

-- 見積（案件）
CREATE TABLE IF NOT EXISTS estimates (
  id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  no              TEXT NOT NULL UNIQUE,
  agency_id       TEXT NOT NULL REFERENCES agencies(id),
  agency_name     TEXT NOT NULL,
  customer_name   TEXT NOT NULL,
  delivery_type   TEXT NOT NULL CHECK (delivery_type IN ('onprem','subscription','cloud')),
  contract_type   TEXT NOT NULL CHECK (contract_type IN ('new','license_add','option_add')),
  cloud_billing   TEXT,            -- 'annual' | 'period' (クラウド新規のみ)
  amount          INTEGER NOT NULL DEFAULT 0,
  maintenance_fee INTEGER NOT NULL DEFAULT 0,
  form_inputs     JSONB NOT NULL DEFAULT '{}',  -- フォーム入力値一式
  excel_url       TEXT NOT NULL DEFAULT '',     -- Vercel Blob の Excel ファイル URL
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved_at     TIMESTAMPTZ
);

-- スキーマ追加（既存テーブルへの ALTER: 初回実行時はスキップ可）
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS cloud_billing TEXT;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS form_inputs JSONB NOT NULL DEFAULT '{}';
ALTER TABLE estimates ALTER COLUMN created_at TYPE TIMESTAMPTZ USING created_at::TIMESTAMPTZ;
ALTER TABLE estimates ALTER COLUMN approved_at TYPE TIMESTAMPTZ USING approved_at::TIMESTAMPTZ;
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS excel_url TEXT NOT NULL DEFAULT '';

-- 見積書テンプレート
CREATE TABLE IF NOT EXISTS templates (
  id            TEXT PRIMARY KEY,          -- 'tpl-1' 〜 'tpl-7' (固定ID)
  delivery_type TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  sub_type      TEXT,                      -- 'annual' | 'period' | NULL
  file_name     TEXT NOT NULL DEFAULT '',  -- アップロードされたファイル名
  blob_url      TEXT NOT NULL DEFAULT '',  -- Vercel Blob の URL
  uploaded_at   DATE NOT NULL DEFAULT CURRENT_DATE
);

-- 通知設定
CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO app_settings (key, value) VALUES
  ('active_channel',  'slack'),          -- 有効チャネル: 'slack' | 'teams' | 'gmail'
  ('slack_target',    ''),               -- Slack Incoming Webhook URL
  ('teams_target',    ''),               -- Teams Incoming Webhook URL
  ('gmail_target',    ''),               -- Gmail 送信先メールアドレス
  ('gmail_from',      ''),               -- Gmail 送信元アドレス
  ('gmail_password',  '')                -- Gmail アプリパスワード
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 初期データ投入（初回のみ実行）
-- =====================================================

-- 代理店
INSERT INTO agencies (id, name, email, approver_name, approver_email, created_at)
VALUES
  ('ag-1','株式会社アルファ','alpha@example.com','田中 太郎','tanaka@alpha.example.com','2024-04-01'),
  ('ag-2','ベータ商事','beta@example.com','鈴木 花子','suzuki@beta.example.com','2024-05-15'),
  ('ag-3','ガンマテック株式会社','gamma@example.com','佐藤 一郎','sato@gamma.example.com','2024-06-01'),
  ('ag-4','デルタソリューションズ','delta@example.com','山田 次郎','yamada@delta.example.com','2024-07-20'),
  ('ag-5','イプシロン情報','epsilon@example.com','中村 三郎','nakamura@epsilon.example.com','2024-09-01')
ON CONFLICT (id) DO NOTHING;

-- 製品単価
INSERT INTO unit_prices (id, product_id, product_name, delivery_type, tiers) VALUES
  ('up-1','ireporter','i-Reporter','onprem','[{"min_licenses":5,"price":35000},{"min_licenses":10,"price":33000},{"min_licenses":20,"price":31000},{"min_licenses":30,"price":30000},{"min_licenses":50,"price":29000},{"min_licenses":100,"price":28000},{"min_licenses":200,"price":27000},{"min_licenses":300,"price":26000},{"min_licenses":500,"price":25000}]'),
  ('up-2','ireporter','i-Reporter','subscription','[{"min_licenses":5,"price":6000},{"min_licenses":10,"price":5500},{"min_licenses":20,"price":5200},{"min_licenses":50,"price":5000},{"min_licenses":100,"price":4800},{"min_licenses":200,"price":4500},{"min_licenses":500,"price":4200}]'),
  ('up-3','ireporter','i-Reporter','cloud','[{"min_licenses":5,"price":30000},{"min_licenses":10,"price":28000},{"min_licenses":20,"price":26000},{"min_licenses":50,"price":25000},{"min_licenses":100,"price":24000},{"min_licenses":200,"price":23000},{"min_licenses":500,"price":22000}]'),
  ('up-4','webapi','Web API','onprem','[{"min_licenses":1,"price":50000}]'),
  ('up-5','conmas_std','ConMas IoT standard版','onprem','[{"min_licenses":1,"price":80000}]'),
  ('up-6','conmas_pro','ConMas IoT professional版','onprem','[{"min_licenses":1,"price":120000}]'),
  ('up-7','conmas_map','ConMas IoT MappingTOOL','onprem','[{"min_licenses":1,"price":60000}]'),
  ('up-8','irepo_link','i-Repo Link','onprem','[{"min_licenses":1,"price":45000}]'),
  ('up-9','irepo_edgeocr','i-Repo EdgeOCR','onprem','[{"min_licenses":1,"price":90000}]'),
  ('up-10','irepo_freedraw','i-Repo FreeDraw','onprem','[{"min_licenses":1,"price":70000}]'),
  ('up-11','irepo_workflow','i-Repo WorkFlow','onprem','[{"min_licenses":1,"price":65000}]')
ON CONFLICT (product_id, delivery_type) DO NOTHING;
