# Crypto Price Server

A lightweight Express server that receives real-time cryptocurrency price updates from a client and broadcasts them to subscribers via [Pusher Channels](https://pusher.com/channels).

## Architecture

```
Client (frontend) ──POST /prices/new──► Express Server ──trigger──► Pusher
                                                                       │
                                                                       ▼
                                               All subscribed clients on 'coin-prices' channel
```

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

   Edit `.env` with your Pusher credentials and desired port.

3. **Start the server**

   ```bash
   npm start          # production
   npm run dev        # development (auto-restarts on file changes)
   ```

## Environment Variables

| Variable         | Required | Default | Description |
|-----------------|----------|---------|-------------|
| `PUSHER_ID`     | Yes      | —       | Pusher application ID |
| `PUSHER_KEY`    | Yes      | —       | Pusher application key |
| `PUSHER_SECRET` | Yes      | —       | Pusher application secret |
| `PUSHER_CLUSTER`| Yes      | —       | Pusher cluster region (e.g. `us2`, `eu`) |
| `PORT`          | No       | `5000`  | HTTP port to listen on |
| `CORS_ORIGIN`   | No       | `*`     | Comma-separated list of allowed origins. **Set this in production.** |

## API

### `GET /`

Health-check endpoint.

**Response `200`**
```json
{ "status": "ok", "service": "crypto-price-server" }
```

---

### `POST /prices/new`

Receives a coin price payload and broadcasts it to all Pusher subscribers on the `coin-prices` channel under the `prices` event.

**Request body** — any non-empty JSON object, e.g.:
```json
{
  "BTC": 65000,
  "ETH": 3200,
  "SOL": 145
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

Tests use [Jest](https://jestjs.io) and [Supertest](https://github.com/ladjs/supertest). Pusher is mocked so no real credentials are needed.

## Security Notes

- **CORS**: Set `CORS_ORIGIN` to your frontend domain in production. Leaving it unset allows all origins.
- **Input validation**: The `/prices/new` endpoint rejects empty and non-object bodies. Consider adding stricter schema validation (see extension recommendations below) if the price payload structure is fixed.
- **Payload size**: Request bodies are capped at 10 KB to mitigate abuse.
- **TLS**: All Pusher communication uses TLS (`useTLS: true`).
- **Secrets**: Never commit `.env`. It is listed in `.gitignore`.

## Extension Recommendations

### 1. Authentication / API Key

The `/prices/new` endpoint is currently open. Add a shared-secret header check or JWT validation to ensure only your own frontend can push prices:

```javascript
// middleware/auth.js
module.exports = (req, res, next) => {
  if (req.headers['x-api-key'] !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
```

### 2. Request Payload Schema Validation

Use [Zod](https://zod.dev) or [Joi](https://joi.dev) to enforce a strict schema and whitelist allowed coin symbols:

```javascript
const { z } = require('zod');
const priceSchema = z.record(z.string().toUpperCase(), z.number().positive());
// validate: priceSchema.parse(req.body)
```

### 3. Rate Limiting

Prevent flooding with [express-rate-limit](https://github.com/express-rate-limit/express-rate-limit):

```javascript
const rateLimit = require('express-rate-limit');
app.use('/prices/new', rateLimit({ windowMs: 60_000, max: 60 }));
```

### 4. Structured Logging

Replace `console.error` with a structured logger like [pino](https://getpino.io) for log levels, JSON output, and request tracing:

```javascript
const pino = require('pino');
const logger = pino();
const pinoHttp = require('pino-http');
app.use(pinoHttp({ logger }));
```

### 5. Multiple Pusher Channels / Events

Extend the POST handler to accept a `channel` and `event` parameter so the server can broadcast to any channel, making it a general-purpose Pusher relay.

### 6. Price History Persistence

Store received prices in a database (e.g. Redis time-series, PostgreSQL with TimescaleDB) to support historical queries and charting.

### 7. CI/CD Pipeline

Add a GitHub Actions workflow that runs `npm test` on every pull request and deploys on merge to main.

### 8. Docker

Add a `Dockerfile` and `docker-compose.yml` for consistent local development and easy container-based deployment.
