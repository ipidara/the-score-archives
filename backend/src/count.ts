import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const TMDB_API_KEY = process.env.TMDB_API_KEY;

if (!TMDB_API_KEY) {
  throw new Error('TMDB_API_KEY is not set');
}

type DiscoverMovie = {
  id: number;
  title: string;
};

type MovieDetails = {
  id: number;
  title: string;
  credits?: {
    crew?: Array<{
      job?: string;
      name?: string;
    }>;
  };
};

type BucketConfig = {
  label: string;
  pages: number;
  with_genres?: string;
};

type PlanResult = {
  plan: BucketConfig[];
  uniqueCandidates: number;
  eligibleTitles: number;
  skippedTitles: number;
  eligibleSamples: Array<{
    id: number;
    title: string;
    composers: string[];
    buckets: string[];
  }>;
};

const HARD_CAP = 1200;
const TARGET = 1000;

const CANDIDATE_PLANS: BucketConfig[][] = [
  [
    { label: 'Broad Popular', pages: 20 },
    { label: 'Sci-Fi', pages: 8, with_genres: '878' },
    { label: 'Animation', pages: 8, with_genres: '16' },
    { label: 'Thriller', pages: 8, with_genres: '53' },
    { label: 'Adventure', pages: 8, with_genres: '12' },
    { label: 'Drama', pages: 8, with_genres: '18' }
  ],
  [
    { label: 'Broad Popular', pages: 25 },
    { label: 'Sci-Fi', pages: 10, with_genres: '878' },
    { label: 'Animation', pages: 10, with_genres: '16' },
    { label: 'Thriller', pages: 10, with_genres: '53' },
    { label: 'Adventure', pages: 10, with_genres: '12' },
    { label: 'Drama', pages: 10, with_genres: '18' }
  ],
  [
    { label: 'Broad Popular', pages: 30 },
    { label: 'Sci-Fi', pages: 10, with_genres: '878' },
    { label: 'Animation', pages: 10, with_genres: '16' },
    { label: 'Thriller', pages: 10, with_genres: '53' },
    { label: 'Adventure', pages: 10, with_genres: '12' },
    { label: 'Drama', pages: 10, with_genres: '18' }
  ],
  [
    { label: 'Broad Popular', pages: 30 },
    { label: 'Sci-Fi', pages: 12, with_genres: '878' },
    { label: 'Animation', pages: 12, with_genres: '16' },
    { label: 'Thriller', pages: 12, with_genres: '53' },
    { label: 'Adventure', pages: 12, with_genres: '12' },
    { label: 'Drama', pages: 12, with_genres: '18' }
  ],
  [
    { label: 'Broad Popular', pages: 35 },
    { label: 'Sci-Fi', pages: 12, with_genres: '878' },
    { label: 'Animation', pages: 12, with_genres: '16' },
    { label: 'Thriller', pages: 12, with_genres: '53' },
    { label: 'Adventure', pages: 12, with_genres: '12' },
    { label: 'Drama', pages: 12, with_genres: '18' }
  ]
];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function uniqueStrings(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.map(v => (v ?? '').trim()).filter(Boolean))];
}

async function fetchDiscoverPage(page: number, withGenres?: string) {
  const response = await axios.get('https://api.themoviedb.org/3/discover/movie', {
    params: {
      api_key: TMDB_API_KEY,
      sort_by: 'popularity.desc',
      page,
      ...(withGenres ? { with_genres: withGenres } : {})
    }
  });

  return response.data as {
    page: number;
    total_pages: number;
    total_results: number;
    results: DiscoverMovie[];
  };
}

async function fetchMovieDetailsWithCredits(tmdbId: number): Promise<MovieDetails> {
  const response = await axios.get(`https://api.themoviedb.org/3/movie/${tmdbId}`, {
    params: {
      api_key: TMDB_API_KEY,
      append_to_response: 'credits'
    }
  });

  return response.data as MovieDetails;
}

function extractOriginalMusicComposers(details: MovieDetails): string[] {
  const crew = details.credits?.crew ?? [];

  return uniqueStrings(
    crew
      .filter(person => person.job === 'Original Music Composer')
      .map(person => person.name)
  );
}

async function collectPool(plan: BucketConfig[], delayMs = 150) {
  const pool = new Map<number, { id: number; title: string; buckets: string[] }>();

  for (const bucket of plan) {
    console.log(`Collecting ${bucket.label} pages 1-${bucket.pages}...`);

    for (let page = 1; page <= bucket.pages; page++) {
      const data = await fetchDiscoverPage(page, bucket.with_genres);

      for (const movie of data.results ?? []) {
        const existing = pool.get(movie.id);

        if (existing) {
          if (!existing.buckets.includes(bucket.label)) {
            existing.buckets.push(bucket.label);
          }
        } else {
          pool.set(movie.id, {
            id: movie.id,
            title: movie.title,
            buckets: [bucket.label]
          });
        }
      }

      await sleep(delayMs);
    }
  }

  return [...pool.values()];
}

async function evaluatePlan(plan: BucketConfig[], delayMs = 200): Promise<PlanResult> {
  const pool = await collectPool(plan, delayMs);

  let eligibleTitles = 0;
  let skippedTitles = 0;

  const eligibleSamples: Array<{
    id: number;
    title: string;
    composers: string[];
    buckets: string[];
  }> = [];

  for (const movie of pool) {
    try {
      const details = await fetchMovieDetailsWithCredits(movie.id);
      const composers = extractOriginalMusicComposers(details);

      if (composers.length > 0) {
        eligibleTitles++;

        if (eligibleSamples.length < 15) {
          eligibleSamples.push({
            id: movie.id,
            title: movie.title,
            composers,
            buckets: movie.buckets
          });
        }
      } else {
        skippedTitles++;
      }
    } catch {
      skippedTitles++;
    }

    await sleep(delayMs);
  }

  return {
    plan,
    uniqueCandidates: pool.length,
    eligibleTitles,
    skippedTitles,
    eligibleSamples
  };
}

function scorePlan(result: PlanResult) {
  const distance = Math.abs(result.eligibleTitles - TARGET);
  const overCapPenalty = result.eligibleTitles > HARD_CAP ? 100000 : 0;
  return distance + overCapPenalty;
}

async function main() {
  const allResults: PlanResult[] = [];

  for (const plan of CANDIDATE_PLANS) {
    console.log('\n==============================');
    console.log('Evaluating plan:');
    for (const bucket of plan) {
      console.log(
        `- ${bucket.label}: ${bucket.pages} pages` +
        (bucket.with_genres ? ` [genre=${bucket.with_genres}]` : '')
      );
    }

    const result = await evaluatePlan(plan);
    allResults.push(result);

    console.log(`Unique candidates: ${result.uniqueCandidates}`);
    console.log(`Eligible titles: ${result.eligibleTitles}`);
    console.log(`Skipped titles: ${result.skippedTitles}`);
    console.log(`Within hard cap (${HARD_CAP}): ${result.eligibleTitles <= HARD_CAP}`);
  }

  const best=[...allResults].sort((a, b) => scorePlan(a) - scorePlan(b))[0]!;

  console.log('\n===== BEST PLAN =====');
  for (const bucket of best.plan) {
    console.log(
      `- ${bucket.label}: ${bucket.pages} pages` +
      (bucket.with_genres ? ` [genre=${bucket.with_genres}]` : '')
    );
  }

  console.log(`\nUnique candidates: ${best.uniqueCandidates}`);
  console.log(`Eligible titles: ${best.eligibleTitles}`);
  console.log(`Skipped titles: ${best.skippedTitles}`);
  console.log(`Distance from target ${TARGET}: ${Math.abs(best.eligibleTitles - TARGET)}`);
  console.log(`Under hard cap ${HARD_CAP}: ${best.eligibleTitles <= HARD_CAP}`);

  console.log('\nSample eligible titles:');
  console.table(best.eligibleSamples);
}

main().catch(err => {
  console.error('Plan search failed:', err);
  process.exit(1);
});