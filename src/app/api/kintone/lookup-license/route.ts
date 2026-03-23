/**
 * POST /api/kintone/lookup-license
 *
 * アプリ219: 同一代理店・同一顧客（会社名）のレコードを検索し、
 * 既存ライセンス数・保守開始/終了年月の候補を返す。
 *
 * 必須環境変数:
 *   KINTONE_DOMAIN（例: https://dea5gs2qu9n6.cybozu.com）
 *   KINTONE_API_TOKEN_APP219（アプリ219の API トークン）
 *
 * フィールドコード（kintone アプリ219の設定に合わせて変更）:
 *   KINTONE_FIELD_AGENCY_ID   デフォルト: agency_id
 *   KINTONE_FIELD_CUSTOMER    デフォルト: customer_name
 *   KINTONE_FIELD_LICENSE     デフォルト: license_count
 *   KINTONE_FIELD_MAINT_START デフォルト: maint_start
 *   KINTONE_FIELD_MAINT_END   デフォルト: maint_end
 */
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { ContractType, DeliveryType } from "@/lib/estimate-schema";
import {
  escapeKintoneQueryString,
  fetchKintoneRecords,
  kintoneDateToYearMonth,
  kintoneNumberValue,
  kintoneStringValue,
} from "@/lib/kintone";

export const runtime = "nodejs";

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

export async function POST(req: Request) {
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

    const body = await req.json() as {
      agencyId?: string;
      userCompanyNameJa?: string;
      userCompanyNameZh?: string;
      contractType?: ContractType;
      deliveryType?: DeliveryType;
    };

    const { agencyId, userCompanyNameJa, userCompanyNameZh, contractType, deliveryType } = body;

    if (contractType !== "license_add" && contractType !== "option_add") {
      return NextResponse.json({ error: "この契約形態では検索できません" }, { status: 400 });
    }
    if (deliveryType !== "onprem" && deliveryType !== "cloud") {
      return NextResponse.json({ error: "この提供形態では検索できません" }, { status: 400 });
    }
    if (!agencyId) {
      return NextResponse.json({ error: "agencyId が必要です" }, { status: 400 });
    }

    const nameJa = String(userCompanyNameJa ?? "").trim();
    const nameZh = String(userCompanyNameZh ?? "").trim();
    const customerSearch = nameJa || nameZh;
    if (!customerSearch) {
      return NextResponse.json(
        { error: "会社名（日本語または中国語）を入力してから検索してください" },
        { status: 400 }
      );
    }

    const fieldAgency = env("KINTONE_FIELD_AGENCY_ID", "agency_id");
    const fieldCustomer = env("KINTONE_FIELD_CUSTOMER", "customer_name");
    const fieldLicense = env("KINTONE_FIELD_LICENSE", "license_count");
    const fieldStart = env("KINTONE_FIELD_MAINT_START", "maint_start");
    const fieldEnd = env("KINTONE_FIELD_MAINT_END", "maint_end");

    const sql = getDb();
    const agRows = await sql`SELECT name FROM agencies WHERE id = ${agencyId}`;
    const agencyNameFromDb = (agRows[0]?.name as string | undefined) ?? "";

    const escapedAgencyId = escapeKintoneQueryString(agencyId);
    const escapedCustomer = escapeKintoneQueryString(customerSearch);

    /**
     * 代理店の突合: まず agency_id フィールドで id 一致。
     * 一致しない運用の場合は KINTONE_MATCH_AGENCY_BY=name で代理店名（DBの name）と一致。
     */
    const matchBy = env("KINTONE_MATCH_AGENCY_BY", "id");
    let agencyClause: string;
    if (matchBy === "name" && agencyNameFromDb) {
      agencyClause = `${fieldAgency} = "${escapeKintoneQueryString(agencyNameFromDb)}"`;
    } else {
      agencyClause = `${fieldAgency} = "${escapedAgencyId}"`;
    }

    const query = `${agencyClause} and ${fieldCustomer} = "${escapedCustomer}" order by $id desc limit 1`;

    const data = await fetchKintoneRecords({
      domain,
      appId,
      apiToken,
      query,
      fields: [fieldLicense, fieldStart, fieldEnd],
    });

    const rec = data.records?.[0];
    if (!rec) {
      return NextResponse.json({
        found: false,
        message: "該当するレコードがありません",
      });
    }

    const existingLicenseCount = kintoneNumberValue(rec, fieldLicense);
    const startRaw = kintoneStringValue(rec, fieldStart);
    const endRaw = kintoneStringValue(rec, fieldEnd);

    const existingMaintenanceStart = kintoneDateToYearMonth(startRaw);
    const existingMaintenanceEnd = kintoneDateToYearMonth(endRaw);

    return NextResponse.json({
      found: true,
      existingLicenseCount: existingLicenseCount ?? undefined,
      existingMaintenanceStart: existingMaintenanceStart ?? undefined,
      existingMaintenanceEnd: existingMaintenanceEnd ?? undefined,
    });
  } catch (e) {
    console.error("[kintone/lookup-license]", e);
    const msg = e instanceof Error ? e.message : String(e);
    const isFieldMissing =
      /GAIA_IQ11|not found|Specified field/i.test(msg) ||
      /フィールド.*見つかりません/i.test(msg);
    if (isFieldMissing) {
      return NextResponse.json(
        {
          error:
            "kintone のフィールドコードがこのアプリに存在しません。Vercel（または .env.local）の KINTONE_FIELD_AGENCY_ID などを、kintone アプリの「フィールドコード」に合わせてください。一覧はブラウザで GET /api/kintone/app-fields を開いて確認できます。",
          detail: msg.slice(0, 400),
        },
        { status: 502 }
      );
    }
    /** ドロップダウン等で、入力値が選択肢にない（クエリの = 比較で失敗） */
    const isChoiceMismatch =
      /GAIA_IQ10|does not exist in the/i.test(msg) || /選択肢/i.test(msg);
    if (isChoiceMismatch) {
      return NextResponse.json(
        {
          error:
            "入力した会社名が kintone の該当フィールド（例: ドロップダウンの選択肢）に一致しません。kintone 側の値と同じ表記で入力するか、フィールド種別・環境変数 KINTONE_FIELD_* をご確認ください。",
          detail: msg.slice(0, 400),
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
