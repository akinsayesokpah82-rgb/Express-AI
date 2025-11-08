// POST /api/song
// body: { prompt: "write a song about x", style: "reggae", length: "verse-chorus" }
app.post("/api/song", async (req, res) => {
  try {
    const { prompt = "", style = "pop", length = "verse-chorus", model = "gpt-3.5-turbo" } = req.body;
    if (!prompt) return res.status(400).json({ error: "No prompt provided" });

    const system = `You are a creative songwriting assistant. Generate lyrics in ${style} style with structure ${length}. Provide verse/chorus labels and optionally suggested chord progressions. Keep lyrics original.`;

    const messages = [{ role: "system", content: system }, { role: "user", content: prompt }];

    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, messages, max_tokens: 800 })
    });

    if (!openaiResp.ok) {
      const txt = await openaiResp.text();
      throw new Error(`OpenAI error: ${txt}`);
    }
    const data = await openaiResp.json();
    // extract assistant text
    const text = data.choices?.[0]?.message?.content || "";
    return res.json({ ok: true, lyrics: text, raw: data });
  } catch (err) {
    console.error("song error", err);
    return res.status(500).json({ error: String(err) });
  }
});
