import request from 'supertest';
import express from 'express';
import cors from 'cors';
import ingestRouter from '../routes/ingest.js';
import searchRouter from '../routes/search.js';

jest.mock('../services/postgres.js', () => ({
  insertFilm: jest.fn(),
  getFilmById: jest.fn()
}));

jest.mock('../services/opensearch', () => ({
  indexFilm: jest.fn(),
  searchFilms: jest.fn()
}));

// import mocked version
import { insertFilm, getFilmById } from '../services/postgres.js';
import { indexFilm, searchFilms } from '../services/opensearch.js';

// Cast to jest mock type so TypeScript knows these
// have .mockResolvedValue() and other mock methods
const mockInsertFilm  = insertFilm  as jest.MockedFunction<typeof insertFilm>;
const mockGetFilmById = getFilmById as jest.MockedFunction<typeof getFilmById>;
const mockIndexFilm   = indexFilm   as jest.MockedFunction<typeof indexFilm>;
const mockSearchFilms = searchFilms as jest.MockedFunction<typeof searchFilms>;

// minimal express app
const app = express();
app.use(express.json());
app.use(cors());
app.use('/ingest', ingestRouter);
app.use('/search', searchRouter);

// test data
const validFilm = {
  tmdb_id:      157336,
  title:        'Interstellar',
  year:         2014,
  directors:    ['Christopher Nolan'],
  composers:    ['Hans Zimmer'],
  film_genres:  ['Sci-Fi', 'Drama'],
  overview:     'A team of explorers travel through a wormhole in space.',
  poster_url:   'https://image.tmdb.org/t/p/w500/abc123.jpg',
  instruments:  ['pipe organ', 'strings', 'synth'],
  moods:        ['epic', 'emotional', 'atmospheric'],
  score_awards: ['Oscar Nomination Best Original Score']
};

// reset mocks
beforeEach(() => {
  jest.clearAllMocks();
});


// POST /ingest

describe('POST /ingest', () => {

  test('returns 201 and film data when valid film is ingested', async () => {
    // Tell the mocks to resolve successfully (simulate successful DB writes)
    mockInsertFilm.mockResolvedValue(undefined);
    mockIndexFilm.mockResolvedValue(undefined as any);

    const res = await request(app)
      .post('/ingest')
      .send(validFilm);

    expect(res.status).toBe(201);
    expect(res.body.message).toBe('Film ingested');
    expect(res.body.film.title).toBe('Interstellar');
    expect(res.body.film.tmdb_id).toBe(157336);
  });

  test('calls insertFilm and indexFilm with the film data', async () => {
    mockInsertFilm.mockResolvedValue(undefined);
    mockIndexFilm.mockResolvedValue(undefined as any);

    await request(app)
      .post('/ingest')
      .send(validFilm);

    // Verify your route actually called both database functions
    expect(mockInsertFilm).toHaveBeenCalledTimes(1);
    expect(mockIndexFilm).toHaveBeenCalledTimes(1);
    expect(mockInsertFilm).toHaveBeenCalledWith(expect.objectContaining({
      tmdb_id: 157336,
      title: 'Interstellar'
    }));
  });

  test('returns 400 when tmdb_id is missing', async () => {
    const { tmdb_id, ...filmWithoutId } = validFilm;

    const res = await request(app)
      .post('/ingest')
      .send(filmWithoutId);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/tmdb_id/);
  });

  test('returns 400 when title is missing', async () => {
    const { title, ...filmWithoutTitle } = validFilm;

    const res = await request(app)
      .post('/ingest')
      .send(filmWithoutTitle);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/title/);
  });

  test('returns 400 when composers is missing', async () => {
    const { composers, ...filmWithoutComposers } = validFilm;

    const res = await request(app)
      .post('/ingest')
      .send(filmWithoutComposers);

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/composers/);
  });

  test('returns 400 when body is empty', async () => {
    const res = await request(app)
      .post('/ingest')
      .send({});

    expect(res.status).toBe(400);
  });

  test('returns 500 when insertFilm throws', async () => {
    // Simulate a database failure
    mockInsertFilm.mockRejectedValue(new Error('Database connection lost'));

    const res = await request(app)
      .post('/ingest')
      .send(validFilm);

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  test('does not call indexFilm if insertFilm throws', async () => {
    mockInsertFilm.mockRejectedValue(new Error('Database connection lost'));

    await request(app)
      .post('/ingest')
      .send(validFilm);

    // If Postgres write fails, OpenSearch should not be called
    expect(mockIndexFilm).not.toHaveBeenCalled();
  });

  test('returns 500 when indexFilm throws', async () => {
    mockInsertFilm.mockResolvedValue(undefined);
    mockIndexFilm.mockRejectedValue(new Error('OpenSearch unavailable'));

    const res = await request(app)
      .post('/ingest')
      .send(validFilm);

    expect(res.status).toBe(500);
  });

});

// GET /search
describe('GET /search', () => {

  test('returns 200 with results array for a valid query', async () => {
  mockSearchFilms.mockResolvedValue({
    results: [validFilm], total: 1, page: 1, limit: 20, pages: 1
  } as any);

  const res = await request(app).get('/search?q=zimmer');

  expect(res.status).toBe(200);
  expect(res.body.results).toBeInstanceOf(Array);
  expect(res.body.count).toBe(1);
  expect(res.body.results[0].title).toBe('Interstellar');
});

  test('passes the query string to searchFilms', async () => {
  mockSearchFilms.mockResolvedValue({
    results: [], total: 0, page: 1, limit: 20, pages: 0
  } as any);

  await request(app).get('/search?q=hans zimmer epic');

  expect(mockSearchFilms).toHaveBeenCalledWith('hans zimmer epic', 1, 20);
});

  test('uses empty string when no query param is provided', async () => {
  mockSearchFilms.mockResolvedValue({
    results: [], total: 0, page: 1, limit: 20, pages: 0
  } as any);

  await request(app).get('/search');

  expect(mockSearchFilms).toHaveBeenCalledWith('', 1, 20);
});

  test('returns count matching results length', async () => {
  const twoFilms = [validFilm, { ...validFilm, tmdb_id: 999, title: 'Dune' }];
  mockSearchFilms.mockResolvedValue({
    results: twoFilms, total: 2, page: 1, limit: 20, pages: 1
  } as any);

  const res = await request(app).get('/search?q=epic');

  expect(res.body.count).toBe(2);
  expect(res.body.results).toHaveLength(2);
});

  test('returns 200 with empty results when nothing matches', async () => {
  mockSearchFilms.mockResolvedValue({
    results: [], total: 0, page: 1, limit: 20, pages: 0
  } as any);

  const res = await request(app).get('/search?q=xyznonexistent');

  expect(res.status).toBe(200);
  expect(res.body.count).toBe(0);
  expect(res.body.results).toEqual([]);
});

  test('returns 500 when searchFilms throws', async () => {
    mockSearchFilms.mockRejectedValue(new Error('OpenSearch unavailable'));

    const res = await request(app).get('/search?q=zimmer');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

});

// GET /search/film/:id
describe('GET /search/film/:id', () => {

  test('returns 200 with film data when film exists', async () => {
    mockGetFilmById.mockResolvedValue(validFilm as any);

    const res = await request(app).get('/search/film/1');

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Interstellar');
    expect(res.body.tmdb_id).toBe(157336);
  });

  test('calls getFilmById with the correct numeric id', async () => {
    mockGetFilmById.mockResolvedValue(validFilm as any);

    await request(app).get('/search/film/42');

    expect(mockGetFilmById).toHaveBeenCalledWith(42);
  });

  test('returns 404 when film does not exist', async () => {
    // getFilmById returns undefined when no row is found
    mockGetFilmById.mockResolvedValue(undefined);

    const res = await request(app).get('/search/film/99999');

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('Not found');
  });

  test('returns 500 when getFilmById throws', async () => {
    mockGetFilmById.mockRejectedValue(new Error('Database connection lost'));

    const res = await request(app).get('/search/film/1');

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  test('passes id as a number not a string to getFilmById', async () => {
    mockGetFilmById.mockResolvedValue(validFilm as any);

    await request(app).get('/search/film/7');

    // Route params come in as strings — your route converts with Number()
    // This test verifies that conversion happens correctly
    expect(mockGetFilmById).toHaveBeenCalledWith(7);
    expect(typeof mockGetFilmById.mock.calls[0]![0]).toBe('number');
  });

});