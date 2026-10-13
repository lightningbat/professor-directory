import { useEffect, useRef, useState } from 'react';
import { BuildingIcon, ChevronDown, GridIcon, PersonIcon, SearchIcon } from './icons.jsx';

const QUICK_TAGS = ['Machine Learning', 'Quantum Computing', 'Material Science', 'Neuroscience'];

function Select({ icon, label, allLabel, value, options, onChange }) {
	return (
		<label className="select">
			<span className="select-icon">{icon}</span>
			<select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
				<option value="">{allLabel}</option>
				{options.map((o) => (
					<option key={o} value={o}>{o}</option>
				))}
			</select>
			<ChevronDown className="select-chevron" width={18} height={18} />
		</label>
	);
}

export default function SearchCard({ filters, options, onChange, onClear, inputRef }) {
	const [draft, setDraft] = useState(filters.q);
	const lastSent = useRef(filters.q);

	// Keep the box in sync when filters are cleared from outside.
	useEffect(() => {
		setDraft(filters.q);
		lastSent.current = filters.q;
	}, [filters.q]);

	// Search as you type, after a short pause.
	useEffect(() => {
		if (draft === lastSent.current) return undefined;
		const timer = setTimeout(() => {
			lastSent.current = draft;
			onChange({ q: draft });
		}, 350);
		return () => clearTimeout(timer);
	}, [draft, onChange]);

	const submit = (e) => {
		e.preventDefault();
		lastSent.current = draft;
		onChange({ q: draft });
	};

	const anyActive = filters.q || filters.college || filters.department || filters.designation;

	return (
		<section className="panel search-card" id="search" aria-label="Search professors">
			<form className="search-row" onSubmit={submit} role="search">
				<label className="field">
					<SearchIcon className="field-icon" />
					<input
						ref={inputRef}
						type="search"
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder="Search by name, college, department, designation, or keywords…"
						aria-label="Search professors"
					/>
				</label>
				<button type="submit" className="btn btn--primary btn--search">
					<span>Search</span> <SearchIcon width={18} height={18} />
				</button>
			</form>

			<div className="filter-row">
				<Select
					icon={<BuildingIcon />}
					label="College"
					allLabel="All Colleges"
					value={filters.college}
					options={options.colleges}
					onChange={(college) => onChange({ college })}
				/>
				<Select
					icon={<GridIcon />}
					label="Department"
					allLabel="All Departments"
					value={filters.department}
					options={options.departments}
					onChange={(department) => onChange({ department })}
				/>
				<Select
					icon={<PersonIcon />}
					label="Designation"
					allLabel="Designation"
					value={filters.designation}
					options={options.designations}
					onChange={(designation) => onChange({ designation })}
				/>
			</div>

			<div className="tag-row">
				<span className="tag-label">Fast-access tags:</span>
				<div className="tags">
					{QUICK_TAGS.map((tag) => (
						<button
							key={tag}
							type="button"
							className={`tag ${filters.q === tag ? 'is-active' : ''}`}
							aria-pressed={filters.q === tag}
							onClick={() => onChange({ q: filters.q === tag ? '' : tag })}
						>
							{tag}
						</button>
					))}
				</div>
				{anyActive && (
					<button type="button" className="link-btn" onClick={onClear}>Clear all</button>
				)}
			</div>
		</section>
	);
}
