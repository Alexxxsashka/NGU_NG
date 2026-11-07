import 'server-only';
import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { z } from 'zod';
import { transaction } from '@/db';
import { audit, lockAdmin } from './admin';
import type { Viewer } from './domain';
import { HttpError, throttle } from './security';
import { staticId, staticAccountKey } from './validation';
import type { PoolClient } from 'pg';

const password = z.string().min(12, 'Пароль має містити щонайменше 12 символів.').max(128);
const registrationName = z.string().trim().min(1, 'Заповніть ім’я та прізвище.').max(50);
const accountId = z.object({ userId: z.string().min(1).max(100), confirmed: z.literal(true) });

export async function lockStaticClaims(c: PoolClient) {
  await c.query("SELECT pg_advisory_xact_lock(hashtext('static-account-claims'))");
}

export async function reserveStatic(c: PoolClient, id: string, userId: string) {
  const taken = await c.query(`
    SELECT 1 FROM app_user WHERE username=$3 AND id<>$2
    UNION ALL
    SELECT 1 FROM personnel WHERE static_id::numeric=$1::text::numeric AND user_id IS NOT NULL AND user_id<>$2
    UNION ALL
    SELECT 1 FROM profile_claims WHERE static_id::numeric=$1::text::numeric AND status='pending' AND user_id<>$2
  `, [id, userId, staticAccountKey(id)]);
  if (taken.rowCount) throw new HttpError('Цей Static ID уже зареєстровано або він очікує підтвердження.', 409);
  const roster = await c.query('SELECT static_id FROM personnel WHERE static_id::numeric=$1::text::numeric ORDER BY (static_id=$1) DESC, static_id LIMIT 1', [id]);
  const claimId = roster.rows[0]?.static_id ?? id.replace(/^0+(?=\d)/, '');
  await c.query('INSERT INTO profile_claims(user_id,static_id) VALUES($1,$2)', [userId, claimId]);
}

export async function register(request: Request, input: unknown) {
  await throttle(request, 'register', 5);
  const p = z.object({ firstName: registrationName, lastName: registrationName, staticId, password, website: z.string().max(0).default('') }).parse(input);
  const digest = await hashPassword(p.password);
  const id = randomUUID();
  return transaction(async c => {
    await lockStaticClaims(c);
    await c.query('INSERT INTO app_user(id,name,email,username,display_username) VALUES($1,$2,$3,$4,$4)',
      [id, p.firstName + " " + p.lastName, id + '@accounts.invalid', staticAccountKey(p.staticId)]);
    await reserveStatic(c, p.staticId, id);
    await c.query("INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES($1,$2,'credential',$2,$3)", [randomUUID(), id, digest]);
    return { created: true };
  });
}

export async function editAccount(input: unknown, u: Viewer) {
  const p = z.object({ name: z.string().trim().min(1).max(101), userId: accountId.shape.userId, staticId: staticId.optional() }).parse(input);
  return transaction(async c => {
    await lockAdmin(c, u);
    await lockStaticClaims(c);
    const old = (await c.query('SELECT id,name,username FROM app_user WHERE id=$1 FOR UPDATE', [p.userId])).rows[0];
    if (!old) throw new HttpError('Обліковий запис не знайдено.', 404);
    const pending = (await c.query("SELECT static_id FROM profile_claims WHERE user_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1", [p.userId])).rows[0];
    const linked = (await c.query('SELECT static_id FROM personnel WHERE user_id=$1', [p.userId])).rows[0];
    if (p.staticId && linked && BigInt(p.staticId) !== BigInt(linked.static_id)) {
      throw new HttpError('Static ID підтвердженого кадрового профілю зафіксовано.', 409);
    }
    if (p.staticId && !linked && (!pending || BigInt(p.staticId) !== BigInt(pending.static_id))) {
      await c.query("UPDATE profile_claims SET status='rejected',reason='Static ID змінено адміністратором',reviewed_by=$1 WHERE user_id=$2 AND status='pending'", [u.id, p.userId]);
      await reserveStatic(c, p.staticId, p.userId);
    }
    const username = p.staticId ? staticAccountKey(p.staticId) : old.username;
    await c.query('UPDATE app_user SET name=$1,username=$2,display_username=$2,updated_at=now() WHERE id=$3', [p.name, username, p.userId]);
    if (username !== old.username) await c.query('DELETE FROM session WHERE user_id=$1', [p.userId]);
    await audit(c, u, 'user.edit', p.userId, { ...old, staticId: linked?.static_id ?? pending?.static_id }, { name: p.name, staticId: p.staticId ?? linked?.static_id ?? pending?.static_id });
    return { saved: true };
  });
}

export async function deleteAccount(input: unknown, u: Viewer) {
  const p = accountId.parse(input);
  if (p.userId === u.id) throw new HttpError('Власний обліковий запис не можна видалити.');
  return transaction(async c => {
    await lockAdmin(c, u);
    await lockStaticClaims(c);
    const old = (await c.query('DELETE FROM app_user WHERE id=$1 RETURNING id,name,username,role', [p.userId])).rows[0];
    if (!old) throw new HttpError('Обліковий запис не знайдено.', 404);
    await audit(c, u, 'user.delete', p.userId, old, null);
    return { deleted: true };
  });
}

export async function issueTemporaryPassword(input: unknown, u: Viewer) {
  const p = accountId.parse(input);
  if (p.userId === u.id) throw new HttpError('Змініть власний пароль в особистому кабінеті.');
  const temporaryPassword = randomBytes(24).toString('base64url');
  const digest = await hashPassword(temporaryPassword);
  return transaction(async c => {
    await lockAdmin(c, u);
    const target = await c.query('UPDATE app_user SET must_change_password=true,updated_at=now() WHERE id=$1', [p.userId]);
    if (!target.rowCount) throw new HttpError('Обліковий запис не знайдено.', 404);
    const result = await c.query("UPDATE account SET password=$1,updated_at=now() WHERE user_id=$2 AND provider_id='credential'", [digest, p.userId]);
    if (!result.rowCount) throw new HttpError('Цей обліковий запис не має входу за паролем.', 409);
    await c.query('DELETE FROM session WHERE user_id=$1', [p.userId]);
    await c.query('DELETE FROM recovery_tokens WHERE user_id=$1', [p.userId]);
    await audit(c, u, 'user.password.temporary', p.userId, null, null);
    return { temporaryPassword };
  });
}

export async function changePassword(request: Request, input: unknown, u: Viewer) {
  await throttle(request, 'change-password:' + u.id, 8, 300);
  const p = z.object({ currentPassword: z.string().min(1).max(128), password }).parse(input);
  if (p.currentPassword === p.password) throw new HttpError('Оберіть інший новий пароль.');
  return transaction(async c => {
    await c.query('SELECT id FROM app_user WHERE id=$1 FOR UPDATE', [u.id]);
    const credential = (await c.query("SELECT id,password FROM account WHERE user_id=$1 AND provider_id='credential' FOR UPDATE", [u.id])).rows[0];
    if (!credential?.password || !(await verifyPassword({ hash: credential.password, password: p.currentPassword }))) {
      throw new HttpError('Поточний пароль неправильний.');
    }
    await c.query('UPDATE account SET password=$1,updated_at=now() WHERE id=$2', [await hashPassword(p.password), credential.id]);
    await c.query('UPDATE app_user SET must_change_password=false,updated_at=now() WHERE id=$1', [u.id]);
    await c.query('DELETE FROM session WHERE user_id=$1', [u.id]);
    await audit(c, u, 'user.password.change', u.id, null, null);
    return { saved: true };
  });
}
