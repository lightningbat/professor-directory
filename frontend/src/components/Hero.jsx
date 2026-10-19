import { ArrowUpRight } from './icons.jsx';
import { Pencil, BinderClip, Pin, Paperclip } from './Decor.jsx';

const AVATARS = [
	{ initials: 'AS', bg: '#c9a58a' },
	{ initials: 'RM', bg: '#8aa6a3' },
	{ initials: 'PN', bg: '#b9a0c4' },
	{ initials: 'AR', bg: '#d6b46f' },
	{ initials: 'KV', bg: '#9fb4c9' },
];

export default function Hero({ onStart }) {
	return (
		<section className="hero" id="top">
			<Pencil className="hero-pencil hero-pencil--left" />
			<Pencil className="hero-pencil hero-pencil--right" />
			<BinderClip className="hero-clip" />
			<Pin className="hero-pin" />

			<div className="hero-copy">
				<div className="pill">
					<div className="pill-primary">
						<span className="avatars" aria-hidden="true">
							{AVATARS.map((a) => (
								<span key={a.initials} style={{ background: a.bg }}>{a.initials}</span>
							))}
						</span>
						<span className="pill-text">Built for students</span>
					</div>

					<Paperclip className="pill-clip" />

					<span className="pill-text pill-secondary">
						Trusted by <strong>1700+</strong> students
					</span>
				</div>

				<h1>Find your Professor across colleges</h1>
				<p className="hero-sub">
					Explore faculty across universities, discover their research interests, and find the
					academic connections that matter to your journey.
				</p>

				<button type="button" className="btn btn--primary hero-cta" onClick={onStart}>
					Let's get started<ArrowUpRight width={18} height={18} />
				</button>
			</div>
		</section>
	);
}
