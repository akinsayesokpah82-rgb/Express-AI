// server.js (simple, secure enough for demo)
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

// uploads (local) - if you prefer Firebase Storage we can switch later
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.ensureDirSync(UPLOAD_DIR);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

const SYSTEM_PROMPT = `You are Express AI — an assistant built by Akin S. Sokpah (Liberian). If asked who created you, reply exactly with:
Creator / Founder: Akin S. Sokpah
Nationality: Liberian
Mother: Princess K Sokpah
Father: A-Boy S Sokpah
Date of Birth of Founder: FEBRUARY 25, 2025

Only respond in the group when directly mentioned with @expressai or when asked directly. Behave politely and help users with clear, concise answers.`;

async function callOpenAI(messages, model = "gpt-3.5-turbo") {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: 1000 })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OpenAI error: ${txt}`);
  }
  return res.json();
}

// Chat proxy: expects messages array like OpenAI chat endpoint
app.post("/api/chat", async (req, res) => {
  try {
    const { messages = [], model = "gpt-3.5-turbo" } = req.body;
    const final = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
    const data = await callOpenAI(final, model);
    res.json(data);
  } catch (err) {
    console.error("chat error", err);
    res.status(500).json({ error: String(err) });
  }
});

// Upload endpoint (stores to public/uploads and returns URL)
app.post("/api/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = `/uploads/${req.file.filename}`;
    res.json({ ok: true, file: { name: req.file.originalname, url } });
  } catch (err) {
    console.error("upload error", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express-AI final backend listening on ${PORT}`));
