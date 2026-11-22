import type { Locale } from "@garage/domain";
import { PromotionsPage } from "./PromotionsPage";

/** Kept for existing imports: the promotions screen now lives in PromotionsPage. `actorId` / `actorRole` are ignored (the store supplies the actor). */
export function QualificationForm({ lang, embedded = false }: { lang: Locale; embedded?: boolean; actorId?: string; actorRole?: string }) {
  return <PromotionsPage lang={lang} embedded={embedded} />;
}

export default QualificationForm;
