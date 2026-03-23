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
| `KINTONE_API_TOKEN_APP219` | アプリ219の API トークン |
| `KINTONE_APP_LICENSE` | 省略時 `219` |
| `KINTONE_FIELD_*` | フィールドコードがデフォルトと異なる場合のみ上書き |
| `KINTONE_MATCH_AGENCY_BY` | `id`（既定）または `name`（代理店名で突合） |

未設定の場合は API が 503 を返し、画面上に案内メッセージが表示されます。

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
