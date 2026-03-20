# Crypto Price Server

A lightweight Express server that fetches real-time cryptocurrency prices on a schedule and broadcasts them to subscribers via [Pusher Channels](https://pusher.com/channels).

## Architecture

```
Express Server ──fetches──► CoinGecko API
      │                     (CryptoCompare fallback)
      │
      └──trigger──► Pusher (coin-prices / prices)
                        │
                        ▼
           All subscribed PWA clients
           (display their chosen currency)
```

The server **owns the full fetch-and-broadcast cycle**. The companion PWA acts as a passive subscriber only — it never POSTs prices to the server.

On startup the server immediately fetches prices, then repeats on the configured interval (default 60 s). The PWA may also perform a single direct API fetch on load for a fast initial render, but all ongoing updates come through Pusher.

## Requirements

- Node.js >= 18.0.0
- A [Pusher Channels](https://dashboard.pusher.com) account

## Setup

1. **Clone and install dependencies**

   ```bash
   git clone <repo-url>
   cd crypto-price-server
   npm install
   ```

2. **Configure environment variables**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` with your Pusher credentials. Add CoinGecko / CryptoCompare API keys to increase rate limits (optional but recommended).

3. **Start the server**

   ```bash
   npm start          # production
   npm run dev        # development (auto-restarts on file changes)
   ```

## Environment Variables

| Variable                | Required | Default  | Description |
|------------------------|----------|----------|-------------|
| `PUSHER_ID`            | Yes      | —        | Pusher application ID |
| `PUSHER_KEY`           | Yes      | —        | Pusher application key |
| `PUSHER_SECRET`        | Yes      | —        | Pusher application secret |
| `PUSHER_CLUSTER`       | Yes      | —        | Pusher cluster region (e.g. `us2`, `eu`) |
| `PORT`                 | No       | `5000`   | HTTP port to listen on |
| `CORS_ORIGIN`          | No       | `*`      | Comma-separated list of allowed origins. **Set this in production.** |
| `COINGECKO_API_KEY`    | No       | —        | Demo API key — raises rate limit from 30 to 500 req/min |
| `CRYPTOCOMPARE_API_KEY`| No       | —        | Fallback provider key (recommended) |
| `FETCH_INTERVAL_MS`    | No       | `60000`  | Price fetch interval in milliseconds |

## Coins & Currencies

Every scheduled fetch retrieves all 7 coins across all 4 currencies in a single request:

| Symbol | CoinGecko ID |
|--------|-------------|
| BTC    | bitcoin     |
| ETH    | ethereum    |
| XRP    | ripple      |
| SOL    | solana      |
| DOGE   | dogecoin    |
| ADA    | cardano     |
| LTC    | litecoin    |

**Currencies:** AUD, USD, EUR, GBP

## Pusher Broadcast

- **Channel:** `coin-prices`
- **Event:** `prices`
- **Payload shape:**

```json
{
  "BTC": { "AUD": "150000", "USD": "98000", "EUR": "90000", "GBP": "77000" },
  "ETH": { "AUD": "5000",   "USD": "3200",  "EUR": "2950",  "GBP": "2500"  }
}
```

## Fetch Strategy

1. **CoinGecko** — up to 3 attempts with exponential backoff (1 s, 2 s, 4 s).
2. **CryptoCompare** — used automatically if CoinGecko fails all 3 attempts; same retry strategy.
3. If both providers fail, the error is logged and the next interval will try again (the server does not crash).

## API

### `GET /`

Health-check endpoint.

**Response `200`**
```json
{
  "status": "ok",
  "service": "crypto-price-server",
  "lastFetchedAt": "2024-01-15T10:30:00.000Z"
}
```

`lastFetchedAt` is `null` until the first successful broadcast.

---

### `POST /prices/new`

Manual override — broadcasts a price payload directly via Pusher. Useful for testing and local dev without a running schedule.

**Request body** — a non-empty JSON object in the standard multi-currency shape:
```json
{
  "BTC": { "AUD": "150000", "USD": "98000", "EUR": "90000", "GBP": "77000" }
}
```

**Responses**

| Status | Meaning |
|--------|---------|
| `200`  | Broadcast succeeded |
| `400`  | Body is missing or not a non-empty JSON object |
| `500`  | Pusher trigger failed (network/auth error) |

## Running Tests

```bash
npm test
```

Tests use [Jest](https://jestjs.io) and [Supertest](https://github.com/ladjs/supertest). Pusher and the price service are mocked so no real credentials or network calls are needed.

## Security Notes

- **CORS**: Set `CORS_ORIGIN` to your frontend domain in production. Leaving it unset allows all origins.
- **Payload size**: Request bodies are capped at 10 KB to mitigate abuse.
- **TLS**: All Pusher communication uses TLS (`useTLS: true`).
- **Secrets**: Never commit `.env`. It is listed in `.gitignore`.

## Extension Recommendations

### 1. Rate Limiting

Prevent flooding `/prices/new` with [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit):

```javascript
const rateLimit = require('express-rate-limit');
app.use('/prices/new', rateLimit({ windowMs: 60_000, max: 60 }));
```

### 2. Structured Logging

Replace `console.error` with a structured logger like [pino](https://getpino.io):

```javascript
const pino = require('pino');
const logger = pino();
const pinoHttp = require('pino-http');
app.use(pinoHttp({ logger }));
```

### 3. Price History Persistence

Store fetched prices in a database (e.g. Redis time-series, PostgreSQL with TimescaleDB) for historical queries and charting.

### 4. CI/CD Pipeline

Add a GitHub Actions workflow that runs `npm test` on every pull request and deploys on merge to main.

### 5. Docker

Add a `Dockerfile` and `docker-compose.yml` for consistent local development and container-based deployment.
