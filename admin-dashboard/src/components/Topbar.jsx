function initials(user) {
  return (user.name || user.email || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function Topbar({ user, onLogout }) {
  return (
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <div>
          <strong>Visitors</strong>
          <span className="muted"> · Professor Directory admin</span>
        </div>
      </div>

      <div className="account">
        {user.picture ? (
          <img src={user.picture} alt="" width="30" height="30" referrerPolicy="no-referrer" />
        ) : (
          <span className="avatar" aria-hidden="true">{initials(user)}</span>
        )}
        <span className="account-name">{user.email}</span>
        <button type="button" className="btn btn--ghost" onClick={onLogout}>Log out</button>
      </div>
    </header>
  );
}
