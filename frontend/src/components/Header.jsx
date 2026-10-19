import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { CapIcon } from './icons.jsx';

function initials(user) {
  const source = user.name || user.email || '?';
  return source.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function Header() {
  const { user, status, login, logout } = useAuth();

  return (
    <header className="site-header">
      <Link className="logo" to="/" aria-label="Professor finder home">
        <CapIcon width={18} height={18} />
      </Link>

      <nav className="site-nav" aria-label="Main">
        <NavLink to="/about">About us</NavLink>
        <NavLink to="/contact">Contact</NavLink>
      </nav>

      <div className="header-actions">
        {status === 'ready' && !user && (
          <button type="button" className="login-btn" onClick={login}>Login/Signup</button>
        )}
        {user && (
          <div className="account">
            {user.picture ? (
              <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" width="32" height="32" />
            ) : (
              <span className="avatar avatar--initials" aria-hidden="true">{initials(user)}</span>
            )}
            <span className="account-name">{user.name || user.email}</span>
            <button type="button" className="link-btn account-out" onClick={logout}>Log out</button>
          </div>
        )}
      </div>
    </header>
  );
}
