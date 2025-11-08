// GET /api/sports?league=EPL&team=LIV
app.get("/api/sports", async (req, res) => {
  try {
    if (!SPORTS_API_URL) return res.status(400).json({ error: "SPORTS_API_URL not set" });
    // Example: your provider may vary; we forward the raw query to provider
    const params = new URLSearchParams({ apikey: SPORTS_API_KEY, ...req.query });
    const url = `${SPORTS_API_URL}?${params.toString()}`;
    const data = await proxyFetch(url);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error("sports error", err);
    return res.status(500).json({ error: String(err) });
  }
});
