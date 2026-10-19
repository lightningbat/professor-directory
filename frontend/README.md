# Professor directory (React + Vite)

```bash
npm install
npm run dev
```

Needs the `professor-api` backend running (default `http://localhost:8080/api`). To point somewhere else,
copy `.env.example` to `.env` and set `VITE_API_URL`.

- All network code is in `src/api/professors.js` (endpoints and shapes documented at the top).
- Login is a full-page redirect to the API's Google flow; tokens live in httpOnly cookies, so the
  frontend never sees them.
- Guests browse and search freely (no verification). Profile links are Google searches and emails are hidden.
- Logged in: right after landing, Cloudflare Turnstile runs invisibly in the background and is traded for a
  short-lived access token (`src/lib/turnstile.js`, `src/lib/access.js`). It is renewed silently ~90 s before it
  expires. With the token you get direct profile links and the "Reveal email" button (rate limited on the server).
  A small box appears only if Cloudflare needs a click. Set `VITE_TURNSTILE_SITE_KEY`.

## Pages
- `/` directory, `/about`, `/contact` (React Router).
- The contact form posts to Web3Forms with `fetch`, so the page never reloads or changes URL.
  Create a key at https://web3forms.com (enter the inbox that should receive messages) and set
  `VITE_WEB3FORMS_ACCESS_KEY` in `.env`.
