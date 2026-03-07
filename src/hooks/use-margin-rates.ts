import useSWR, { mutate } from "swr";
import type { MarginRate } from "@/lib/mock-data";

const KEY = "/api/margin-rates";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

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
