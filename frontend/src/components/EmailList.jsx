import { useState } from 'react';
import { getRevealedEmails, revealEmails } from '../api/professors.js';
import { useAuth } from '../hooks/useAuth.jsx';
import { CheckIcon, ChevronDown, ClipboardIcon, MailIcon } from './icons.jsx';

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function EmailChip({ email, variant }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (await copyText(email)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <span className={`email email--${variant}`}>
      {variant === 'box' && <MailIcon className="email-icon" width={18} height={18} />}
      <a className="email-text" href={`mailto:${email}`}>{email}</a>
      <button
        type="button"
        className="copy-btn"
        onClick={copy}
        aria-label={copied ? 'Copied' : `Copy ${email}`}
        title={copied ? 'Copied' : 'Copy email'}
      >
        {copied ? <CheckIcon width={16} height={16} /> : <ClipboardIcon width={16} height={16} />}
      </button>
    </span>
  );
}

function waitText(seconds) {
  if (!seconds) return 'a while';
  if (seconds < 90) return `${seconds} seconds`;
  if (seconds < 5400) return `${Math.ceil(seconds / 60)} minutes`;
  return `${Math.ceil(seconds / 3600)} hours`;
}

function errorText(err) {
  if (err.status === 429) return `Reveal limit reached. Try again in ${waitText(err.retryAfterSeconds)}.`;
  if (err.status === 401) return 'We couldn’t verify you’re human. Please try again in a moment.';
  return 'Couldn’t load the email. Please try again.';
}

/** variant "chip" is for the table, "box" is for the mobile card. */
export default function EmailList({ professor, variant = 'chip' }) {
  const { user, login } = useAuth();
  const [emails, setEmails] = useState(() => getRevealedEmails(professor.id) ?? null);
  const [status, setStatus] = useState('idle'); // idle | loading | error
  const [error, setError] = useState(null);
  const [quota, setQuota] = useState(null);
  const [open, setOpen] = useState(false);

  if (!professor.emailCount) return <span className="muted">No email listed</span>;

  if (!user) {
    return (
      <button type="button" className={`reveal-btn reveal-btn--${variant}`} onClick={login}>
        <MailIcon width={16} height={16} /> Log in to view email
      </button>
    );
  }

  const reveal = async () => {
    setStatus('loading');
    try {
      const result = await revealEmails(professor.id);
      setEmails(result.emails);
      setQuota(result.quota);
      setStatus('idle');
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  };

  if (!emails) {
    const label = professor.emailCount > 1 ? `Reveal ${professor.emailCount} emails` : 'Reveal email';
    return (
      <div className={`emails emails--${variant}`}>
        <button
          type="button"
          className={`reveal-btn reveal-btn--${variant}`}
          onClick={reveal}
          disabled={status === 'loading'}
        >
          <MailIcon width={16} height={16} /> {status === 'loading' ? 'Revealing…' : label}
        </button>
        {status === 'error' && <p className="reveal-error" role="alert">{errorText(error)}</p>}
      </div>
    );
  }

  const [first, ...rest] = emails;
  const shown = open ? emails : [first];

  return (
    <div className={`emails emails--${variant}`}>
      {shown.map((email) => (
        <EmailChip key={email} email={email} variant={variant} />
      ))}
      {rest.length > 0 && (
        <button
          type="button"
          className={`more-btn more-btn--${variant}`}
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Show less' : variant === 'box' ? `(+${rest.length} more emails)` : `+${rest.length} more`}
          {variant === 'box' && <ChevronDown className={open ? 'is-flipped' : ''} width={16} height={16} />}
        </button>
      )}
      {quota && (
        <p className="quota-note">{Math.max(0, quota.hourRemaining)} reveals left this hour</p>
      )}
    </div>
  );
}
