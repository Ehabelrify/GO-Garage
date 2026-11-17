import { createHash,createHmac,randomUUID,timingSafeEqual } from "node:crypto";
import { Router } from "express";
import { withTransaction } from "../../infrastructure/database/db";
import { isWhatsAppProviderDeliveryEnabled } from "./whatsapp-policy";
import { confirmJourneyBooking } from "./booking-journey";
import { parseProviderEventTime } from "./provider-event-time";

export const providerWebhookRouter=Router();
const deliveryRank:Record<string,number>={accepted:1,"definite-failure":1,delivered:2,read:3};

providerWebhookRouter.post("/events",async(req,res,next)=>{try{
  if(!isWhatsAppProviderDeliveryEnabled())return res.status(503).json({code:"PROVIDER_DISCONNECTED",message:"Provider delivery is not enabled."});
  const secret=process.env.WHATSAPP_WEBHOOK_SECRET,signature=String(req.header("x-provider-signature")??""),eventId=String(req.header("x-provider-event-id")??""),channelId=String(req.header("x-provider-channel-id")??""),raw=(req as typeof req&{rawBody?:Buffer}).rawBody;
  if(!secret||!raw||!eventId||!channelId)return res.status(400).json({code:"INVALID_PROVIDER_EVENT",message:"Provider event metadata is incomplete."});
  const expected=createHmac("sha256",secret).update(raw).digest("hex"),provided=signature.replace(/^sha256=/,"");
  if(expected.length!==provided.length||!timingSafeEqual(Buffer.from(expected),Buffer.from(provided)))return res.status(401).json({code:"INVALID_SIGNATURE",message:"Provider signature is invalid."});
  const body=req.body as{kind?:string;providerMessageId?:string;occurredAt?:string;contactHash?:string;text?:string;confirmationKey?:string},occurred=parseProviderEventTime(body.occurredAt);
  if(typeof body.kind!=="string"||!occurred)return res.status(400).json({code:"INVALID_PROVIDER_EVENT",message:"Provider event body is invalid or future-dated."});
  const kind=body.kind;
  const outcome=await withTransaction(async client=>{
    const channel=(await client.query<{provider:string;status:string}>("SELECT provider,status FROM messaging_channels WHERE id=$1 FOR UPDATE",[channelId])).rows[0];if(!channel||!["sandbox","ready"].includes(channel.status))return "disabled" as const;
    const inserted=await client.query("INSERT INTO messaging_provider_events(provider,channel_id,provider_event_id,event_kind,provider_message_id,payload_digest,occurred_at) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",[channel.provider,channelId,eventId,kind,body.providerMessageId??null,createHash("sha256").update(raw).digest("hex"),occurred]);if(!inserted.rowCount)return "duplicate" as const;
    if(kind==="inbound-message"||kind==="booking-confirmation"){
      if(!body.contactHash||(kind==="inbound-message"&&!body.text?.trim())||(kind==="booking-confirmation"&&!body.confirmationKey))throw Object.assign(new Error("Inbound contact and action data are required."),{status:400,code:"INVALID_INBOUND"});
      const link=(await client.query<{customer_id:string;vehicle_id:string;branch_id:string;name:string}>("SELECT l.customer_id,l.vehicle_id,l.branch_id,c.name FROM messaging_contact_links l JOIN customers c ON c.id=l.customer_id WHERE l.channel_id=$1 AND l.provider_contact_hash=$2",[channelId,body.contactHash])).rows[0];if(!link)throw Object.assign(new Error("Inbound contact is not approved for this channel."),{status:409,code:"CONTACT_UNMAPPED"});
      let conversation=(await client.query<{id:string}>("SELECT id FROM whatsapp_conversations WHERE mode='operational' AND channel_id=$1 AND customer_id=$2 AND branch_id=$3 AND status IN ('open','pending') ORDER BY updated_at DESC LIMIT 1 FOR UPDATE",[channelId,link.customer_id,link.branch_id])).rows[0];
      if(!conversation&&kind==="booking-confirmation")throw Object.assign(new Error("Booking confirmation has no active conversation."),{status:409,code:"CONVERSATION_NOT_FOUND"});
      if(!conversation){conversation={id:`wa-${randomUUID()}`};await client.query("INSERT INTO whatsapp_conversations(id,branch_id,mode,channel_id,customer_label,customer_id,vehicle_id,verification_code,last_inbound_at) VALUES($1,$2,'operational',$3,$4,$5,$6,$7,$8)",[conversation.id,link.branch_id,channelId,link.name,link.customer_id,link.vehicle_id,randomUUID().slice(0,8),occurred]);}
      if(kind==="booking-confirmation"){const confirmation=await confirmJourneyBooking(client,conversation.id,body.confirmationKey!,channelId);if(confirmation.status!=="confirmed"&&confirmation.status!=="replayed")throw Object.assign(new Error("Booking confirmation could not be committed."),{status:409,code:confirmation.status==="capacity-conflict"?"CAPACITY_CONFLICT":"CONFIRMATION_REJECTED"});}
      else{await client.query("INSERT INTO whatsapp_messages(id,conversation_id,mode,kind,body,created_at) VALUES($1,$2,'operational','customer',$3,$4)",[randomUUID(),conversation.id,body.text!.trim(),occurred]);await client.query("UPDATE whatsapp_conversations SET status='open',bot_state='paused',last_inbound_at=greatest(coalesce(last_inbound_at,$2),$2),human_response_required_at=NULL,unread_count=unread_count+1,version=version+1,updated_at=now() WHERE id=$1",[conversation.id,occurred]);}
    }else if(body.providerMessageId&&kind in deliveryRank){const current=(await client.query<{id:string;status:string}>("SELECT id,status FROM messaging_outbox WHERE channel_id=$1 AND provider_message_id=$2 FOR UPDATE",[channelId,body.providerMessageId])).rows[0];if(current&&(deliveryRank[kind]??0)>(deliveryRank[current.status]??0))await client.query("UPDATE messaging_outbox SET status=$2,updated_at=now() WHERE id=$1",[current.id,kind]);}
    return "persisted" as const;
  });
  res.status(outcome==="persisted"?202:200).json({state:outcome});
}catch(error){const value=error as Error&{status?:number;code?:string};if(value.status)return res.status(value.status).json({code:value.code??"PROVIDER_EVENT_REJECTED",message:value.message});next(error);}});
