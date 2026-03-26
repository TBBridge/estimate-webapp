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

- **突合キー（既定）**: `KINTONE_SALES_UPSERT_SCOPE` が未設定または `customer` のとき、見積の `customer_name` と **完全一致**する顧客名フィールド（`KINTONE_SALES_FIELD_CUSTOMER`）で 1 件を検索します。**複数代理店から同一顧客への見積は、同じ kintone レコードを更新**する想定です。
- **突合キー（従来互換）**: `KINTONE_SALES_UPSERT_SCOPE=customer_and_agency` のとき、`KINTONE_SALES_FIELD_AGENCY_ID` と顧客名の**両方**で検索します（`KINTONE_SALES_MATCH_AGENCY_BY` で id / name）。
- **更新**: 1 件見つかった場合は `PUT` でマッピングしたフィールドを上書きします。
- **見積履歴の追記**: `KINTONE_SALES_FIELD_ESTIMATE_HISTORY` に複数行文字列フィールドのコードを指定すると、承認のたびに **1 行**（承認日・代理店名・見積番号）を末尾に追加します（新規レコード作成時は 1 行目のみ）。最大長を超える場合は末尾側を切り詰めます。
- **新規**: 顧客に該当レコードがなければ `POST` で追加します。
- **案件一覧の詳細**: 管理者・承認者の詳細モーダルで、同一ルールで kintone を参照し、レコードがあれば主要フィールドを表示します（`GET /api/estimates/[id]?includeKintoneSales=1`）。
- **それ以外の契約形態**や **営業案件用 env 未設定**のときは kintone はスキップされ、承認のみ成功します。
- **API トークンの権限**: `KINTONE_SALES_API_TOKEN` には少なくとも **レコードの閲覧・追加・編集** を付与してください。同一顧客の見積を 2 件目以降承認するときは既存レコードの **更新（PUT）** が走るため、「追加」のみ許可していると **403 / `GAIA_NO01`（Using this API token, you cannot run the specified API）** になります。

| 変数 | 説明 |
|------|------|
| `KINTONE_SALES_APP_ID` | 営業案件管理アプリのアプリ ID |
| `KINTONE_SALES_API_TOKEN` | そのアプリ用 API トークン |
| `KINTONE_SALES_FIELD_CUSTOMER` | **必須**。顧客名フィールドのフィールドコード |
| `KINTONE_SALES_UPSERT_SCOPE` | `customer`（既定）または `customer_and_agency` |
| `KINTONE_SALES_FIELD_AGENCY_ID` | 代理店を kintone に書き込むフィールド。`customer_and_agency` 時は検索にも使用 |
| `KINTONE_SALES_MATCH_AGENCY_BY` | `id`（既定）または `name` |
| `KINTONE_SALES_FIELD_ESTIMATE_HISTORY` | 任意。見積承認の追記ログ用（長文） |
| `KINTONE_SALES_FIELD_*` | 見積番号・Excel/PDF URL・承認日など（`.env.example` 参照） |

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
