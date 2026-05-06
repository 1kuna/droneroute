import { Router } from "express";
import rateLimit from "express-rate-limit";

interface NominatimResult {
  display_name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: [string, string, string, string];
  type?: string;
  class?: string;
  importance?: number;
}

interface GeocodeResult {
  displayName: string;
  latitude: number;
  longitude: number;
  boundingBox?: {
    south: number;
    north: number;
    west: number;
    east: number;
  };
  type?: string;
  category?: string;
  importance?: number;
}

const DEFAULT_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const DEFAULT_USER_AGENT =
  "DroneRoute/0.5.0 (self-hosted DJI mission planner; configure GEOCODER_USER_AGENT)";
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const UPSTREAM_INTERVAL_MS = 1100;

const cache = new Map<
  string,
  { expiresAt: number; results: GeocodeResult[] }
>();
let upstreamQueue: Promise<void> = Promise.resolve();
let lastUpstreamRequestAt = 0;

export const geocodeRoutes = Router();

const geocodeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many searches, please try again in a minute" },
});

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithUpstreamThrottle<T>(fn: () => Promise<T>): Promise<T> {
  const run = upstreamQueue.then(async () => {
    const elapsed = Date.now() - lastUpstreamRequestAt;
    if (elapsed < UPSTREAM_INTERVAL_MS) {
      await delay(UPSTREAM_INTERVAL_MS - elapsed);
    }
    lastUpstreamRequestAt = Date.now();
    return fn();
  });

  upstreamQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function trimCache(): void {
  const now = Date.now();
  for (const [key, value] of cache) {
    if (value.expiresAt <= now) cache.delete(key);
  }

  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (!oldest) break;
    cache.delete(oldest);
  }
}

function cacheKey(query: string, limit: number, language: string): string {
  return `${query.toLowerCase()}\n${limit}\n${language}`;
}

function parseBoundingBox(
  boundingbox: NominatimResult["boundingbox"],
): GeocodeResult["boundingBox"] {
  if (!boundingbox || boundingbox.length !== 4) return undefined;

  const [south, north, west, east] = boundingbox.map(Number);
  if (![south, north, west, east].every(Number.isFinite)) return undefined;

  return { south, north, west, east };
}

function normalizeResults(results: NominatimResult[]): GeocodeResult[] {
  return results.flatMap((result) => {
    const latitude = Number(result.lat);
    const longitude = Number(result.lon);
    if (
      !result.display_name ||
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return [];
    }

    const normalized: GeocodeResult = {
      displayName: result.display_name,
      latitude,
      longitude,
      boundingBox: parseBoundingBox(result.boundingbox),
      type: result.type,
      category: result.class,
      importance: result.importance,
    };
    return [normalized];
  });
}

geocodeRoutes.get("/search", geocodeLimiter, async (req, res) => {
  const query = String(req.query.q || "").trim();
  const limit = Math.min(10, Math.max(1, Number(req.query.limit) || 5));
  const language = String(req.headers["accept-language"] || "en").slice(0, 80);

  if (query.length < 2) {
    res
      .status(400)
      .json({ error: "Search query must be at least 2 characters" });
    return;
  }
  if (query.length > 200) {
    res.status(400).json({ error: "Search query is too long" });
    return;
  }

  trimCache();
  const key = cacheKey(query, limit, language);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.json({ results: cached.results, cached: true });
    return;
  }

  try {
    const baseUrl = process.env.GEOCODER_URL || DEFAULT_NOMINATIM_URL;
    const url = new URL(baseUrl);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("addressdetails", "1");
    url.searchParams.set("limit", String(limit));

    const response = await runWithUpstreamThrottle(() =>
      fetch(url, {
        headers: {
          Accept: "application/json",
          "Accept-Language": language,
          "User-Agent": process.env.GEOCODER_USER_AGENT || DEFAULT_USER_AGENT,
        },
        signal: AbortSignal.timeout(8000),
      }),
    );

    if (!response.ok) {
      console.warn("Geocoder upstream error", {
        status: response.status,
        statusText: response.statusText,
      });
      res.status(502).json({ error: "Location search is unavailable" });
      return;
    }

    const rawResults = (await response.json()) as NominatimResult[];
    const results = normalizeResults(rawResults);
    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, results });
    trimCache();

    res.json({ results, cached: false });
  } catch (err: any) {
    console.error("Geocoder search failed:", err);
    res.status(502).json({ error: "Location search is unavailable" });
  }
});
