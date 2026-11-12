import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { GarageActor } from "./authz";
import type { RequestWithActor } from "./auth";
let testPool: typeof import("./db").pool | undefined;
let createRouter: typeof import("./routes/whatsapp").createWhatsAppRouter | undefined;

const integration = process.env.DATABASE_URL ? describe : describe.skip;
const suffix = crypto.randomUUID();
const branchId = `wa-test-branch-${suffix}`;
const customerId = `customer-sample-it-${suffix}`;
const vehicleId = `vehicle-wa-test-${suffix}`;
const serviceId = `wa-test-service-${suffix}`;
const actorId = `wa-test-manager-${suffix}`;
const otherActorId = `wa-test-reception-${suffix}`;
const actor: GarageActor = {
  userId: actorId,
  email: `${actorId}@example.test`,
  name: "Test Branch Manager",
  role: "branch-manager",
  branchIds: [branchId],
};

integration("WhatsApp branch inbox and simulated journey", () => {
  let server: ReturnType<ReturnType<typeof express>["listen"]>;
  let baseUrl = "";

  beforeAll(async () => {
    testPool = (await import("./db")).pool;
    createRouter = (await import("./routes/whatsapp")).createWhatsAppRouter;
    await testPool.query(
      `INSERT INTO branches
         (id, name_en, name_ar, location_label, daily_dropoff_limit, working_hours,
          clean_bays, general_bays, weekly_day_off)
       VALUES ($1, 'Test Simulation Branch', 'فرع اختبار', 'Fictional', 8, 10, 1, 2, 'Friday')`,
      [branchId],
    );
    await testPool.query(
      `INSERT INTO operating_settings (setting_id, scope_key, value)
       VALUES ('branch-working-hours', $1, '8')`,
      [branchId],
    );
    await testPool.query(
      `INSERT INTO services (id, name_en, name_ar, bay_type, bay_hours, price_label, active)
       VALUES ($1, 'Test Inspection', 'فحص تجريبي', 'general', 2, 'Estimate after inspection', true)`,
      [serviceId],
    );
    await testPool.query(
      `INSERT INTO staff_memberships (clerk_user_id, email, full_name, role, branch_ids, status)
       VALUES ($1, $2, 'Test Branch Manager', 'branch-manager', ARRAY[$3]::text[], 'active'),
              ($4, $5, 'Test Receptionist', 'receptionist', ARRAY[$3]::text[], 'active')`,
      [actorId, actor.email, branchId, otherActorId, `${otherActorId}@example.test`],
    );
    await testPool.query(
      `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language)
       VALUES ($1, 'Fictional Test Customer', $2, $3, 'en')`,
      [customerId, `+20 100 77${suffix.replaceAll("-", "").slice(0, 6)}`, `2010077${suffix.replaceAll("-", "").slice(0, 6)}`],
    );
    await testPool.query(
      `INSERT INTO vehicles (id, customer_id, make, model, year, plate)
       VALUES ($1, $2, 'Sample', 'Test Vehicle', 2024, 'DEMO T01')`,
      [vehicleId, customerId],
    );
    await testPool.query("INSERT INTO customer_branches (customer_id, branch_id) VALUES ($1, $2)", [customerId, branchId]);

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as RequestWithActor).actor = actor;
      next();
    });
    app.use("/api/whatsapp", createRouter!());
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!testPool) return;
    await testPool.query("DELETE FROM whatsapp_conversations WHERE branch_id = $1", [branchId]);
    await testPool.query(
      `DELETE FROM job_events WHERE job_id IN (
         SELECT j.id FROM jobs j JOIN bookings b ON b.id = j.booking_id WHERE b.customer_id = $1
       )`,
      [customerId],
    );
    await testPool.query("DELETE FROM jobs WHERE booking_id IN (SELECT id FROM bookings WHERE customer_id = $1)", [customerId]);
    await testPool.query("DELETE FROM bookings WHERE customer_id = $1", [customerId]);
    await testPool.query("DELETE FROM customer_branches WHERE customer_id = $1", [customerId]);
    await testPool.query("DELETE FROM vehicles WHERE customer_id = $1", [customerId]);
    await testPool.query("DELETE FROM customers WHERE id = $1", [customerId]);
    await testPool.query("DELETE FROM staff_memberships WHERE clerk_user_id = ANY($1::text[])", [[actorId, otherActorId]]);
    await testPool.query("DELETE FROM operating_settings WHERE setting_id = 'branch-working-hours' AND scope_key = $1", [branchId]);
    await testPool.query("DELETE FROM services WHERE id = $1", [serviceId]);
    await testPool.query("DELETE FROM branches WHERE id = $1", [branchId]);
  });

  it("enforces branch ownership, safe notes, confirmation, estimates, and provider isolation", async () => {
    const request = async (path: string, body?: unknown) => {
      const response = await fetch(`${baseUrl}/api/whatsapp${path}`, {
        method: body ? "POST" : "GET",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      return { response, body: await response.json() as Record<string, any> };
    };

    const forbiddenBranch = await request("/conversations?branchId=branch-b");
    expect(forbiddenBranch.response.status).toBe(403);

    const created = await request("/conversations", { branchId });
    expect(created.response.status).toBe(201);
    const conversationId = created.body.conversation.id as string;
    expect(created.body.conversation.simulation).toBe(true);

    const unclaimedReply = await request(`/conversations/${conversationId}/messages`, {
      kind: "reply",
      text: "This should require an assignment.",
    });
    expect(unclaimedReply.response.status).toBe(409);
    expect(unclaimedReply.body.code).toBe("CONVERSATION_UNCLAIMED");

    const claimed = await request(`/conversations/${conversationId}/action`, { action: "claim" });
    expect(claimed.response.status).toBe(200);
    const assignmentList = await request(`/staff?branchId=${branchId}`);
    expect(assignmentList.body.staff.some((member: { userId: string }) => member.userId === otherActorId)).toBe(true);
    const assigned = await request(`/conversations/${conversationId}/action`, { action: "assign", userId: otherActorId });
    expect(assigned.response.status).toBe(200);
    const assignedDetail = await request(`/conversations/${conversationId}`);
    expect(assignedDetail.body.conversation.assignedUserId).toBe(otherActorId);
    const reassigned = await request(`/conversations/${conversationId}/action`, { action: "assign", userId: actorId });
    expect(reassigned.response.status).toBe(200);

    const staffReply = await request(`/conversations/${conversationId}/messages`, {
      kind: "reply",
      text: "I can help check that for you.",
    });
    expect(staffReply.response.status).toBe(201);
    expect(staffReply.body.message.deliveryState).toBe("not-sent");

    expect((await request(`/conversations/${conversationId}/action`, { action: "pending" })).response.status).toBe(200);
    expect((await request(`/conversations/${conversationId}/action`, { action: "resolve" })).response.status).toBe(200);
    expect((await request(`/conversations/${conversationId}/action`, { action: "reopen" })).response.status).toBe(200);

    const receptionistApp = express();
    receptionistApp.use(express.json());
    receptionistApp.use((req, _res, next) => {
      (req as RequestWithActor).actor = {
        ...actor,
        userId: otherActorId,
        email: `${otherActorId}@example.test`,
        name: "Test Receptionist",
        role: "receptionist",
      };
      next();
    });
    receptionistApp.use("/api/whatsapp", createRouter!());
    const receptionistServer = receptionistApp.listen(0, "127.0.0.1");
    await new Promise<void>((resolve, reject) => {
      receptionistServer.once("listening", resolve);
      receptionistServer.once("error", reject);
    });
    const receptionistPort = (receptionistServer.address() as AddressInfo).port;
    const receptionistClaim = await fetch(`http://127.0.0.1:${receptionistPort}/api/whatsapp/conversations/${conversationId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "claim" }),
    });
    const receptionistStaffList = await fetch(`http://127.0.0.1:${receptionistPort}/api/whatsapp/staff?branchId=${branchId}`);
    const receptionistStaff = await receptionistStaffList.json() as { staff: Array<{ userId: string }> };
    await new Promise<void>((resolve) => receptionistServer.close(() => resolve()));
    expect(receptionistClaim.status).toBe(409);
    expect(receptionistStaff.staff).toEqual([{ userId: otherActorId, name: "Test Receptionist", role: "receptionist" }]);

    const note = await request(`/conversations/${conversationId}/messages`, {
      kind: "internal-note",
      text: "Staff-only simulation note.",
    });
    expect(note.response.status).toBe(201);
    expect(note.body.message.kind).toBe("internal-note");

    const serviceAnswer = await request(`/conversations/${conversationId}/service-question`, { serviceId, lang: "ar" });
    expect(serviceAnswer.response.status).toBe(201);
    expect(serviceAnswer.body.bot.text).toContain("فحص تجريبي");
    const unread = await request(`/conversations?branchId=${branchId}`);
    expect(unread.body.conversations.find((item: { id: string }) => item.id === conversationId).unreadCount).toBe(1);
    const markedRead = await request(`/conversations/${conversationId}/action`, { action: "mark-read" });
    expect(markedRead.response.status).toBe(200);
    const readList = await request(`/conversations?branchId=${branchId}`);
    expect(readList.body.conversations.find((item: { id: string }) => item.id === conversationId).unreadCount).toBe(0);

    const date = "2099-01-05";
    const availability = await request(`/availability?branchId=${branchId}&serviceId=${serviceId}&date=${date}&lang=en`);
    expect(availability.body.available).toBe(true);
    expect(availability.body.slots).toHaveLength(8);
    expect(availability.body.slots[0].time).toBe("08:00");
    expect(availability.body.slots.at(-1).time).toBe("15:00");
    expect(availability.body.scheduleNote).toContain("Owner must confirm");
    expect(availability.body.alternatives.length).toBeGreaterThan(0);

    const invalidTimeDraft = await request(`/conversations/${conversationId}/booking-draft`, {
      serviceId,
      date,
      time: "09:30",
      lang: "en",
    });
    expect(invalidTimeDraft.response.status).toBe(400);
    expect(invalidTimeDraft.body.code).toBe("INVALID_BOOKING_DRAFT");

    const draft = await request(`/conversations/${conversationId}/booking-draft`, {
      serviceId,
      date,
      time: "09:00",
      lang: "en",
    });
    expect(draft.response.status).toBe(201);
    expect(draft.body.simulation).toBe(true);
    expect(draft.body.deliveryState).toBe("not-sent");
    const beforeConfirmation = await testPool!.query("SELECT id FROM bookings WHERE created_by = 'whatsapp-simulation' AND customer_id = $1", [customerId]);
    expect(beforeConfirmation.rowCount).toBe(0);
    const draftTranscript = await request(`/conversations/${conversationId}`);
    expect(draftTranscript.body.messages.some((message: { kind: string; text: string }) =>
      message.kind === "bot" && message.text.includes(draft.body.expectedPickup))).toBe(true);

    const confirmed = await request(`/conversations/${conversationId}/booking-confirm`, {
      draftId: draft.body.draftId,
      confirmed: true,
      lang: "en",
    });
    expect(confirmed.response.status).toBe(201);
    expect(confirmed.body.status).toBe("pending");
    expect(confirmed.body.deliveryState).toBe("not-sent");

    const changePreview = await request(`/conversations/${conversationId}/booking-change`, {
      bookingId: confirmed.body.bookingId,
      action: "reschedule",
      date: "2099-01-06",
      time: "11:00",
      lang: "en",
    });
    expect(changePreview.body.requiresConfirmation).toBe(true);
    const beforeChangeConfirmation = await testPool!.query<{ dropoff_date: Date | string }>(
      "SELECT dropoff_date FROM bookings WHERE id = $1",
      [confirmed.body.bookingId],
    );
    const currentDropoff = beforeChangeConfirmation.rows[0].dropoff_date;
    expect(currentDropoff instanceof Date ? currentDropoff.toISOString().slice(0, 10) : currentDropoff).toBe(date);

    const rescheduled = await request(`/conversations/${conversationId}/booking-change`, {
      bookingId: confirmed.body.bookingId,
      action: "reschedule",
      draftId: changePreview.body.draftId,
      confirmed: true,
      lang: "en",
    });
    expect(rescheduled.response.status).toBe(200);
    expect(rescheduled.body.rescheduled).toBe(true);
    expect(rescheduled.body.expectedPickup).toBeTruthy();
    expect(rescheduled.body.etaReason).toContain("bay-hours");
    expect(rescheduled.body.etaAt).toBeTruthy();

    const verifiedStatus = await request(`/conversations/${conversationId}/status-lookup`, {
      bookingId: confirmed.body.bookingId,
      verificationCode: "4821",
      lang: "en",
    });
    expect(verifiedStatus.response.status).toBe(200);
    expect(verifiedStatus.body.expectedPickup).toBeTruthy();
    expect(JSON.stringify(verifiedStatus.body)).not.toContain("Fictional Test Customer");
    expect(JSON.stringify(verifiedStatus.body)).not.toContain("DEMO T01");
    const rejectedStatus = await request(`/conversations/${conversationId}/status-lookup`, {
      bookingId: confirmed.body.bookingId,
      verificationCode: "incorrect",
      lang: "en",
    });
    expect(rejectedStatus.response.status).toBe(403);

    const cancelPreview = await request(`/conversations/${conversationId}/booking-change`, {
      bookingId: confirmed.body.bookingId,
      action: "cancel",
      lang: "en",
    });
    expect(cancelPreview.body.requiresConfirmation).toBe(true);
    const declined = await request(`/conversations/${conversationId}/booking-change`, {
      bookingId: confirmed.body.bookingId,
      action: "cancel",
      draftId: cancelPreview.body.draftId,
      declined: true,
      lang: "en",
    });
    expect(declined.body.declined).toBe(true);
    const unchanged = await testPool!.query<{ status: string }>("SELECT status FROM bookings WHERE id = $1", [confirmed.body.bookingId]);
    expect(unchanged.rows[0].status).toBe("pending");

    const transcript = await request(`/conversations/${conversationId}`);
    expect(transcript.body.messages.some((message: { kind: string }) => message.kind === "internal-note")).toBe(true);
    expect(transcript.body.events.some((event: { eventType: string }) => event.eventType === "simulation-booking-rescheduled")).toBe(true);
    expect(transcript.body.conversation.simulation).toBe(true);
    const handoff = await request(`/conversations/${conversationId}/action`, { action: "handoff" });
    expect(handoff.response.status).toBe(200);
    const handoffDetail = await request(`/conversations/${conversationId}`);
    expect(handoffDetail.body.conversation.assignedUserId).toBeNull();
    expect(handoffDetail.body.messages.some((message: { kind: string; text: string }) =>
      message.kind === "bot" && message.text.includes("handoff"))).toBe(true);

    const readiness = await request("/status");
    expect(readiness.body.providerConnected).toBe(false);
    expect(readiness.body.deliveryEnabled).toBe(false);
    expect(Object.values(readiness.body.readiness).every((ready) => ready === false)).toBe(true);
  });
});
