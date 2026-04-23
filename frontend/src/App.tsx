import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes } from 'react-router-dom';
import { motion, useScroll, useTransform } from 'motion/react';
import FilmObjectViewer from './components/FilmObjectViewer';
import './App.css';

type Film = {
  tmdb_id: number;
  title: string;
  year: number;
  directors: string[];
  composers: string[];
  film_genres: string[];
  overview: string;
  poster_url: string;
  instruments: string[];
  moods: string[];
  score_awards: string[];
};

type SearchResponse = {
  results: Film[];
  count: number;
  total: number;
  page: number;
  limit: number;
  pages: number;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;
const PAGE_SIZE = 20;
const PREFETCH_PX = 600;

function HomePage() {
  return (
    <main className="home-page">
      <section className="home-hero" aria-label="Leitmotif intro">
        <img className="hero-ear" src="/ear.svg" alt="Textured ear symbol" />

        <div className="hero-copy">
          <h1>THE SCORE ARCHIVES</h1>
          <p>find films by how they sound.</p>
          <Link to="/discover" className="discover-link">
            discover
          </Link>
        </div>
      </section>
    </main>
  );
}

function FilmModal({ film, onClose }: { film: Film; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${film.title} details`}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button
          className="modal-close"
          onClick={onClose}
          aria-label="Close details"
          type="button"
        >
          ×
        </button>
        <div className="modal-body">
          {film.poster_url ? (
            <img src={film.poster_url} alt="" className="modal-poster" />
          ) : (
            <div className="modal-poster modal-poster-placeholder" aria-hidden="true" />
          )}
          <div className="modal-details">
            <h2>
              {film.title} ({film.year})
            </h2>
            <p>
              <strong>Composer:</strong> {film.composers.join(', ') || 'Unknown'}
            </p>
            <p>
              <strong>Director:</strong> {film.directors.join(', ') || 'Unknown'}
            </p>
            <p>
              <strong>Genres:</strong> {film.film_genres.join(', ') || 'Unknown'}
            </p>
            <p>
              <strong>Moods:</strong> {film.moods.join(', ') || 'None'}
            </p>
            <p>
              <strong>Instruments:</strong> {film.instruments.join(', ') || 'None'}
            </p>
            {film.score_awards.length > 0 && (
              <p>
                <strong>Awards:</strong> {film.score_awards.join(', ')}
              </p>
            )}
            <p className="overview">{film.overview}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function DiscoverPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Film[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFilm, setSelectedFilm] = useState<Film | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [fellBack, setFellBack] = useState(false);
  const [searchVersion, setSearchVersion] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollX } = useScroll({ container: scrollRef });
  const recordRotate = useTransform(scrollX, [0, 1500], [0, -360], { clamp: false });

  // Refs so scroll listener always sees latest values for infinite-scroll trigger
  const pageRef = useRef(1);
  const pagesRef = useRef(0);
  const loadingMoreRef = useRef(false);
  const activeQueryRef = useRef('');
  pageRef.current = page;
  pagesRef.current = pages;
  activeQueryRef.current = activeQuery;

  async function fetchPage(q: string, pageNum: number): Promise<SearchResponse> {
    if (!API_BASE_URL) {
      throw new Error('Missing VITE_API_BASE_URL configuration.');
    }
    const res = await fetch(
      `${API_BASE_URL}/search?q=${encodeURIComponent(q)}&page=${pageNum}&limit=${PAGE_SIZE}`
    );
    if (!res.ok) {
      throw new Error(`Search failed: ${res.status}`);
    }
    return res.json();
  }

  function applyFresh(data: SearchResponse) {
    const safeResults = data.results ?? [];
    const safeTotal =
      typeof data.total === 'number' ? data.total : safeResults.length;
    const safeLimit = data.limit && data.limit > 0 ? data.limit : PAGE_SIZE;
    const safePages =
      typeof data.pages === 'number'
        ? data.pages
        : Math.max(1, Math.ceil(safeTotal / safeLimit));
    const safePage = data.page ?? 1;
    setResults(safeResults);
    setTotal(safeTotal);
    setPages(safePages);
    setPage(safePage);
    pageRef.current = safePage;
    pagesRef.current = safePages;
  }

  async function loadMore() {
    if (loadingMoreRef.current) return;
    const next = pageRef.current + 1;
    if (next > pagesRef.current) return;

    loadingMoreRef.current = true;
    try {
      const data = await fetchPage(activeQueryRef.current, next);
      const newOnes = data.results ?? [];
      if (newOnes.length === 0) {
        pagesRef.current = pageRef.current;
        setPages(pageRef.current);
        return;
      }
      setResults((prev) => [...prev, ...newOnes]);
      const advancedTo = data.page ?? next;
      setPage(advancedTo);
      pageRef.current = advancedTo;
      if (typeof data.total === 'number') setTotal(data.total);
      if (typeof data.pages === 'number') {
        setPages(data.pages);
        pagesRef.current = data.pages;
      }
    } catch {
      // silent — leave existing reel in place
    } finally {
      loadingMoreRef.current = false;
    }
  }

  // Reset scroll position only on a NEW search (not on background appends)
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollLeft = 0;
    setCanScrollLeft(false);
    const raf = requestAnimationFrame(() => {
      container.scrollLeft = 0;
      setCanScrollLeft(false);
    });
    return () => cancelAnimationFrame(raf);
  }, [searchVersion]);

  // Track scroll state and trigger infinite-scroll prefetch on every results change
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;

    const update = () => {
      setCanScrollLeft(container.scrollLeft > 1);
      const distanceToEnd =
        container.scrollWidth - (container.scrollLeft + container.clientWidth);
      setCanScrollRight(distanceToEnd > 1);

      if (
        distanceToEnd < PREFETCH_PX &&
        !loadingMoreRef.current &&
        pageRef.current < pagesRef.current
      ) {
        loadMore();
      }
    };

    update();
    container.addEventListener('scroll', update, { passive: true });

    const ro = new ResizeObserver(update);
    ro.observe(container);
    Array.from(container.children).forEach((child) => ro.observe(child));

    return () => {
      container.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [results, hasSearched]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setHasSearched(true);
    setSearchVersion((v) => v + 1);
    const trimmed = query.trim();
    setSearchedQuery(trimmed);

    try {
      const data = await fetchPage(query, 1);

      const totalForQuery =
        typeof data.total === 'number' ? data.total : data.results?.length ?? 0;

      if (trimmed && totalForQuery === 0) {
        setFellBack(true);
        setActiveQuery('');
        activeQueryRef.current = '';
        const fallback = await fetchPage('', 1);
        applyFresh(fallback);
      } else {
        setFellBack(false);
        setActiveQuery(query);
        activeQueryRef.current = query;
        applyFresh(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setResults([]);
      setTotal(0);
      setPage(1);
      setPages(0);
      pageRef.current = 1;
      pagesRef.current = 0;
      setSearchedQuery('');
      setFellBack(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`discover-page ${hasSearched ? 'is-active' : 'is-initial'}`}>
      <div className="record-wrapper" aria-hidden="true">
        <motion.img
          src="/full-record.svg"
          className="record-img"
          style={{ rotate: recordRotate }}
          alt=""
        />
      </div>

      <header className="discover-head">
        <Link to="/" className="home-link" aria-label="Go back to home page">
          THE SCORE ARCHIVES
        </Link>
        <p>find films by composer, mood, instrumentation, film genre, or title</p>
      </header>

      <section className="search-area">
        <form onSubmit={handleSearch} className="search-form">
          <span className="search-hint">
            try something like… zimmer, dark orchestral, light piano, or comedy
          </span>
          <div className="search-input-wrap">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="search-input"
              aria-label="Search films"
              autoFocus
            />
            <button
              type="submit"
              disabled={loading}
              className="search-submit"
              aria-label="Search"
            >
              {loading ? (
                <span className="search-submit-dots">…</span>
              ) : (
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" />
                </svg>
              )}
            </button>
          </div>
        </form>

        {(error || hasSearched) && (
          <p className="result-meta" role="status">
            {error
              ? error
              : fellBack
                ? `no results for "${searchedQuery}" — showing all ${total} film${total === 1 ? '' : 's'} instead`
                : !searchedQuery
                  ? `${total} film${total === 1 ? '' : 's'} available`
                  : `${total} result${total === 1 ? '' : 's'} for "${searchedQuery}"`}
          </p>
        )}
        {!error && results.length > 0 && (
          <p className="result-hint">click on a film to view more</p>
        )}
      </section>

      <div className="results-strip-wrap">
        <button
          type="button"
          className={`strip-nav strip-nav-prev${canScrollLeft ? ' is-visible' : ''}`}
          onClick={() =>
            scrollRef.current?.scrollBy({
              left: -scrollRef.current.clientWidth * 0.6,
              behavior: 'smooth',
            })
          }
          aria-label="Scroll left"
          aria-hidden={!canScrollLeft}
          tabIndex={canScrollLeft ? 0 : -1}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M11 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="results-strip" ref={scrollRef} aria-label="Search results">
          {results.length > 0
            ? results.map((film) => (
                <FilmObjectViewer
                  key={film.tmdb_id}
                  film={film}
                  onClick={() => setSelectedFilm(film)}
                />
              ))
            : Array.from({ length: 8 }, (_, i) => (
                <div key={i} className="poster-slot" aria-hidden="true" />
              ))}
        </div>
        <button
          type="button"
          className={`strip-nav strip-nav-next${canScrollRight ? ' is-visible' : ''}`}
          onClick={() =>
            scrollRef.current?.scrollBy({
              left: scrollRef.current.clientWidth * 0.6,
              behavior: 'smooth',
            })
          }
          aria-label="Scroll right"
          aria-hidden={!canScrollRight}
          tabIndex={canScrollRight ? 0 : -1}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {selectedFilm && (
        <FilmModal film={selectedFilm} onClose={() => setSelectedFilm(null)} />
      )}
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/discover" element={<DiscoverPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
