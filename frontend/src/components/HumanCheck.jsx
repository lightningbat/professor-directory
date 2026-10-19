import { useAuth } from '../hooks/useAuth.jsx';

/**
 * The Turnstile check itself is invisible and lives in lib/turnstile.js (it only shows a small box if
 * Cloudflare needs a click). This banner appears only when verification keeps failing for a signed-in person.
 */
export default function HumanCheck() {
  const { user, access, retryAccess } = useAuth();
  if (!user || access.status !== 'error') return null;

  return (
    <div className="human-banner" role="alert">
      <span>We couldn’t verify you’re human, so emails and direct profile links are unavailable for now.</span>
      <button type="button" className="link-btn" onClick={retryAccess}>Try again</button>
    </div>
  );
}
