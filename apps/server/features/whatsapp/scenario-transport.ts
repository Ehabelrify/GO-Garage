import type { WhatsAppJourneyInput,WhatsAppJourneyState } from "@garage/domain";
import { advanceJourney } from "@garage/domain";
import { isWhatsAppProviderDeliveryEnabled } from "./whatsapp-policy";
export type ScenarioContext={scenarioId:string;actorId:string};
export class ScenarioTransport{receive(context:ScenarioContext,fictionalChannelId:string,state:WhatsAppJourneyState,input:WhatsAppJourneyInput){if(process.env.GARAGE_DATASET_CLASS!=="scenario"||!context.scenarioId||!context.actorId||!fictionalChannelId)throw Object.assign(new Error("Scenario transport requires an isolated scenario deployment."),{code:"SCENARIO_ISOLATION_REQUIRED"});if(isWhatsAppProviderDeliveryEnabled()||process.env.WHATSAPP_WEBHOOK_SECRET)throw Object.assign(new Error("Provider effects are forbidden in scenario deployment."),{code:"SCENARIO_PROVIDER_FORBIDDEN"});return advanceJourney(state,input);}}
