// server.js — Express AI backend (Firebase Admin + Flutterwave + AI + proxies)
// NOTE: set FIREBASE_SERVICE_ACCOUNT (JSON), ADMIN_UID, FLW_SECRET_KEY, etc in Render env

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

// Allow large body (webhooks may require raw bodies)
app.use(cors());
app.use(express.json({ limit: "6mb" }));
app.use(express.urlencoded({ extended: true, limit: "6mb" }));
app.use(express.static("public"));
app.use(rateLimit({ windowMs: 60 * 1000, max: 400 }));

// ensure directories
fs.ensureDirSync(path.join(__dirname, "public", "uploads"));
fs.ensureDirSync(path.join(__dirname, "data"));

// ----------------- Initialize Firebase Admin -----------------
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${sa.project_id}.appspot.com`
    });
    console.log("✅ Firebase Admin initialized");
  } catch (err) {
    console.error("Failed to initialize Firebase Admin:", err);
  }
} else {
  console.warn("FIREBASE_SERVICE_ACCOUNT not set — admin features disabled");
}

const adminDb = admin.apps.length ? admin.firestore() : null;

// ----------------- Multer upload (stores to public/uploads) -----------------
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "public", "uploads")),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// ----------------- System prompt (creator info, no DOB) -----------------
const SYSTEM_PROMPT = `You are Express AI — an assistant built by Akin S. Sokpah (Liberian).
If asked who created you, reply exactly with:
Creator / Founder: Akin S. Sokpah
Nationality: Liberian
Mother: Princess K Sokpah
Father: A-Boy S Sokpah

Only respond in a group when directly mentioned with @expressai or when asked directly. Be polite, concise, and helpful.`;

// ----------------- Helpers: OpenAI / Gemini -----------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";

async function callOpenAI(messages, model = "gpt-3.5-turbo") {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({ model, messages, max_tokens: 1200 })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`OpenAI error: ${txt}`);
  }
  return r.json();
}

async function callGemini(prompt) {
  if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-preview:generateText?key=${GEMINI_API_KEY}`;
  // Use simple text generation API structure (adjust to latest Gemini endpoints if needed)
  const payload = {
    prompt: { text: prompt },
    temperature: 0.2,
    maxOutputTokens: 800
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Gemini error: ${txt}`);
  }
  const j = await r.json();
  // navigate common response fields — may differ; adapt if Google changes API
  return j.candidates?.[0]?.content?.[0]?.text || j.output?.[0]?.content || JSON.stringify(j);
}

// unified AI runner (tries Gemini then OpenAI)
async function runAI(messagesOrPrompt, useChat = true, model = "gpt-3.5-turbo") {
  // If messages passed (OpenAI style), call OpenAI with system prompt added
  if (Array.isArray(messagesOrPrompt)) {
    const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...messagesOrPrompt];
    if (OPENAI_API_KEY) return (await callOpenAI(messages, model)).choices?.[0]?.message?.content;
    // fallback: join messages to a prompt and try Gemini
    const joined = messages.map(m => `${m.role}: ${m.content}`).join("\n");
    if (GEMINI_API_KEY) return await callGemini(joined);
    throw new Error("No AI key configured");
  } else {
    // it's a single prompt string
    const prompt = SYSTEM_PROMPT + "\n\nUser: " + messagesOrPrompt;
    if (GEMINI_API_KEY) return await callGemini(prompt);
    if (OPENAI_API_KEY) {
      const messages = [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: messagesOrPrompt }];
      return (await callOpenAI(messages, model)).choices?.[0]?.message?.content;
    }
    throw new Error("No AI key configured");
  }
}

// ----------------- News / Weather / Sports proxies -----------------
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || "";
const OPENWEATHER_KEY = process.env.OPENWEATHER_KEY || "";
const SPORTS_API_URL = process.env.SPORTS_API_URL || "";
const SPORTS_API_KEY = process.env.SPORTS_API_KEY || "";

app.get("/api/news", async (req, res) => {
  try {
    if (!NEWSAPI_KEY) return res.status(400).json({ error: "NEWSAPI_KEY not set" });
    const { q, country = "us", category } = req.query;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (country) params.set("country", country);
    if (category) params.set("category", category);
    params.set("apiKey", NEWSAPI_KEY);
    const url = `https://newsapi.org/v2/top-headlines?${params.toString()}`;
    const r = await fetch(url);
    const j = await r.json();
    res.json({ ok: true, data: j });
  } catch (err) {
    console.error("news error", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/weather", async (req, res) => {
  try {
    if (!OPENWEATHER_KEY) return res.status(400).json({ error: "OPENWEATHER_KEY not set" });
    const city = req.query.city || "Monrovia";
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${OPENWEATHER_KEY}&units=metric`;
    const r = await fetch(url);
    const j = await r.json();
    res.json({ ok: true, data: j });
  } catch (err) {
    console.error("weather error", err);
    res.status(500).json({ error: String(err) });
  }
});

app.get("/api/sports", async (req, res) => {
  try {
    if (!SPORTS_API_URL) return res.status(400).json({ error: "SPORTS_API_URL not configured" });
    const params = new URLSearchParams({ apikey: SPORTS_API_KEY || "", ...req.query });
    const url = `${SPORTS_API_URL}?${params.toString()}`;
    const r = await fetch(url);
    const j = await r.json();
    res.json({ ok: true, data: j });
  } catch (err) {
    console.error("sports error", err);
    res.status(500).json({ error: String(err) });
  }
});

// ----------------- Subject AI & Song generator -----------------
app.post("/api/subject", async (req, res) => {
  try {
    const { subject = "general", messages = [], model } = req.body;
    const prompts = {
      nursing: "You are a nursing assistant. Provide practical, evidence-aware nursing help. Recommend consulting qualified practitioners when needed.",
      math: "You are a math tutor. Provide step-by-step solutions and verify results.",
      english: "You are an English instructor. Edit and explain grammar, essays and vocabulary.",
      monetize: "You are a monetization coach: lawful, practical advice on YouTube, TikTok, Facebook monetization, affiliate marketing.",
      scholarships: "You are an academic advisor on scholarships: provide sources, eligibility and tips.",
      general: "You are Express AI — helpful and concise."
    };
    const system = prompts[subject.toLowerCase()] || prompts.general;
    const msgs = [{ role: "system", content: system }, ...messages];
    const reply = await runAI(msgs, true, model || "gpt-3.5-turbo");
    res.json({ ok: true, reply });
  } catch (err) {
    console.error("subject error", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/api/song", async (req, res) => {
  try {
    const { prompt = "", style = "pop", length = "verse-chorus", model } = req.body;
    if (!prompt) return res.status(400).json({ error: "No prompt" });
    const system = `You are a songwriting assistant. Generate lyrics in ${style} style with structure ${length}. Label verses/choruses.`;
    const reply = await runAI([{ role: "system", content: system }, { role: "user", content: prompt }], true, model || "gpt-3.5-turbo");
    res.json({ ok: true, lyrics: reply });
  } catch (err) {
    console.error("song error", err);
    res.status(500).json({ error: String(err) });
  }
});

// ----------------- Upload endpoint -----------------
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

// ----------------- Contact (Join Request) -----------------
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: "name,email,message required" });
    const contactsPath = path.join(__dirname, "data", "contacts.json");
    let arr = [];
    try { arr = JSON.parse(await fs.readFile(contactsPath, "utf8")); } catch(e) { arr = []; }
    const record = { id: crypto.randomUUID(), name, email, message, createdAt: new Date().toISOString() };
    arr.unshift(record);
    await fs.writeFile(contactsPath, JSON.stringify(arr, null, 2));
    // optional: store to Firestore as well (if adminDb)
    if (adminDb) await adminDb.collection("joinRequests").add(record);
    res.json({ ok: true, record });
  } catch (err) {
    console.error("contact error", err);
    res.status(500).json({ error: String(err) });
  }
});

// ----------------- Flutterwave payments (create, verify, webhook) -----------------
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FLW_WEBHOOK_SECRET = process.env.FLW_WEBHOOK_SECRET || "";

async function flutterwaveCreatePayment({ amount = 10, currency = "USD", email, name, tx_ref, redirect_url }) {
  if (!FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY not configured");
  const url = "https://api.flutterwave.com/v3/payments";
  const body = {
    tx_ref,
    amount: String(amount),
    currency,
    redirect_url,
    payment_options: "card,banktransfer,ussd, mobilemoney",
    customer: { email: email || "customer@example.com", name: name || "Express AI user" }
  };
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FLW_SECRET_KEY}` },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  return j;
}

async function flutterwaveVerifyByReference(tx_ref) {
  if (!FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY not configured");
  const url = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(tx_ref)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` } });
  const j = await r.json();
  return j;
}

// Create payment: client posts amount, email, name -> server creates tx_ref & calls Flutterwave -> returns link & tx_ref
app.post("/api/pay/create", async (req, res) => {
  try {
    const { amount = 10, currency = "USD", email, name, redirect_url } = req.body;
    if (!FLW_SECRET_KEY) return res.status(500).json({ error: "FLW_SECRET_KEY not set" });
    const tx_ref = `expressai_${Date.now()}_${Math.floor(Math.random()*10000)}`;
    const result = await flutterwaveCreatePayment({ amount, currency, email, tx_ref, name, redirect_url: redirect_url || `${req.headers.origin || ""}/` });

    // Save record to Firestore (server-side) if available
    if (adminDb) await adminDb.collection("payments").add({
      tx_ref, amount, currency, email, name, status: "created", createdAt: admin.firestore.FieldValue.serverTimestamp(), flutterwave_response: result
    });

    res.json({ ok: true, result, tx_ref });
  } catch (err) {
    console.error("pay/create error", err);
    res.status(500).json({ error: String(err) });
  }
});

// Verify payment by tx_ref (client may poll)
app.get("/api/pay/verify", async (req, res) => {
  try {
    const { tx_ref } = req.query;
    if (!tx_ref) return res.status(400).json({ error: "tx_ref required" });
    const verify = await flutterwaveVerifyByReference(tx_ref);
    // update Firestore payment doc(s)
    if (adminDb && verify && verify.data) {
      const snaps = await adminDb.collection("payments").where("tx_ref", "==", tx_ref).get();
      const status = (verify.data.status === "successful") ? "successful" : verify.data.status || "unknown";
      for (const s of snaps.docs) {
        await s.ref.set({ verifyResponse: verify, status, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const rec = s.data();
        if (status === "successful" && rec && rec.uid) {
          await adminDb.collection("users").doc(rec.uid).set({ role: "member", email: rec.email }, { merge: true });
        }
      }
    }
    res.json({ ok: true, verify });
  } catch (err) {
    console.error("pay/verify error", err);
    res.status(500).json({ error: String(err) });
  }
});

// Flutterwave webhook (use raw body to validate signature)
app.post("/api/pay/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const incomingSig = req.headers["verif-hash"] || req.headers["verif_hash"];
    if (FLW_WEBHOOK_SECRET && incomingSig !== FLW_WEBHOOK_SECRET) {
      console.warn("Invalid webhook signature", incomingSig);
      return res.status(400).send("invalid signature");
    }
    const bodyStr = req.body.toString("utf8");
    let payload;
    try { payload = JSON.parse(bodyStr); } catch (e) { payload = null; }
    const data = payload?.data || null;
    if (!data) return res.status(400).send("no data");
    const tx_ref = data.tx_ref || data.txref || data.reference;
    const status = data.status || "";
    if (adminDb && tx_ref) {
      const snaps = await adminDb.collection("payments").where("tx_ref", "==", tx_ref).get();
      const newStatus = (status === "successful" || status === "completed") ? "successful" : status;
      for (const s of snaps.docs) {
        await s.ref.set({ flutterwaveWebhook: data, status: newStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const rec = s.data();
        if ((newStatus === "successful" || newStatus === "completed") && rec && rec.uid) {
          await adminDb.collection("users").doc(rec.uid).set({ role: "member", email: rec.email, name: rec.name }, { merge: true });
          await adminDb.collection("rooms").doc("college-group").collection("messages").add({
            sender: "System",
            text: `${rec.name || rec.email} payment confirmed — membership activated.`,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      }
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("webhook error", err);
    res.status(500).send("error");
  }
});

// ----------------- Secure Admin Approve Endpoint -----------------
app.post("/api/admin/approve", async (req, res) => {
  try {
    if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin not configured" });
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Missing Authorization header" });
    const idToken = authHeader.split("Bearer ")[1].trim();
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(idToken); } catch (e) { return res.status(401).json({ error: "Invalid ID token" }); }
    const adminUid = process.env.ADMIN_UID;
    if (!adminUid) return res.status(500).json({ error: "ADMIN_UID not configured" });
    if (decoded.uid !== adminUid) return res.status(403).json({ error: "Not authorized (not admin)" });

    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: "paymentId required" });
    const pRef = adminDb.collection("payments").doc(paymentId);
    const pDoc = await pRef.get();
    if (!pDoc.exists) return res.status(404).json({ error: "Payment not found" });
    const p = pDoc.data();
    await pRef.update({ status: "approved", approvedBy: decoded.uid, approvedAt: admin.firestore.FieldValue.serverTimestamp() });

    if (p && p.uid) {
      await adminDb.collection("users").doc(p.uid).set({ role: "member", email: p.email || null, name: p.name || null }, { merge: true });
      await adminDb.collection("rooms").doc("college-group").collection("messages").add({
        sender: "System",
        text: `${p.name || p.email} approved as member by admin.`,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    res.json({ ok: true, paymentId, uid: p && p.uid });
  } catch (err) {
    console.error("admin/approve error", err);
    res.status(500).json({ error: String(err) });
  }
});

// ----------------- Group AI: endpoint to post AI reply into Firestore room -----------------
// This is a helper the client could call to ask server to generate an AI reply and save it to Firestore room.
app.post("/api/room/ai-reply", async (req, res) => {
  try {
    const { roomId = "college-group", userMessage = "", model } = req.body;
    if (!userMessage) return res.status(400).json({ error: "userMessage required" });
    // create thinking message in room
    if (adminDb) {
      await adminDb.collection("rooms").doc(roomId).collection("messages").add({
        sender: "Express AI",
        text: "Express AI is thinking...",
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    // create messages array (system + user)
    const messages = [{ role: "user", content: userMessage }];
    const replyText = await runAI(messages, true, model || "gpt-3.5-turbo");
    if (adminDb) {
      await adminDb.collection("rooms").doc(roomId).collection("messages").add({
        sender: "Express AI",
        text: replyText,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }
    res.json({ ok: true, reply: replyText });
  } catch (err) {
    console.error("room/ai-reply error", err);
    res.status(500).json({ error: String(err) });
  }
});

// ----------------- Health -----------------
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express-AI backend listening on ${PORT}`));
