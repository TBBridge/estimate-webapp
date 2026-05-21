"use client";

import { useCallback, useRef, useState } from "react";
import type { HubSpotDealSelectionPayload } from "@/lib/hubspot-approve-feedback";

/**
 * HubSpot で複数取引がマッチしたとき、承認者/管理者にどの取引へ紐付けるかを
 * モーダルで選んでもらうための React フック。
 *
 * 使い方:
 *   const { selectionState, requestSelection, confirmSelection, cancelSelection } =
 *     useHubSpotDealSelection();
 *
 *   // 承認フロー内で 409 を受けたら:
 *   const chosen = await requestSelection(payload);
 *   if (!chosen) throw new Error(HUBSPOT_DEAL_SELECTION_CANCELLED);
 *
 *   // JSX:
 *   <HubSpotDealSelectionDialog
 *     open={selectionState.open}
 *     payload={selectionState.payload}
 *     locale={locale}
 *     onConfirm={confirmSelection}
 *     onCancel={cancelSelection}
 *   />
 */
export type HubSpotDealSelectionState =
  | { open: false; payload: null }
  | { open: true; payload: HubSpotDealSelectionPayload };

export function useHubSpotDealSelection() {
  const [selectionState, setSelectionState] = useState<HubSpotDealSelectionState>({
    open: false,
    payload: null,
  });
  const resolverRef = useRef<((value: string | null) => void) | null>(null);

  const requestSelection = useCallback(
    (payload: HubSpotDealSelectionPayload): Promise<string | null> => {
      return new Promise<string | null>((resolve) => {
        resolverRef.current = resolve;
        setSelectionState({ open: true, payload });
      });
    },
    []
  );

  const confirmSelection = useCallback((selectedDealId: string) => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setSelectionState({ open: false, payload: null });
    resolver?.(selectedDealId);
  }, []);

  const cancelSelection = useCallback(() => {
    const resolver = resolverRef.current;
    resolverRef.current = null;
    setSelectionState({ open: false, payload: null });
    resolver?.(null);
  }, []);

  return { selectionState, requestSelection, confirmSelection, cancelSelection };
}
