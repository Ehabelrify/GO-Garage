import { describe, expect, it, vi } from "vitest";

vi.mock("../../infrastructure/database/db", () => ({ pool: { query: vi.fn() }, withTransaction: vi.fn() }));
vi.mock("../auth/staff-capability", () => ({ staffHasCapabilityForBranch: vi.fn() }));
vi.mock("./availability-service", () => ({}));
vi.mock("../commercial/quote-booking", () => ({}));
import { cancelTransportForBooking } from "../commercial/transport-service";
import { cancelForBooking } from "../reminders/reminder-service";
import { cancelBookingDownstream, cancellationNote } from "./booking-service";

const client = (responses: Array<{ rows: unknown[] }>): any => {
  const query = vi.fn();
  for (const r of responses) query.mockResolvedValueOnce(r);
  query.mockResolvedValue({ rows: [] });
  return { query };
};

describe("booking cancel cleanup (P2T-009)", () => {
  it("cancels open transport requests with an event carrying the reason", async () => {
    const c = client([{ rows: [{ id: "t1", status: "confirmed", revision: 3 }, { id: "t2", status: "proposed", revision: 1 }] }]);
    expect(await cancelTransportForBooking(c, "b1", "u1", "Customer changed plans")).toEqual(["t1", "t2"]);
    expect(String(c.query.mock.calls[0][0])).toMatch(/status IN \('proposed','requested','confirmed'\)/);
    expect(c.query.mock.calls[2][1]).toEqual(["t1", 4, "confirmed", "u1", "Booking cancelled: Customer changed plans"]);
    expect(c.query).toHaveBeenCalledTimes(5);
  });
  it("leaves in-progress and completed transport alone (select filters them out)", async () => {
    const c = client([{ rows: [] }]);
    expect(await cancelTransportForBooking(c, "b1", "u1", "x")).toEqual([]);
    expect(c.query).toHaveBeenCalledTimes(1);
  });
  it("cancels due or snoozed reminders and logs a reminder event each", async () => {
    const c = client([{ rows: [{ id: "r1" }, { id: "r2" }] }]);
    expect(await cancelForBooking(c, "b1", "u1")).toBe(2);
    expect(String(c.query.mock.calls[0][0])).toMatch(/status = 'due'/);
    expect(String(c.query.mock.calls[1][0])).toMatch(/reminder_events/);
    expect(c.query.mock.calls[1][1]).toEqual(["r1", "u1"]);
  });
  it("records the notification choice on the note and runs both cleanups", async () => {
    expect(cancellationNote("Moved", true)).toContain("requested");
    expect(cancellationNote("Moved")).toContain("not requested");
    const c = client([{ rows: [{ id: "t1", status: "requested", revision: 1 }] }, { rows: [] }, { rows: [] }, { rows: [{ id: "r1" }] }]);
    expect(await cancelBookingDownstream(c, "b1", "u1", "Moved")).toEqual({ transportCancelled: 1, remindersCancelled: 1 });
  });
});
