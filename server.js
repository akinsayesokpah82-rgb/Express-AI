// server.js (ESM) - Firebase Admin + Storage + OpenAI streaming + ID token verification
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs-extra";
import { v4 as uuidv4 } from "uuid";
import Busboy from "busboy";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));
app.use(rateLimit({ windowMs: 60 * 1000, max: 120 }));

// --- Initialize Firebase Admin using FIREBASE_SERVICE_ACCOUNT env var ---
const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saJson) {
  console.error("FIREBASE_SERVICE_ACCOUNT not set in environment!");
} else {
  try {
    const sa = JSON.parse(saJson);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || sa.project_id + ".appspot.com",
    });
    console.log("Firebase Admin initialized.");
  } catch (e) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT:", e);
  }
}
const bucket = admin.storage ? admin.storage().bucket() : null;

// --- System prompt with founder info ---
const SYSTEM_PROMPT = `You are Express AI — an assistant built by Akin S. Sokpah (Liberian). If asked who created you, reply exactly with:
Creator / Founder: Akin S. Sokpah
Nationality: Liberian
Mother: Princess K Sokpah
Father: A-Boy S Sokpah
Date of Birth of Founder: FEBRUARY 25, 2025

Only respond in the group when directly mentioned with @expressai or when asked directly.`;

// --- Utility: verify Firebase ID token middleware ---
async function verifyIdToken(req, res, next) {
  const authHeader = req.headers.authorization || "";
  if (!authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }
  const idToken = authHeader.split("Bearer ")[1].trim();
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded; // includes uid, email, name, etc.
  } catch (err) {
    console.warn("Invalid ID token:", err.message || err);
    req.user = null;
  }
  next();
}

// --- OpenAI simple call (non-streaming) ---
async function callOpenAI(messages, model = "gpt-4o-mini") {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");
  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: 1000 }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`OpenAI error: ${t}`);
  }
  return resp.json();
}

// --- Streaming chat endpoint: client POSTs messages JSON; server proxies to OpenAI with stream:true and streams tokens back ---
app.post("/api/chat/stream", verifyIdToken, async (req, res) => {
  try {
    // Expect body: { messages: [...], model: "...", provider: "openai" }
    const { messages = [], model = "gpt-4o-mini" } = req.body;
    const finalMessages = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) return res.status(500).json({ error: "OPENAI_API_KEY not configured" });

    // Prepare request to OpenAI with streaming enabled
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openaiKey}` },
      body: JSON.stringify({ model, messages: finalMessages, max_tokens: 1000, stream: true }),
    });

    if (!openaiResp.ok) {
      const errtxt = await openaiResp.text();
      return res.status(502).json({ error: "OpenAI error", detail: errtxt });
    }

    // Set SSE-like headers for client to stream
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });

    // Read the OpenAI response stream and forward chunks as SSE data events.
    const reader = openaiResp.body.getReader();
    const decoder = new TextDecoder();

    async function pump() {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        // OpenAI streaming sends lines like: "data: {...}\n\n"
        // We'll forward each chunk to the client as a data: <chunk>\n\n
        // For safety, break into lines and forward 'data:' lines.
        const lines = chunk.split(/\r?\n/);
        for (let line of lines) {
          if (!line) continue;
          // Forward as-is but prefix to keep SSE format
          // Escape any bare newlines by replacing with \\n
          const safe = line.replace(/\n/g, "\\n");
          res.write(`data: ${safe}\n\n`);
        }
      }
      // signal end
      res.write(`data: [DONE]\n\n`);
      res.end();
    }

    pump().catch((err) => {
      console.error("Streaming pump error:", err);
      try { res.write(`data: [ERROR]\n\n`); res.end(); } catch(e){}
    });
  } catch (err) {
    console.error("chat/stream error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// --- Admin announce endpoint: requires verified ID token and ADMIN_UID match ---
app.post("/api/admin/announce", verifyIdToken, async (req, res) => {
  try {
    const adminUid = process.env.ADMIN_UID;
    if (!adminUid) return res.status(500).json({ error: "ADMIN_UID not configured" });

    // req.user set by verifyIdToken
    if (!req.user) return res.status(401).json({ error: "Missing or invalid ID token" });
    if (req.user.uid !== adminUid) return res.status(403).json({ error: "Forbidden: not admin" });

    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "No message provided" });

    // For this API we just acknowledge — the frontend should write the announcement to Firestore as needed.
    return res.json({ ok: true, announce: message });
  } catch (err) {
    console.error("admin announce error:", err);
    res.status(500).json({ error: String(err) });
  }
});

// --- Upload endpoint using Busboy -> upload to Firebase Storage ---
app.post("/api/upload", verifyIdToken, async (req, res) => {
  if (!bucket) return res.status(500).json({ error: "Firebase Storage not configured" });

  const bb = Busboy({ headers: req.headers });
  let fileUploadPromise = null;
  let savedFileName = null;
  let originalName = null;

  bb.on("file", (fieldname, file, info) => {
    const { filename, encoding, mimeType } = info;
    originalName = filename;
    const ext = path.extname(filename) || "";
    savedFileName = `${Date.now()}-${uuidv4()}${ext}`;
    const fileUpload = bucket.file(`uploads/${savedFileName}`);
    const stream = fileUpload.createWriteStream({ metadata: { contentType: mimeType } });
    file.pipe(stream);
    fileUploadPromise = new Promise((resolve, reject) => {
      stream.on("finish", async () => {
        try {
          // make file publicly readable (optional) and get public URL
          // For production you may prefer signed URLs instead of public access
          await fileUpload.makePublic();
          const publicUrl = `https://storage.googleapis.com/${bucket.name}/uploads/${savedFileName}`;
          resolve({ ok: true, url: publicUrl });
        } catch (e) {
          reject(e);
        }
      });
      stream.on("error", (err) => reject(err));
    });
  });

  bb.on("field", (name, val) => {
    // handle form fields if needed
  });

  bb.on("close", async () => {
    try {
      const result = fileUploadPromise ? await fileUploadPromise : null;
      if (!result) return res.status(400).json({ error: "No file uploaded" });
      return res.json({ ok: true, file: { name: originalName, url: result.url } });
    } catch (err) {
      console.error("upload finalize error:", err);
      return res.status(500).json({ error: String(err) });
    }
  });

  req.pipe(bb);
});

// Health
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express-AI v5 (secure + storage + streaming) listening on ${PORT}`));
