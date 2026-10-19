import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { defineAction, type ActionResult, type ActionRuntime } from '@/core/action';
import { files } from '@/core/db/schema';
import { AppError } from '@/core/errors';
import { getStorage, type Storage } from '@/core/storage';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

// Tür, dosya adına değil içeriğin imza baytlarına göre belirlenir. SVG/HTML kabul edilmez.
export function sniffContentType(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return 'image/webp';
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  return null;
}

type Deps = { storage?: Storage };

export function storeFile(raw: unknown, rt?: ActionRuntime, deps: Deps = {}): Promise<ActionResult<{ id: string; contentType: string; size: number }>> {
  return defineAction({
    name: 'files.store',
    roles: ['admin', 'sales', 'tracking'],
    input: z.object({ name: z.string().trim().min(1).max(200), bytes: z.instanceof(Uint8Array) }),
    run: async (ctx, i) => {
      if (i.bytes.byteLength > MAX_FILE_BYTES) throw new AppError('VALIDATION', 'Dosya en fazla 10 MB olabilir.');
      const contentType = sniffContentType(i.bytes);
      if (!contentType) throw new AppError('VALIDATION', 'Yalnızca PNG, JPEG, WEBP görsel ve PDF yüklenebilir.');
      const key = `companies/${ctx.companyId}/${randomUUID()}`;
      const [row] = await ctx.tx
        .insert(files)
        .values({ companyId: ctx.companyId, key, name: i.name, contentType, size: i.bytes.byteLength, createdBy: ctx.user.userId })
        .returning({ id: files.id });
      await (deps.storage ?? getStorage()).put(key, i.bytes, contentType);
      await ctx.audit({ entity: 'file', entityId: row!.id, after: { name: i.name, contentType, size: i.bytes.byteLength } });
      return { id: row!.id, contentType, size: i.bytes.byteLength };
    },
  })(raw, rt);
}

export function readStoredFile(id: string, rt?: ActionRuntime, deps: Deps = {}): Promise<ActionResult<{ bytes: Uint8Array; contentType: string; name: string }>> {
  return defineAction({
    name: 'files.read',
    readOnlySafe: true,
    roles: ['admin', 'sales', 'tracking', 'slitting', 'printing', 'cutting', 'finishing', 'repair'],
    rateLimit: false,
    input: z.object({ id: z.string().uuid() }),
    run: async (ctx, i) => {
      const [row] = await ctx.tx.select().from(files).where(eq(files.id, i.id));
      if (!row) throw new AppError('NOT_FOUND', 'Dosya bulunamadı.');
      const bytes = await (deps.storage ?? getStorage()).get(row.key);
      if (!bytes) throw new AppError('NOT_FOUND', 'Dosya bulunamadı.');
      return { bytes, contentType: row.contentType, name: row.name };
    },
  })({ id }, rt);
}
