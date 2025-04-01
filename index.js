const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
const port = process.env.PORT || 3002;

// Enable CORS for your extension's origin
app.use(cors({
  origin: "chrome-extension://*"
}));

// Cache variables
let cachedPrice = null;
let cachedExchangeRates = {
  gbpToUsdRate: 1,
  eurToUsdRate: 1,
  cadToUsdRate: 1,
  jpyToUsdRate: 1,
  cnyToUsdRate: 1,
};
let lastFetch = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds

// Rate limiting variables
const REQUEST_LIMIT = 60; // Max 60 requests per minute
let requestCount = 0;
let resetTime = Date.now() + 60 * 1000; // Reset counter every minute

// Middleware for rate limiting
app.use((req, res, next) => {
  const now = Date.now();
  if (now > resetTime) {
    requestCount = 0;
    resetTime = now + 60 * 1000; // Reset every minute
  }
  requestCount++;
  if (requestCount > REQUEST_LIMIT) {
    return res.status(429).json({ error: "Rate limit exceeded, please try again later." });
  }
  next();
});

// Function to fetch SOL price and exchange rates
async function fetchSolPrice() {
  const now = Date.now();
  if (cachedPrice && now - lastFetch < CACHE_DURATION) {
    console.log("Using cached SOL price:", cachedPrice, "Exchange rates:", cachedExchangeRates);
    return;
  }

  // Fetch SOL price in USD
  try {
    console.log("Fetching SOL price from CoinMarketCap...");
    const response = await axios.get(
      "https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=SOL&convert=USD",
      { headers: { "X-CMC_PRO_API_KEY": "b8312c67-4d9c-4175-8724-1e2c1ff27397" } }
    );
    if (!response.data.data || !response.data.data.SOL || !response.data.data.SOL.quote.USD.price) {
      throw new Error("Invalid response from CoinMarketCap");
    }
    cachedPrice = parseFloat(response.data.data.SOL.quote.USD.price.toFixed(2));
    lastFetch = now;
    console.log("Fetched SOL price from CoinMarketCap:", cachedPrice);
  } catch (error) {
    console.error("Error fetching from CoinMarketCap:", error.message);
    try {
      console.log("Falling back to CoinGecko...");
      const response = await axios.get(
        "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
      );
      if (!response.data.solana || !response.data.solana.usd) {
        throw new Error("Invalid response from CoinGecko");
      }
      cachedPrice = parseFloat(response.data.solana.usd.toFixed(2));
      lastFetch = now;
      console.log("Fetched SOL price from CoinGecko:", cachedPrice);
    } catch (error) {
      console.error("Error fetching from CoinGecko:", error.message);
      try {
        console.log("Falling back to KuCoin...");
        const kucoinResponse = await axios.get(
          "https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=SOL-USDT"
        );
        if (!kucoinResponse.data.data || !kucoinResponse.data.data.price) {
          throw new Error("Invalid response from KuCoin");
        }
        cachedPrice = parseFloat(parseFloat(kucoinResponse.data.data.price).toFixed(2));
        lastFetch = now;
        console.log("Fetched SOL price from KuCoin:", cachedPrice);
      } catch (kucoinError) {
        console.error("Error fetching from KuCoin:", kucoinError.message);
        if (!cachedPrice) {
          console.error("No price available; all APIs failed.");
        }
      }
    }
  }

  // Fetch exchange rates (GBP, EUR, CAD, JPY, CNY to USD) using Frankfurter API
  try {
    console.log("Fetching exchange rates from Frankfurter...");
    const response = await axios.get(
      "https://api.frankfurter.app/latest?from=GBP&to=USD,EUR,CAD,JPY,CNY"
    );
    if (!response.data.rates || !response.data.rates.USD) {
      throw new Error("Invalid response from Frankfurter API");
    }
    // Since Frankfurter returns rates relative to GBP, we need to calculate X/USD rates
    const gbpToUsd = response.data.rates.USD;
    cachedExchangeRates = {
      gbpToUsdRate: parseFloat(gbpToUsd.toFixed(4)),
      eurToUsdRate: parseFloat((gbpToUsd / response.data.rates.EUR).toFixed(4)),
      cadToUsdRate: parseFloat((gbpToUsd / response.data.rates.CAD).toFixed(4)),
      jpyToUsdRate: parseFloat((gbpToUsd / response.data.rates.JPY).toFixed(4)),
      cnyToUsdRate: parseFloat((gbpToUsd / response.data.rates.CNY).toFixed(4)),
    };
    console.log("Fetched exchange rates:", cachedExchangeRates);
  } catch (error) {
    console.error("Error fetching exchange rates:", error.message);
    cachedExchangeRates = {
      gbpToUsdRate: 1,
      eurToUsdRate: 1,
      cadToUsdRate: 1,
      jpyToUsdRate: 1,
      cnyToUsdRate: 1,
    };
  }
}

// Fetch price on startup and every 30 minutes
fetchSolPrice();
setInterval(fetchSolPrice, CACHE_DURATION);

// API endpoint to serve the cached SOL price and exchange rates
app.get("/sol-price", (req, res) => {
  console.log(`Request received at ${new Date().toISOString()}`);
  if (cachedPrice && Date.now() - lastFetch < CACHE_DURATION) {
    res.json({ usd: cachedPrice, exchangeRates: cachedExchangeRates });
  } else {
    res.status(503).json({ error: "Price not available, please try again later." });
  }
});

// Health check endpoint
app.get("/", (req, res) => {
  res.send("Solify It Proxy Server is running!");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});