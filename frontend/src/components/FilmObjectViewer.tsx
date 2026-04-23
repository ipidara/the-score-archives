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

type FilmObjectViewerProps = {
  film: Film;
  onClick?: () => void;
};

export default function FilmObjectViewer({ film, onClick }: FilmObjectViewerProps) {
  return (
    <button className="film-card" onClick={onClick} type="button">
      <h3 className="film-title">{film.title}</h3>
      <div className="poster-wrap">
        {film.poster_url ? (
          <img src={film.poster_url} alt="" className="poster" />
        ) : (
          <div className="poster-placeholder" aria-hidden="true" />
        )}
      </div>
    </button>
  );
}
