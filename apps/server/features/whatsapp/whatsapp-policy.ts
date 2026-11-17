export function isWhatsAppSimulationWriteEnabled(environment = process.env.NODE_ENV) {
  return environment !== "production";
}

export function isWhatsAppProviderDeliveryEnabled() {
  return process.env.NODE_ENV === "production"
    && process.env.GARAGE_DATASET_CLASS === "operational"
    && process.env.WHATSAPP_PROVIDER_ENABLED === "true"
    && Boolean(process.env.WHATSAPP_WEBHOOK_SECRET);
}
