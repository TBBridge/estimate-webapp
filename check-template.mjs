import ExcelJS from "exceljs";
import { readFileSync } from "fs";

// .env.local を手動で読み込む
const env = readFileSync("e:/_Work_AI/estimate-webapp/.env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

import("@neondatabase/serverless").then(async ({ neon }) => {
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  const rows = await sql`SELECT id, file_name, blob_url FROM templates WHERE blob_url != '' ORDER BY id`;
  console.log("Templates:");
  rows.forEach(r => console.log(" ", r.id, r.file_name));

  const tpl1 = rows.find(r => r.id === "tpl-1") || rows[0];
  if (!tpl1) { console.log("No template found"); process.exit(0); }

  console.log("\nChecking:", tpl1.id, tpl1.file_name);
  const res = await fetch(tpl1.blob_url);
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("Buffer size:", buf.length);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);

  console.log("Sheets:", wb.worksheets.map(s => `${s.name}(${s.state})`).join(", "));

  const sheet = wb.getWorksheet("表紙") || wb.worksheets[0];
  console.log("Target sheet:", sheet.name);
  console.log("C3:", JSON.stringify(sheet.getCell("C3").value));
  console.log("C4:", JSON.stringify(sheet.getCell("C4").value));
  console.log("C5:", JSON.stringify(sheet.getCell("C5").value));
  console.log("C18:", JSON.stringify(sheet.getCell("C18").value));

  // 書き込みテスト
  sheet.getCell("C3").value = "2026-03-12";
  sheet.getCell("C4").value = "テスト代理店";
  sheet.getCell("C5").value = "テスト顧客HH";
  sheet.getCell("C18").value = 10;

  console.log("\nAfter write:");
  console.log("C3:", JSON.stringify(sheet.getCell("C3").value));
  console.log("C4:", JSON.stringify(sheet.getCell("C4").value));
  console.log("C5:", JSON.stringify(sheet.getCell("C5").value));
  console.log("C18:", JSON.stringify(sheet.getCell("C18").value));

  // ファイルに書き出して確認
  await wb.xlsx.writeFile("e:/_Work_AI/estimate-webapp/check-template-output.xlsx");
  console.log("\nOutput written to check-template-output.xlsx");

  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
