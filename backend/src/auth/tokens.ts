import { createHash, randomBytes } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';

const ISSUER = 'professor-api';
const OAUTH_TX_TTL_SECONDS = 600;

export interface OAuthTx {
  state: string;
  codeVerifier: string;
  returnTo: string;
}

/**
 * Access tokens are stateless: a signed JWT that is only checked by signature and expiry,
 * with no database lookup. Refresh tokens are opaque random strings stored (hashed) in the DB.
 */
export class TokenService {
  private readonly key: Uint8Array;

  constructor(secret: string, private readonly accessTtlSeconds: number) {
    this.key = new TextEncoder().encode(secret);
  }

  signAccess(userId: string): Promise<string> {
    return new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(userId)
      .setIssuer(ISSUER)
      .setAudience('access')
      .setIssuedAt()
      .setExpirationTime(`${this.accessTtlSeconds}s`)
      .sign(this.key);
  }

  async verifyAccess(token: string): Promise<{ userId: string } | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        issuer: ISSUER,
        audience: 'access',
        algorithms: ['HS256'],
      });
      return payload.sub ? { userId: payload.sub } : null;
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

export const hashRefreshToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

export function newRefreshToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString('base64url');
  return { raw, hash: hashRefreshToken(raw) };
}
