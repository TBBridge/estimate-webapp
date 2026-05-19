-- 承認通知（承認/差し戻し → 代理店担当者宛）専用の設定キーを追加
-- 既存 app_settings には触らず、未投入のキーだけ追加する
INSERT INTO app_settings (key, value) VALUES
  ('decision_gmail_from',       ''),
  ('decision_gmail_password',   ''),
  ('decision_subject_template', ''),
  ('decision_body_template',    '')
ON CONFLICT (key) DO NOTHING;
