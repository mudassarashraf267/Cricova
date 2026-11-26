import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

export type Role = 'admin' | 'scorer' | 'viewer';
export const ROLES: Role[] = ['admin', 'scorer', 'viewer'];
export interface TokenUser { id: string; username: string; name: string; role: Role }

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((res, rej) => scrypt(password, salt, 64, (e, key) => (e ? rej(e) : res(`${salt.toString('hex')}:${key.toString('hex')}`))));
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, key] = stored.split(':');
  return new Promise((res, rej) => scrypt(password, Buffer.from(salt, 'hex'), 64, (e, k) => {
    if (e) return rej(e);
    const expect = Buffer.from(key, 'hex');
    res(expect.length === k.length && timingSafeEqual(expect, k));
  }));
}

export function signToken(u: TokenUser, secret: string, ttlSec = 7 * 24 * 3600): string {
  const body = b64(JSON.stringify({ ...u, exp: Math.floor(Date.now() / 1000) + ttlSec }));
  return `${body}.${b64(createHmac('sha256', secret).update(body).digest())}`;
}

export function verifyToken(token: string, secret: string): TokenUser | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const good = createHmac('sha256', secret).update(body).digest();
  const given = Buffer.from(sig, 'base64url');
  if (good.length !== given.length || !timingSafeEqual(good, given)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenUser & { exp: number };
    if (p.exp < Date.now() / 1000) return null;
    return { id: p.id, username: p.username, name: p.name, role: p.role };
  } catch { return null; }
}

/** In-memory failed-login limiter (per username): 8 failures per 15 minutes. */
export class LoginLimiter {
  private fails = new Map<string, number[]>();
  constructor(private max = 8, private windowMs = 15 * 60 * 1000) {}
  blocked(key: string) { return this.recent(key).length >= this.max; }
  fail(key: string) { this.fails.set(key, [...this.recent(key), Date.now()]); }
  clear(key: string) { this.fails.delete(key); }
  private recent(key: string) { return (this.fails.get(key) ?? []).filter((t) => Date.now() - t < this.windowMs); }
}
