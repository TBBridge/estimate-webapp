/**
 * HubSpot CRM API v3 — 取引の検索（POST /crm/v3/objects/deals/search）と作成（POST /crm/v3/objects/deals）
 */

import { CONTRACT_TYPES } from "@/lib/constants";
import type { HubSpotConfig } from "@/lib/hubspot-env";
import { buildHubSpotSingleMatchValue } from "@/lib/hubspot-env";

const USER_AGENT = "estimate-webapp/hubspot-deals";

function contractTypeLabelJa(raw: string): string {
  return CONTRACT_TYPES.find((c) => c.value === raw)?.labelJa ?? raw;
}

function buildDealName(config: HubSpotConfig, customerName: string, estimateNo?: string): string {
  const name = customerName.trim();
  if (config.dealNameIncludeEstimateNo && estimateNo?.trim()) {
    return `${estimateNo.trim()} ${name}`.slice(0, 500);
  }
  return name.slice(0, 500);
}

/** AND モードの代理店プロパティに送る値（HubSpot が UUID 用テキストか代理店名ドロップダウンかで切替） */
function agencyFieldValue(config: HubSpotConfig, input: { agencyId: string; agencyName: string }): string {
  return config.agencyMatchSends === "name"
    ? String(input.agencyName ?? "").trim()
    : String(input.agencyId ?? "").trim();
}

type HubSpotSearchResult = {
  total?: number;
  results?: Array<{ id: string; properties?: Record<string, string | null> }>;
};

type HubSpotPipelineItem = {
  id: string;
  label: string;
  displayOrder?: number;
  stages: Array<{ id: string; label: string; displayOrder: number }>;
};

let cachedDefaultStage: { pipelineId: string; stageId: string } | null = null;

type HubSpotErrorBody = {
  message?: string;
  correlationId?: string;
  errors?: Array<{ message?: string; context?: Record<string, unknown> }>;
};

function formatHubSpotErrorBody(status: number, text: string): string {
  let detail = text.slice(0, 2000);
  try {
    const j = JSON.parse(text) as HubSpotErrorBody;
    if (j.message) detail = j.message;
    if (j.errors?.length) {
      const parts = j.errors
        .map((e) => {
          const ctx = e.context ? ` ${JSON.stringify(e.context)}` : "";
          return e.message ? `${e.message}${ctx}` : ctx.trim() || JSON.stringify(e);
        })
        .filter(Boolean);
      if (parts.length) detail = `${detail} — ${parts.join(" | ")}`;
    }
    if (j.correlationId) detail = `${detail} [correlationId: ${j.correlationId}]`;
  } catch {
    /* raw text */
  }
  return `HubSpot API ${status}: ${detail}`;
}

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
    throw new Error(formatHubSpotErrorBody(res.status, text));
  }
  return (text ? JSON.parse(text) : {}) as T;
}

function buildSearchBody(
  config: HubSpotConfig,
  input: { agencyId: string; agencyName: string; customerName: string }
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
            {
              propertyName: dedupe.agencyProperty,
              operator: "EQ",
              value: agencyFieldValue(config, { agencyId: input.agencyId, agencyName: input.agencyName }),
            },
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

async function fetchDealPipelines(config: HubSpotConfig): Promise<HubSpotPipelineItem[]> {
  const data = await hubspotFetchJson<{ results: HubSpotPipelineItem[] }>(
    config,
    "GET",
    "/crm/v3/pipelines/deals"
  );
  return data.results ?? [];
}

async function resolvePipelineAndStage(
  config: HubSpotConfig
): Promise<{ pipelineId: string; stageId: string }> {
  if (config.pipelineId && config.dealStageId) {
    return { pipelineId: config.pipelineId, stageId: config.dealStageId };
  }

  const pipelines = await fetchDealPipelines(config);
  const pipeLabel = config.pipelineLabel?.trim();
  const stageLabel = config.dealStageLabel?.trim();

  if (pipeLabel && stageLabel) {
    const pl = pipelines.find((p) => p.label === pipeLabel);
    if (!pl) {
      throw new Error(
        `HubSpot にパイプライン「${pipeLabel}」がありません。HUBSPOT_PIPELINE_LABEL / HUBSPOT_PIPELINE_ID を確認してください。`
      );
    }
    const st = pl.stages.find((s) => s.label === stageLabel);
    if (!st) {
      throw new Error(
        `パイプライン「${pipeLabel}」にステージ「${stageLabel}」がありません。HUBSPOT_DEAL_STAGE_LABEL / HUBSPOT_DEAL_STAGE_ID を確認してください。`
      );
    }
    return { pipelineId: pl.id, stageId: st.id };
  }

  if (cachedDefaultStage) return cachedDefaultStage;

  const sorted = [...pipelines].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  const p = sorted[0];
  if (!p?.stages?.length) {
    throw new Error("HubSpot に取引パイプラインまたはステージがありません。");
  }
  const stages = [...p.stages].sort((a, b) => a.displayOrder - b.displayOrder);
  const stage = stages[0];
  cachedDefaultStage = { pipelineId: p.id, stageId: stage.id };
  return cachedDefaultStage;
}

async function resolveDealOwnerId(config: HubSpotConfig): Promise<string | undefined> {
  if (config.dealOwnerId?.trim()) return config.dealOwnerId.trim();
  const search = config.dealOwnerSearchName?.trim();
  if (!search) return undefined;
  const normalized = search.toLowerCase().replace(/\s+/g, " ").trim();
  const data = await hubspotFetchJson<{
    results?: Array<{ id: string | number; firstName?: string; lastName?: string }>;
  }>(config, "GET", "/crm/v3/owners?limit=500");
  for (const o of data.results ?? []) {
    const full = `${o.firstName ?? ""} ${o.lastName ?? ""}`
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");
    if (full === normalized) return String(o.id);
  }
  console.warn(
    `[hubspot] 取引担当者「${search}」に一致する Owner が見つかりません。HUBSPOT_DEAL_OWNER_ID を直接指定するか、Private App に crm.objects.owners.read を付与してください。`
  );
  return undefined;
}

/** テンプレ JSON のあと、会社名・都道府県・担当・商談区分を上書き設定 */
async function applyDealRequiredAndExtraFields(
  config: HubSpotConfig,
  properties: Record<string, string>,
  input: {
    agencyId: string;
    agencyName: string;
    customerName: string;
    estimateNo?: string;
    contractType?: string;
  }
): Promise<void> {
  const customerName = String(input.customerName ?? "").trim();
  const contractLabel =
    input.contractType != null && input.contractType !== ""
      ? contractTypeLabelJa(input.contractType)
      : "";

  if (config.extraCreateProperties) {
    for (const [k, v] of Object.entries(config.extraCreateProperties)) {
      properties[k] = v
        .replace(/\{\{estimate_no\}\}/g, input.estimateNo ?? "")
        .replace(/\{\{customer_name\}\}/g, customerName)
        .replace(/\{\{agency_id\}\}/g, input.agencyId)
        .replace(/\{\{agency_name\}\}/g, input.agencyName.trim())
        .replace(/\{\{contract_type\}\}/g, input.contractType ?? "")
        .replace(/\{\{contract_type_label\}\}/g, contractLabel);
    }
  }

  if (config.dealCompanyProperty) {
    properties[config.dealCompanyProperty] = customerName;
  }
  if (config.dealPrefectureProperty) {
    properties[config.dealPrefectureProperty] = config.dealPrefectureValue;
  }
  const ownerId = await resolveDealOwnerId(config);
  if (ownerId) {
    properties.hubspot_owner_id = ownerId;
  }
  if (config.dealNegotiationProperty && input.contractType) {
    properties[config.dealNegotiationProperty] = contractTypeLabelJa(input.contractType);
  }
}

export type FindOrCreateDealInput = {
  agencyId: string;
  agencyName: string;
  customerName: string;
  /** 見積番号（取引名に使用） */
  estimateNo: string;
  /** 商談区分などに使う契約形態（DB の contract_type） */
  contractType?: string;
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
      agencyName: input.agencyName,
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
    const dealName = buildDealName(config, input.customerName, input.estimateNo);

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
      properties[dedupe.agencyProperty] = agencyFieldValue(config, {
        agencyId: input.agencyId,
        agencyName: input.agencyName,
      });
      properties[dedupe.customerProperty] = input.customerName.trim();
    } else if (dedupe.kind === "customer") {
      properties[dedupe.customerProperty] = input.customerName.trim();
    }
    // dedupe.kind === "none" のときは追加プロパティなし（dealname のみ）

    await applyDealRequiredAndExtraFields(config, properties, {
      agencyId: input.agencyId,
      agencyName: input.agencyName,
      customerName: input.customerName,
      estimateNo: input.estimateNo,
      contractType: input.contractType,
    });

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
  /** DB の contract_type（商談区分に日本語ラベルを設定） */
  contractType: string;
  /** 取引名に使う見積番号（HUBSPOT_DEAL_NAME_INCLUDE_ESTIMATE_NO=true のときのみ付与） */
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
    const dealName = buildDealName(config, customerName, input.estimateNo);

    const properties: Record<string, string> = {
      dealname: dealName,
      pipeline: pipelineId,
      dealstage: stageId,
    };

    const { dedupe } = config;
    if (dedupe.kind === "single") {
      properties[dedupe.property] = buildHubSpotSingleMatchValue(input.agencyId, customerName);
    } else if (dedupe.kind === "and") {
      properties[dedupe.agencyProperty] = agencyFieldValue(config, {
        agencyId: input.agencyId,
        agencyName: input.agencyName,
      });
      properties[dedupe.customerProperty] = customerName;
    } else if (dedupe.kind === "customer") {
      properties[dedupe.customerProperty] = customerName;
    }

    await applyDealRequiredAndExtraFields(config, properties, {
      agencyId: input.agencyId,
      agencyName: input.agencyName,
      customerName,
      estimateNo: input.estimateNo,
      contractType: input.contractType,
    });

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
