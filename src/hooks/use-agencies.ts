import useSWR, { mutate } from "swr";
import type { Agency } from "@/lib/mock-data";

const KEY = "/api/agencies";
const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useAgencies() {
  const { data, error, isLoading } = useSWR<Agency[]>(KEY, fetcher);
  return { agencies: data ?? [], error, isLoading };
}

export async function createAgency(body: Omit<Agency, "id" | "createdAt">): Promise<Agency> {
  const res = await fetch(KEY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const created = await res.json();
  await mutate(KEY);
  return created;
}

export async function updateAgency(id: string, body: Omit<Agency, "id" | "createdAt">): Promise<Agency> {
  const res = await fetch(`${KEY}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await res.text());
  const updated = await res.json();
  await mutate(KEY);
  return updated;
}

export async function deleteAgency(id: string): Promise<void> {
  const res = await fetch(`${KEY}/${id}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error(await res.text());
  await mutate(KEY);
}
