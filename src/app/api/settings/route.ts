/**
 * GET  /api/settings  — 通知設定を取得
 * PUT  /api/settings  — 通知設定を更新
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { handleAuthError, requireAdmin } from "@/lib/auth/guards";

const SETTING_KEYS = [
  "active_channel",
  "slack_target",
  "teams_target",
  "gmail_target",
  "gmail_from",
  "gmail_password",
] as const;

export async function GET(req: Request) {
  try {
    await requireAdmin(req);
    const sql = getDb();
    const rows = await sql`
      SELECT key, value FROM app_settings
      WHERE key = ANY(${SETTING_KEYS as unknown as string[]})
    `;
    const result: Record<string, string> = {};
    for (const r of rows) result[r.key] = r.value;
    return NextResponse.json(result);
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error("[settings GET]", e);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    await requireAdmin(req);
    const sql = getDb();
    const body = await req.json() as Record<string, string>;

    for (const key of SETTING_KEYS) {
      if (key in body) {
        await sql`
          INSERT INTO app_settings (key, value)
          VALUES (${key}, ${body[key]})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
        `;
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const authRes = handleAuthError(e);
    if (authRes) return authRes;
    console.error("[settings PUT]", e);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
