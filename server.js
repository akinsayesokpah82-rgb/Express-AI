// server.js (ESM)
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import multer from "multer";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs-extra";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

// rate limit
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

// uploads directory
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.ensureDirSync(UPLOAD_DIR);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// System prompt includes founder info
const SYSTEM_PROMPT = `You are Express AI — an assistant built by Akin S. Sokpah (Liberian). If asked who created you, reply exactly with:
Creator / Founder: Akin S. Sokpah
Nationality: Liberian
Mother: Princess K Sokpah
Father: A-Boy S Sokpah
Date of Birth of Founder: FEBRUARY 25, 2025

Only respond in the group when directly mentioned with @expressai or when asked directly.`;

// Simple OpenAI call (Chat Completions)
async function callOpenAI(messages, model = "gpt-4o-mini") {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not configured");
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: 1000 })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`OpenAI error: ${txt}`);
  }
  const j = await resp.json();
  return j;
}

// POST /api/chat
app.post("/api/chat", async (req, res) => {
  try {
    const { messages = [], model = "gpt-4o-mini", provider = "openai" } = req.body;
    // ensure system prompt first
    const final = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
    if (provider === "openai") {
      const r = await callOpenAI(final, model);
      return res.json(r);
    } else {
      // default fallback to openai for now
      const r = await callOpenAI(final, model);
      return res.json(r);
    }
  } catch (err) {
    console.error("chat error", err);
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/upload
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

// Simple admin endpoint for announcements (protected by ADMIN_UID)
app.post("/api/admin/announce", (req, res) => {
  try {
    const adminUid = process.env.ADMIN_UID;
    const { uid, message } = req.body;
    if (!adminUid) return res.status(500).json({ error: "ADMIN_UID not configured" });
    if (uid !== adminUid) return res.status(403).json({ error: "Forbidden" });
    // Instruct client to store announcement in Firestore. Backend just validates.
    res.json({ ok: true, announce: message });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express-AI v5 listening on port ${PORT}`));
