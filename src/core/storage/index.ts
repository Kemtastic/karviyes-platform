import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { getEnv } from '@/core/env';

export type Storage = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
};

const SAFE_KEY = /^[a-z0-9/-]+$/;

// Yerel dosya sistemi: anahtarlar yalnızca uuid ve '/' içerir; kök dışına çıkılamaz.
export function createFsStorage(root: string): Storage {
  const base = resolve(root);
  const pathOf = (key: string) => {
    if (!SAFE_KEY.test(key)) throw new Error('Geçersiz dosya anahtarı');
    const full = resolve(join(base, key));
    if (!full.startsWith(base)) throw new Error('Geçersiz dosya anahtarı');
    return full;
  };
  return {
    async put(key, bytes) {
      const p = pathOf(key);
      await mkdir(dirname(p), { recursive: true });
      await writeFile(p, bytes);
    },
    async get(key) {
      try {
        return new Uint8Array(await readFile(pathOf(key)));
      } catch {
        return null;
      }
    },
    async delete(key) {
      await rm(pathOf(key), { force: true });
    },
  };
}

// S3 uyumlu depolama (Supabase Storage, MinIO, AWS).
export function createS3Storage(cfg: { endpoint?: string; bucket: string; accessKeyId: string; secretAccessKey: string; region?: string }): Storage {
  const client = import('@aws-sdk/client-s3').then((s3) => ({
    s3,
    c: new s3.S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region ?? 'auto',
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
    }),
  }));
  return {
    async put(key, bytes, contentType) {
      const { s3, c } = await client;
      await c.send(new s3.PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: bytes, ContentType: contentType }));
    },
    async get(key) {
      const { s3, c } = await client;
      try {
        const out = await c.send(new s3.GetObjectCommand({ Bucket: cfg.bucket, Key: key }));
        return out.Body ? new Uint8Array(await out.Body.transformToByteArray()) : null;
      } catch {
        return null;
      }
    },
    async delete(key) {
      const { s3, c } = await client;
      await c.send(new s3.DeleteObjectCommand({ Bucket: cfg.bucket, Key: key }));
    },
  };
}

let instance: Storage | undefined;

export function getStorage(): Storage {
  if (instance) return instance;
  const env = getEnv();
  if (env.STORAGE_DRIVER === 's3') {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error('S3 depolama ayarları eksik (S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY).');
    }
    instance = createS3Storage({ endpoint: env.S3_ENDPOINT, bucket: env.S3_BUCKET, accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY });
  } else {
    instance = createFsStorage(env.STORAGE_FS_DIR);
  }
  return instance;
}
