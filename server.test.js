// Set env vars before requiring server to pass startup validation
process.env.PUSHER_ID = 'test-id';
process.env.PUSHER_KEY = 'test-key';
process.env.PUSHER_SECRET = 'test-secret';
process.env.PUSHER_CLUSTER = 'us2';

jest.mock('pusher', () => {
  return jest.fn().mockImplementation(() => ({
    trigger: jest.fn().mockResolvedValue({ status: 200 }),
  }));
});

const request = require('supertest');
const Pusher = require('pusher');
const app = require('./server');

// Capture the Pusher instance created at module load time before any mocks are cleared
let pusherInstance;
beforeAll(() => {
  pusherInstance = Pusher.mock.results[0].value;
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('GET /', () => {
  it('returns 200 with service status', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', service: 'crypto-price-server' });
  });
});

describe('POST /prices/new', () => {
  it('triggers Pusher and returns 200 for valid price data', async () => {
    const prices = { BTC: 65000, ETH: 3200 };
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
