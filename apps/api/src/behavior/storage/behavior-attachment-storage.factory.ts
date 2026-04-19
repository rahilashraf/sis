import path from 'node:path';
import {
  BehaviorAttachmentStorage,
} from './behavior-attachment-storage';
import { LocalBehaviorAttachmentStorage } from './local-behavior-attachment-storage';
import { S3BehaviorAttachmentStorage } from './s3-behavior-attachment-storage';

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (!value) {
    return fallback;
  }

  return value.trim().toLowerCase() === 'true';
}

export function createBehaviorAttachmentStorageFromEnv(): BehaviorAttachmentStorage {
  const driver = (
    process.env.BEHAVIOR_ATTACHMENT_STORAGE_DRIVER?.trim().toLowerCase() ?? 'local'
  );

  if (driver === 's3') {
    return new S3BehaviorAttachmentStorage({
      bucket: getRequiredEnv('BEHAVIOR_ATTACHMENT_S3_BUCKET'),
      region: getRequiredEnv('BEHAVIOR_ATTACHMENT_S3_REGION'),
      endpoint: process.env.BEHAVIOR_ATTACHMENT_S3_ENDPOINT?.trim() || undefined,
      forcePathStyle: parseBoolean(
        process.env.BEHAVIOR_ATTACHMENT_S3_FORCE_PATH_STYLE,
        false,
      ),
      accessKeyId: getRequiredEnv('BEHAVIOR_ATTACHMENT_S3_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('BEHAVIOR_ATTACHMENT_S3_SECRET_ACCESS_KEY'),
    });
  }

  const rootDirectory =
    process.env.BEHAVIOR_ATTACHMENT_LOCAL_ROOT?.trim() ||
    path.join(process.cwd(), 'storage', 'behavior-attachments');
  return new LocalBehaviorAttachmentStorage(rootDirectory);
}
