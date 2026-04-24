/**
 * HubSpot CRM API v3 — 取引の検索（POST /crm/v3/objects/deals/search）と作成（POST /crm/v3/objects/deals）
 */

import type { HubSpotConfig } from "@/lib/hubspot-env";
import { buildHubSpotSingleMatchValue } from "@/lib/hubspot-env";

const USER_AGENT = "estimate-webapp/hubspot-deals";

type HubSpotSearchResult = {
  total?: number;
  results?: Array<{ id: string; properties?: Record<string, string | null> }>;
};

type HubSpotPipelineResponse = {
  results: Array<{
    id: string;
    stages: Array<{ id: string; displayOrder: number }>;
  }>;
};

let cachedDefaultStage: { pipelineId: string; stageId: string } | null = null;

async function hubspotFetchJson<T>(
  config: HubSpotConfig,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${config.apiBase}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text) as { message?: string };
      if (j.message) detail = j.message;
    } catch {
      /* ignore */
    }
    throw new Error(`HubSpot API ${res.status}: ${detail}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function buildSearchBody(
  config: HubSpotConfig,
  input: { agencyId: string; customerName: string }
): { filterGroups: Array<{ filters: Array<Record<string, string>> }>; limit: number; properties: string[] } {
  const { dedupe } = config;
  const props = new Set<string>(["dealname", "pipeline", "dealstage"]);

  if (dedupe.kind === "single") {
    props.add(dedupe.property);
    const value = buildHubSpotSingleMatchValue(input.agencyId, input.customerName);
    return {
      filterGroups: [
        {
          filters: [
            { propertyName: dedupe.property, operator: "EQ", value },
          ],
        },
      ],
      limit: 5,
      properties: [...props],
    };
  }

  if (dedupe.kind === "and") {
    props.add(dedupe.agencyProperty);
    props.add(dedupe.customerProperty);
    return {
      filterGroups: [
        {
          filters: [
            { propertyName: dedupe.agencyProperty, operator: "EQ", value: input.agencyId },
            { propertyName: dedupe.customerProperty, operator: "EQ", value: input.customerName.trim() },
          ],
        },
      ],
      limit: 5,
      properties: [...props],
    };
  }

  if (dedupe.kind === "customer") {
    props.add(dedupe.customerProperty);
    return {
      filterGroups: [
        {
          filters: [
            { propertyName: dedupe.customerProperty, operator: "EQ", value: input.customerName.trim() },
          ],
        },
      ],
      limit: 5,
      properties: [...props],
    };
  }

  // dedupe.kind === "none": dealname の CONTAINS_TOKEN で会社名のみ検索
  return {
    filterGroups: [
      {
        filters: [
          { propertyName: "dealname", operator: "CONTAINS_TOKEN", value: input.customerName.trim() },
        ],
      },
    ],
    limit: 5,
    properties: [...props],
  };
}

async function resolvePipelineAndStage(
  config: HubSpotConfig
): Promise<{ pipelineId: string; stageId: string }> {
  if (config.pipelineId && config.dealStageId) {
    return { pipelineId: config.pipelineId, stageId: config.dealStageId };
  }
  if (cachedDefaultStage) return cachedDefaultStage;

  const data = await hubspotFetchJson<HubSpotPipelineResponse>(
    config,
    "GET",
    "/crm/v3/pipelines/deals"
  );
  const pipelines = [...(data.results ?? [])].sort((a, b) => {
    const ao = (a as { displayOrder?: number }).displayOrder ?? 0;
    const bo = (b as { displayOrder?: number }).displayOrder ?? 0;
    return ao - bo;
  });
  const p = pipelines[0];
  if (!p?.stages?.length) {
    throw new Error("HubSpot に取引パイプラインまたはステージがありません。");
  }
  const stages = [...p.stages].sort((a, b) => a.displayOrder - b.displayOrder);
  const stage = stages[0];
  cachedDefaultStage = { pipelineId: p.id, stageId: stage.id };
  return cachedDefaultStage;
}

export type FindOrCreateDealInput = {
  agencyId: string;
  agencyName: string;
  customerName: string;
  /** 見積番号（取引名に使用） */
  estimateNo: string;
};

export type FindOrCreateDealResult =
  | { ok: true; dealId: string; created: boolean }
  | { ok: false; error: string };

/**
 * 同一条件の取引があればその ID を返し、なければ新規作成して ID を返す。
 */
export async function findOrCreateDeal(
  config: HubSpotConfig,
  input: FindOrCreateDealInput
): Promise<FindOrCreateDealResult> {
  try {
    const searchBody = buildSearchBody(config, {
      agencyId: input.agencyId,
      customerName: input.customerName,
    });
    const searched = await hubspotFetchJson<HubSpotSearchResult>(
      config,
      "POST",
      "/crm/v3/objects/deals/search",
      searchBody
    );
    const first = searched.results?.[0];
    if (first?.id) {
      return { ok: true, dealId: first.id, created: false };
    }

    const { pipelineId, stageId } = await resolvePipelineAndStage(config);
    const dealName = `${input.estimateNo} ${input.customerName.trim()}`.slice(0, 500);

    const properties: Record<string, string> = {
      dealname: dealName,
      pipeline: pipelineId,
      dealstage: stageId,
    };

    const { dedupe } = config;
    if (dedupe.kind === "single") {
      properties[dedupe.property] = buildHubSpotSingleMatchValue(
        input.agencyId,
        input.customerName
      );
    } else if (dedupe.kind === "and") {
      properties[dedupe.agencyProperty] = input.agencyId;
      properties[dedupe.customerProperty] = input.customerName.trim();
    } else if (dedupe.kind === "customer") {
      properties[dedupe.customerProperty] = input.customerName.trim();
    }
    // dedupe.kind === "none" のときは追加プロパティなし（dealname のみ）

    if (config.extraCreateProperties) {
      for (const [k, v] of Object.entries(config.extraCreateProperties)) {
        properties[k] = v
          .replace(/\{\{estimate_no\}\}/g, input.estimateNo)
          .replace(/\{\{customer_name\}\}/g, input.customerName.trim())
          .replace(/\{\{agency_id\}\}/g, input.agencyId)
          .replace(/\{\{agency_name\}\}/g, input.agencyName.trim());
      }
    }

    const created = await hubspotFetchJson<{ id: string }>(
      config,
      "POST",
      "/crm/v3/objects/deals",
      { properties }
    );
    if (!created.id) {
      return { ok: false, error: "HubSpot 取引の作成レスポンスに id がありません。" };
    }
    return { ok: true, dealId: created.id, created: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}

// ─────────────────────────────────────────────────────────────
// 会社名のみで取引を検索／作成する API
// （承認時の HubSpot 連携は「同じ会社名の取引」を見つけてから契約形態に応じて分岐する）
// ─────────────────────────────────────────────────────────────

export type HubSpotDealSummary = {
  id: string;
  dealName: string;
  /** 重複検知に使ったプロパティで返ってきた会社名 */
  customerName?: string;
  pipeline?: string;
  dealStage?: string;
};

function customerSearchPropertyName(config: HubSpotConfig): string | null {
  if (config.dedupe.kind === "and") return config.dedupe.customerProperty;
  if (config.dedupe.kind === "customer") return config.dedupe.customerProperty;
  return null;
}

/**
 * 会社名のみで HubSpot の取引を検索する。
 *  1) HUBSPOT_MATCH_CUSTOMER_PROPERTY が設定されていれば EQ で完全一致
 *  2) 未設定なら dealname の CONTAINS_TOKEN（HubSpot API 標準）でフォールバック
 */
export async function searchDealsByCompanyName(
  config: HubSpotConfig,
  companyName: string
): Promise<HubSpotDealSummary[]> {
  const trimmed = String(companyName ?? "").trim();
  if (!trimmed) return [];

  const customerProp = customerSearchPropertyName(config);
  const props = new Set<string>(["dealname", "pipeline", "dealstage"]);
  if (customerProp) props.add(customerProp);

  const filterGroups = customerProp
    ? [
        {
          filters: [
            { propertyName: customerProp, operator: "EQ", value: trimmed },
          ],
        },
      ]
    : [
        {
          filters: [
            { propertyName: "dealname", operator: "CONTAINS_TOKEN", value: trimmed },
          ],
        },
      ];

  const body = {
    filterGroups,
    limit: 20,
    properties: [...props],
  };

  const res = await hubspotFetchJson<HubSpotSearchResult>(
    config,
    "POST",
    "/crm/v3/objects/deals/search",
    body
  );

  return (res.results ?? []).map((r) => {
    const p = r.properties ?? {};
    return {
      id: r.id,
      dealName: String(p.dealname ?? ""),
      customerName: customerProp ? String(p[customerProp] ?? "") : undefined,
      pipeline: p.pipeline ? String(p.pipeline) : undefined,
      dealStage: p.dealstage ? String(p.dealstage) : undefined,
    };
  });
}

export type CreateDealByCompanyInput = {
  agencyId: string;
  agencyName: string;
  customerName: string;
  /** 取引名に使う見積番号（無ければ会社名のみで取引名にする） */
  estimateNo?: string;
};

/** 会社名で新しい取引を HubSpot に作成し、ID を返す */
export async function createDealByCompanyName(
  config: HubSpotConfig,
  input: CreateDealByCompanyInput
): Promise<{ ok: true; dealId: string } | { ok: false; error: string }> {
  try {
    const customerName = String(input.customerName ?? "").trim();
    if (!customerName) {
      return { ok: false, error: "会社名が空のため HubSpot 取引を作成できません。" };
    }

    const { pipelineId, stageId } = await resolvePipelineAndStage(config);
    const dealName = (input.estimateNo
      ? `${input.estimateNo} ${customerName}`
      : customerName
    ).slice(0, 500);

    const properties: Record<string, string> = {
      dealname: dealName,
      pipeline: pipelineId,
      dealstage: stageId,
    };

    const { dedupe } = config;
    if (dedupe.kind === "single") {
      properties[dedupe.property] = buildHubSpotSingleMatchValue(input.agencyId, customerName);
    } else if (dedupe.kind === "and") {
      properties[dedupe.agencyProperty] = input.agencyId;
      properties[dedupe.customerProperty] = customerName;
    } else if (dedupe.kind === "customer") {
      properties[dedupe.customerProperty] = customerName;
    }

    if (config.extraCreateProperties) {
      for (const [k, v] of Object.entries(config.extraCreateProperties)) {
        properties[k] = v
          .replace(/\{\{estimate_no\}\}/g, input.estimateNo ?? "")
          .replace(/\{\{customer_name\}\}/g, customerName)
          .replace(/\{\{agency_id\}\}/g, input.agencyId)
          .replace(/\{\{agency_name\}\}/g, input.agencyName.trim());
      }
    }

    const created = await hubspotFetchJson<{ id: string }>(
      config,
      "POST",
      "/crm/v3/objects/deals",
      { properties }
    );
    if (!created.id) {
      return { ok: false, error: "HubSpot 取引の作成レスポンスに id がありません。" };
    }
    return { ok: true, dealId: created.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
