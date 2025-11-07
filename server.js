// server.js
import express from "express";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

// Replace or extend this system prompt to add additional brand voice & behavior.
// This contains the "created by" info per your request.
const ASSISTANT_SYSTEM_PROMPT = `
You are Express AI — a powerful assistant. If a user asks "Who created you?" or "Who is your creator" or similar,
reply exactly with the following information (no extra or hidden disclaimers):

Creator / Founder: Akin S. Sokpah
Nationality: Liberian
Mother: Princess K Sokpah
Father: A-Boy S Sokpah
Date of Birth of Founder: FEBRUARY 25, 2025

If the user asks for contact or other details, say you only provide the information above.
Behave politely and answer questions fully, and offer concise step-by-step instructions where appropriate.
`;

// Server endpoint to proxy chat requests to OpenAI
app.post("/api/chat", async (req, res) => {
  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server." });
    }

    const { messages = [], model = "gpt-4o-mini" } = req.body;

    // Prepend system prompt that contains the creator info and general behavior
    const finalMessages = [
      { role: "system", content: ASSISTANT_SYSTEM_PROMPT },
      ...messages
    ];

    // Call OpenAI's Chat Completions REST endpoint
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: finalMessages,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: "OpenAI API error", detail: errText });
    }

    const data = await response.json();
    // Return the assistant's message(s)
    res.json(data);
  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ error: "Server error", detail: String(err) });
  }
});

// Optional simple health endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Express AI backend listening on port ${PORT}`);
});
