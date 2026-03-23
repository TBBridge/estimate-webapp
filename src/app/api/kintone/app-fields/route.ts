/**
 * GET /api/kintone/app-fields
 *
 * kintone アプリ（既定: KINTONE_APP_LICENSE / 219）のフィールドコード一覧を返す。
 * Vercel の KINTONE_FIELD_* が実アプリのフィールドと一致しているか確認する用途。
 */
import { NextResponse } from "next/server";
import {
  fetchKintoneFormFields,
  flattenKintoneFormFieldList,
  normalizeKintoneDomain,
} from "@/lib/kintone";

export const runtime = "nodejs";

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

export async function GET() {
  try {
    const domain = env("KINTONE_DOMAIN");
    const appId = env("KINTONE_APP_LICENSE", "219") || "219";
    const apiToken = env("KINTONE_API_TOKEN_APP219");

    if (!domain || !apiToken) {
      return NextResponse.json(
        {
          error:
            "kintone が未設定です。KINTONE_DOMAIN と KINTONE_API_TOKEN_APP219 を環境変数に設定してください。",
          configured: false,
        },
        { status: 503 }
      );
    }

    const raw = await fetchKintoneFormFields({ domain, appId, apiToken });
    const fields = flattenKintoneFormFieldList(raw);

    /** 現在の lookup-license が参照する論理名 → 環境変数で上書きした実フィールドコード */
    const lookupMapping = {
      KINTONE_FIELD_AGENCY_ID: env("KINTONE_FIELD_AGENCY_ID", "agency_id"),
      KINTONE_FIELD_CUSTOMER: env("KINTONE_FIELD_CUSTOMER", "customer_name"),
      KINTONE_FIELD_LICENSE: env("KINTONE_FIELD_LICENSE", "license_count"),
      KINTONE_FIELD_MAINT_START: env("KINTONE_FIELD_MAINT_START", "maint_start"),
      KINTONE_FIELD_MAINT_END: env("KINTONE_FIELD_MAINT_END", "maint_end"),
    };

    const codes = new Set(fields.map((f) => f.code));
    const mappingStatus = Object.entries(lookupMapping).map(([envKey, fieldCode]) => ({
      envKey,
      fieldCode,
      existsInApp: codes.has(fieldCode),
    }));

    return NextResponse.json({
      domain: normalizeKintoneDomain(domain),
      appId,
      description:
        "lookup-license は query と fields[] で次の論理フィールドを使います。GAIA_IQ11 のときは fieldCode を kintone の「フィールドコード」と一致させてください。",
      lookupMapping,
      mappingStatus,
      fieldCount: fields.length,
      fields,
    });
  } catch (e) {
    console.error("[kintone/app-fields]", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
