# Admin dashboard (React + Vite)

Live visitor monitoring for the Professor Directory: how many people are online right now
(signed in vs guests), where they are, visitors per day, and sign-ups.

```bash
npm install
npm run dev        # http://localhost:5174
```

## Setup (in the API's `.env`)
```
ADMIN_EMAILS=you@gmail.com        # Google accounts allowed in (comma-separated)
ADMIN_URL=http://localhost:5174   # where this dashboard runs
ANALYTICS_TIMEZONE=UTC            # what "today" means, e.g. Asia/Kolkata
```
Then open the dashboard and click "Continue with Google". Anyone else gets "No admin access".
The dashboard only reads `/api/admin/*` on the same server as the public site.

## How "online now" works
The public site sends a small heartbeat every ~25 s while a tab is visible (random browser id + tab id +
page path, no personal data). A browser counts as online if its last heartbeat was within 75 s, so closing
a tab or switching away drops it from the count within about a minute. Signed-in vs guest is decided by the
server from the login cookie. Once a minute the server stores a snapshot of the numbers for the charts.

Visitors = browsers (two tabs from one browser count once). Visits = tabs opened.
