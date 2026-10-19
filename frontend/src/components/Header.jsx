import { Link, NavLink } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import { CapIcon } from './icons.jsx';

function initials(user) {
	const source = user.name || user.email || '?';
	return source.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

export default function Header() {
	const { user, status, login, logout } = useAuth();
	const [menuOpen, setMenuOpen] = useState(false);

	const toggleMenu = () => setMenuOpen((prev) => !prev);
	const closeMenu = () => setMenuOpen(false);

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

			{/* 4. Mobile Hamburger Button */}
			<button
				type="button"
				className={`menu-toggle ${menuOpen ? 'is-active' : ''}`}
				onClick={toggleMenu}
				aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
				aria-expanded={menuOpen}
			>
				<span className="bar" />
				<span className="bar" />
				<span className="bar" />
			</button>

			{/* 5. Mobile Dropdown Drawer */}
			<div className={`mobile-menu ${menuOpen ? 'is-open' : ''}`}>
				<nav className="mobile-nav" aria-label="Mobile navigation">
					<NavLink to="/">Home</NavLink>
					<NavLink to="/about">About us</NavLink>
					<NavLink to="/contact">Contact</NavLink>
				</nav>

				<div className="mobile-actions">
					{status === 'ready' && !user && (
						<button
							type="button"
							className="login-btn mobile-login-btn"
							onClick={() => {
								closeMenu();
								login();
							}}
						>
							Login/Signup
						</button>
					)}

					{user && (
						<div className="mobile-account">
							<div className="account-user">
								{user.picture ? (
									<img
										className="avatar"
										src={user.picture}
										alt=""
										referrerPolicy="no-referrer"
										width="36"
										height="36"
									/>
								) : (
									<span className="avatar avatar--initials" aria-hidden="true">
										{initials(user)}
									</span>
								)}
								<span className="account-name">{user.name || user.email}</span>
							</div>
							<button
								type="button"
								className="link-btn account-out"
								onClick={() => {
									closeMenu();
									logout();
								}}
							>
								Log out
							</button>
						</div>
					)}
				</div>
			</div>
		</header>
	);
}
