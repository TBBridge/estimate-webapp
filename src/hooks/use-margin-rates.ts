import useSWR, { mutate } from "swr";
import type { MarginRate } from "@/lib/mock-data";

const KEY = "/api/margin-rates";
const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export function useMarginRates() {
  const { data, error, isLoading } = useSWR<MarginRate[]>(KEY, fetcher);
  return { marginRates: data ?? [], error, isLoading };
}

export async function updateMarginRate(id: string, rate: number): Promise<void> {
  const res = await fetch(KEY, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, rate }),
  });
  if (!res.ok) throw new Error(await res.text());
  await mutate(KEY);
}

export async function createMarginRate(
  agencyId: string,
  agencyName: string,
  productId: string,
  deliveryType: string,
  rate: number,
): Promise<void> {
  const res = await fetch(KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agencyId, agencyName, productId, deliveryType, rate }),
  });
  if (!res.ok) throw new Error(await res.text());
  await mutate(KEY);
}

export async function deleteMarginRate(id: string): Promise<void> {
  const res = await fetch(KEY, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) throw new Error(await res.text());
  await mutate(KEY);
}
