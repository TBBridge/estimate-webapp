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

## ビルド・デプロイ

```bash
npm run build
npm start
```

Vercel にデプロイする場合は、リポジトリを GitHub に push し、Vercel で当該リポジトリをインポートしてください。

## 今後の実装予定

- 代理店・仕切り率・製品単価・テンプレートのマスタ管理
- 見積作成（提供形態×契約形態の分岐、入力、計算、Excel→PDF）
- kintone / HubSpot 連携
- 承認フロー・通知（Teams / Slack / Gmail）
- 見積書ダウンロード制御
- 案件一覧・ダッシュボード分析

要件の詳細は `docs/requirements-specification.md` を参照してください。
