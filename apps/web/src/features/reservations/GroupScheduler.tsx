import { useMemo, useState } from "react";
import type { Locale } from "@garage/domain";
import { bookingAvailabilityApi, reservationApi, useGarageStore, type SlotAvailability } from "../../shared/store";
import { Field, RecordRef } from "../../shared/components";
import { dateLabel } from "../../shared/ui";
import { commercialError } from "../quotes/commercial-errors";
import { buildLookups, tr } from "../quotes/lookups";
import { addDays, todayIso } from "../quotes/quote-logic";
import { groupSlotsByDay, type ReservationRow } from "./reservation-logic";

type Pick = { dropoffDate: string; dropoffTime: string };

/** Book every vehicle of one qualification together. Each vehicle gets its own booking; the group commits as one. */
export function GroupScheduler({ lang, rows, onDone }: { lang: Locale; rows: ReservationRow[]; onDone: () => void }) {
  const t = tr(lang);
  const store = useGarageStore();
  const lookups = useMemo(() => buildLookups(store.state, lang), [store.state, lang]);
  const [availability, setAvailability] = useState<Record<string, SlotAvailability>>({});
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [day, setDay] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const qualificationId = rows[0]?.reservation?.qualificationId ?? "";
  const complete = rows.every((row) => picks[row.id]);

  async function find(row: ReservationRow) {
    const reservation = row.reservation;
    const from = day[row.id] || todayIso();
    if (!reservation) return;
    try {
      const result = await bookingAvailabilityApi.slots({ branchId: row.branchId, fromDate: from, toDate: addDays(from, 6), quoteId: reservation.acceptedQuote.quoteId, quoteRevision: reservation.acceptedQuote.revision });
      setAvailability((current) => ({ ...current, [row.id]: result }));
    } catch (error) { setMessage(commercialError(error, lang)); }
  }

  async function confirm() {
    setBusy(true); setMessage("");
    try {
      await reservationApi.scheduleGroup({
        qualificationId,
        items: rows.map((row) => {
          const slotInfo = availability[row.id];
          return { reservationId: row.id, expectedRevision: row.reservation!.revision, slot: { ...picks[row.id], configurationVersion: slotInfo?.status === "available" ? slotInfo.configurationVersion : undefined } };
        }),
        idempotencyKey: crypto.randomUUID(),
      });
      setMessage(t("All installations booked.", "تم حجز جميع مواعيد التركيب."));
      onDone();
    } catch (error) { setMessage(commercialError(error, lang)); onDone(); } finally { setBusy(false); }
  }

  return <div className="qo-group">
    {rows.map((row) => {
      const slotInfo = availability[row.id];
      const vehicle = lookups.vehicle(row.vehicleId);
      return <div className="qo-stack" key={row.id}>
        <div className="qo-row between">
          <RecordRef type="vehicle" id={row.vehicleId} label={vehicle?.vehicle.plate} subtitle={vehicle?.vehicle.makeModel} />
          {picks[row.id] && <span className="tag">{dateLabel(picks[row.id].dropoffDate, lang)} · <bdi className="mono">{picks[row.id].dropoffTime}</bdi></span>}
        </div>
        <div className="qo-row">
          <Field label={t("From day", "من يوم")}><input className="field-input" type="date" min={todayIso()} value={day[row.id] ?? ""} onChange={(event) => setDay((current) => ({ ...current, [row.id]: event.target.value }))} /></Field>
          <button type="button" className="btn btn-sm" onClick={() => void find(row)}>{t("Find slots", "اعرض المواعيد")}</button>
        </div>
        {slotInfo?.status === "unconfigured" && <p className="qo-muted">{t("Availability is not set up for this branch.", "المواعيد غير مهيأة لهذا الفرع.")}</p>}
        {slotInfo?.status === "available" && (slotInfo.slots.length === 0
          ? <p className="qo-muted">{t("No free slots in this week.", "لا توجد مواعيد متاحة هذا الأسبوع.")}</p>
          : groupSlotsByDay(slotInfo.slots).map((group) => <div className="qo-day" key={group.date}>
              <strong>{dateLabel(group.date, lang)}</strong>
              <div className="qo-slots">{group.slots.map((slot) => {
                const on = picks[row.id]?.dropoffDate === slot.dropoffDate && picks[row.id]?.dropoffTime === slot.dropoffTime;
                return <button key={`${slot.dropoffDate}:${slot.dropoffTime}`} type="button" className={`btn btn-sm${on ? " btn-primary" : ""}`} aria-pressed={on} onClick={() => setPicks((current) => ({ ...current, [row.id]: { dropoffDate: slot.dropoffDate, dropoffTime: slot.dropoffTime } }))}><bdi className="mono">{slot.dropoffTime}</bdi></button>;
              })}</div>
            </div>))}
      </div>;
    })}
    {message && <p role="status" className="qo-muted">{message}</p>}
    <div className="qo-row"><button type="button" className="btn btn-primary" disabled={busy || !complete} onClick={() => void confirm()}>{t("Book all installations", "احجز كل مواعيد التركيب")}</button></div>
  </div>;
}
