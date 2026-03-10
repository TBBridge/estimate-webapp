import useSWR, { mutate } from "swr";
import type { UnitPrice, PriceTier } from "@/lib/mock-data";

const KEY = "/api/unit-prices";
const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export function useUnitPrices() {
  const { data, error, isLoading } = useSWR<UnitPrice[]>(KEY, fetcher);
  return { unitPrices: data ?? [], error, isLoading };
}

export async function updateUnitPriceTiers(id: string, tiers: PriceTier[]): Promise<void> {
  const res = await fetch(`${KEY}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tiers }),
  });
  if (!res.ok) throw new Error(await res.text());
  await mutate(KEY);
}
