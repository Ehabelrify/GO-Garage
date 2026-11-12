export function isWhatsAppSimulationWriteEnabled(environment = process.env.NODE_ENV) {
  return environment !== "production";
}

export function isWhatsAppProviderDeliveryEnabled() {
  return false;
}
