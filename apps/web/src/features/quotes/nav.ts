import { useCallback } from "react";
import { useLocation } from "wouter";

export type OffersTab = "quotes" | "reservations" | "benefits" | "promotions";

/** Full-page link into a tab of Quotes & offers with a record open. Works from any page. */
export const offersPath = (tab: OffersTab, id?: string) => {
  const params = new URLSearchParams();
  if (tab !== "quotes") params.set("tab", tab);
  if (id) params.set("record", id);
  const query = params.toString();
  return `/workspace/quotes${query ? `?${query}` : ""}`;
};

/** Cross-tab navigation for the quote -> reservation -> benefit chain. */
export function useOffersNav() {
  const [, navigate] = useLocation();
  return useCallback((tab: OffersTab, id?: string) => navigate(offersPath(tab, id)), [navigate]);
}
