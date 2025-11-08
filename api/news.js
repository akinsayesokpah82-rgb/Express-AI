// GET /api/news?country=us&category=general&q=...
app.get("/api/news", async (req, res) => {
  try {
    // prefer NewsAPI.org if configured
    const { q, country = "us", category } = req.query;
    if (!NEWSAPI_KEY) return res.status(400).json({ error: "NEWSAPI_KEY not set" });

    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (country) params.set("country", country);
    if (category) params.set("category", category);
    params.set("apiKey", NEWSAPI_KEY);
    const url = `https://newsapi.org/v2/top-headlines?${params.toString()}`;

    const data = await proxyFetch(url);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error("news error", err);
    return res.status(500).json({ error: String(err) });
  }
});
