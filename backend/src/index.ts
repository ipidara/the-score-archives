import express from 'express';
import dotenv from 'dotenv';
import { createTable } from './services/postgres.js';
import { createIndex } from './services/opensearch.js';
import ingestRouter from './routes/ingest.js';
import searchRouter from './routes/search.js';
import cors from 'cors';

dotenv.config(); // make dotenv accessible
const app = express(); // create app object
app.use(express.json()); // ensure json is parsed

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

app.use(cors({ origin: allowedOrigins }));

app.use('/ingest', ingestRouter);
app.use('/search', searchRouter);

async function start() {
  await createTable();
  await createIndex();
  app.listen(process.env.PORT, () => {
    console.log(`Running on port ${process.env.PORT}`);
  });
}

start();