import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { pool,withTransaction } from "../../infrastructure/database/db";
import { providerAdapter } from "./provider";
import { isWhatsAppProviderDeliveryEnabled } from "./whatsapp-policy";

type OutboundContent={type:"freeform"|"template";language:"ar"|"en";text:string;templateRef?:string};
async function approvedDelivery(client:Pick<PoolClient,"query">,input:{conversationId:string;channelId:string;recipientRef:string;content:OutboundContent;at:Date}){
  const row=(await client.query<{channel_id:string|null;preferred_language:string;last_inbound_at:Date|null;provider_contact_hash:string|null;customer_service_window_hours:number;approved_template_ref:string|null}>(`SELECT c.channel_id,cu.preferred_language,c.last_inbound_at,l.provider_contact_hash,p.customer_service_window_hours,p.approved_template_ref FROM whatsapp_conversations c JOIN customers cu ON cu.id=c.customer_id LEFT JOIN messaging_contact_links l ON l.channel_id=c.channel_id AND l.customer_id=c.customer_id JOIN messaging_delivery_policies p ON p.channel_id=c.channel_id AND p.language=cu.preferred_language AND p.active=true AND (p.expires_at IS NULL OR p.expires_at>$3) WHERE c.id=$1 AND c.mode='operational' AND c.channel_id=$2`,[input.conversationId,input.channelId,input.at])).rows[0];
  if(!row||row.provider_contact_hash!==input.recipientRef||row.preferred_language!==input.content.language)return false;
  if(input.content.type==="template")return Boolean(row.approved_template_ref&&input.content.templateRef===row.approved_template_ref);
  return Boolean(row.last_inbound_at&&input.at.getTime()-row.last_inbound_at.getTime()<=row.customer_service_window_hours*3600000);
}

export async function enqueueOutbound(client:PoolClient,input:{conversationId:string;channelId:string;recipientRef:string;content:OutboundContent;idempotencyKey:string;expiresAt:string}){
  const expires=new Date(input.expiresAt),now=new Date();
  if(!Number.isFinite(expires.getTime())||expires<=now||!input.content.text.trim()||!await approvedDelivery(client,{...input,at:now}))throw Object.assign(new Error("Approved consent, recipient, service window or template, language and expiry are required."),{code:"OUTBOUND_POLICY_UNCONFIGURED",status:422});
  const id=randomUUID(),status=isWhatsAppProviderDeliveryEnabled()?"queued":"held";
  const row=await client.query<{id:string}>("INSERT INTO messaging_outbox(id,conversation_id,channel_id,recipient_ref,content,idempotency_key,status,next_attempt_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8) ON CONFLICT(idempotency_key) DO UPDATE SET id=messaging_outbox.id RETURNING id",[id,input.conversationId,input.channelId,input.recipientRef,JSON.stringify(input.content),input.idempotencyKey,status,expires]);
  return{outboxId:row.rows[0].id,state:status as "held"|"queued"};
}

export async function dispatchDue(now=new Date()){
  if(!isWhatsAppProviderDeliveryEnabled())return{claimed:0,accepted:0,held:true};
  await withTransaction(async client=>{await client.query("UPDATE messaging_outbox SET status='expired',lease_until=NULL,updated_at=now() WHERE status IN ('queued','leased') AND expires_at<=$1",[now]);await client.query("UPDATE messaging_outbox SET status='queued',lease_until=NULL,next_attempt_at=$1,updated_at=now() WHERE status='leased' AND lease_until<=$1 AND expires_at>$1",[now]);});
  const adapter=providerAdapter(),due=await pool.query<{id:string;conversation_id:string;channel_id:string;recipient_ref:string;content:OutboundContent;idempotency_key:string;attempts:number}>("UPDATE messaging_outbox SET status='leased',lease_until=$1::timestamptz+interval '2 minutes',attempts=attempts+1,updated_at=now() WHERE id IN (SELECT id FROM messaging_outbox WHERE status='queued' AND next_attempt_at<=$1 AND expires_at>$1 ORDER BY next_attempt_at FOR UPDATE SKIP LOCKED LIMIT 25) RETURNING id,conversation_id,channel_id,recipient_ref,content,idempotency_key,attempts",[now]);
  let accepted=0;
  for(const item of due.rows){if(!await approvedDelivery(pool,{conversationId:item.conversation_id,channelId:item.channel_id,recipientRef:item.recipient_ref,content:item.content,at:now})){await pool.query("UPDATE messaging_outbox SET status='held',failure_code='POLICY_UNCONFIGURED',lease_until=NULL,updated_at=now() WHERE id=$1",[item.id]);continue;}const result=await adapter.send({channelId:item.channel_id,recipient:item.recipient_ref,content:item.content,idempotencyKey:item.idempotency_key});await withTransaction(async client=>{if(result.state==="accepted"){accepted++;await client.query("UPDATE messaging_outbox SET status='accepted',provider_message_id=$2,lease_until=NULL,updated_at=now() WHERE id=$1",[item.id,result.providerMessageId]);}else if(result.state==="unknown-outcome")await client.query("UPDATE messaging_outbox SET status='unknown-outcome',failure_code='OUTCOME_UNKNOWN',lease_until=NULL,updated_at=now() WHERE id=$1",[item.id]);else if(result.retryable&&item.attempts<5)await client.query("UPDATE messaging_outbox SET status='queued',failure_code=$2,next_attempt_at=now()+(interval '1 minute'*power(2,attempts)),lease_until=NULL,updated_at=now() WHERE id=$1",[item.id,result.code]);else await client.query("UPDATE messaging_outbox SET status='definite-failure',failure_code=$2,lease_until=NULL,updated_at=now() WHERE id=$1",[item.id,result.code]);});}
  return{claimed:due.rowCount,accepted,held:false};
}
