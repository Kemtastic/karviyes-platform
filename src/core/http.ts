import { ERROR_STATUS } from '@/core/errors';
import type { Action, ActionResult } from '@/core/action';

export function resultStatus(r: ActionResult<unknown>): number {
  return r.ok ? 200 : ERROR_STATUS[r.code];
}

// Route Handler'da POST gövdesini action'a verir; başka siteden gelen istekleri reddeder.
export function routeHandler<O>(action: Action<O>) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== new URL(req.url).host) {
      return Response.json({ ok: false, code: 'FORBIDDEN', message: 'İzin verilmeyen kaynak.' }, { status: 403 });
    }
    const body: unknown = await req.json().catch(() => ({}));
    const result = await action(body);
    return new Response(JSON.stringify(result, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)), {
      status: resultStatus(result),
      headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  };
}
