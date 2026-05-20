// pdf-parse 1.1.1 の index.js には自動実行されるデバッグコードが残っており、
// バンドラによっては問題になる。pdf-parse/lib/pdf-parse.js を直接インポートして
// この副作用を避けるが、@types/pdf-parse はサブパスを宣言していないので
// 同等の型を再 export する。
declare module "pdf-parse/lib/pdf-parse.js" {
  import PdfParse from "pdf-parse";
  export default PdfParse;
}
