-- 見積と HubSpot 取引の対応（申請時に find-or-create で取得した deal id）
ALTER TABLE estimates ADD COLUMN IF NOT EXISTS hubspot_deal_id TEXT NOT NULL DEFAULT '';
