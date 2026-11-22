import { Eye } from "lucide-react";
import type { Locale } from "@garage/domain";
import { useGarageStore } from "../../shared/store";
import { hasCapability } from "../../shared/capabilities";
import { tr } from "./lookups";

/** quotes.manage lets a person create, revise, offer, accept, reserve and redeem. quotes.view alone is read-only. The server enforces; this only hides controls. */
export function useCanManageQuotes(): boolean {
  const store = useGarageStore();
  return hasCapability(store.actor, "quotes.manage");
}

/** Subtle note for people who can see quotes but not change them. */
export function ReadOnlyNote({ lang }: { lang: Locale }) {
  const t = tr(lang);
  return <span className="qo-readonly" title={t("You can view this area but not change it.", "يمكنك عرض هذا القسم دون تعديله.")}>
    <Eye size={13} aria-hidden="true" />{t("View only", "عرض فقط")}
  </span>;
}
