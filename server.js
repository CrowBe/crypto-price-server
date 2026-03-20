'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const Pusher = require('pusher');
const { fetchPrices } = require('./priceService');

// Validate required environment variables at startup
const REQUIRED_ENV = ['PUSHER_ID', 'PUSHER_KEY', 'PUSHER_SECRET', 'PUSHER_CLUSTER'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

const PORT = parseInt(process.env.PORT, 10) || 5000;
const FETCH_INTERVAL_MS = parseInt(process.env.FETCH_INTERVAL_MS, 10) || 60_000;

// CORS_ORIGIN can be a comma-separated list of allowed origins.
// If unset, all origins are allowed (development default — restrict in production).
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim())
  : undefined;

const pusher = new Pusher({
  appId: process.env.PUSHER_ID,
  key: process.env.PUSHER_KEY,
  secret: process.env.PUSHER_SECRET,
  cluster: process.env.PUSHER_CLUSTER,
  useTLS: true,
});

const app = express();

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cors(corsOrigins ? { origin: corsOrigins } : {}));

// ISO timestamp of the last successful scheduled price fetch
let lastFetchedAt = null;

/**
 * Fetch prices and broadcast via Pusher. Logs errors but never throws,
 * so a failing interval does not crash the process.
 */
async function fetchAndBroadcast() {
  try {
    const prices = await fetchPrices();
    await pusher.trigger('coin-prices', 'prices', prices);
    lastFetchedAt = new Date().toISOString();
    console.log(`Prices broadcast at ${lastFetchedAt}`);
  } catch (err) {
    console.error('Scheduled fetch/broadcast failed:', err.message);
  }
}

// Start the scheduled fetch (first run is immediate)
function startScheduler() {
  fetchAndBroadcast();
  return setInterval(fetchAndBroadcast, FETCH_INTERVAL_MS);
}

app.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'crypto-price-server', lastFetchedAt });
});

// Manual override: accepts a price payload and broadcasts it directly via Pusher.
// Useful for testing and local dev without a running schedule.
app.post('/prices/new', async (req, res, next) => {
  const body = req.body;

  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
    return res.status(400).json({ error: 'Request body must be a non-empty JSON object' });
  }

  try {
    await pusher.trigger('coin-prices', 'prices', body);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

if (require.main === module) {
  startScheduler();
  app.listen(PORT, () => {
    console.log(`Crypto Price Server listening on port ${PORT}`);
  });
}

module.exports = { app, startScheduler, fetchAndBroadcast };
