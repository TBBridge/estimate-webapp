/**
 * POST /api/kintone/lookup-license
 *
 * ログイン代理店に紐づく kintone レコードを、顧客名で検索（既定: 部分一致 like）。
 * 複数件の場合は candidates 配列で返し、フロントで選択させる。
 *
 * KINTONE_CUSTOMER_MATCH_MODE=equals のときは完全一致（ドロップダウン型フィールド向け）、limit 1。
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
  type KintoneRecord,
} from "@/lib/kintone";
import { getKintoneLicenseAppConfig, kintoneConfigErrorMessage } from "@/lib/kintone-env";

export const runtime = "nodejs";

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() ?? fallback;
}

export type KintoneLicenseCandidate = {
  recordId: string;
  customerDisplay: string;
  existingLicenseCount?: number;
  existingMaintenanceStart?: { year: number; month: number };
  existingMaintenanceEnd?: { year: number; month: number };
};

function mapRecordToCandidate(
  rec: KintoneRecord,
  fieldCustomer: string,
  fieldLicense: string,
  fieldStart: string,
  fieldEnd: string
): KintoneLicenseCandidate | null {
  const recordId = String(rec.$id?.value ?? "").trim();
  if (!recordId) return null;
  const customerDisplay = kintoneStringValue(rec, fieldCustomer).trim() || recordId;
  const existingLicenseCount = kintoneNumberValue(rec, fieldLicense) ?? undefined;
  const startRaw = kintoneStringValue(rec, fieldStart);
  const endRaw = kintoneStringValue(rec, fieldEnd);
  const existingMaintenanceStart = kintoneDateToYearMonth(startRaw) ?? undefined;
  const existingMaintenanceEnd = kintoneDateToYearMonth(endRaw) ?? undefined;
  return {
    recordId,
    customerDisplay,
    existingLicenseCount,
    existingMaintenanceStart,
    existingMaintenanceEnd,
  };
}

export async function POST(req: Request) {
  try {
    const kc = getKintoneLicenseAppConfig();
    if (!kc) {
      return NextResponse.json(
        { error: kintoneConfigErrorMessage(), configured: false },
        { status: 503 }
      );
    }
    const { domain, appId, apiToken } = kc;

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
    const termsRaw: string[] = [];
    if (nameJa) termsRaw.push(nameJa);
    if (nameZh && nameZh !== nameJa) termsRaw.push(nameZh);
    if (termsRaw.length === 0) {
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

    const customerMode = env("KINTONE_CUSTOMER_MATCH_MODE", "like").toLowerCase();
    const maxResults = Math.min(Math.max(parseInt(env("KINTONE_LOOKUP_MAX_RESULTS", "30"), 10) || 30, 1), 100);
    const minLen = Math.max(1, parseInt(env("KINTONE_SEARCH_MIN_LENGTH", "2"), 10) || 2);

    const sql = getDb();
    const agRows = await sql`SELECT name FROM agencies WHERE id = ${agencyId}`;
    const agencyNameFromDb = (agRows[0]?.name as string | undefined) ?? "";

    const escapedAgencyId = escapeKintoneQueryString(agencyId);

    const matchBy = env("KINTONE_MATCH_AGENCY_BY", "id");
    let agencyClause: string;
    if (matchBy === "name" && agencyNameFromDb) {
      agencyClause = `${fieldAgency} = "${escapeKintoneQueryString(agencyNameFromDb)}"`;
    } else {
      agencyClause = `${fieldAgency} = "${escapedAgencyId}"`;
    }

    let customerClause: string;
    let limit: number;

    if (customerMode === "equals") {
      const primary = termsRaw[0];
      customerClause = `${fieldCustomer} = "${escapeKintoneQueryString(primary)}"`;
      limit = 1;
    } else {
      const validTerms = termsRaw.filter((t) => t.length >= minLen);
      if (validTerms.length === 0) {
        return NextResponse.json({
          found: false,
          matchCount: 0,
          candidates: [] as KintoneLicenseCandidate[],
          message: `顧客名は${minLen}文字以上入力してください。`,
          requiresSelection: false,
        });
      }
      const likes = validTerms.map((t) => `${fieldCustomer} like "${escapeKintoneQueryString(t)}"`);
      customerClause = likes.length === 1 ? likes[0] : `(${likes.join(" or ")})`;
      limit = maxResults;
    }

    const query = `${agencyClause} and ${customerClause} order by $id desc limit ${limit}`;

    const data = await fetchKintoneRecords({
      domain,
      appId,
      apiToken,
      query,
      fields: ["$id", fieldCustomer, fieldLicense, fieldStart, fieldEnd],
    });

    const candidates: KintoneLicenseCandidate[] = [];
    for (const rec of data.records ?? []) {
      const c = mapRecordToCandidate(rec, fieldCustomer, fieldLicense, fieldStart, fieldEnd);
      if (c) candidates.push(c);
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        found: false,
        matchCount: 0,
        candidates: [],
        message: "該当するレコードがありません",
        requiresSelection: false,
      });
    }

    /** 後方互換: 1件のときはトップレベルにも展開（既存クライアント用） */
    const first = candidates[0];
    return NextResponse.json({
      found: true,
      matchCount: candidates.length,
      candidates,
      requiresSelection: candidates.length > 1,
      existingLicenseCount: first.existingLicenseCount,
      existingMaintenanceStart: first.existingMaintenanceStart,
      existingMaintenanceEnd: first.existingMaintenanceEnd,
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
    const isChoiceMismatch =
      /GAIA_IQ10|does not exist in the/i.test(msg) || /選択肢/i.test(msg);
    if (isChoiceMismatch) {
      return NextResponse.json(
        {
          error:
            "検索に使えないフィールド種別の可能性があります（例: ドロップダウンは like が使えません）。環境変数 KINTONE_CUSTOMER_MATCH_MODE=equals で完全一致にするか、顧客名を文字列（1行）フィールドにしてください。",
          detail: msg.slice(0, 400),
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
