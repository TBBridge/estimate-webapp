import useSWR, { mutate } from "swr";
import type { Estimate } from "@/lib/mock-data";

const BASE = "/api/estimates";
const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

type Filters = {
  agencyId?: string;
  deliveryType?: string;
  contractType?: string;
  status?: string;
  customerName?: string;
  from?: string;
  to?: string;
};

function buildKey(filters: Filters) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) {
    if (v) params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${BASE}?${qs}` : BASE;
}

export function useEstimates(filters: Filters = {}) {
  const key = buildKey(filters);
  const { data, error, isLoading } = useSWR<Estimate[]>(key, fetcher);
  return { estimates: data ?? [], error, isLoading };
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
