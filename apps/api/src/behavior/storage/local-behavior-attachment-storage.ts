import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  BehaviorAttachmentStorage,
  StoredBehaviorAttachment,
} from './behavior-attachment-storage';

export class LocalBehaviorAttachmentStorage implements BehaviorAttachmentStorage {
  constructor(private readonly rootDirectory: string) {}

  private resolveAbsolutePath(key: string) {
    const normalizedKey = key.replace(/\\/g, '/');
    return path.join(this.rootDirectory, normalizedKey);
  }

  async store(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }) {
    const absolutePath = this.resolveAbsolutePath(params.key);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, params.body);
  }

  async read(key: string): Promise<StoredBehaviorAttachment> {
    const absolutePath = this.resolveAbsolutePath(key);
    const body = await readFile(absolutePath);

    return {
      body,
      contentType: 'application/pdf',
      contentLength: body.byteLength,
    };
  }

  async remove(key: string) {
    const absolutePath = this.resolveAbsolutePath(key);
    await unlink(absolutePath).catch(() => undefined);
  }
}
