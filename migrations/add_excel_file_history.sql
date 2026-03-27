-- Neon / psql: Excel 差し替え履歴（Vercel Blob は同一パス上書き不可のため世代別パスで保存）
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS excel_file_history JSONB NOT NULL DEFAULT '[]'::jsonb;
