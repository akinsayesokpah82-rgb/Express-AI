// --- add near top of server.js ---
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || "";
const OPENWEATHER_KEY = process.env.OPENWEATHER_KEY || "";
const SPORTS_API_URL = process.env.SPORTS_API_URL || ""; // e.g. "https://www.thesportsdb.com/api/v1/json/1"
const SPORTS_API_KEY = process.env.SPORTS_API_KEY || "";

// helper fetch wrapper
async function proxyFetch(url, options = {}) {
  const r = await fetch(url, options);
  if (!r.ok) {
    const txt = await r.text().catch(()=>"");
    throw new Error(`Upstream error: ${r.status} ${txt}`);
  }
  return r.json();
}
