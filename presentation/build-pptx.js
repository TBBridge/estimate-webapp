/**
 * Build PowerPoint from slide data and images using PptxGenJS only.
 * Run from repo root: node presentation/build-pptx.js
 */
const path = require("path");
const pptxgen = require("pptxgenjs");

const PRES_DIR = path.resolve(__dirname);
const IMAGES_DIR = path.join(PRES_DIR, "images");
const OUTPUT_PATH = path.join(PRES_DIR, "estimate-webapp-report.pptx");

// Slide dimensions 16:9 (inches): 10 x 5.625
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.5;

function imgPath(name) {
  return path.join(IMAGES_DIR, name);
}

async function main() {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "Estimate Web App Team";
  pptx.title = "代理店向け 見積自動作成Webアプリ 開発状況報告";

  // Slide 1: Title
  let s1 = pptx.addSlide();
  s1.background = { color: "1a365d" };
  s1.addImage({ path: imgPath("slide01-title.png"), x: 4.1, y: 1, w: 1.8, h: 1.8 });
  s1.addText("代理店向け 見積自動作成Webアプリ", { x: 0.5, y: 2.9, w: 9, h: 0.8, fontSize: 36, bold: true, color: "FFFFFF", align: "center" });
  s1.addText("開発状況報告 — システム設計から現状の実装内容まで", { x: 0.5, y: 3.75, w: 9, h: 0.5, fontSize: 18, color: "a0aec0", align: "center" });

  // Slide 2: Background and purpose
  let s2 = pptx.addSlide();
  s2.addText("プロジェクトの背景と目的", { x: 0.5, y: 0.4, w: 6, h: 0.5, fontSize: 24, bold: true, color: "2d3748" });
  s2.addText("現状の課題", { x: 0.5, y: 1, w: 6, h: 0.35, fontSize: 14, bold: true, color: "4a5568" });
  s2.addText("• 見積作成が手作業で、提供形態・契約形態の分岐が複雑\n• 代理店ごとの仕切り率計算ミスや承認漏れのリスク", { x: 0.5, y: 1.35, w: 6, h: 1, fontSize: 12, color: "4a5568", bullet: true });
  s2.addText("開発の目的", { x: 0.5, y: 2.5, w: 6, h: 0.35, fontSize: 14, bold: true, color: "4a5568" });
  s2.addText("• 代理店がWeb上で正確な見積を自動作成できる仕組みの構築\n• 承認ワークフローのシステム化と案件の一元管理・分析\n• PDF形式の見積書を自動生成し業務効率を向上", { x: 0.5, y: 2.85, w: 6, h: 1.4, fontSize: 12, color: "4a5568", bullet: true });
  s2.addImage({ path: imgPath("slide02-purpose.png"), x: 7, y: 1.2, w: 2.5, h: 3.2 });

  // Slide 3: Architecture
  let s3 = pptx.addSlide();
  s3.addText("システム全体像（アーキテクチャ）", { x: 0.5, y: 0.4, w: 6, h: 0.5, fontSize: 24, bold: true, color: "2d3748" });
  s3.addText("• インフラ：Vercel（サーバーレス）\n• フロント／バック：Next.js 15 / React 19 / TypeScript\n• データベース：Neon Postgres\n• ファイル：Vercel Blob（テンプレート・生成Excel/PDF）\n• 外部API：ConvertAPI（Excel→PDF変換）\n• ソース管理：GitHub", { x: 0.5, y: 1, w: 6, h: 2.8, fontSize: 12, color: "4a5568", bullet: true });
  s3.addImage({ path: imgPath("slide03-architecture.png"), x: 7, y: 1.2, w: 2.5, h: 3.2 });

  // Slide 4: Roles
  let s4 = pptx.addSlide();
  s4.addText("ユーザーロールと権限", { x: 0.5, y: 0.4, w: 6, h: 0.5, fontSize: 24, bold: true, color: "2d3748" });
  s4.addText("1. 代理店", { x: 0.5, y: 1, w: 6, h: 0.3, fontSize: 13, bold: true, color: "2b6cb0" });
  s4.addText("見積の新規作成・申請／自分の案件一覧／承認済みPDFのダウンロード", { x: 0.5, y: 1.3, w: 6, h: 0.5, fontSize: 11, color: "4a5568" });
  s4.addText("2. 承認者", { x: 0.5, y: 1.9, w: 6, h: 0.3, fontSize: 13, bold: true, color: "2b6cb0" });
  s4.addText("申請内容の確認と承認・却下／見積書（Excel・PDF）のダウンロード", { x: 0.5, y: 2.2, w: 6, h: 0.5, fontSize: 11, color: "4a5568" });
  s4.addText("3. 自社管理者", { x: 0.5, y: 2.8, w: 6, h: 0.3, fontSize: 13, bold: true, color: "2b6cb0" });
  s4.addText("ダッシュボード分析／全案件一覧／マスタ管理／アカウント管理", { x: 0.5, y: 3.1, w: 6, h: 0.6, fontSize: 11, color: "4a5568" });
  s4.addImage({ path: imgPath("slide04-roles.png"), x: 7, y: 1.2, w: 2.5, h: 3.2 });

  // Slide 5: Flow
  let s5 = pptx.addSlide();
  s5.addText("業務フロー（見積作成〜承認）", { x: 0.5, y: 0.4, w: 6, h: 0.5, fontSize: 24, bold: true, color: "2d3748" });
  s5.addText("1. 見積入力：提供形態・契約形態を選択し、必要項目を入力\n2. 自動計算＆ファイル生成：仕切り率を参照し、Excel「設定情報」シートへ書き込み\n3. 申請＆通知：DB保存後、承認者へSlack/Teams/Gmailで通知\n4. 承認＆PDF化：承認者が承認し、表紙・ライセンス・保守料の3シートでPDF生成\n5. ダウンロード：代理店が完成PDFをダウンロード", { x: 0.5, y: 1, w: 6, h: 3.2, fontSize: 11, color: "4a5568", bullet: true });
  s5.addImage({ path: imgPath("slide05-flow.png"), x: 7, y: 1.2, w: 2.5, h: 3.2 });

  // Slide 6: UI/UX
  let s6 = pptx.addSlide();
  s6.addText("UI / UX のこだわり", { x: 0.5, y: 0.4, w: 6, h: 0.5, fontSize: 24, bold: true, color: "2d3748" });
  s6.addText("• モダンなデザイン：Tailwind CSS による統一されたインターフェース\n• レスポンシブ＆ダークモード：端末に合わせた表示とテーマ切り替え\n• 多言語対応 (i18n)：日本語・英語の切り替え\n• 動的フォーム：提供形態・契約形態に応じて入力項目がリアルタイムに切り替わる直感的なフォーム", { x: 0.5, y: 1, w: 6, h: 2.5, fontSize: 12, color: "4a5568", bullet: true });
  s6.addImage({ path: imgPath("slide06-ui.png"), x: 7, y: 1.2, w: 2.5, h: 3.2 });

  // Slide 7: Patterns
  let s7 = pptx.addSlide();
  s7.addText("コア機能① 見積パターンの網羅", { x: 0.5, y: 0.4, w: 6, h: 0.5, fontSize: 24, bold: true, color: "2d3748" });
  s7.addText("提供形態 × 契約形態のマトリクス対応", { x: 0.5, y: 0.95, w: 6, h: 0.35, fontSize: 12, bold: true, color: "4a5568" });
  s7.addText("• オンプレミス：新規 / ライセンス追加 / オプション追加\n• サブスクリプション：新規\n• クラウド：新規（年額・区切り）/ ライセンス追加", { x: 0.5, y: 1.35, w: 6, h: 1.2, fontSize: 11, color: "4a5568", bullet: true });
  s7.addText("厳密なバリデーション：i-Reporterライセンス数は規定ティア（5,10,…500）のみ。オプション（Web API Module Set 等）の動的選択。", { x: 0.5, y: 2.65, w: 6, h: 0.9, fontSize: 11, color: "4a5568" });
  s7.addImage({ path: imgPath("slide07-patterns.png"), x: 7, y: 1.2, w: 2.5, h: 3.2 });

  // Slide 8: Excel & PDF
  let s8 = pptx.addSlide();
  s8.addText("コア機能② Excel自動入力とPDF生成", { x: 0.5, y: 0.4, w: 6, h: 0.5, fontSize: 24, bold: true, color: "2d3748" });
  s8.addText("Excel自動入力 (ExcelJS)", { x: 0.5, y: 0.95, w: 6, h: 0.3, fontSize: 12, bold: true, color: "4a5568" });
  s8.addText("• 「設定情報」シートに顧客名・ライセンス数・代理店種別を書き込み\n• Excel側のVLOOKUP・計算式をそのまま活用", { x: 0.5, y: 1.25, w: 6, h: 0.9, fontSize: 11, color: "4a5568", bullet: true });
  s8.addText("高精度PDF変換 (ConvertAPI)", { x: 0.5, y: 2.25, w: 6, h: 0.3, fontSize: 12, bold: true, color: "4a5568" });
  s8.addText("• 「表紙」「ライセンス」「保守料」の3シートのみPDF化\n• 設定情報シートは veryHidden にし、数式参照を維持したまま変換対象から除外", { x: 0.5, y: 2.55, w: 6, h: 1, fontSize: 11, color: "4a5568", bullet: true });
  s8.addImage({ path: imgPath("slide08-excel-pdf.png"), x: 7, y: 1.2, w: 2.5, h: 3.2 });

  // Slide 9: Master & Dashboard
  let s9 = pptx.addSlide();
  s9.addText("コア機能③ マスタ管理とダッシュボード", { x: 0.5, y: 0.4, w: 6, h: 0.5, fontSize: 24, bold: true, color: "2d3748" });
  s9.addText("マスタ管理（管理者向け）", { x: 0.5, y: 0.95, w: 6, h: 0.3, fontSize: 12, bold: true, color: "4a5568" });
  s9.addText("• 代理店マスタ（代理店種別・通知先）\n• 仕切り率・製品単価・テンプレート管理", { x: 0.5, y: 1.25, w: 6, h: 0.8, fontSize: 11, color: "4a5568", bullet: true });
  s9.addText("ダッシュボード", { x: 0.5, y: 2.15, w: 6, h: 0.3, fontSize: 12, bold: true, color: "4a5568" });
  s9.addText("• DBから集計したKPI（総申請数・承認待ち・総見積金額）\n• 代理店別・月別・提供形態別のグラフ（Recharts）", { x: 0.5, y: 2.45, w: 6, h: 0.9, fontSize: 11, color: "4a5568", bullet: true });
  s9.addImage({ path: imgPath("slide09-dashboard.png"), x: 7, y: 1.2, w: 2.5, h: 3.2 });

  // Slide 10: Challenges
  let s10 = pptx.addSlide();
  s10.addText("技術的な課題と解決策", { x: 0.5, y: 0.4, w: 6, h: 0.5, fontSize: 24, bold: true, color: "2d3748" });
  s10.addText("1. Vercel環境でのExcel処理の不安定さ\n課題：サーバーレスで巨大バッファ読み込みが失敗。\n解決：PassThrough ストリーム経由で ExcelJS に読み込ませ安定化。", { x: 0.5, y: 0.95, w: 6, h: 1.1, fontSize: 11, color: "4a5568", bullet: true });
  s10.addText("2. PDF変換時のシート制御\n課題：設定情報シートを削除すると数式が壊れる。\n解決：シートを veryHidden にし、変換対象から除外しつつ参照を維持。", { x: 0.5, y: 2.15, w: 6, h: 1.1, fontSize: 11, color: "4a5568", bullet: true });
  s10.addText("3. オプション選択のデータ構造の不一致\n課題：フロントのオブジェクト形式とバックの配列想定の食い違い。\n解決：getCheckedOptionLabels でチェック済みオプション名を正しく抽出。", { x: 0.5, y: 3.35, w: 6, h: 1.1, fontSize: 11, color: "4a5568", bullet: true });
  s10.addImage({ path: imgPath("slide10-challenges.png"), x: 7, y: 1.2, w: 2.5, h: 3.2 });

  // Slide 11: Future
  let s11 = pptx.addSlide();
  s11.addText("今後の展望（Next Steps）", { x: 0.5, y: 0.4, w: 6, h: 0.5, fontSize: 24, bold: true, color: "2d3748" });
  s11.addText("外部システム連携", { x: 0.5, y: 0.95, w: 6, h: 0.3, fontSize: 12, bold: true, color: "4a5568" });
  s11.addText("• kintone：営業案件管理（App ID:127）、ライセンス管理（ID:166）との連携\n• HubSpot：顧客・商談パイプラインとの連携（オブジェクト・プロパティは今後定義）", { x: 0.5, y: 1.25, w: 6, h: 1, fontSize: 11, color: "4a5568", bullet: true });
  s11.addText("運用テストとフィードバック：実際の代理店ユーザーによるテスト運用とUI/UXの微調整", { x: 0.5, y: 2.4, w: 6, h: 0.5, fontSize: 11, color: "4a5568" });
  s11.addImage({ path: imgPath("slide11-future.png"), x: 7, y: 1.2, w: 2.5, h: 3.2 });

  // Slide 12: Summary
  let s12 = pptx.addSlide();
  s12.background = { color: "1a365d" };
  s12.addImage({ path: imgPath("slide12-summary.png"), x: 4.5, y: 1.2, w: 1, h: 1 });
  s12.addText("まとめ", { x: 0.5, y: 2.3, w: 9, h: 0.5, fontSize: 28, bold: true, color: "FFFFFF", align: "center" });
  s12.addText("複雑な見積業務を Next.js と Vercel でシンプルかつセキュアに刷新。Excel の柔軟性と Web の堅牢性を組み合わせ、今後の kintone・HubSpot 連携でさらなる業務自動化の基盤を整えました。", { x: 1, y: 2.9, w: 8, h: 1.2, fontSize: 14, color: "e2e8f0", align: "center" });

  await pptx.writeFile({ fileName: OUTPUT_PATH });
  console.log("Created:", OUTPUT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
