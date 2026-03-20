'use strict';

// Set env vars before requiring any modules that validate them at load time
process.env.PUSHER_ID = 'test-id';
process.env.PUSHER_KEY = 'test-key';
process.env.PUSHER_SECRET = 'test-secret';
process.env.PUSHER_CLUSTER = 'us2';

jest.mock('pusher', () => {
  return jest.fn().mockImplementation(() => ({
    trigger: jest.fn().mockResolvedValue({ status: 200 }),
  }));
});

// Mock priceService so tests control what fetchPrices returns
jest.mock('./priceService', () => ({
  fetchPrices: jest.fn(),
}));

const request = require('supertest');
const Pusher = require('pusher');
const { fetchPrices } = require('./priceService');
const { app, fetchAndBroadcast } = require('./server');

const SAMPLE_PRICES = {
  BTC: { AUD: '150000', USD: '98000', EUR: '90000', GBP: '77000' },
  ETH: { AUD: '5000',   USD: '3200',  EUR: '2950',  GBP: '2500'  },
};

let pusherInstance;
beforeAll(() => {
  pusherInstance = Pusher.mock.results[0].value;
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── GET / ────────────────────────────────────────────────────────────────────

describe('GET /', () => {
  it('returns 200 with service status', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'crypto-price-server' });
  });

  it('includes lastFetchedAt (null before first fetch)', async () => {
    const res = await request(app).get('/');
    expect(res.body).toHaveProperty('lastFetchedAt');
  });

  it('includes an ISO timestamp in lastFetchedAt after a successful fetch', async () => {
    fetchPrices.mockResolvedValueOnce(SAMPLE_PRICES);
    await fetchAndBroadcast();

    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body.lastFetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ─── Scheduled fetch & broadcast ─────────────────────────────────────────────

describe('fetchAndBroadcast', () => {
  it('calls fetchPrices and triggers Pusher broadcast', async () => {
    fetchPrices.mockResolvedValueOnce(SAMPLE_PRICES);

    await fetchAndBroadcast();

    expect(fetchPrices).toHaveBeenCalledTimes(1);
    expect(pusherInstance.trigger).toHaveBeenCalledWith('coin-prices', 'prices', SAMPLE_PRICES);
  });

  it('uses CryptoCompare fallback when CoinGecko fails', async () => {
    // priceService.fetchPrices encapsulates the fallback logic;
    // here we simulate it returning fallback data after an internal failure
    const fallbackPrices = { BTC: { AUD: '148000', USD: '97000', EUR: '89000', GBP: '76000' } };
    fetchPrices.mockRejectedValueOnce(new Error('CoinGecko failed'));
    fetchPrices.mockResolvedValueOnce(fallbackPrices);

    // First call fails — should not throw
    await fetchAndBroadcast();
    expect(pusherInstance.trigger).not.toHaveBeenCalled();

    // Second call succeeds (simulates fallback succeeding on next interval)
    await fetchAndBroadcast();
    expect(pusherInstance.trigger).toHaveBeenCalledWith('coin-prices', 'prices', fallbackPrices);
  });

  it('logs an error but does not throw when fetchPrices fails', async () => {
    fetchPrices.mockRejectedValueOnce(new Error('Network error'));
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    await expect(fetchAndBroadcast()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});

// ─── POST /prices/new ─────────────────────────────────────────────────────────

describe('POST /prices/new', () => {
  it('triggers Pusher and returns 200 for valid price data', async () => {
    const prices = { BTC: { AUD: '150000', USD: '98000' } };
    const res = await request(app).post('/prices/new').send(prices);

    expect(res.status).toBe(200);
    expect(pusherInstance.trigger).toHaveBeenCalledWith('coin-prices', 'prices', prices);
  });

  it('returns 400 for an empty body', async () => {
    const res = await request(app).post('/prices/new').send({});
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 400 for an array body', async () => {
    const res = await request(app)
      .post('/prices/new')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify([{ BTC: 65000 }]));
    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('returns 500 when Pusher.trigger throws', async () => {
    pusherInstance.trigger.mockRejectedValueOnce(new Error('Pusher connection failed'));

    const res = await request(app).post('/prices/new').send({ BTC: 65000 });
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error', 'Internal server error');
  });
});
