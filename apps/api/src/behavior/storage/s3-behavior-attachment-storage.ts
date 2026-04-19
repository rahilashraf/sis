import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import type {
  BehaviorAttachmentStorage,
  StoredBehaviorAttachment,
} from './behavior-attachment-storage';

type S3BehaviorAttachmentStorageOptions = {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  accessKeyId: string;
  secretAccessKey: string;
};

export class S3BehaviorAttachmentStorage implements BehaviorAttachmentStorage {
  private readonly client: S3Client;

  constructor(private readonly options: S3BehaviorAttachmentStorageOptions) {
    this.client = new S3Client({
      region: options.region,
      endpoint: options.endpoint,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    });
  }

  async store(params: {
    key: string;
    body: Buffer;
    contentType: string;
  }) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: params.key,
        Body: params.body,
        ContentType: params.contentType,
      }),
    );
  }

  async read(key: string): Promise<StoredBehaviorAttachment> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.options.bucket,
        Key: key,
      }),
    );

    const body = response.Body;
    if (!body) {
      throw new Error('Attachment body is missing');
    }

    const bytes = await body.transformToByteArray();

    return {
      body: Buffer.from(bytes),
      contentType: response.ContentType ?? null,
      contentLength: response.ContentLength ?? null,
    };
  }

  async remove(key: string) {
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.options.bucket,
          Key: key,
        }),
      );
    } catch (error) {
      if (
        error instanceof S3ServiceException &&
        (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404)
      ) {
        return;
      }

      throw error;
    }
  }
}
