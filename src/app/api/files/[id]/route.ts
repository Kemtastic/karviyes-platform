import { readStoredFile } from '@/core/files/service';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await readStoredFile(id);
  if (!result.ok) return new Response('Bulunamadı', { status: result.code === 'UNAUTHENTICATED' ? 401 : 404 });
  const { bytes, contentType, name } = result.data;
  const inline = contentType.startsWith('image/');
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'X-Content-Type-Options': 'nosniff',
      // Yüklenen içerik betik çalıştıramaz.
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src 'self'",
      'Cache-Control': 'private, max-age=300',
    },
  });
}
