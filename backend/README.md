# Professor API (Node + TypeScript)

```bash
npm install
cp .env.example .env     # set ACCESS_TOKEN_SECRET (openssl rand -base64 48) and the Google keys
npm run dev              # http://localhost:8080/api
npm test
```

## Google OAuth setup
1. Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth client ID (Web application).
2. Add `http://localhost:8080/api/auth/google/callback` as an Authorized redirect URI (and your production URL later).
3. Put the client ID/secret in `.env`. Without them everything works for logged-out visitors and login returns 503.

## Endpoints (all under `/api`)
| Method | Path | Notes |
|---|---|---|
| GET | `/professors` | `q, college, department, designation, page, pageSize`. Without an access token `profileUrl` is a Google search. Never includes emails; each row has `emailCount`. |
| POST | `/professors/:id/email` | Needs an access token. Verifies it, then counts against limits, then returns `{ emails, quota }`. 429 + `Retry-After` when limited. |
| GET | `/filters`, `/stats` | Public. |
| GET | `/auth/google?returnTo=/` | Starts login (state + PKCE). |
| GET | `/auth/google/callback` | Google redirects here; sets cookies; redirects to the frontend. |
| POST | `/auth/access` | `{ turnstileToken }` + login cookie -> access token cookie. 401 not logged in, 400 `turnstile_failed`, 503 `turnstile_unavailable`. |
| POST | `/auth/logout` | Revokes the login token server-side, clears cookies. |
| GET | `/auth/me` | `{ user, access: { expiresAt } \| null }` from the login cookie. |

## Tokens and Cloudflare Turnstile
Two tokens, both httpOnly cookies:
- **Login token** (`auth_token`): random opaque string, **stateful** (only its SHA-256 hash is stored in `auth_sessions`),
  created at Google login, never rotated. Valid until revoked (logout), 14 days idle, or 30 days total. Cookie path
  `/api/auth`, so it is only ever sent to the auth endpoints.
- **Access token** (`access_token`): signed JWT, **stateless**, 12 minutes (`ACCESS_TOKEN_TTL_SECONDS`, 10-15 min intended).
  Only obtained by `POST /api/auth/access` with the login cookie **plus a Cloudflare Turnstile token**, which the server
  verifies with Cloudflare (single-use, hostname and action checked). Cookie path `/api`.

What needs what:
| | guest | logged in, no access token | access token |
|---|---|---|---|
| browse / search / filters | yes | yes | yes |
| profile link | Google search link | Google search link | **direct link** |
| reveal email | no | no | **yes** (rate limited) |
| `/api/admin/*` | no | no | admin emails only |

- Cloudflare unreachable -> `503 turnstile_unavailable` (fails closed); browsing is unaffected.
- Logout revokes the login token immediately. An access token already issued stays valid until it expires
  (at most 12 minutes), because it is stateless.
- Cookies are `Secure` in production. POSTs also check the `Origin` header against `CORS_ORIGIN`.

## Reveal limits
Per user 15/hour and 50/day; per IP 30/hour across all users. Rolling windows, counted in the `email_reveals` table.
IPv6 clients are grouped by /64. Behind a proxy/load balancer set `TRUST_PROXY=1` (number of proxies) or every
visitor will look like the proxy's IP. SQLite is single-node: with several API instances, move the limiter to Redis.

## Admin & visitor analytics
- `POST /api/analytics/heartbeat` `{ visitorId, sessionId, path }` is called by the public site every ~25 s while a tab is
  visible. Signed-in vs guest comes from the login cookie. No IPs are stored, only random browser/tab ids. Throttled to
  120 requests/min per IP.
- Everything under `/api/admin` needs a valid login **and** an email in `ADMIN_EMAILS` (401 / 403 otherwise):

| Path | Returns |
|---|---|
| `GET /admin/me` | the admin user |
| `GET /admin/overview` | online now (visitors / signed in / guests / tabs), pages being viewed, today's totals, reveals (24 h), user count |
| `GET /admin/online?kind=all\|user\|guest` | one row per open tab (signed-in rows include name + email) |
| `GET /admin/timeline?range=24h\|7d\|30d` | peak people online per time slot (a snapshot is stored every minute) |
| `GET /admin/daily?days=1..90` | unique visitors, visits, sign-ups per day, zero-filled |

"Online" = a heartbeat in the last 75 s. Days follow `ANALYTICS_TIMEZONE`. Data older than `ANALYTICS_RETENTION_DAYS` is purged.
After Google login the API can send the browser back to the admin dashboard because `ADMIN_URL` is an allowed redirect origin.
