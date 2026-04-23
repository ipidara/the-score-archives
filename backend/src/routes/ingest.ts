import { Router } from 'express';
import { insertFilm } from '../services/postgres.js';
import { indexFilm } from '../services/opensearch.js';
import { type Film } from '../types/film.js';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const film: Film = req.body;

    // Basic validation
    if (!film.tmdb_id || !film.title || !film.composers) {
      return res.status(400).json({ error: 'tmdb_id, title, and composers are required' });
    }

    await insertFilm(film);   // put in postgres
    await indexFilm(film);    // index in opensearch

    res.status(201).json({ message: 'Film ingested', film });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;