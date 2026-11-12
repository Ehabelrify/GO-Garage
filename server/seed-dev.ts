import { initialState } from "../src/demoData";
import type { BranchId } from "../src/types";
import { pool } from "./db";

if (process.env.NODE_ENV === "production") {
  throw new Error("Development sample data cannot be seeded with NODE_ENV=production.");
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const branch of initialState.branches) {
      await client.query(
        `INSERT INTO branches
           (id, name_en, name_ar, location_label, daily_dropoff_limit, working_hours, clean_bays, general_bays, weekly_day_off)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (id) DO NOTHING`,
        [
          branch.id,
          branch.name,
          branch.id === "branch-a" ? "مركز خدمة مدينة نصر" : "ورشة المعادي",
          branch.id === "branch-a" ? "Nasr City, Cairo" : "Maadi, Cairo",
          branch.dailyDropoffLimit,
          branch.workingHours,
          branch.cleanBays,
          branch.generalBays,
          branch.weeklyDayOff,
        ],
      );
    }

    await client.query(
      `UPDATE branches SET name_en = $2, name_ar = $3, location_label = $4
       WHERE id = $1 AND name_en LIKE 'Sample branch %'`,
      ["branch-a", "Nasr City Service Center", "مركز خدمة مدينة نصر", "Nasr City, Cairo"],
    );
    await client.query(
      `UPDATE branches SET name_en = $2, name_ar = $3, location_label = $4
       WHERE id = $1 AND name_en LIKE 'Sample branch %'`,
      ["branch-b", "Maadi Workshop", "ورشة المعادي", "Maadi, Cairo"],
    );

    const demoStaff = [
      ["demo-owner", "Owner@noemail.com", "Demo Owner", "owner", []],
      ["demo-manager", "Manager@noemail.com", "Salma Nabil", "branch-manager", ["branch-a"]],
      ["demo-reception", "Reception@noemail.com", "Karim Adel", "receptionist", ["branch-a"]],
      ["demo-technician", "Technician@noemail.com", "Youssef Samir", "technician", ["branch-a"]],
    ] as const;
    for (const [userId, email, name, role, branchIds] of demoStaff) {
      await client.query(
        `INSERT INTO staff_memberships (clerk_user_id, email, full_name, role, branch_ids, status)
         VALUES ($1, $2, $3, $4, $5::text[], 'active')
         ON CONFLICT (clerk_user_id) DO NOTHING`,
        [userId, email, name, role, branchIds],
      );
    }
    for (const service of initialState.services) {
      const serviceArabicNames: Record<string, string> = {
        inspection: "فحص السيارة",
        tint: "تظليل النوافذ",
        audio: "ترقية النظام الصوتي",
        ceramic: "طلاء سيراميك",
        "full-ppf": "حماية كاملة للطلاء",
      };
      await client.query(
        `INSERT INTO services (id, name_en, name_ar, bay_type, bay_hours, price_label)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [
          service.id,
          serviceArabicNames[service.id] ?? service.name,
          service.name,
          service.bayType,
          service.bayHours,
          service.priceLabel,
        ],
      );
      await client.query(
        "UPDATE services SET name_ar = $2 WHERE id = $1 AND name_ar = name_en",
        [service.id, serviceArabicNames[service.id] ?? service.name],
      );
    }

    const sampleWarrantyPolicies = [
      {
        policyId: "sample-auto-warranty-tint",
        name: "Sample window tint coverage · draft",
        serviceId: "tint",
        durationMonths: 12,
      },
      {
        policyId: "sample-auto-warranty-ceramic",
        name: "Sample ceramic coating coverage · draft",
        serviceId: "ceramic",
        durationMonths: 24,
      },
      {
        policyId: "sample-auto-warranty-ppf",
        name: "Sample full PPF coverage · draft",
        serviceId: "full-ppf",
        durationMonths: 36,
      },
    ];
    for (const policy of sampleWarrantyPolicies) {
      await client.query(
        `INSERT INTO warranty_policies
           (policy_id, version, name, eligible_service_ids, auto_issue, start_rule, duration_months,
            exclusions, evidence_requirements, review_role, response_days, created_by)
         VALUES ($1, 1, $2, ARRAY[$3]::text[], true, 'job-delivery', $4,
                 'Sample-only draft. Owner must replace and approve these exclusions before publishing.',
                 'Sample-only draft. Owner must confirm required evidence before publishing.',
                 'owner', 5, 'demo-owner')
         ON CONFLICT (policy_id, version) DO NOTHING`,
        [policy.policyId, policy.name, policy.serviceId, policy.durationMonths],
      );
    }

    for (const setting of initialState.decisions) {
      const scopes: Array<BranchId | "business"> = setting.scope === "business" ? ["business"] : setting.branches ?? [];
      for (const scopeKey of scopes) {
        const value = setting.valueByScope[scopeKey] ?? "";
        if (!value) continue;
        await client.query(
          `INSERT INTO operating_settings (setting_id, scope_key, value)
           VALUES ($1, $2, $3)
           ON CONFLICT (setting_id, scope_key) DO NOTHING`,
          [setting.id, scopeKey, value],
        );
      }
    }

    for (const customer of initialState.customers) {
      const normalizedPhone = customer.phone.replace(/\D/g, "");
      await client.query(
        `INSERT INTO customers (id, name, phone, phone_normalized, preferred_language)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [customer.id, customer.name, customer.phone, normalizedPhone, customer.language],
      );
      await client.query(
        `UPDATE customers SET name = $2, phone = $3, phone_normalized = $4, preferred_language = $5
         WHERE id = $1 AND EXISTS (
           SELECT 1 FROM bookings WHERE customer_id = $1 AND created_by = 'development-seed'
         )`,
        [customer.id, customer.name, customer.phone, normalizedPhone, customer.language],
      );

      for (const vehicle of customer.vehicles) {
        const [make = "Vehicle", ...modelParts] = vehicle.makeModel.split(" ");
        const yearValue = modelParts.at(-1);
        const year = yearValue && /^\d{4}$/.test(yearValue) ? Number(yearValue) : null;
        const model = year === null ? modelParts.join(" ") : modelParts.slice(0, -1).join(" ");
        await client.query(
          `INSERT INTO vehicles (id, customer_id, make, model, year, plate)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [vehicle.id, customer.id, make, model || "Sample vehicle", year, vehicle.plate],
        );
      }
    }

    for (const booking of initialState.bookings) {
      await client.query(
        `INSERT INTO customer_branches (customer_id, branch_id)
         VALUES ($1, $2)
         ON CONFLICT DO NOTHING`,
        [booking.customerId, booking.branchId],
      );
      await client.query(
        `INSERT INTO bookings
           (id, customer_id, vehicle_id, service_id, branch_id, dropoff_date, dropoff_time, expected_pickup, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (id) DO NOTHING`,
        [
          booking.id,
          booking.customerId,
          booking.vehicleId,
          booking.serviceId,
          booking.branchId,
          booking.dropoffDate,
          booking.dropoffTime,
          booking.expectedPickup,
          booking.status,
          "development-seed",
        ],
      );
    }

    for (const job of initialState.jobs) {
      await client.query(
        `INSERT INTO jobs (id, booking_id, branch_id, stage, updated_at)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [job.id, job.bookingId, job.branchId, job.stage, job.updatedAt],
      );
    }

    const sampleJobEvents = [
      ["job-sample-1-event", "job-sample-1", "received", "in-service", "demo-technician", "Fictional work milestone."],
      ["job-sample-2-event", "job-sample-2", "in-service", "qc", "demo-technician", "Fictional work milestone."],
      ["job-sample-3-event", "job-sample-3", "qc", "ready", "demo-manager", "Fictional work milestone."],
      ["job-sample-4-event", "job-sample-4", "ready", "delivered", "demo-reception", "Fictional work milestone."],
    ] as const;
    for (const [eventId, jobId, fromStage, toStage, actorId, note] of sampleJobEvents) {
      await client.query(
        `INSERT INTO job_events (id, job_id, from_stage, to_stage, actor_user_id, note)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO NOTHING`,
        [eventId, jobId, fromStage, toStage, actorId, note],
      );
    }

    const sampleConversations = [
      {
        id: "wa-sample-open",
        branchId: "branch-a",
        customerId: "customer-sample-1",
        vehicleId: "vehicle-sample-1",
        label: "Mariam Hassan",
        status: "open",
        unread: 2,
        bookingId: "booking-sample-1",
        kind: "customer",
        body: "Could you check whether window tint has an opening this week?",
      },
      {
        id: "wa-sample-pending",
        branchId: "branch-b",
        customerId: "customer-sample-2",
        vehicleId: "vehicle-sample-2",
        label: "Omar Fawzy",
        status: "pending",
        unread: 0,
        bookingId: "booking-sample-2",
        kind: "staff",
        body: "Your inspection is in quality review. The pickup date shown is an estimate.",
      },
      {
        id: "wa-sample-resolved",
        branchId: "branch-a",
        customerId: "customer-sample-3",
        vehicleId: "vehicle-sample-3",
        label: "Nour El-Sayed",
        status: "resolved",
        unread: 0,
        bookingId: "booking-sample-3",
        kind: "internal-note",
        body: "Internal note: customer requested an update after the quality check. Not sent to customer.",
      },
    ] as const;
    for (const sample of sampleConversations) {
      await client.query(
        `INSERT INTO whatsapp_conversations
           (id, branch_id, customer_label, customer_id, vehicle_id, status, unread_count, related_booking_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO NOTHING`,
        [sample.id, sample.branchId, sample.label, sample.customerId, sample.vehicleId, sample.status, sample.unread, sample.bookingId],
      );
      const followup = sample.id === "wa-sample-open"
        ? { id: `${sample.id}-bot`, kind: "bot", body: "Sample quote only. We can check a drop-off date using the branch capacity rules." }
        : sample.id === "wa-sample-pending"
          ? { id: `${sample.id}-customer`, kind: "customer", body: "Thanks. Please let me know if the estimate changes." }
          : { id: `${sample.id}-customer`, kind: "customer", body: "Thank you for the update." };
      await client.query(
        `INSERT INTO whatsapp_messages (id, conversation_id, kind, body)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        [followup.id, sample.id, followup.kind, followup.body],
      );
      await client.query(
        `INSERT INTO whatsapp_messages (id, conversation_id, kind, body, author_user_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [`${sample.id}-message`, sample.id, sample.kind, sample.body, sample.kind === "staff" || sample.kind === "internal-note" ? "demo-reception" : null],
      );
      await client.query(
        `INSERT INTO whatsapp_conversation_events (id, conversation_id, event_type, details, actor_user_id)
         VALUES ($1, $2, 'seeded-scenario', 'Fictional development inbox scenario.', 'demo-owner')
         ON CONFLICT (id) DO NOTHING`,
        [`${sample.id}-event`, sample.id],
      );
    }

    await client.query(
      `INSERT INTO warranty_policies
         (policy_id, version, name, eligible_service_ids, start_rule, duration_months, exclusions,
          evidence_requirements, review_role, response_days, status, created_by)
       VALUES ('demo-warranty-outline', 1, 'Sample inspection coverage outline — not approved',
               ARRAY['inspection'], 'job-delivery', 12,
               'Fictional example only; Owner-approved exclusions are not configured.',
               'Fictional example only; approved evidence requirements are not configured.',
               'branch-manager', 30, 'draft', 'demo-owner')
       ON CONFLICT (policy_id, version) DO NOTHING`,
    );
    await client.query(
      "DELETE FROM warranty_qr_print_events WHERE warranty_id = 'demo-warranty-example'",
    );
    await client.query(
      "DELETE FROM warranty_invoice_drafts WHERE warranty_id = 'demo-warranty-example'",
    );
    await client.query(
      "DELETE FROM warranty_audit_events WHERE warranty_id = 'demo-warranty-example'",
    );
    await client.query(
      "DELETE FROM warranty_claims WHERE warranty_id = 'demo-warranty-example'",
    );
    await client.query(
      "DELETE FROM warranties WHERE id = 'demo-warranty-example'",
    );

    await client.query("COMMIT");
    console.info("Development sample branches, staff, services, a provisional warranty draft, settings, customers, bookings, jobs, and inbox scenarios are ready; no sample warranty coverage is issued.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((error: unknown) => {
  console.error("Development sample data was not seeded.", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
});
