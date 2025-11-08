// GET /api/weather?city=Monrovia
app.get("/api/weather", async (req, res) => {
  try {
    const { city = "Monrovia" } = req.query;
    if (!OPENWEATHER_KEY) return res.status(400).json({ error: "OPENWEATHER_KEY not set" });

    const q = encodeURIComponent(city);
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${q}&appid=${OPENWEATHER_KEY}&units=metric`;
    const data = await proxyFetch(url);
    return res.json({ ok: true, data });
  } catch (err) {
    console.error("weather error", err);
    return res.status(500).json({ error: String(err) });
  }
});
