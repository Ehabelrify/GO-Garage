export type ProviderSendResult={state:"accepted";providerMessageId:string}|{state:"definite-failure";code:string;retryable:boolean}|{state:"unknown-outcome";reconciliationRef:string|null};
export interface ProviderAdapter{send(input:{channelId:string;recipient:string;content:unknown;idempotencyKey:string}):Promise<ProviderSendResult>;reconcile?(input:{channelId:string;idempotencyKey:string;providerMessageId?:string|null}):Promise<ProviderSendResult>;}
export class DisconnectedProviderAdapter implements ProviderAdapter{async send():Promise<ProviderSendResult>{return{state:"definite-failure",code:"PROVIDER_DISCONNECTED",retryable:false};}}
export function providerAdapter():ProviderAdapter{return new DisconnectedProviderAdapter();}
