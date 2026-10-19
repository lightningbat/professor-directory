import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'professor-api';
// "-v2": access tokens are now only issued after a Cloudflare Turnstile check, so tokens from the
// old design (no Turnstile) are rejected by audience instead of lingering until they expire.
const ACCESS_AUDIENCE = 'access-v2';
const OAUTH_TX_TTL_SECONDS = 600;

export interface OAuthTx {
  state: string;
  codeVerifier: string;
  returnTo: string;
}

export interface AccessToken {
  token: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/**
 * The access token is stateless: a signed JWT checked only by signature and expiry, no database lookup.
 * It proves "a logged-in human solved Turnstile within the last few minutes". The login token itself
 * (stateful) lives in AuthSessionStore.
 */
export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: string, readonly accessTtlSeconds: number) {
    this.key = new TextEncoder().encode(secret);
  }

  async signAccess(userId: string, ttlSeconds = this.accessTtlSeconds): Promise<AccessToken> {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + ttlSeconds;
    const token = await new SignJWT({ role: 'user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience(ACCESS_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(this.key);
    return { token, expiresAt: exp * 1000 };
  }

  async verifyAccess(token: string): Promise<{ userId: string; expiresAt: number } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: ACCESS_AUDIENCE,
        algorithms: ['HS256'],
      });
      if (!payload.sub || payload.role !== 'user' || typeof payload.exp !== 'number') return null;
      return { userId: payload.sub, expiresAt: payload.exp * 1000 };
    } catch {
      return null;
    }
  }

  /** Short-lived signed cookie that carries the OAuth state + PKCE verifier across the Google redirect. */
  signOAuthTx(tx: OAuthTx): Promise<string> {
    return new SignJWT({ state: tx.state, cv: tx.codeVerifier, rt: tx.returnTo })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(ISSUER)
      .setAudience('oauth-tx')
      .setIssuedAt()
      .setExpirationTime(`${OAUTH_TX_TTL_SECONDS}s`)
      .sign(this.key);
  }

  async verifyOAuthTx(token: string): Promise<OAuthTx | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: 'oauth-tx',
        algorithms: ['HS256'],
      });
      const { state, cv, rt } = payload as Record<string, unknown>;
      if (typeof state !== 'string' || typeof cv !== 'string' || typeof rt !== 'string') return null;
      return { state, codeVerifier: cv, returnTo: rt };
    } catch {
      return null;
    }
  }
}

export const OAUTH_TX_MAX_AGE_MS = OAUTH_TX_TTL_SECONDS * 1000;

export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

export function newOpaqueToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashToken(raw) };
}
