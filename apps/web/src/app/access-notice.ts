import type { GarageRole } from "@garage/domain";
import { aliasFor, navigation } from "./navigation";

/**
 * What to tell someone who opens a workspace address their role cannot use (P2T-015). Two different causes, two different messages:
 *  - the address is a real page the person is not allowed to open  -> say which page, and who can grant it;
 *  - the address is not a page at all (a mistyped or old link)      -> say the page was not found.
 * Either way the person is sent to their own landing page; the message only explains why they are not where they asked to be.
 */
export type AccessNotice =
  | { kind: "no-access"; pageEn: string; pageAr: string }
  | { kind: "not-found" };

/** Known page ids and their display names, including merged-away pages that only exist as an alias of another page. */
function knownPageName(segment: string): { en: string; ar: string } | null {
  const item = navigation.find((entry) => entry.id === segment);
  if (item) return { en: item.en, ar: item.ar };
  const alias = aliasFor(segment);
  if (alias) return { en: alias.en, ar: alias.ar };
  return null;
}

/** Notice for a segment the role could not open, or null when there is nothing to say (no segment, i.e. the bare workspace address). */
export function accessNoticeFor(segment: string | undefined): AccessNotice | null {
  if (!segment || segment === "workspace") return null;
  const page = knownPageName(segment);
  return page ? { kind: "no-access", pageEn: page.en, pageAr: page.ar } : { kind: "not-found" };
}

/** Who can grant access: the owner manages permissions, so the owner is the right person to ask. Owners themselves have nobody to ask. */
export function accessNoticeText(notice: AccessNotice, role: GarageRole, lang: "en" | "ar"): string {
  const ar = lang === "ar";
  if (notice.kind === "not-found") return ar ? "هذه الصفحة غير موجودة. تم تحويلك إلى صفحتك الرئيسية." : "That page does not exist. You have been taken to your home page.";
  const page = ar ? notice.pageAr : notice.pageEn;
  if (role === "owner") return ar ? `لا تملك صلاحية فتح «${page}». راجع صلاحياتك في الإعدادات.` : `You cannot open ${page}. Check your permissions in Settings.`;
  return ar
    ? `ليس لديك صلاحية فتح «${page}». اطلب من المالك منحك الصلاحية. تم تحويلك إلى صفحتك الرئيسية.`
    : `You do not have access to ${page}. Ask the owner to grant it. You have been taken to your home page.`;
}
