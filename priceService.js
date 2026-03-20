'use strict';

const COIN_GECKO_IDS = [
  'bitcoin', 'ethereum', 'ripple', 'solana', 'dogecoin', 'cardano', 'litecoin',
];

const SYMBOL_MAP = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  ripple: 'XRP',
  solana: 'SOL',
  dogecoin: 'DOGE',
  cardano: 'ADA',
  litecoin: 'LTC',
};

const CURRENCIES = ['aud', 'usd', 'eur', 'gbp'];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(fn, maxAttempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      await sleep(1000 * Math.pow(2, attempt - 1)); // 1s, 2s, 4s
    }
    try {
      return await fn();
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}

async function fetchFromCoinGecko() {
  const params = new URLSearchParams({
    ids: COIN_GECKO_IDS.join(','),
    vs_currencies: CURRENCIES.join(','),
  });
  if (process.env.COINGECKO_API_KEY) {
    params.set('x_cg_demo_api_key', process.env.COINGECKO_API_KEY);
  }

  const url = `https://api.coingecko.com/api/v3/simple/price?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CoinGecko responded with ${res.status}`);
  }
  const data = await res.json();

  // Map to PWA shape: { BTC: { AUD: "150000", USD: "98000", ... }, ... }
  const result = {};
  for (const [id, prices] of Object.entries(data)) {
    const symbol = SYMBOL_MAP[id];
    if (!symbol) continue;
    result[symbol] = {};
    for (const [currency, value] of Object.entries(prices)) {
      result[symbol][currency.toUpperCase()] = String(value);
    }
  }
  return result;
}

async function fetchFromCryptoCompare() {
  const params = new URLSearchParams({
    fsyms: Object.values(SYMBOL_MAP).join(','),
    tsyms: CURRENCIES.map((c) => c.toUpperCase()).join(','),
  });
  if (process.env.CRYPTOCOMPARE_API_KEY) {
    params.set('api_key', process.env.CRYPTOCOMPARE_API_KEY);
  }

  const url = `https://min-api.cryptocompare.com/data/pricemulti?${params}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`CryptoCompare responded with ${res.status}`);
  }
  const data = await res.json();
  if (data.Response === 'Error') {
    throw new Error(`CryptoCompare error: ${data.Message}`);
  }

  // CryptoCompare response is already in the right shape but values are numbers — stringify them
  const result = {};
  for (const [symbol, prices] of Object.entries(data)) {
    result[symbol] = {};
    for (const [currency, value] of Object.entries(prices)) {
      result[symbol][currency] = String(value);
    }
  }
  return result;
}

/**
 * Fetch prices from CoinGecko (up to 3 attempts), falling back to CryptoCompare
 * (up to 3 attempts) if CoinGecko fails completely.
 * Returns the mapped multi-currency price object.
 */
async function fetchPrices() {
  try {
    return await fetchWithRetry(fetchFromCoinGecko);
  } catch (coinGeckoErr) {
    console.warn('CoinGecko fetch failed, falling back to CryptoCompare:', coinGeckoErr.message);
    return await fetchWithRetry(fetchFromCryptoCompare);
  }
}

module.exports = { fetchPrices };
