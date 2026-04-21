import useSWR, { mutate } from "swr";
import type { Estimate } from "@/lib/mock-data";

const BASE = "/api/estimates";

type Filters = {
  agencyId?: string;
  deliveryType?: string;
  contractType?: string;
  status?: string;
  customerName?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

function buildKey(filters: Filters) {
  const { page, pageSize, ...rest } = filters;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && v !== null && String(v) !== "") params.set(k, String(v));
  }
  if (page != null && pageSize != null) {
    params.set("page", String(page));
    params.set("pageSize", String(pageSize));
  }
  const qs = params.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

type EstimatesPayload = { estimates: Estimate[]; total: number };

const fetcher = async (url: string): Promise<EstimatesPayload> => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const data: unknown = await r.json();
  if (Array.isArray(data)) {
    const list = data as Estimate[];
    return { estimates: list, total: list.length };
  }
  const o = data as { estimates?: Estimate[]; total?: number };
  return {
    estimates: o.estimates ?? [],
    total: typeof o.total === "number" ? o.total : (o.estimates?.length ?? 0),
  };
};

export function useEstimates(filters: Filters = {}) {
  const key = buildKey(filters);
  const { data, error, isLoading } = useSWR(key, fetcher);
  return {
    estimates: data?.estimates ?? [],
    total: data?.total ?? 0,
    error,
    isLoading,
  };
}

export async function createEstimate(body: Omit<Estimate, "id" | "status" | "createdAt" | "approvedAt">): Promise<Estimate> {
  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const created = await res.json();
  await mutate(BASE);
  return created;
}
