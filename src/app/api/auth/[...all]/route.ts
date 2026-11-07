import { query } from '@/db';
import { getAuth } from '@/lib/auth';
import { failure, HttpError, readBody, writable } from '@/lib/security';
import { z } from 'zod';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  try { return await getAuth().handler(request); } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    writable();
    const path = new URL(request.url).pathname;
    if (path === '/api/auth/sign-out') return await getAuth().handler(request);
    if (path !== '/api/auth/sign-in/username') throw new HttpError('Операцію не знайдено.', 404);

    const input = z.object({ username: z.string().max(40) }).parse(await readBody(request.clone(), 4096));
    const [credential] = await query<{ id: string; password: string }>(
      "SELECT a.id,a.password FROM account a JOIN app_user u ON u.id=a.user_id WHERE u.username=$1 AND a.provider_id='credential'",
      [input.username.toLowerCase()]
    );
    const response = await getAuth().handler(request);
    if (!response.ok) return response;

    // A reset can commit between verification and Better Auth inserting the session.
    const [current] = credential
      ? await query<{ password: string }>('SELECT password FROM account WHERE id=$1', [credential.id])
      : [];
    if (!credential || !current || current.password !== credential.password) {
      const { token } = await response.json() as { token: string };
      await query('DELETE FROM session WHERE token=$1', [token]);
      throw new HttpError('Пароль змінився. Увійдіть знову.', 401);
    }
    return response;
  } catch (error) {
    return failure(error);
  }
}
