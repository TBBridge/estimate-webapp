/**
 * Excel → PDF 変換ユーティリティ
 *
 * ConvertAPI (https://www.convertapi.com/) を使用して
 * Excel ファイルを PDF に変換する。
 *
 * 必須環境変数:
 *   CONVERTAPI_SECRET  ConvertAPI のシークレットキー
 *
 * 取得方法:
 *   1. https://www.convertapi.com/ でアカウント登録（無料枠あり）
 *   2. ダッシュボードから Secret key を取得
 *   3. Vercel: Settings → Environment Variables → CONVERTAPI_SECRET に設定
 */

export async function convertExcelToPdf(excelBuffer: Buffer): Promise<Buffer> {
  const secret = process.env.CONVERTAPI_SECRET;
  if (!secret) {
    throw new Error(
      "PDF生成には CONVERTAPI_SECRET 環境変数の設定が必要です。" +
      "Vercel ダッシュボード → Settings → Environment Variables に CONVERTAPI_SECRET を追加してください。"
    );
  }

  const arrayBuffer: ArrayBuffer = new Uint8Array(excelBuffer).buffer;
  const blob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const formData = new FormData();
  formData.append("File", blob, "estimate.xlsx");
  formData.append("StoreFile", "true");

  // ConvertAPI v2: Token 認証（Bearer）または Secret クエリパラメータの両方に対応
  const res = await fetch(
    `https://v2.convertapi.com/convert/xlsx/to/pdf`,
    {
      method: "POST",
      headers: { "Authorization": `Bearer ${secret}` },
      body: formData,
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ConvertAPI エラー ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json() as {
    Files?: { FileData?: string; Url?: string }[];
  };

  const file = json.Files?.[0];
  if (!file) throw new Error("ConvertAPI: レスポンスにファイルが含まれていません");

  if (file.FileData) {
    return Buffer.from(file.FileData, "base64");
  }

  if (file.Url) {
    const dlRes = await fetch(file.Url);
    if (!dlRes.ok) throw new Error(`ConvertAPI ダウンロードエラー: ${dlRes.status}`);
    return Buffer.from(await dlRes.arrayBuffer());
  }

  throw new Error("ConvertAPI: PDF データを取得できませんでした");
}
