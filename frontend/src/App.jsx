import { useCallback, useRef, useState } from 'react';
import Header from './components/Header.jsx';
import Hero from './components/Hero.jsx';
import SearchCard from './components/SearchCard.jsx';
import FacultyDirectory from './components/FacultyDirectory.jsx';
import { Eraser, Pencil, BinderClip } from './components/Decor.jsx';
import { useFilterOptions, useProfessors, useStats } from './hooks/useApi.js';
import { useAuth } from './hooks/useAuth.jsx';

const EMPTY_FILTERS = { q: '', college: '', department: '', designation: '' };

export default function App() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const searchInput = useRef(null);
  const directoryHeading = useRef(null);

  const options = useFilterOptions();
  const stats = useStats();
  const { user, status: authStatus, authError, dismissAuthError, hasAccess } = useAuth();
  const { rows, total, pageSize, loading, error, retry } = useProfessors(
    filters,
    page,
    // Profile links differ per viewer: guests and not-yet-verified users get Google searches, verified users direct links.
    `${user?.id ?? 'guest'}:${hasAccess ? 'access' : 'none'}`,
    authStatus === 'ready',
  );

  // Any filter change goes back to page 1.
  const updateFilters = useCallback((patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const changePage = (next) => {
    setPage(next);
    directoryHeading.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const startSearching = () => {
    document.getElementById('search')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    searchInput.current?.focus({ preventScroll: true });
  };

  return (
    <div className="page">
      <Header />
      {authError && (
        <div className="notice" role="alert">
          <span>{authError}</span>
          <button type="button" className="link-btn" onClick={dismissAuthError}>Dismiss</button>
        </div>
      )}
      <main>
        <Hero onStart={startSearching} />

        <div className="content">
          <Pencil className="side-pencil" />
          <BinderClip className="side-clip" />
          <Eraser className="side-eraser" />
          <div className="notebook" aria-hidden="true" />

          <div className="content-inner">
            <SearchCard
              filters={filters}
              options={options}
              onChange={updateFilters}
              onClear={clearFilters}
              inputRef={searchInput}
            />
            <FacultyDirectory
              rows={rows}
              total={total}
              page={page}
              pageSize={pageSize}
              loading={loading}
              error={error}
              stats={stats}
              onPage={changePage}
              onRetry={retry}
              onClear={clearFilters}
              headingRef={directoryHeading}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
