import ExcelJS from "exceljs";
import { readFileSync } from "fs";

const env = readFileSync("e:/_Work_AI/estimate-webapp/.env.local", "utf8");
for (const line of env.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

import("@neondatabase/serverless").then(async ({ neon }) => {
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL);
  const rows = await sql`SELECT id, file_name, blob_url FROM templates WHERE blob_url != '' ORDER BY id`;

  for (const tpl of rows) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Template: ${tpl.id} - ${tpl.file_name}`);

    const res = await fetch(tpl.blob_url);
    const buf = Buffer.from(await res.arrayBuffer());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);

    console.log("Sheets:", wb.worksheets.map(s => s.name).join(", "));

    const sheet = wb.getWorksheet("設定情報");
    if (!sheet) { console.log("  ⚠ 設定情報シートなし"); continue; }

    console.log("設定情報シートの非空セル一覧:");
    sheet.eachRow((row, rowNum) => {
      row.eachCell({ includeEmpty: false }, (cell, colNum) => {
        const val = cell.value;
        if (val !== null && val !== undefined && val !== "") {
          const addr = `${String.fromCharCode(64 + colNum)}${rowNum}`;
          console.log(`  ${addr}: ${JSON.stringify(val)}`);
        }
      });
    });
  }

  process.exit(0);
}).catch(e => { console.error(e); process.exit(1); });
