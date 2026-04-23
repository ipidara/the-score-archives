import 'dotenv/config';

import axios from 'axios';
import OpenAI from 'openai';

import { createTable, insertFilm } from '../services/postgres.js';
import { createIndex, indexFilm } from '../services/opensearch.js';
import { type Film } from '../types/film.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TMDB_API_KEY) throw new Error('TMDB_API_KEY is not set');
if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// 
// TYPES
// 
// fields needed from API responses from tmdb, wikidata, and openai
//

// TMDB: movie object for tmdb's discover request
type DiscoverMovie = {
  id: number;
  title: string;
};

// TMDB: movie object for tmdb's individual movie
type MovieDetails = {
  id: number;
  title?: string;
  release_date?: string;
  overview?: string;
  poster_path?: string | null;
  genres?: Array<{ id: number; name: string }>;
  external_ids?: { imdb_id?: string | null };
  credits?: {
    crew?: Array<{ job?: string; name?: string }>;
  };
};

// WIKIDATA
type Awards = { score_awards: string[] };

// OPENAI
type GenTags = { moods: string[]; instruments: string[] };

// TMDB: with_genres: id for that genre
type BucketConfig = { label: string; pages: number; with_genres?: string };

const ingestion: BucketConfig[] = [
  { label: 'Broad Popular', pages: 35 },// 35
  { label: 'Sci-Fi',        pages: 12, with_genres: '878' }, //12
  { label: 'Animation',     pages: 12, with_genres: '16'  },
  { label: 'Thriller',      pages: 12, with_genres: '53'  },
  { label: 'Adventure',     pages: 12, with_genres: '12'  },
  { label: 'Drama',         pages: 12, with_genres: '18'  },
  { label: 'Action',        pages: 12, with_genres: '28'  },
  { label: 'Mystery',       pages: 12, with_genres: '9648'}
];

//
// HELPERS
//

// rate limiter for api requests
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// trim whitespace, ensure strings are not empty, remove duplicates with set, return unique strings only
function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map(v => (v ?? '').trim()).filter(Boolean))];
}

// how tmdb needs image urls built
function buildPosterUrl(posterPath?: string | null): string {
  return posterPath ? `https://image.tmdb.org/t/p/w500${posterPath}` : '';
}

async function fetchDiscoverPage(page: number, withGenres?: string) {
  const response = await axios.get('https://api.themoviedb.org/3/discover/movie', {
    params: {
      api_key: TMDB_API_KEY,
      sort_by: 'popularity.desc',
      page,
      // if genre id exists, use it, otherwise, don't
      ...(withGenres ? { with_genres: withGenres } : {})
    }
  });

  return response.data as {
    page: number;
    total_pages: number;
    results: DiscoverMovie[];
  };
}

async function collectPool(delayMs = 120) {
  // create pool w/out duplicates; tmdb id twice to ensure easy access
  const pool = new Map<number, { id: number; title: string; buckets: string[] }>();

  for (const bucket of ingestion) { // each genre bucket
    console.log(`Collecting ${bucket.label} pages 1-${bucket.pages}...`);

    for (let page = 1; page <= bucket.pages; page++) { // each page in genre bucket
      const data = await fetchDiscoverPage(page, bucket.with_genres);

      // if movies not found, then empty array
      for (const movie of data.results ?? []) { // each film in page in bucket
        const existing = pool.get(movie.id);

        // if movie, then add to bucket label 
        if (existing) {
          if (!existing.buckets.includes(bucket.label)) {
            existing.buckets.push(bucket.label);
          }
        } else {
          pool.set(movie.id, { id: movie.id, title: movie.title, buckets: [bucket.label] });
        }
      }
      await sleep(delayMs);
    }
  }
  return [...pool.values()];
}

async function fetchMovieDetails(tmdbId: number): Promise<MovieDetails> {
  const response = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
    params: { api_key: TMDB_API_KEY, append_to_response: 'credits,external_ids' }
  });

  return response.data as MovieDetails;
}

function extractDirectors(details: MovieDetails): string[] {
  return uniqueStrings(
    (details.credits?.crew ?? [])
      .filter(p => p.job === 'Director')
      .map(p => p.name)
  );
}

function extractComposers(details: MovieDetails): string[] {
  return uniqueStrings(
    (details.credits?.crew ?? [])
      .filter(p => p.job === 'Original Music Composer')
      .map(p => p.name)
  );
}

const MUSIC_KEYWORDS = ['music', 'score', 'soundtrack', 'composer', 'original song'];

async function fetchWikidataAwards(imdbId?: string | null): Promise<Awards> {
  if (!imdbId) return { score_awards: [] };

  const query = `
    SELECT ?awardLabel ?nominationLabel WHERE {
      ?film wdt:P345 "${imdbId}".
      OPTIONAL { ?film wdt:P166 ?award. }
      OPTIONAL { ?film wdt:P1411 ?nomination. }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
    }
  `;

  try {
    const response = await axios.get('https://query.wikidata.org/sparql', {
      params: { format: 'json', query },
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': 'leitmotif-app/1.0'
      },
      timeout: 8000
    });

    const bindings = response.data?.results?.bindings ?? [];
    const awards = uniqueStrings([
      ...bindings.map((b: any) => b.awardLabel?.value),
      ...bindings.map((b: any) =>
        b.nominationLabel?.value ? `${b.nominationLabel.value} nomination` : undefined
      )
    ]).filter(award =>
      MUSIC_KEYWORDS.some(kw => award.toLowerCase().includes(kw))
    );

    return { score_awards: awards };
  } catch {
    console.warn(`Wikidata awards lookup failed for IMDb ID ${imdbId}`);
    return { score_awards: [] };
  }
}

async function generateTags(input: {
  title: string;
  overview: string;
  filmGenres: string[];
  composers: string[];
}): Promise<GenTags> {
  const prompt = `
You are tagging film scores for a soundtrack search app.
Return ONLY valid raw JSON. No markdown. No explanation.
Do not invent awards. Do not mention leitmotifs. Do not return empty strings.

Title: ${input.title}
Overview: ${input.overview}
Film genres: ${input.filmGenres.join(', ') || 'Unknown'}
Composer(s): ${input.composers.join(', ') || 'Unknown'}

Return exactly this shape:
{
  "moods": ["3 to 5 concise mood descriptors"],
  "instruments": ["3 to 5 likely instruments or sonic textures"]
}
`.trim();

  try {
    const response = await openai.responses.create({
      model: 'gpt-5-mini',
      input: prompt
    });

    const text = response.output_text?.trim() ?? '';
    const parsed = JSON.parse(text);

    return {
      moods: Array.isArray(parsed.moods) ? uniqueStrings(parsed.moods) : [],
      instruments: Array.isArray(parsed.instruments) ? uniqueStrings(parsed.instruments) : []
    };
  } catch {
    console.warn(`OpenAI tag generation failed for "${input.title}"`);
    return { moods: [], instruments: [] };
  }
}

async function seed() {
  await createTable();
  await createIndex();

  const pool = await collectPool();
  console.log(`Collected ${pool.length} unique candidate films...`);

  let inserted = 0;
  let skipped = 0;

  for (const candidate of pool) {
    try {
      const details = await fetchMovieDetails(candidate.id);
      const directors = extractDirectors(details);
      const composers = extractComposers(details);

      if (composers.length === 0) {
        skipped++;
        console.log(`- Skipping "${details.title ?? candidate.title}": no TMDB Original Music Composer`);
        continue;
      }

      const filmGenres = uniqueStrings(details.genres?.map(g => g.name) ?? []);
      const awardsData = await fetchWikidataAwards(details.external_ids?.imdb_id);
      const genTags = await generateTags({
        title: details.title ?? '',
        overview: details.overview ?? '',
        filmGenres,
        composers
      });

      const film: Film = {
        tmdb_id: candidate.id,
        title: details.title ?? '',
        year: parseInt(details.release_date?.split('-')?.[0] ?? '0', 10) || 0,
        directors,
        composers,
        film_genres: filmGenres,
        overview: details.overview ?? '',
        poster_url: buildPosterUrl(details.poster_path),
        instruments: genTags.instruments,
        moods: genTags.moods,
        score_awards: awardsData.score_awards
      };

      await insertFilm(film);
      await indexFilm(film);

      inserted++;
      console.log(`✓ ${film.title} (${film.year})`);
      await sleep(250);
    } catch (error) {
      console.error(`✗ Failed for tmdb_id ${candidate.id}:`, error);
    }
  }

  console.log(`Done. Inserted: ${inserted}. Skipped: ${skipped}.`);
}

seed().catch(error => {
  console.error('Seed failed:', error);
  process.exit(1);
});