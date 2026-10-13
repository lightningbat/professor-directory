import './institutions-strip.scss';

// 1. Grab all images eagerly
const rawImages = import.meta.glob('../assets/clg-logos/*.{png,jpg,jpeg,svg,webp}', {
	eager: true,
	import: 'default',
});

// 2. Map file paths to clean names (e.g. "./assets/images/cat.png" -> "cat")
const images = Object.fromEntries(
	Object.entries(rawImages).map(([path, url]) => [
		path.split('/').pop().replace(/\.[^/.]+$/, ''),
		url,
	])
);

const INSTITUTIONS = [
	{ name: 'IIT Delhi', logo: 'iit-delhi' },
	{ name: 'IIT Bombay', logo: 'iit-bombay' },
	{ name: 'IIT Madras', logo: 'iit-madras' },
	{ name: 'IIT Kanpur', logo: 'iit-kanpur' },
	{ name: 'IIT Roorkee', logo: 'iit-roorkee' },
	{ name: 'IIT Guwahati', logo: 'iit-guwahati' },
];

function Logo({ name, logo }) {
	// console.log(logo)
	return (
		<li className="inst-item">
			<img
				src={images[logo]}
				alt=""
				width="28"
				height="28"
				loading="lazy"
				onError={(e) => {
					e.currentTarget.onerror = null;
					e.currentTarget.src = templateLogo;
				}}
			/>
			<span>{name}</span>
		</li>
	);
}

export default function InstitutionsStrip({
	title = 'Leading institutions',
	items = INSTITUTIONS,
}) {
	return (
		<section className="inst" aria-label={title}>
			<p className="inst-title">{title}</p>

			<div className="inst-viewport">
				<div className="inst-track">
					{/* Main set */}
					<ul className="inst-list">
						{items.map((i) => (
							<Logo key={i.logo} {...i} />
						))}
					</ul>
					{/* Clone set for continuous seamless loop */}
					<ul className="inst-list" aria-hidden="true">
						{items.map((i) => (
							<Logo key={`${i.name}-clone`} {...i} />
						))}
					</ul>
				</div>
			</div>
		</section>
	);
}
