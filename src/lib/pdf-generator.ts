/**
 * HTML 文字列を PDF Buffer に変換するユーティリティ
 *
 * Vercel サーバーレス環境では @sparticuz/chromium を使用。
 * ローカル開発では CHROMIUM_EXECUTABLE_PATH 環境変数でシステムの
 * Chrome/Chromium を指定するか、未設定時は @sparticuz/chromium を使用。
 */

export async function htmlToPdf(html: string): Promise<Buffer> {
  // 動的インポートでバンドルサイズを最小化
  const puppeteer = await import("puppeteer-core");

  let executablePath: string;
  let launchArgs: string[];

  if (process.env.CHROMIUM_EXECUTABLE_PATH) {
    // ローカル開発: システムの Chrome を使用
    executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
    launchArgs = ["--no-sandbox", "--disable-setuid-sandbox"];
  } else {
    // Vercel 本番: @sparticuz/chromium を使用
    const chromium = await import("@sparticuz/chromium");
    executablePath = await chromium.default.executablePath();
    launchArgs = chromium.default.args;
  }

  const browser = await puppeteer.default.launch({
    args: launchArgs,
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", bottom: "15mm", left: "15mm", right: "15mm" },
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
