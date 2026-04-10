#!/usr/bin/env node

// weather-cli.js
//  Features:
//  1. Fetch weather from OpenWeatherMapAPI (async/await)
//  2. Cache results in JSON file (fs module)
//  3. Parse command-line arguments (process.argv)
//  4. Handle errors gracefully
//  5. Format output beautifully with colors (manual ANSI colors)

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.join(__dirname, "weather-cache.json");
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const API_KEY = process.env.OPENWEATHER_API_KEY;

const COLORS = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
};

function colorize(text, color) {
  return `${color}${text}${COLORS.reset}`;
}

function printHelp() {
  console.log(`
    ${colorize("Weather CLI", COLORS.bold)}
    A simple command-line weather app using OpenWeatherMap.

    ${colorize("Usage:", COLORS.cyan)}
      node weather-cli.js <city>
      node weather-cli.js <city> --forecast
      node weather-cli.js --help
      node weather-cli.js --clear-cache

    ${colorize("Examples:", COLORS.cyan)}
      node weather-cli.js London
      node weather-cli.js Lagos --forecast
      node weather-cli.js "New York"
      node weather-cli.js --clear-cache

    ${colorize("Environment Variable:", COLORS.cyan)}
      OPENWEATHER_API_KEY=API_KEY

    ${colorize("Notes:", COLORS.cyan)}
      - Current weather is shown by default
      - Forecast shows 5-day / 3-hour interval data from OpenWeatherMap
      - Cached responses expire after 10 minutes
    `)
}

async function ensureCacheFileExists() {
  try {
    await fs.access(CACHE_FILE)
  } catch {
    await fs.writeFile(CACHE_FILE, JSON.stringify({}, null, 2), "utf-8");
  }
}


async function readCache() {
  await ensureCacheFileExists();

  try {
    const raw = await fs.readFile(CACHE_FILE, "utf-8");
    return JSON.parse(raw || "{}");
  } catch {
    return {};
  }
}

async function writeCache(cacheData) {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2), "utf-8");
}

async function clearCache() {
  await fs.writeFile(CACHE_FILE, JSON.stringify({}, null, 2), "utf-8");
  console.log(colorize("✅ Cache cleared successfully.", COLORS.green));
}

function makeCacheKey(city, type) {
  return `${city.toLowerCase().trim()}::${type}`;
}

function isCacheValid(entry) {
  if (!entry || !entry.timestamp) {
    return false;
  }

  const age = Date.now() - entry.timestamp;
  return age < CACHE_TTL_MS;
}

async function getFromCache(city, type) {
  const cache = await readCache();
  const key = makeCacheKey(city, type);
  const entry = cache[key];

  if (isCacheValid(entry)) {
    return entry.data;
  }

  return null;
}

async function saveToCache(city, type, data) {
  const cache = await readCache();
  const key = makeCacheKey(city, type);

  cache[key] = {
    timestamp: Date.now(),
    data,
  };
  await writeCache(cache);
}

function parseArgs(argv) {
  const args = argv.slice(2);

  return {
    help: args.includes("--help"),
    forecast: args.includes("--forecast"),
    clearCache: args.includes("--clear-cache"),
    city: args.filter(arg => !arg.startsWith("--")).join(" ").trim(),
  };
}

async function fetchCurrentWeather(city) {
  const encodedCity = encodeURIComponent(city);
  const url =
    `https://api.openweathermap.org/data/2.5/weather?q=${encodedCity}&appid=${API_KEY}&units=metric`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch current weather.");
  }
  return data;
}

async function fetchForecast(city) {
  const encodedCity = encodeURIComponent(city);
  const url =
    `https://api.openweathermap.org/data/2.5/forecast?q=${encodedCity}&appid=${API_KEY}&units=metric`;

  const response = await fetch(url);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Failed to fetch forecast.");
  }
  return data;
}

function formatCurrentWeather(data) {
  const cityName = data.name;
  const country = data.sys?.country ?? "unknown";
  const description = data.weather?.[0]?.description ?? "No description";
  const temperature = data.main?.temp ?? "N/A";
  const feelsLike = data.main?.feels_like ?? "N/A";
  const humidity = data.main?.humidity ?? "N/A";
  const windSpeed = data.wind?.speed ?? "N/A";

  console.log(colorize("\n══════════════════════════════════════", COLORS.blue));
  console.log(colorize(`    Current Weather for ${cityName}, ${country}`, COLORS.bold));
  console.log(colorize("══════════════════════════════════════", COLORS.blue));

  console.log(`${colorize("Condition :", COLORS.cyan)} ${description}`);
  console.log(`${colorize("Temp      :", COLORS.yellow)} ${temperature}°C`);
  console.log(`${colorize("Feels Like:", COLORS.yellow)} ${feelsLike}°C`);
  console.log(`${colorize("Humidity  :", COLORS.magenta)} ${humidity}%`);
  console.log(`${colorize("Wind Speed:", COLORS.green)} ${windSpeed}m/s`);
  console.log(`${colorize("══════════════════════════════════════\n", COLORS.blue)}`);
}

function formatForecast(data) {
  const cityName = data.city?.name ?? "Unknown City";
  const country = data.city?.country ?? "Unknown";
  const forecastList = data.list ?? [];

  console.log(colorize("\n══════════════════════════════════════", COLORS.blue));
  console.log(colorize(`    5-Day Forecast for ${cityName}, ${country}`, COLORS.bold));
  console.log(colorize("══════════════════════════════════════", COLORS.blue));

  for (const item of forecastList) {
    const dateTime = item.dt_txt ?? "Unknown time";
    const description = item.weather?.[0]?.description ?? "No description";
    const temp = item.main?.temp ?? "N/A";
    const feelsLike = item.main?.feels_like ?? "N/A";

    console.log(colorize(`${dateTime}`, COLORS.cyan));
    console.log(`   Condition : ${description}`);
    console.log(`   Temp      : ${temp}°C`);
    console.log(`   Feels Like: ${feelsLike}°C`);
    console.log(`   Humidity  : ${humidity}%`);
    console.log(colorize("---------------------------", COLORS.dim));
  }

  console.log();
}

async function getWeather(city, forecastMode) {
  const type = forecastMode ? "forecast" : "current";

  const cachedData = await getFromCache(city, type);
  if (cachedData) {
    console.log(colorize("📦 Using cached weather data.\n", COLORS.green));
    return cachedData;
  }
  console.log(colorize("🌐 Fetching fresh weather data...\n", COLORS.yellow));

  let data;
  if (forecastMode) {
    data = await fetchForecast(city);
  } else {
    data = await fetchCurrentWeather(city);
  }

  await saveToCache(city, type, data);
  return data;
}

async function main() {
  try {
    const { help, forecast, clearCache, city } = parseArgs((process.argv));

    if (help) {
      printHelp();
      return;
    }

    if (clearCache) {
      await clearCache;
      return;
    }

    if (!city) {
      console.error(colorize("❌ Error: Please provide a city name.\n", COLORS.red));
      printHelp();
      process.exitCode = 1;
      return;
    }

    if (!API_KEY) {
      console.error(
        colorize("❌ Error: MISSING OPENWEATHER_API_KEY environment variable.", COLORS.red)
      );
      console.log(
        colorize('Set it like this:\nexport OPENWEATHER_API_KEY="your_api_key_here"', COLORS.yellow)
      );
      processs.exitCode = 1;
      return;
    }

    const weatherData = await getWeather(city, forecast);

    if (forecast) {
      formatForecast(weatherData);
    } else {
      formatCurrentWeather(weatherData);
    }
  } catch (err) {
    console.error(colorize(`❌ Error: ${err.message}`, COLORS.red));
    process.exitCode = 1;
  }
}

main();
