import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/** Thin seam around Google so tests can swap in a fake. */
export interface GoogleAuth {
  start(state: string): Promise<{ url: string; codeVerifier: string }>;
  finish(code: string, codeVerifier: string): Promise<GoogleProfile>;
}

export function createGoogleAuth(cfg: { clientId: string; clientSecret: string; redirectUri: string }): GoogleAuth {
  const client = new OAuth2Client({
    clientId: cfg.clientId,
    clientSecret: cfg.clientSecret,
    redirectUri: cfg.redirectUri,
  });

  return {
    async start(state) {
      const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
      const url = client.generateAuthUrl({
        scope: ['openid', 'email', 'profile'],
        state,
        code_challenge: codeChallenge,
        code_challenge_method: CodeChallengeMethod.S256,
        prompt: 'select_account',
      });
      return { url, codeVerifier };
    },

    async finish(code, codeVerifier) {
      const { tokens } = await client.getToken({ code, codeVerifier });
      if (!tokens.id_token) throw new Error('Google did not return an id_token');
      const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: cfg.clientId });
      const p = ticket.getPayload();
      if (!p?.sub || !p.email) throw new Error('Google profile is missing sub or email');
      return {
        sub: p.sub,
        email: p.email,
        emailVerified: p.email_verified === true,
        name: p.name ?? null,
        picture: p.picture ?? null,
      };
    },
  };
}
