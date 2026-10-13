import { ChevronLeft, ChevronRight } from './icons.jsx';
import { ProfessorCards, ProfessorTable, SkeletonRows } from './ProfessorViews.jsx';

const formatCount = (n) => `${Number(n).toLocaleString('en-US')}+`;

export default function FacultyDirectory({
	rows, total, page, pageSize, loading, error, stats, onPage, onRetry, onClear, headingRef,
}) {
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
	const to = Math.min(page * pageSize, total);
	const firstLoad = loading && rows.length === 0;

	let body;
	if (error) {
		body = (
			<div className="state" role="alert">
				<p className="state-title">Couldn’t load professors</p>
				<p className="state-text">Check your connection and try again.</p>
				<button type="button" className="btn btn--outline" onClick={onRetry}>Try again</button>
			</div>
		);
	} else if (firstLoad) {
		body = <SkeletonRows />;
	} else if (rows.length === 0) {
		body = (
			<div className="state">
				<p className="state-title">No professors match these filters</p>
				<p className="state-text">Try a different keyword, or remove a filter.</p>
				<button type="button" className="btn btn--outline" onClick={onClear}>Clear all</button>
			</div>
		);
	} else {
		body = (
			<div className={`results ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
				<div className="only-wide"><ProfessorTable rows={rows} /></div>
				<div className="only-narrow"><ProfessorCards rows={rows} /></div>
			</div>
		);
	}

	return (
		<section className="directory" aria-labelledby="directory-title">
			<div className="directory-head">
				<h2 id="directory-title" ref={headingRef} tabIndex={-1}>Faculty directory</h2>
				<p className="count" aria-live="polite">
					{loading ? 'Searching…' : error ? '' : `Showing ${from}–${to} of ${total.toLocaleString('en-US')}`}
				</p>
			</div>

			<div className="panel directory-panel">
				{body}

				<div className="directory-foot">
					<dl className="stats">
						{[
							['professors', 'Professors Listed'],
							['universities', 'Universities'],
							['departments', 'Departments'],
						].map(([key, label]) => (
							<div key={key} className="stat">
								<dt className="stat-value">{stats ? formatCount(stats[key]) : '—'}</dt>
								<dd className="stat-label">{label}</dd>
							</div>
						))}
					</dl>

					<div className="pager">
						<span className="pager-count" aria-live="polite">{page} / {pageCount}</span>
						<button
							type="button"
							className="icon-btn"
							onClick={() => onPage(page - 1)}
							disabled={page <= 1 || loading}
							aria-label="Previous page"
						>
							<ChevronLeft />
						</button>
						<button
							type="button"
							className="icon-btn"
							onClick={() => onPage(page + 1)}
							disabled={page >= pageCount || loading}
							aria-label="Next page"
						>
							<ChevronRight />
						</button>
					</div>
				</div>
			</div>
		</section>
	);
}
