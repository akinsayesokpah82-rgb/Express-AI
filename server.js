// server.js
// Express AI — Smart Version (Gemini + OpenAI Support)

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import fetch from "node-fetch";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

app.get("/", (req, res) => {
  res.send("🧠 Express AI backend with Smart AI is running successfully!");
});

app.post("/api/chat", async (req, res) => {
  try {
    const { message, user } = req.body;

    if (!message) return res.json({ reply: "No message received." });

    const aiReply = await generateAIReply(message);

    // Save chat
    await db.collection("messages").add({
      user: user || "Anonymous",
      message,
      reply: aiReply,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ reply: aiReply });
  } catch (error) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ reply: "⚠️ Server error. Try again later." });
  }
});

async function generateAIReply(prompt) {
  // Try Gemini first
  if (GEMINI_API_KEY) {
    try {
      const geminiRes = await fetch(
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=" +
          GEMINI_API_KEY,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      const data = await geminiRes.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "Gemini could not respond.";
    } catch (err) {
      console.error("Gemini error:", err);
    }
  }

  // If Gemini not available, use OpenAI
  if (OPENAI_API_KEY) {
    try {
      const openaiRes = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const data = await openaiRes.json();
      return data.choices?.[0]?.message?.content || "OpenAI could not respond.";
    } catch (err) {
      console.error("OpenAI error:", err);
    }
  }

  return "No AI key found. Please add GEMINI_API_KEY or OPENAI_API_KEY in environment settings.";
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Express AI running on port ${PORT}`));
