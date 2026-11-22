/**
 * Inbox projection of who a conversation is with. A conversation may exist before any customer does (an unsaved
 * number). The number is shown only when the provider event legitimately carried it; otherwise a neutral label with
 * the last four characters of the contact hash is shown. The phone is never logged and never copied elsewhere.
 */
export interface ContactRow { customer_label: string; customer_id: string | null; contact_label: string | null; contact_phone: string | null }
export interface ContactProjection { customerLabel: string; linked: boolean; contactLabel: string; contactPhone?: string }

export const NEW_CONTACT = "New contact";
export const hashTail = (hash: string) => hash.slice(-4);
/** Stored neutral label for an unlinked conversation (never contains the number). */
export const unlinkedLabel = (hash: string) => `${NEW_CONTACT} (#${hashTail(hash)})`;

export function projectContact(row: ContactRow, options: { hidePhone?: boolean } = {}): ContactProjection {
  if (!row.customer_id && options.hidePhone) row = { ...row, contact_phone: null };
  if (row.customer_id) return { customerLabel: row.customer_label, linked: true, contactLabel: row.customer_label };
  const title = row.contact_phone ? `${NEW_CONTACT} (${row.contact_phone})` : row.contact_label?.trim() || NEW_CONTACT;
  return { customerLabel: title, linked: false, contactLabel: title, ...(row.contact_phone ? { contactPhone: row.contact_phone } : {}) };
}

/** Provider phone as sent: digits with an optional leading plus; spaces, dashes and brackets are dropped. Null when it is not a plausible number. */
export function cleanProviderPhone(value: string | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/[\s\-().]/g, "");
  return /^\+?\d{8,15}$/.test(digits) ? digits : null;
}
