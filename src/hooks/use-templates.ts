import useSWR, { mutate } from "swr";

export type TemplateMeta = {
  id: string;
  deliveryType: string;
  contractType: string;
  subType?: string;
  fileName: string;
  blobUrl?: string;
  uploadedAt: string;
};

const KEY = "/api/templates";
const fetcher = async (url: string) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

export function useTemplates() {
  const { data, error, isLoading } = useSWR<TemplateMeta[]>(KEY, fetcher);
  return { templates: data ?? [], error, isLoading };
}

export async function uploadTemplate(id: string, file: File): Promise<TemplateMeta> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`/api/templates/${id}`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(err.error ?? "Upload failed");
  }
  const data = await res.json() as TemplateMeta;
  await mutate(KEY);
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
  await mutate(KEY);
}
