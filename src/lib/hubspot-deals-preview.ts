/**
 * 案件詳細表示用: HubSpot から「同じ会社名」の取引を検索し、UI 表示用の payload を返す
 */
import type { Locale } from "@/lib/translations";
import { getHubSpotConfig } from "@/lib/hubspot-env";
import { searchDealsByCompanyName, type HubSpotDealSummary } from "@/lib/hubspot-deals";

export type HubSpotDealsPreviewPayload =
  | { configured: false }
  | {
      configured: true;
      found: boolean;
      deals: Array<{
        id: string;
        dealName: string;
        customerName?: string;
      }>;
      error?: string;
    };

export async function fetchHubSpotDealsPreviewForCustomer(
  customerName: string,
  _locale: Locale
): Promise<HubSpotDealsPreviewPayload> {
  const cfg = getHubSpotConfig();
  if (!cfg) return { configured: false };

  const trimmed = String(customerName ?? "").trim();
  if (!trimmed) {
    return { configured: true, found: false, deals: [] };
  }

  try {
    const results: HubSpotDealSummary[] = await searchDealsByCompanyName(cfg, trimmed);
    return {
      configured: true,
      found: results.length > 0,
      deals: results.map((d) => ({
        id: d.id,
        dealName: d.dealName,
        customerName: d.customerName,
      })),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[hubspot-deals-preview]", msg);
    return {
      configured: true,
      found: false,
      deals: [],
      error: msg.slice(0, 400),
    };
  }
}
