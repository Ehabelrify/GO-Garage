import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../../infrastructure/database/db", () => ({
  pool: { query },
  withTransaction: async (run: (client: { query: typeof query }) => unknown) => run({ query }),
}));
const { ingestUnlinkedInbound, linkConversationToCustomer, LinkError } = await import("./unlinked-contact");
const { projectContact, cleanProviderPhone, unlinkedLabel } = await import("./contact-projection");

const HASH = "f".repeat(60) + "ab12";
let existing: Row | null;
let conversation: Row | null;
let customerFound: boolean;
let vehicleFound: boolean;
const sqlOf = () => query.mock.calls.map(([sql]) => String(sql));
const done = (rows: Row[], rowCount = rows.length) => ({ rows, rowCount });

beforeEach(() => {
  existing = null; customerFound = true; vehicleFound = true;
  conversation = { id: "wa-1", branch_id: "b1", channel_id: "ch-1", customer_id: null, vehicle_id: null, provider_contact_hash: HASH, mode: "operational" };
  query.mockReset();
  query.mockImplementation(async (sql: string, values?: unknown[]) => {
    const text = String(sql);
    if (text.includes("provider_contact_hash=$2 AND customer_id IS NULL")) return done(existing ? [existing] : []);
    if (text.includes("FROM messaging_channels c")) return done([{ branch_id: "b1" }]);
    if (text.includes("FROM whatsapp_conversations WHERE id=$1 FOR UPDATE")) return done(conversation ? [conversation] : []);
    if (text.includes("SELECT c.id,c.name FROM customers c")) return done(customerFound ? [{ id: values![0], name: "Mona" }] : []);
    if (text.includes("FROM vehicles v WHERE")) return done(vehicleFound ? [{}] : []);
    return done([], 1);
  });
});

describe("unlinked WhatsApp contacts", () => {
  it("creates a New contact conversation titled with the phone and stores the inbound message", async () => {
    const out = await ingestUnlinkedInbound({ query } as never, { channelId: "ch-1", contactHash: HASH, contactPhone: "+20 100 555 0141", text: " hello ", occurred: new Date("2026-11-22T10:00:00Z") });
    expect(out.created).toBe(true);
    const insert = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO whatsapp_conversations"))!;
    const values = insert[1] as unknown[];
    expect(values).toContain("+201005550141");
    expect(values).toContain(unlinkedLabel(HASH));
    expect(unlinkedLabel(HASH)).toBe("New contact (#ab12)");
    expect(String(insert[0])).toContain("NULL,NULL");
    const message = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO whatsapp_messages"))!;
    expect((message[1] as unknown[])[2]).toBe("hello");
    expect(sqlOf().some((sql) => sql.includes("unread_count=unread_count+1"))).toBe(true);
  });
  it("continues the open conversation for the same contact instead of creating another", async () => {
    existing = { id: "wa-9", contact_phone: null };
    const out = await ingestUnlinkedInbound({ query } as never, { channelId: "ch-1", contactHash: HASH, contactPhone: "01005550141", text: "again", occurred: new Date() });
    expect(out).toEqual({ conversationId: "wa-9", created: false });
    expect(sqlOf().some((sql) => sql.includes("INSERT INTO whatsapp_conversations"))).toBe(false);
    expect(sqlOf().some((sql) => sql.includes("SET contact_phone=$2"))).toBe(true);
  });
  it("without a provider phone the title uses the last four characters of the hash and no phone is stored", async () => {
    await ingestUnlinkedInbound({ query } as never, { channelId: "ch-1", contactHash: HASH, text: "hi", occurred: new Date() });
    const values = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO whatsapp_conversations"))![1] as unknown[];
    expect(values[values.length - 1]).toBeNull();
    expect(projectContact({ customer_label: "New contact", customer_id: null, contact_label: unlinkedLabel(HASH), contact_phone: null })).toEqual({ customerLabel: "New contact (#ab12)", linked: false, contactLabel: "New contact (#ab12)" });
  });
});

describe("inbox projections", () => {
  it("unlinked rows expose linked:false, the label and the phone; linked rows show the customer name", () => {
    expect(projectContact({ customer_label: "New contact", customer_id: null, contact_label: "x", contact_phone: "+201005550141" })).toEqual({ customerLabel: "New contact (+201005550141)", linked: false, contactLabel: "New contact (+201005550141)", contactPhone: "+201005550141" });
    expect(projectContact({ customer_label: "Mona", customer_id: "c1", contact_label: null, contact_phone: null })).toEqual({ customerLabel: "Mona", linked: true, contactLabel: "Mona" });
  });
  it("hides the phone from demo sessions and rejects implausible provider numbers", () => {
    expect(projectContact({ customer_label: "New contact", customer_id: null, contact_label: "New contact (#ab12)", contact_phone: "+201005550141" }, { hidePhone: true })).toMatchObject({ contactLabel: "New contact (#ab12)" });
    expect(projectContact({ customer_label: "New contact", customer_id: null, contact_label: "New contact (#ab12)", contact_phone: "+201005550141" }, { hidePhone: true }).contactPhone).toBeUndefined();
    expect(cleanProviderPhone("+20 (100) 555-0141")).toBe("+201005550141");
    expect(cleanProviderPhone("abc")).toBeNull();
    expect(cleanProviderPhone("123")).toBeNull();
  });
});

describe("link a conversation to a customer", () => {
  const staff = { userId: "u1", role: "receptionist", branchIds: ["b1"] };
  it("creates the contact link with the stored hash, attaches the conversation, clears the phone and audits it", async () => {
    const out = await linkConversationToCustomer({ query } as never, staff, { conversationId: "wa-1", customerId: "c1", vehicleId: "v1" });
    expect(out).toMatchObject({ conversationId: "wa-1", customerId: "c1", vehicleId: "v1", customerLabel: "Mona", linked: true });
    const link = query.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO messaging_contact_links"))!;
    expect(link[1]).toEqual(["ch-1", HASH, "c1", "v1", "b1", "u1"]);
    const update = query.mock.calls.filter(([sql]) => String(sql).includes("UPDATE whatsapp_conversations SET customer_id=$2"));
    expect(update).toHaveLength(1);
    expect(String(update[0][0])).toContain("contact_phone=NULL");
    expect(sqlOf().some((sql) => sql.includes("'contact-linked'"))).toBe(true);
  });
  it("blocks demo identities, other customers' conversations, unknown conversations and customers", async () => {
    await expect(linkConversationToCustomer({ query } as never, { ...staff, isDemo: true }, { conversationId: "wa-1", customerId: "c1" })).rejects.toMatchObject({ status: 403, code: "DEMO_ACTION_DISABLED" });
    conversation = { ...conversation, customer_id: "someone-else" };
    await expect(linkConversationToCustomer({ query } as never, staff, { conversationId: "wa-1", customerId: "c1" })).rejects.toMatchObject({ status: 409, code: "ALREADY_LINKED" });
    conversation = null;
    await expect(linkConversationToCustomer({ query } as never, staff, { conversationId: "nope", customerId: "c1" })).rejects.toBeInstanceOf(LinkError);
    conversation = { id: "wa-1", branch_id: "b1", channel_id: "ch-1", customer_id: null, vehicle_id: null, provider_contact_hash: HASH, mode: "operational" };
    customerFound = false;
    await expect(linkConversationToCustomer({ query } as never, staff, { conversationId: "wa-1", customerId: "c9" })).rejects.toMatchObject({ code: "CUSTOMER_NOT_FOUND" });
    customerFound = true; vehicleFound = false;
    await expect(linkConversationToCustomer({ query } as never, staff, { conversationId: "wa-1", customerId: "c1", vehicleId: "v-other" })).rejects.toMatchObject({ code: "VEHICLE_NOT_FOUND" });
  });
});
