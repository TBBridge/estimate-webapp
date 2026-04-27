import useSWR, { mutate } from "swr";
import type { Agency } from "@/lib/mock-data";

const KEY = "/api/agencies";
const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

function messageFromErrorBody(text: string, status: number): string {
  try {
    const j = JSON.parse(text) as { error?: string };
    if (typeof j.error === "string" && j.error.trim()) return j.error;
  } catch {
    /* plain text or HTML */
  }
  if (text.trim()) return text.slice(0, 300);
  return `HTTP ${status}`;
}

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
  const text = await res.text();
  if (!res.ok) throw new Error(messageFromErrorBody(text, res.status));
  const created = JSON.parse(text) as Agency;
  await mutate(KEY);
  return created;
}

export async function updateAgency(id: string, body: Omit<Agency, "id" | "createdAt">): Promise<Agency> {
  const res = await fetch(`${KEY}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(messageFromErrorBody(text, res.status));
  const updated = JSON.parse(text) as Agency;
  await mutate(KEY);
  return updated;
}

export async function deleteAgency(id: string): Promise<void> {
  const res = await fetch(`${KEY}/${id}`, { method: "DELETE" });
  const text = await res.text();
  if (!res.ok) throw new Error(messageFromErrorBody(text, res.status));
  await mutate(KEY);
}
