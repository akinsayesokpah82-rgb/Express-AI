// POST /api/subject
// body: { subject: "nursing" | "math" | "english" | "monetize" | ..., messages: [...] }
app.post("/api/subject", async (req, res) => {
  try {
    const { subject = "general", messages = [], model = "gpt-3.5-turbo" } = req.body;
    // subject system prompts map
    const prompts = {
      nursing: "You are a helpful nursing assistant. Provide evidence-based, practical nursing answers. Cite sources when possible and be careful with medical advice: recommend consulting instructors or practitioners.",
      math: "You are a math tutor. Show step-by-step solutions, explain concepts clearly, and verify results.",
      english: "You are an English teacher: help grammar, essay structure, vocabulary, and editing.",
      monetize: "You are a growth & monetization coach: practical, legal advice on YouTube, TikTok, Facebook monetization, affiliate marketing, and creating online courses.",
      scholarships: "You are an academic advisor: find scholarships, explain eligibility, and provide application tips.",
      general: "You are Express AI — helpful and concise."
    };
    const system = prompts[subject.toLowerCase()] || prompts.general;
    const finalMessages = [{ role: "system", content: system }, ...messages];

    // call OpenAI
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model, messages: finalMessages, max_tokens: 1200 })
    });
    if (!openaiResp.ok) {
      const txt = await openaiResp.text();
      throw new Error(`OpenAI error: ${txt}`);
    }
    const data = await openaiResp.json();
    return res.json({ ok: true, data });
  } catch (err) {
    console.error("subject error", err);
    return res.status(500).json({ error: String(err) });
  }
});
