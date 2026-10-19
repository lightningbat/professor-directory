import { loginUrl } from '../api.js';

function Shell({ children }) {
  return (
    <main className="gate">
      <div className="gate-card">
        <span className="brand-mark" aria-hidden="true" />
        {children}
      </div>
    </main>
  );
}

export function LoadingScreen() {
  return (
    <Shell>
      <p className="muted" role="status">Checking your session…</p>
    </Shell>
  );
}

export function LoginScreen() {
  return (
    <Shell>
      <h1>Admin dashboard</h1>
      <p className="muted">Sign in with the Google account that has admin access.</p>
      <a className="btn btn--solid" href={loginUrl()}>Continue with Google</a>
    </Shell>
  );
}

export function ForbiddenScreen({ user, onLogout }) {
  return (
    <Shell>
      <h1>No admin access</h1>
      <p className="muted">
        {user?.email ? <><strong>{user.email}</strong> isn’t on the admin list.</> : 'This account isn’t on the admin list.'}
      </p>
      <p className="muted">Ask the site owner to add it to <code>ADMIN_EMAILS</code>, or switch accounts.</p>
      <button type="button" className="btn" onClick={onLogout}>Log out and switch account</button>
    </Shell>
  );
}

export function ErrorScreen({ message, onRetry }) {
  return (
    <Shell>
      <h1>Can’t reach the API</h1>
      <p className="muted">{message || 'Something went wrong.'}</p>
      <p className="muted">Make sure the server is running and this origin is allowed by <code>ADMIN_URL</code>.</p>
      <button type="button" className="btn btn--solid" onClick={onRetry}>Try again</button>
    </Shell>
  );
}
