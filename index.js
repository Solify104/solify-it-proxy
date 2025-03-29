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
let lastFetch = 0;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

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

// Function to fetch SOL price from CoinGecko with Binance as a fallback
async function fetchSolPrice() {
  try {
    console.log("Fetching SOL price from CoinGecko...");
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd"
    );
    cachedPrice = response.data.solana.usd;
    lastFetch = Date.now();
    console.log("Fetched SOL price from CoinGecko:", cachedPrice);
  } catch (error) {
    console.error("Error fetching from CoinGecko:", error.message);
    try {
      console.log("Falling back to Binance...");
      const binanceResponse = await axios.get(
        "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT"
      );
      cachedPrice = parseFloat(binanceResponse.data.price);
      lastFetch = Date.now();
      console.log("Fetched SOL price from Binance:", cachedPrice);
    } catch (binanceError) {
      console.error("Error fetching from Binance:", binanceError.message);
    }
  }
}

// Fetch price on startup and every 10 minutes
fetchSolPrice();
setInterval(fetchSolPrice, CACHE_DURATION);

// API endpoint to serve the cached SOL price
app.get("/sol-price", (req, res) => {
  console.log(`Request received at ${new Date().toISOString()}`);
  if (cachedPrice && Date.now() - lastFetch < CACHE_DURATION) {
    res.json({ usd: cachedPrice });
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