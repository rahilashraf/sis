export type StoredBehaviorAttachment = {
  body: Buffer;
  contentType: string | null;
  contentLength: number | null;
};

export interface BehaviorAttachmentStorage {
  store(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void>;
  read(key: string): Promise<StoredBehaviorAttachment>;
  remove(key: string): Promise<void>;
}
