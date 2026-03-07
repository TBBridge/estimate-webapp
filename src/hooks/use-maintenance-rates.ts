import useSWR, { mutate } from "swr";
import type { MaintenanceRate } from "@/lib/mock-data";

const KEY = "/api/maintenance-rates";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useMaintenanceRates() {
  const { data, error, isLoading } = useSWR<MaintenanceRate[]>(KEY, fetcher);
  return { maintenanceRates: data ?? [], error, isLoading };
}

export async function updateMaintenanceRate(id: string, rate: number): Promise<void> {
  const res = await fetch(KEY, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, rate }),
  });
  if (!res.ok) throw new Error(await res.text());
  await mutate(KEY);
}
