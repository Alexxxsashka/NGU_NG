import { query } from '@/db';
import { getAuth } from '@/lib/auth';
import { failure, HttpError, readBody, writable } from '@/lib/security';
import { z } from 'zod';
import { canonicalStaticId, staticAccountKey } from '@/lib/validation';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try { return await getAuth().handler(request); } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    writable();
    const path = new URL(request.url).pathname;
    if (path === '/api/auth/sign-out') return await getAuth().handler(request);
    if (path !== '/api/auth/sign-in/static-id') throw new HttpError('Операцію не знайдено.', 404);
    const input = z.object({ staticId: canonicalStaticId, password: z.string().min(1).max(128) }).parse(await readBody(request, 4096));
    const lookup = () => query<{ id: string; username: string; password: string }>(
      `SELECT a.id,u.username,a.password FROM account a JOIN app_user u ON u.id=a.user_id
        WHERE a.provider_id='credential' AND (
          u.username=$2 OR (u.username !~ '^static_[0-9]+$' AND (
            EXISTS(SELECT 1 FROM personnel p WHERE p.user_id=u.id AND p.static_id::numeric=$1::text::numeric)
            OR EXISTS(SELECT 1 FROM profile_claims c WHERE c.user_id=u.id AND c.status='pending' AND c.static_id::numeric=$1::text::numeric)
          ))
        ) LIMIT 2`, [input.staticId, staticAccountKey(input.staticId)]
    );
    const matches = await lookup();
    const credential = matches.length === 1 ? matches[0] : undefined;
    const headers = new Headers(request.headers);
    headers.delete('content-length');
    const authUrl = new URL('/api/auth/sign-in/username', request.url);
    const response = await getAuth().handler(new Request(authUrl, {
      method: 'POST', headers, body: JSON.stringify({ username: credential?.username ?? staticAccountKey(input.staticId), password: input.password }),
    }));
    if (!response.ok) return response;

    // The password or Static ID can change while Better Auth creates the session.
    const current = await lookup();
    if (!credential || current.length !== 1 || current[0].id !== credential.id || current[0].password !== credential.password) {
      const { token } = await response.json() as { token: string };
      await query('DELETE FROM session WHERE token=$1', [token]);
      throw new HttpError('Не вдалося увійти. Перевірте Static ID і пароль.', 401);
    }
    return response;
  } catch (error) {
    return failure(error);
  }
}
