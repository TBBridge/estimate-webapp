import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import { agencyMutationErrorResponse } from "@/app/api/agencies/agency-mutation-errors";

export const runtime = "nodejs";

type RowErr = { line: number; message: string };

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v !== undefined && v !== "") return v;
  }
  return "";
}

/**
 * CSV ヘッダ例（いずれかの列名）:
 * name,email,loginPassword,agencyType,contactName,department,phoneCountryCode,phoneLocal,faxCountryCode,faxLocal,approverName,approverEmail
 * 日本語: 代理店名,メール,ログインパスワード,代理店種別,担当者名,部署,電話国番号,電話,FAX国番号,FAX,承認者名,承認者メール
 */
export async function POST(req: Request) {
  try {
    const ct = req.headers.get("content-type") ?? "";
    if (!ct.includes("multipart/form-data")) {
      return NextResponse.json({ error: "multipart/form-data で file を送ってください" }, { status: 400 });
    }
    const fd = await req.formData();
    const file = fd.get("file");
    if (!file || typeof file === "string") {
      return NextResponse.json({ error: "file が必要です" }, { status: 400 });
    }
    const text = await (file as File).text();
    const rows = parseCsv(text);
    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV にデータ行がありません" }, { status: 400 });
    }

    const sql = getDb();
    let created = 0;
    const errors: RowErr[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const line = i + 2;
      const name = pick(row, "name", "代理店名", "agency_name").trim();
      const email = pick(row, "email", "メール", "e-mail").trim();
      if (!name || !email) {
        errors.push({ line, message: "name と email は必須です" });
        continue;
      }
      const loginPassword = pick(row, "loginpassword", "login_password", "ログインパスワード");
      const agencyType = pick(row, "agencytype", "agency_type", "代理店種別");
      const contactName = pick(row, "contactname", "contact_name", "担当者名");
      const department = pick(row, "department", "部署");
      const phoneCountryCode = pick(row, "phonecountrycode", "phone_country_code", "電話国番号") || "+81";
      const phoneLocal = pick(row, "phonelocal", "phone_local", "電話");
      const faxCountryCode = pick(row, "faxcountrycode", "fax_country_code", "fax国番号", "fax国") || "+81";
      const faxLocal = pick(row, "faxlocal", "fax_local", "fax");
      const approverName = pick(row, "approvername", "approver_name", "承認者名");
      const approverEmail = pick(row, "approveremail", "approver_email", "承認者メール");

      try {
        await sql`
          INSERT INTO agencies (
            name, email, login_password, agency_type, contact_name, department,
            phone_country_code, phone_local, fax_country_code, fax_local,
            approver_name, approver_email
          )
          VALUES (
            ${name}, ${email}, ${loginPassword}, ${agencyType},
            ${contactName}, ${department},
            ${phoneCountryCode}, ${phoneLocal},
            ${faxCountryCode}, ${faxLocal},
            ${approverName}, ${approverEmail}
          )
        `;
        created += 1;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push({ line, message: msg });
      }
    }

    return NextResponse.json({ created, errors, totalRows: rows.length });
  } catch (e) {
    return agencyMutationErrorResponse(e, "[agencies import-csv]");
  }
}
