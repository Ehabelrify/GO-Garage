import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { cleanProviderPhone, unlinkedLabel } from "./contact-projection";

/**
 * Inbound text from a number nobody has linked to a customer. It still reaches the inbox: one open conversation per
 * (channel, contact hash) titled "New contact (<phone>)" for receptionists and managers of the receiving branch.
 * The branch is the channel's default branch, else the first branch. No customer or vehicle is invented.
 */
export async function ingestUnlinkedInbound(
  client: Pick<PoolClient, "query">,
  input: { channelId: string; contactHash: string; contactPhone?: string; text: string; occurred: Date },
): Promise<{ conversationId: string; created: boolean }> {
  const phone = cleanProviderPhone(input.contactPhone);
  let conversation = (await client.query<{ id: string; contact_phone: string | null }>(
    "SELECT id,contact_phone FROM whatsapp_conversations WHERE mode='operational' AND channel_id=$1 AND provider_contact_hash=$2 AND customer_id IS NULL AND status IN ('open','pending') ORDER BY updated_at DESC LIMIT 1 FOR UPDATE",
    [input.channelId, input.contactHash])).rows[0];
  let created = false;
  if (!conversation) {
    const branch = (await client.query<{ branch_id: string | null }>(
      "SELECT COALESCE(c.default_branch_id,(SELECT id FROM branches ORDER BY id LIMIT 1)) AS branch_id FROM messaging_channels c WHERE c.id=$1", [input.channelId])).rows[0]?.branch_id;
    if (!branch) throw Object.assign(new Error("No branch is available to receive this contact."), { status: 409, code: "NO_RECEIVING_BRANCH" });
    const id = `wa-${randomUUID()}`;
    await client.query(
      `INSERT INTO whatsapp_conversations(id,branch_id,mode,channel_id,customer_label,customer_id,vehicle_id,verification_code,last_inbound_at,contact_label,provider_contact_hash,contact_phone)
       VALUES($1,$2,'operational',$3,'New contact',NULL,NULL,$4,$5,$6,$7,$8)`,
      [id, branch, input.channelId, randomUUID().slice(0, 8), input.occurred, unlinkedLabel(input.contactHash), input.contactHash, phone]);
    await client.query(
      "INSERT INTO whatsapp_conversation_events(id,conversation_id,event_type,details,actor_user_id) VALUES($1,$2,'new-contact-received','A message arrived from a number that is not saved as a customer.',NULL)",
      [randomUUID(), id]);
    conversation = { id, contact_phone: phone };
    created = true;
  } else if (phone && !conversation.contact_phone) {
    await client.query("UPDATE whatsapp_conversations SET contact_phone=$2 WHERE id=$1", [conversation.id, phone]);
  }
  await client.query("INSERT INTO whatsapp_messages(id,conversation_id,mode,kind,body,created_at) VALUES($1,$2,'operational','customer',$3,$4)", [randomUUID(), conversation.id, input.text.trim(), input.occurred]);
  await client.query(
    "UPDATE whatsapp_conversations SET status='open',bot_state='paused',last_inbound_at=greatest(coalesce(last_inbound_at,$2),$2),human_response_required_at=NULL,unread_count=unread_count+1,version=version+1,updated_at=now() WHERE id=$1",
    [conversation.id, input.occurred]);
  return { conversationId: conversation.id, created };
}

export class LinkError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

/**
 * Attaches an unsaved-number conversation to a customer (and optionally one of their vehicles). Stores the contact link
 * with the provider hash so every later message from this number matches automatically, clears the stored phone (the
 * customer record owns it from now on), and writes a conversation event. Safe to repeat for the same customer.
 * Caller checks capabilities (whatsapp.use + bookings.manage), demo identities and inbox access to the conversation.
 */
export async function linkConversationToCustomer(
  client: Pick<PoolClient, "query">,
  actor: { userId: string; role: string; branchIds: string[]; isDemo?: boolean },
  input: { conversationId: string; customerId: string; vehicleId?: string },
): Promise<{ conversationId: string; customerId: string; vehicleId: string | null; customerLabel: string; linked: true }> {
  if (actor.isDemo) throw new LinkError(403, "DEMO_ACTION_DISABLED", "Linking is unavailable in a temporary demo session.");
  const conversation = (await client.query<{ id: string; branch_id: string; channel_id: string | null; customer_id: string | null; vehicle_id: string | null; provider_contact_hash: string | null; mode: string }>(
    "SELECT id,branch_id,channel_id,customer_id,vehicle_id,provider_contact_hash,mode FROM whatsapp_conversations WHERE id=$1 FOR UPDATE", [input.conversationId])).rows[0];
  if (!conversation) throw new LinkError(404, "CONVERSATION_NOT_FOUND", "Conversation not found.");
  if (conversation.customer_id && conversation.customer_id !== input.customerId) throw new LinkError(409, "ALREADY_LINKED", "This conversation already belongs to another customer.");
  const customer = (await client.query<{ id: string; name: string }>(
    `SELECT c.id,c.name FROM customers c
      WHERE c.id=$1 AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind='customer' AND ra.entity_id=c.id)
        AND ($2 OR EXISTS (SELECT 1 FROM customer_branches cb WHERE cb.customer_id=c.id AND cb.branch_id=ANY($3::text[])))`,
    [input.customerId, actor.role === "owner", actor.branchIds])).rows[0];
  if (!customer) throw new LinkError(404, "CUSTOMER_NOT_FOUND", "Customer not found.");
  let vehicleId: string | null = input.vehicleId ?? conversation.vehicle_id;
  if (vehicleId) {
    const vehicle = await client.query("SELECT 1 FROM vehicles v WHERE v.id=$1 AND v.customer_id=$2 AND NOT EXISTS (SELECT 1 FROM record_archives ra WHERE ra.entity_kind='vehicle' AND ra.entity_id=v.id)", [vehicleId, customer.id]);
    if (!vehicle.rowCount) throw new LinkError(404, "VEHICLE_NOT_FOUND", "Vehicle not found for this customer.");
  } else vehicleId = null;
  // The customer must be known at the conversation's branch for quotes and bookings made from the chat.
  await client.query("INSERT INTO customer_branches(customer_id,branch_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [customer.id, conversation.branch_id]);
  if (conversation.channel_id && conversation.provider_contact_hash) {
    await client.query(
      `INSERT INTO messaging_contact_links(channel_id,provider_contact_hash,customer_id,vehicle_id,branch_id,approved_by)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(channel_id,provider_contact_hash) DO UPDATE SET customer_id=EXCLUDED.customer_id,vehicle_id=EXCLUDED.vehicle_id,branch_id=EXCLUDED.branch_id,approved_by=EXCLUDED.approved_by,approved_at=now()`,
      [conversation.channel_id, conversation.provider_contact_hash, customer.id, vehicleId, conversation.branch_id, actor.userId]);
    // Any other unlinked conversation from the same number follows the same customer.
    await client.query(
      "UPDATE whatsapp_conversations SET customer_id=$3,vehicle_id=$4,customer_label=$5,contact_phone=NULL,version=version+1,updated_at=now() WHERE channel_id=$1 AND provider_contact_hash=$2 AND customer_id IS NULL AND id<>$6",
      [conversation.channel_id, conversation.provider_contact_hash, customer.id, vehicleId, customer.name, conversation.id]);
  }
  await client.query(
    "UPDATE whatsapp_conversations SET customer_id=$2,vehicle_id=$3,customer_label=$4,contact_phone=NULL,version=version+1,updated_at=now() WHERE id=$1",
    [conversation.id, customer.id, vehicleId, customer.name]);
  await client.query(
    "INSERT INTO whatsapp_conversation_events(id,conversation_id,event_type,details,actor_user_id) VALUES($1,$2,'contact-linked',$3,$4)",
    [randomUUID(), conversation.id, "The conversation was linked to a customer.", actor.userId]);
  return { conversationId: conversation.id, customerId: customer.id, vehicleId, customerLabel: customer.name, linked: true };
}
