# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

代理店向け見積自動作成 Web アプリ（Next.js 15 App Router / React 19 / TypeScript）。Vercel にデプロイし、Neon Postgres を本体ストレージとして使用。kintone（ライセンス参照アプリ・営業案件管理アプリ）と HubSpot CRM、CloudConvert（Excel→PDF）と連携する。要件詳細は `requirements-specification.md`。

## 開発コマンド

```bash
npm install          # 初回・依存追加後（postinstall で husky 有効化）
npm run dev          # Next.js dev サーバ (turbopack) http://localhost:3000
npm run build        # 本番ビルド
npm start            # 本番起動
npm run lint         # next lint (ESLint)
npm test             # vitest run（ワンショット）
npm run test:watch   # vitest（ウォッチ）
npm run test:coverage  # v8 カバレッジ（include: src/lib/auth/**）
```

単一テストファイル: `npx vitest run src/lib/auth/__tests__/session.test.ts`
名前で絞り込み: `npx vitest run -t "renewSession"`

ルートにあるスクリプト類 (`check-pdf-prep.mjs`, `check-template.mjs`, `get-excel-url.mjs` 等) は Excel テンプレート / PDF 生成パイプラインのデバッグ用ワンショットツール。本体ビルドには含まれない。

## Git 自動 push

`.husky/post-commit` が `git commit` 後に自動で `git push` を実行する。回避方法:

- 一回だけ: PowerShell `$env:SKIP_AUTO_PUSH=1; git commit ...`
- すべての Husky を無効化: `HUSKY=0 git commit ...`

## アーキテクチャ

### 認証 (`src/lib/auth/` + `src/middleware.ts`)

セッションは **HS256 JWT を HttpOnly Cookie**（本番は `__Host-est_session`、非本番は `est_session`）に格納する。

- `src/middleware.ts`: edge runtime での **粗いゲート**。署名 / 期限 / スライディング更新のみ実施。`/login`, `/api/auth/{login,logout,me}` は公開。`/admin/**`, `/approver/**`, `/agency/**` は未認証ならリダイレクト。その他 `/api/**` は 401。**失効リスト照合は edge では行わない**。
- `src/lib/auth/session.ts`: スライディング 8 時間 / 絶対 7 日。残り 50% を切ったときに renew。`AUTH_SECRET`（32 文字以上）必須。
- `src/lib/auth/guards.ts`: route handler 用の最終認可層。`requireAuth` / `requireRole` / `requireAdmin` / `requireAdminOrApprover` / `requireEstimateAccess` を提供。`ensureSameOrigin` が状態変更系リクエストで `NEXT_PUBLIC_BASE_URL` と Origin を照合（**本番で env 未設定なら 500 fail-close**、dev/test は警告のみで通過）。失効照合 (`session_revocations`) はここで実施。`AuthError` を投げ、route 側で `handleAuthError` 経由で `NextResponse` に変換する。
- ロール: `admin` / `agency` / `approver`（`src/lib/constants.ts`）。agency セッションには `agencyId` が付与され、`requireEstimateAccess` で `estimates.agency_id` と突合される。

### データベース (`src/lib/db.ts` + `migrations/`)

Neon serverless ドライバ。接続文字列は **`DATABASE_URL` → `POSTGRES_URL` → `POSTGRES_PRISMA_URL` → `NEON_DATABASE_URL`** の順で解決（Vercel の Neon 連携で名前がブレるため）。

スキーマは `src/lib/db-schema.sql` が単一の真実で、変更は **追記方式の `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`**（既存環境への冪等適用）で書く。差分マイグレーションは `migrations/*.sql`（手動適用）。テーブル未作成は `src/lib/pg-errors.ts` の `isUndefinedTable` で識別する。

主要テーブル: `agencies`, `system_users`, `session_revocations`, `margin_rates`, `maintenance_rates`, `estimates`（Excel/PDF URL・kintone deal id 等を含む）, テンプレート/単価マスタ。

### API ルート (`src/app/api/`)

- `auth/{login,logout,me}`: 公開。
- `estimates/` (一覧・作成・`[id]` 取得/更新・`submit` 申請)、`agencies/`, `masters/`, `templates/`, `unit-prices/`, `margin-rates/`, `maintenance-rates/`, `system-users/`, `settings/`, `dashboard/`, `kintone/` 配下に kintone デバッグエンドポイント (`app-fields` 等)。
- すべて Next.js route handler。状態変更系は **冒頭で `requireXxx` を呼ぶ**（agency が他社見積へアクセスできないことを保証する責任は route ハンドラ側）。

### 画面 (`src/app/`)

App Router。ロール別ディレクトリで分割: `admin/`（ダッシュボード・代理店・マスタ・案件一覧・設定）, `agency/`（見積作成・一覧）, `approver/`（承認待ち）, `login/`。`src/components/auth-guard.tsx` と `dashboard-layout.tsx` が共通レイアウト。Tailwind v3 + `src/lib/locale-context.tsx` / `theme-context.tsx` / `translations.ts` で日英切替・テーマ切替。

### 見積書生成パイプライン

1. `src/lib/template-cells.ts` + `src/lib/excel-writer.ts` で **ExcelJS** を使い、管理者がアップロードしたテンプレート (`.xlsx`) のセルへ値を流し込む。表紙 / ライセンス / 保守料 / 設定情報シートを使用。
2. `src/lib/estimate-form-display.ts` / `estimate-schema.ts`（Zod）でフォーム値の正規化・検証。
3. `src/lib/pdf-generator.ts` が生成済み Excel をコピーして「表紙 / ライセンス / 保守料」だけ visible にし、**CloudConvert sync Jobs API** で PDF 化（`CLOUDCONVERT_API_KEY` 必須、スコープ `task.read/write`）。Excel 入力が ~10MB を超えると import/base64 が使えなくなる。
4. 成果物は `@vercel/blob` で保存し URL を `estimates` 行に紐づける。Excel 差し替え時は履歴を `excel-file-history.ts` で保持。

### 外部システム連携

- **kintone（ライセンス参照アプリ）** `src/lib/kintone.ts` + `kintone-env.ts`: 「ライセンス追加」「オプション追加」見積のフォームから既存ライセンス・保守期間を取得。フィールドコードはアプリの実コード（**英数字内部名**）に合わせて env で設定。エラー `GAIA_IQ11` はフィールドコード不一致のサイン。デバッグ用に `GET /api/kintone/app-fields` で実フィールド一覧を返す。
- **kintone（営業案件管理アプリ）** `src/lib/kintone-sales-*.ts`: 契約形態「新規」の見積を承認したときに upsert。突合は既定で顧客名のみ (`KINTONE_SALES_UPSERT_SCOPE=customer`)。`KINTONE_SALES_FIELD_ESTIMATE_HISTORY` を指定すると承認のたびに 1 行ずつ追記。API トークンは**閲覧・追加・編集**の 3 権限すべて必要（編集が無いと 2 件目以降の承認で `GAIA_NO01` / 403）。
- **HubSpot** `src/lib/hubspot-*.ts`: Private App + CRM v3。見積申請時に取引を検索し、存在しなければ作成。重複判定は単一プロパティ (`HUBSPOT_MATCH_PROPERTY` に `agency_id|正規化顧客名`) または agency+customer の AND モード。env 未設定や重複条件不足のときは**スキップして申請は成功させる**。
- **通知** `src/lib/notify.ts` + `notification-templates.ts`: 2 系統に分離。
  - **申請通知** (代理店 → 承認者・管理者): `app_settings.active_channel` ＝ `slack` / `teams` / `gmail` のいずれかで送信。
  - **承認通知** (承認者・管理者 → 代理店担当者): 常に Gmail。`decision_gmail_from` / `decision_gmail_password` / `decision_subject_template` / `decision_body_template` を `app_settings` に保存し、テンプレートには `{{estimateNo}}` `{{customerName}}` `{{agencyName}}` `{{decisionLabel}}` `{{decidedAt}}` `{{recipientName}}` `{{recipientGreeting}}` のプレースホルダが使える。受信者は `form_inputs.estimateRequesterEmail` → `agencies.email` の順でフォールバック。設定不足や受信者不在のときは `{ ok: false, error: "decision_gmail_config_missing" | "decision_recipient_email_missing" }` を返し警告ログを残す（**黙ってスキップしない**）。

## 主要環境変数

詳細は `.env.example`。最低限必要:

- `DATABASE_URL` または `POSTGRES_URL`（Neon）
- `AUTH_SECRET`（32 文字以上ランダム）
- `NEXT_PUBLIC_BASE_URL`（本番 CSRF 検証で必須。未設定時は 500）
- 連携系: `KINTONE_DOMAIN` / `KINTONE_API_TOKEN` / `KINTONE_SALES_*` / `HUBSPOT_ACCESS_TOKEN` / `CLOUDCONVERT_API_KEY`（未設定の連携機能は静かにスキップする実装）

## テスト

vitest（node 環境）。テストは現状 `src/lib/__tests__/`（`estimate-schema`, `notify`）と `src/lib/auth/__tests__/`（`session`, `password`, `guards`）に集中。カバレッジ計測は `src/lib/auth/**` 限定。Playwright が devDependency にあるが E2E スイートは未整備。

## 注意点

- `src/lib/mock-data.ts` は古いモック認証用のフォールバック。DB 未接続時のテストやプレゼン用途で残っている — 仕様の真実ではない。
- `presentation/` はプロダクトデモ用資料置き場で、ビルドには含まれない。
- 本リポジトリは日本語コメント中心。新規コードでもユーザー向けメッセージ・ログ・コメントは原則日本語で揃える。
