import { Router } from 'express';
import { searchFilms } from '../services/opensearch.js';
import { getFilmById } from '../services/postgres.js';

const router = Router();

// GET /search?q=dark moody orchestral hans zimmer&page=1&limit=20
router.get('/', async (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const page =
    typeof req.query.page === 'string' ? parseInt(req.query.page, 10) : 1;
  const limit =
    typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 20;

  try {
    const data = await searchFilms(q, page, limit);
    res.json({
      results: data.results,
      count: data.results.length,
      total: data.total,
      page: data.page,
      limit: data.limit,
      pages: data.pages
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /search/film/42
router.get('/film/:id', async (req, res) => {
  try {
    const film = await getFilmById(Number(req.params.id));
    if (!film) {
      return res.status(404).json({ error: 'Not found' });
    }
    res.json(film);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;