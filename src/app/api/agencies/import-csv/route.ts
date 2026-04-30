import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseCsv } from "@/lib/csv";
import { agencyMutationErrorResponse } from "@/app/api/agencies/agency-mutation-errors";
import { handleAuthError, requireAdmin } from "@/lib/auth/guards";
import { hashPassword } from "@/lib/auth/password";

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
 * name,email,loginPassword,agencyType,contactName,department,phoneCountryCode,phoneLocal,approverName,approverEmail
 * 日本語: 代理店名,メール,ログインパスワード,代理店種別,担当者名,部署,電話国番号,電話,承認者名,承認者メール
 */
export async function POST(req: Request) {
  try {
    await requireAdmin(req);
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
      const approverName = pick(row, "approvername", "approver_name", "承認者名");
      const approverEmail = pick(row, "approveremail", "approver_email", "承認者メール");

      try {
        // パスワード列が CSV に含まれていればハッシュ化して書き込む（平文は保存しない）。
        // 空のままだと password_hash が NULL のまま登録され、当該代理店はログイン不可になる。
        // オペレータが見落とさないように警告として errors にも残す。
        const passwordHash = loginPassword ? await hashPassword(loginPassword) : null;
        const migratedAt = passwordHash ? new Date().toISOString() : null;
        if (!passwordHash) {
          errors.push({
            line,
            message: "loginPassword が空のため、この代理店はログインできません（要再設定）",
          });
        }
        await sql`
          INSERT INTO agencies (
            name, email, login_password, password_hash, password_migrated_at,
            agency_type, contact_name, department,
            phone_country_code, phone_local, fax_country_code, fax_local,
            approver_name, approver_email
          )
          VALUES (
            ${name}, ${email}, '', ${passwordHash}, ${migratedAt},
            ${agencyType},
            ${contactName}, ${department},
            ${phoneCountryCode}, ${phoneLocal},
            ${"+81"}, ${""},
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
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    return agencyMutationErrorResponse(e, "[agencies import-csv]");
  }
}
