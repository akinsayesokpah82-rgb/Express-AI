// server.js - Express AI backend (safe)
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import { v4 as uuidv4 } from "uuid";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

// ensure dirs
fs.ensureDirSync(path.join(__dirname, "public", "uploads"));
fs.ensureDirSync(path.join(__dirname, "data"));

// multer upload (local storage)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "public", "uploads")),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// System prompt (creator info, no DOB)
const SYSTEM_PROMPT = `You are Express AI — an assistant built by Akin S. Sokpah (Liberian).
If asked who created you, reply exactly with:
Creator / Founder: Akin S. Sokpah
Nationality: Liberian
Mother: Princess K Sokpah
Father: A-Boy S Sokpah

Only respond in group when directly mentioned with @expressai or asked directly. Be polite and concise.`;

// Helper: call OpenAI chat completions
async function callOpenAI(messages, model = "gpt-3.5-turbo") {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
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

// ---------------- API ROUTES ----------------

// Chat proxy (for group AI replies / subject)
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

// Subject-specific assistant (Nursing, Math, etc.)
app.post("/api/subject", async (req, res) => {
  try {
    const { subject = "general", messages = [], model = "gpt-3.5-turbo" } = req.body;
    const prompts = {
      nursing: "You are a nursing assistant. Provide practical, evidence-aware nursing help and recommend consulting qualified professionals when necessary.",
      math: "You are a math tutor. Show step-by-step solutions and explain concepts clearly.",
      english: "You are an English instructor. Help with grammar, editing, essays, and vocabulary.",
      monetize: "You are a monetization coach. Provide legal, ethical advice for YouTube/TikTok/Facebook monetization and course creation.",
      scholarships: "You are an academic advisor focused on scholarships and application advice.",
      general: "You are Express AI — helpful and concise."
    };
    const system = prompts[subject.toLowerCase()] || prompts.general;
    const final = [{ role: "system", content: system }, ...messages];
    const data = await callOpenAI(final, model);
    res.json({ ok: true, data });
  } catch (err) {
    console.error("subject error", err);
    res.status(500).json({ error: String(err) });
  }
});

// Song / lyrics generator
app.post("/api/song", async (req, res) => {
  try {
    const { prompt = "", style = "pop", length = "verse-chorus", model = "gpt-3.5-turbo" } = req.body;
    if (!prompt) return res.status(400).json({ error: "No prompt provided" });
    const system = `You are a songwriting assistant. Generate lyrics in style: ${style} and structure: ${length}. Label sections like Verse/Chorus.`;
    const final = [{ role: "system", content: system }, { role: "user", content: prompt }];
    const data = await callOpenAI(final, model);
    const text = data.choices?.[0]?.message?.content || "";
    res.json({ ok: true, lyrics: text });
  } catch (err) {
    console.error("song error", err);
    res.status(500).json({ error: String(err) });
  }
});

// News proxy (NewsAPI.org)
app.get("/api/news", async (req, res) => {
  try {
    const key = process.env.NEWSAPI_KEY;
    if (!key) return res.status(400).json({ error: "NEWSAPI_KEY not set" });
    const { q, country = "us", category } = req.query;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (country) params.set("country", country);
    if (category) params.set("category", category);
    params.set("apiKey", key);
    const url = `https://newsapi.org/v2/top-headlines?${params.toString()}`;
    const r = await fetch(url);
    const j = await r.json();
    res.json({ ok: true, data: j });
  } catch (err) {
    console.error("news error", err);
    res.status(500).json({ error: String(err) });
  }
});

// Weather proxy (OpenWeatherMap)
app.get("/api/weather", async (req, res) => {
  try {
    const key = process.env.OPENWEATHER_KEY;
    if (!key) return res.status(400).json({ error: "OPENWEATHER_KEY not set" });
    const city = req.query.city || "Monrovia";
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${key}&units=metric`;
    const r = await fetch(url);
    const j = await r.json();
    res.json({ ok: true, data: j });
  } catch (err) {
    console.error("weather error", err);
    res.status(500).json({ error: String(err) });
  }
});

// Sports proxy (placeholder - configure SPORTS_API_URL & SPORTS_API_KEY)
app.get("/api/sports", async (req, res) => {
  try {
    const base = process.env.SPORTS_API_URL;
    const key = process.env.SPORTS_API_KEY;
    if (!base) return res.status(400).json({ error: "SPORTS_API_URL not configured" });
    const params = new URLSearchParams({ apikey: key || "", ...req.query });
    const url = `${base}?${params.toString()}`;
    const r = await fetch(url);
    const j = await r.json();
    res.json({ ok: true, data: j });
  } catch (err) {
    console.error("sports error", err);
    res.status(500).json({ error: String(err) });
  }
});

// Upload endpoint (local)
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

// Contact / Join Request (stores locally to data/contacts.json)
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: "name,email,message required" });
    const contactsPath = path.join(__dirname, "data", "contacts.json");
    let arr = [];
    try { arr = JSON.parse(await fs.readFile(contactsPath, "utf8")); } catch(e){ arr = []; }
    const record = { id: uuidv4(), name, email, message, createdAt: new Date().toISOString() };
    arr.unshift(record);
    await fs.writeFile(contactsPath, JSON.stringify(arr, null, 2));
    res.json({ ok: true, record });
  } catch (err) {
    console.error("contact error", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express-AI backend listening on ${PORT}`));
