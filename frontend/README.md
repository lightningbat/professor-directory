# Professor directory (React + Vite)

```bash
npm install
npm run dev
```

Needs the `professor-api` backend running (default `http://localhost:8080/api`). To point somewhere else,
copy `.env.example` to `.env` and set `VITE_API_URL`.

- All network code is in `src/api/professors.js` (endpoints and shapes documented at the top).
- Login is a full-page redirect to the API's Google flow; sessions live in httpOnly cookies, so the
  frontend never sees a token. A 401 triggers one silent refresh and retry.
- Logged out: profile links are Google searches and emails are hidden.
  Logged in: direct profile links and a "Reveal email" button (rate limited on the server).

## Pages
- `/` directory, `/about`, `/contact` (React Router).
- The contact form posts to Web3Forms with `fetch`, so the page never reloads or changes URL.
  Create a key at https://web3forms.com (enter the inbox that should receive messages) and set
  `VITE_WEB3FORMS_ACCESS_KEY` in `.env`.
