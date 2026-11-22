import type { ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import type { Locale } from "@garage/domain";
import { Phone, Plate, useRecords, type RecordType } from "../../shared/components";
import { whatsappHref } from "./booking-logic";

/** A record link whose visible content is any node (plate chip, date). Plain text when no RecordProvider is mounted. */
export function RecordChip({ type, id, label, subtitle, children }: { type: RecordType; id: string; label: string; subtitle?: string; children: ReactNode }) {
  const records = useRecords();
  if (!records) return <span className="record-ref plain">{children}</span>;
  return <button type="button" className="record-ref" aria-haspopup="dialog" aria-label={label} onClick={() => records.open({ type, id, label, subtitle })}>{children}</button>;
}

/** Plate chip that opens the vehicle preview, with the make/model as a quiet second line. */
export function VehicleCell({ id, plate, makeModel }: { id: string; plate: string | undefined; makeModel?: string }) {
  return <span className="bk-cell">
    <RecordChip type="vehicle" id={id} label={plate ?? ""} subtitle={makeModel}><Plate value={plate} /></RecordChip>
    {makeModel && <span className="bk-sub"><bdi>{makeModel}</bdi></span>}
  </span>;
}

/** Phone as a tel: link plus a WhatsApp icon link; both are LTR isolates that never wrap. */
export function ContactLinks({ phone, lang }: { phone: string | null | undefined; lang: Locale }) {
  const wa = whatsappHref(phone);
  return <span className="bk-contact">
    <Phone value={phone} link />
    {wa && <a className="bk-wa" href={wa} target="_blank" rel="noopener noreferrer" aria-label={lang === "ar" ? "مراسلة واتساب" : "Message on WhatsApp"} title="WhatsApp"><MessageCircle size={14} aria-hidden="true" /></a>}
  </span>;
}
