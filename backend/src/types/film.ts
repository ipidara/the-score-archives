// film object definition

export interface Film {
  // for the film itself
  id?: number;
  tmdb_id: number;
  title: string;
  year: number;
  directors: string[];
  composers: string[];
  film_genres: string[];
  overview: string;
  poster_url: string;

  // for the score
  instruments: string[];
  score_awards: string[];
  moods: string[];
} 