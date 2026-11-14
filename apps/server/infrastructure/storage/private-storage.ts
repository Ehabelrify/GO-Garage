import { Client } from "@replit/object-storage";

let storageClient: Client | null = null;

export function isPrivateStorageConfigured() {
  return Boolean(process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim());
}

export function privateStorageClient() {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID?.trim();
  if (!bucketId) return null;
  storageClient ??= new Client({ bucketId });
  return storageClient;
}
