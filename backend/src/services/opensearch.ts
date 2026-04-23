import 'dotenv/config';
import { Client } from '@opensearch-project/opensearch';
import { type Film } from '../types/film.js';

// console.log('BONSAI_URL:', process.env.BONSAI_URL);

const client = new Client({
  node: process.env.BONSAI_URL!
});

// try {
//   const info = await client.info();
//   console.log('All is well:', info.body ?? info);
// } catch (err) {
//   console.error('Cluster connection error:', err);
// }

export async function createIndex() {
  const exists = await client.indices.exists({ index: 'films' });
  
  if (!exists.body) {
    await client.indices.create({
      index: 'films',
      body: {
        mappings: {
          properties: {
            id:            { type: 'integer' },
            tmdb_id:       { type: 'integer' },
            year:          { type: 'integer' },

            title: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            directors: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            composers: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            overview: {
              type: 'text'
            },
            poster_url: {
              type: 'keyword'
            },

            film_genres: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            instruments: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            score_awards: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' }
              }
            },
            moods: {
              type: 'text',
              fields: {
                keyword: { type: 'keyword' }
              }
            }
          }
        }
      }
    });
    console.log('Created films index');
  } else {
    console.log('films index already exists');
  }
}

export async function searchFilms(query: string, page = 1, limit = 20) {
  const trimmed = query.trim();
  const safePage = Math.max(1, Math.floor(page) || 1);
  const safeLimit = Math.min(100, Math.max(1, Math.floor(limit) || 20));
  const from = (safePage - 1) * safeLimit;

  const response = await client.search({
    index: 'films',
    body: {
      from,
      size: safeLimit,
      query: trimmed
        ? {
            bool: {
              should: [
                {
                  match: {
                    composers: {
                      query: trimmed,
                      boost: 8
                    }
                  }
                },
                {
                  match: {
                    title: {
                      query: trimmed,
                      boost: 6
                    }
                  }
                },
                {
                  match: {
                    moods: {
                      query: trimmed,
                      boost: 7
                    }
                  }
                },
                {
                  match: {
                    instruments: {
                      query: trimmed,
                      boost: 5
                    }
                  }
                },
                {
                  match: {
                    film_genres: {
                      query: trimmed,
                      boost: 3
                    }
                  }
                },
                {
                  match: {
                    overview: {
                      query: trimmed,
                      boost: 1
                    }
                  }
                }
              ],
              minimum_should_match: 1
            }
          }
        : {
            match_all: {}
          }
    }
  });

  const rawTotal = response.body.hits.total;
  const total = typeof rawTotal === 'number' ? rawTotal : rawTotal?.value ?? 0;

  return {
    results: response.body.hits.hits.map((hit: any) => hit._source),
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.max(1, Math.ceil(total / safeLimit))
  };
}

export async function indexFilm(film: Film) {
  await client.index({
    index: 'films',
    id: film.tmdb_id.toString(),
    body: film
  });
}