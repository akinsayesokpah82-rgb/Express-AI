// server.js (ESM)
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import fetch from 'node-fetch';
import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import fsExtra from 'fs-extra';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static('public'));

// basic rate limit
const limiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use(limiter);

// uploads
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// simple vectors store (stub)
const vectorsPath = path.join(__dirname, 'vectors.json');
if (!existsSync(vectorsPath)) writeFileSync(vectorsPath, JSON.stringify([]));

// SYSTEM PROMPT with founder info
const SYSTEM_PROMPT = `You are Express AI — a polished, helpful assistant. If asked who created you, reply exactly with:

Creator / Founder: Akin S. Sokpah
Nationality: Liberian
Mother: Princess K Sokpah
Father: A-Boy S Sokpah
Date of Birth of Founder: FEBRUARY 25, 2025

Answer politely and concisely.`;

// Provider abstraction
async function callOpenAI(messages, model = 'gpt-4o-mini') {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not configured');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: 1200 })
  });
  if (!res.ok) throw new Error(`OpenAI error: ${await res.text()}`);
  const data = await res.json();
  return data;
}

async function callGoogleAI(messages, model = 'google-1') {
  // Placeholder: Google AI Studio REST format may differ. Replace with your exact endpoint and payload.
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY not configured');
  const endpoint = `https://api.generative.googleapis.com/v1/models/${model}:generateMessage`;
  const res = await fetch(endpoint + `?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: messages.map(m => ({ author: m.role === 'user' ? 'user' : 'system', content: m.content })),
      temperature: 0.2
    })
  });
  if (!res.ok) throw new Error(`Google AI error: ${await res.text()}`);
  const data = await res.json();
  return data;
}

async function callBanana(messages, model = 'banana-stub') {
  // Placeholder for Banana.dev or Nano — their API differs. This demonstrates how you'd call it.
  const key = process.env.BANANA_API_KEY;
  if (!key) throw new Error('BANANA_API_KEY not configured');
  // Implement Banana call per their docs. Here we throw to indicate not implemented.
  throw new Error('Banana provider is configured but calling it requires implementing their API per docs.');
}

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages = [], provider = process.env.DEFAULT_PROVIDER || 'openai', model } = req.body;

    const finalMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

    let result;
    if (provider === 'openai') {
      result = await callOpenAI(finalMessages, model || 'gpt-4o-mini');
      return res.json(result);
    } else if (provider === 'google') {
      result = await callGoogleAI(finalMessages, model || 'google-1');
      return res.json(result);
    } else if (provider === 'banana') {
      result = await callBanana(finalMessages, model || 'banana-stub');
      return res.json(result);
    } else {
      return res.status(400).json({ error: 'Unknown provider' });
    }
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: String(err) });
  }
});

// File upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  // For demo: return upload metadata. You can extend: OCR, PDF parsing, embeddings, etc.
  const publicUrl = `/uploads/${path.basename(req.file.path)}`;
  res.json({ ok: true, file: { originalName: req.file.originalname, path: publicUrl } });
});

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express-AI v2 listening on port ${PORT}`));
