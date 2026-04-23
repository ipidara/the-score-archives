// handles postgres functions, create table, write to, and read from
// no need to update or delete films from database, just search them

import { Pool } from 'pg';
import { type Film } from '../types/film.js';

const pool = new Pool({
  connectionString: process.env.PG_CONNECTION_STRING,
  ssl: { rejectUnauthorized: false }
});

// create table 
export async function createTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS films (
    id SERIAL PRIMARY KEY,
    tmdb_id INTEGER UNIQUE NOT NULL,
    title TEXT NOT NULL,
    year INTEGER,
    directors TEXT[],
    composers TEXT[],
    film_genres TEXT[],
    overview TEXT,
    poster_url TEXT,
    instruments TEXT,
    score_awards TEXT[],
    moods TEXT[],
    created_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

export async function insertFilm(film: Film) {
  const { tmdb_id, title, year, directors, composers, film_genres, overview, poster_url, instruments, score_awards, moods } = film

  await pool.query (`
    INSERT INTO films (tmdb_id, title, year, directors, composers, film_genres, overview, poster_url, instruments, score_awards, moods)

    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)

    ON CONFLICT (tmdb_id) DO NOTHING`,
    [tmdb_id, title, year, directors, composers, film_genres, overview, poster_url, instruments, score_awards, moods]
    );
}

export async function getFilmById(id: number) {
  const result = await pool.query(`SELECT * FROM films WHERE id = $1`, [id]);
  return result.rows[0];
}