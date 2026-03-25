# 見積自動作成 Web アプリ (Estimate Web App)

代理店向け見積作成・案件管理の枠組みです。Next.js + React、Vercel デプロイ想定。

## 技術スタック

- **Next.js 15** (App Router)
- **React 19**
- **TypeScript**
- **Tailwind CSS**
- **認証**: 現状はモック（メール+パスワード、ロール: 自社管理者 / 代理店 / 承認者）

## 開発用ログイン

| ロール     | メール              | パスワード |
|------------|---------------------|------------|
| 自社管理者 | admin@example.com   | admin      |
| 代理店     | agency@example.com  | agency     |
| 承認者     | approver@example.com| approver   |

## ディレクトリ構成（概要）

```
src/
  app/
    layout.tsx, page.tsx, globals.css
    login/           # ログイン
    admin/           # 自社管理者: ダッシュボード、代理店登録、マスタ、案件一覧、設定
    agency/          # 代理店: ホーム、見積作成・一覧
    approver/        # 承認者: 承認待ち一覧
  components/
    auth-guard.tsx
    dashboard-layout.tsx
  lib/
    auth-context.tsx
    constants.ts
```

## セットアップ

```bash
cd estimate-webapp
npm install
npm run dev
```

http://localhost:3000 で開き、未ログイン時は `/login` にリダイレクトされます。

### データベース（Neon）

本番・プレビューでは **Vercel の Neon 連携** により `DATABASE_URL` または `POSTGRES_URL` のいずれかが設定されることがあります。アプリは `DATABASE_URL` → `POSTGRES_URL` → … の順で参照します。`DATABASE_URL` だけが無い状態で `POSTGRES_URL` だけあると、以前の実装では接続に失敗することがありました（現在は両方に対応）。

ローカルでは `.env.local` に Neon の接続文字列を `DATABASE_URL` で設定してください。

### Git / GitHub（コミット後の自動 push）

[Husky](https://typicode.github.io/husky/) の `post-commit` で、**ローカルで `git commit` した直後に `git push` が走り**、追跡ブランチが設定されていれば GitHub に反映されます。

- 初回のみ: `git push -u origin main`（または作業ブランチ）で upstream を設定しておいてください。
- 自動 push を一回だけ無効にする: `SKIP_AUTO_PUSH=1 git commit -m "..."`（PowerShell では `$env:SKIP_AUTO_PUSH=1; git commit ...`）
- すべての Husky を無効にする: `HUSKY=0 git commit ...`
- **ファイル保存だけでは push されません。** 変更をコミットしたタイミングでリモートへ送られます。

`npm install` 実行時に `prepare` スクリプトでフックが有効になります。リポジトリをクローンした直後も `npm install` が必要です。

### 環境変数（kintone 連携）

ライセンス追加・オプション追加で「kintoneから既存情報を取得」を使う場合、`.env.local` 等に以下を設定します。テンプレートは `.env.example` を参照。

| 変数 | 説明 |
|------|------|
| `KINTONE_DOMAIN` | kintone のドメイン（例: `https://dea5gs2qu9n6.cybozu.com`） |
| `KINTONE_APP_ID` | **ライセンス参照アプリの ID**（推奨。未設定時は `KINTONE_APP_LICENSE`、それもなければ `219`） |
| `KINTONE_API_TOKEN` | そのアプリ用 API トークン（推奨。未設定時は `KINTONE_API_TOKEN_APP219`） |
| `KINTONE_APP_LICENSE` | 後方互換用の別名（`KINTONE_APP_ID` と同じ意味） |
| `KINTONE_API_TOKEN_APP219` | 後方互換用のトークン変数名 |
| `KINTONE_MATCH_AGENCY_BY` | `id`（既定: Web の代理店 ID を kintone に格納）または `name`（代理店名で突合） |
| `KINTONE_CUSTOMER_MATCH_MODE` | `like`（既定・顧客名の部分一致）または `equals`（完全一致。ドロップダウン型の顧客フィールドは `equals` が必要なことがあります） |
| `KINTONE_LOOKUP_MAX_RESULTS` | `like` 検索で返す最大件数（1〜100、既定 30）。複数件のときはフォームで 1 件を選択 |
| `KINTONE_SEARCH_MIN_LENGTH` | `like` モードで検索語として使う最小文字数（既定 2） |

**フィールドコード（`KINTONE_APP_ID` で指定したアプリに実在するコードに合わせる）**

| 環境変数 | アプリ内の役割（論理） | コード未設定時の既定値 |
|----------|------------------------|------------------------|
| `KINTONE_FIELD_AGENCY_ID` | 代理店の突合（ID または名前） | `agency_id` |
| `KINTONE_FIELD_CUSTOMER` | 顧客（エンドユーザー）会社名 | `customer_name` |
| `KINTONE_FIELD_LICENSE` | 既存ライセンス数 | `license_count` |
| `KINTONE_FIELD_MAINT_START` | 保守開始日 | `maint_start` |
| `KINTONE_FIELD_MAINT_END` | 保守終了日 | `maint_end` |

kintone のエラー `GAIA_IQ11` / 「Specified field (…) not found」は、上記いずれかの**フィールドコードがアプリに存在しない**ときに出ます。Vercel の環境変数に **存在しない名前**（例: `会社名_代理店`）を入れていると同様のエラーになります。

**実アプリのフィールドコード一覧の確認:** デプロイ先のオリジンでブラウザから  
`GET /api/kintone/app-fields`  
を開くと、JSON で `fields`（`code` / `type` / `label`）と、現在の `lookupMapping` がアプリに存在するか（`mappingStatus`）が返ります。

未設定の場合は API が 503 を返し、画面上に案内メッセージが表示されます。

### 営業案件管理アプリ（新規見積の承認時）

契約形態が**新規**の見積を管理者または承認者が**承認**したとき、環境変数が揃っていれば kintone の営業案件管理アプリにレコードを**登録または更新**します。

- **突合キー**: `KINTONE_SALES_FIELD_CUSTOMER` の値が、見積の `customer_name`（申請時に保存された表示名）と**完全一致**する既存レコードを検索します。`KINTONE_SALES_FIELD_AGENCY_ID` を設定している場合は、ライセンス参照と同様に **代理店（id または name）** も条件に含めます。
- **更新**: 上記で 1 件見つかった場合はそのレコードを `PUT` で更新します。
- **新規**: 見つからない場合は `POST` で追加します。
- **それ以外の契約形態**（ライセンス追加・オプション追加）や **営業案件用の env 未設定**のときは何もせず、承認のみ成功します。
- トークンには対象アプリの**レコード追加・編集**権限が必要です。

| 変数 | 説明 |
|------|------|
| `KINTONE_SALES_APP_ID` | 営業案件管理アプリのアプリ ID |
| `KINTONE_SALES_API_TOKEN` | そのアプリ用 API トークン |
| `KINTONE_SALES_FIELD_CUSTOMER` | **必須**。顧客名フィールドのフィールドコード |
| `KINTONE_SALES_FIELD_AGENCY_ID` | 代理店突合用フィールド（推奨） |
| `KINTONE_SALES_MATCH_AGENCY_BY` | `id`（既定）または `name` |
| `KINTONE_SALES_FIELD_*` | 見積番号・Excel/PDF URL・承認日など、書き込むフィールドごとにコードを指定（`.env.example` 参照） |

## ビルド・デプロイ

```bash
npm run build
npm start
```

Vercel にデプロイする場合は、リポジトリを GitHub に push し、Vercel で当該リポジトリをインポートしてください。

## 今後の実装予定

- 代理店・仕切り率・製品単価・テンプレートのマスタ管理
- 見積作成（提供形態×契約形態の分岐、入力、計算、Excel→PDF）
- kintone（既存ライセンス・保守期間の参照） / HubSpot 連携
- 承認フロー・通知（Teams / Slack / Gmail）
- 見積書ダウンロード制御
- 案件一覧・ダッシュボード分析

要件の詳細は `docs/requirements-specification.md` を参照してください。
