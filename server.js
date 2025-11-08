// server.js (Express AI — Firebase Admin + Flutterwave payments + secure admin endpoints)
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
app.use(cors());
app.use(express.json({ limit: "5mb" })); // webhook needs raw body sometimes; handled below
app.use(express.static("public"));
app.use(rateLimit({ windowMs: 60 * 1000, max: 400 }));

// --- ensure folders
fs.ensureDirSync(path.join(__dirname, "public", "uploads"));
fs.ensureDirSync(path.join(__dirname, "data"));

// --- multer upload (local)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "public", "uploads")),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// --- Initialize Firebase Admin SDK from env (FIREBASE_SERVICE_ACCOUNT JSON)
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.warn("WARNING: FIREBASE_SERVICE_ACCOUNT not set. Admin endpoints will not work until configured.");
} else {
  try {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(sa),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${sa.project_id}.appspot.com`
    });
    console.log("✅ Firebase Admin initialized");
  } catch (err) {
    console.error("❌ Failed to initialize Firebase Admin:", err);
  }
}
const adminDb = admin.apps.length ? admin.firestore() : null;

// --- System prompt (creator info - no DOB)
const SYSTEM_PROMPT = `You are Express AI — an assistant built by Akin S. Sokpah (Liberian).
If asked who created you, reply exactly with:
Creator / Founder: Akin S. Sokpah
Nationality: Liberian
Mother: Princess K Sokpah
Father: A-Boy S Sokpah

Only respond in group when directly mentioned with @expressai or asked directly. Be polite and concise.`;

// --- OpenAI helper
async function callOpenAI(messages, model = "gpt-3.5-turbo") {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY not configured");
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages, max_tokens: 1200 })
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`OpenAI error: ${txt}`);
  }
  return r.json();
}

// -------------------- Payment: Flutterwave helpers --------------------
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY || "";
const FLW_PUBLIC_KEY = process.env.FLW_PUBLIC_KEY || "";
const FLW_WEBHOOK_SECRET = process.env.FLW_WEBHOOK_SECRET || ""; // set this in Flutterwave webhook settings

async function flutterwaveCreatePayment({ amount = 10, currency = "USD", email, tx_ref, redirect_url, fullname }) {
  if (!FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY not configured");
  const url = "https://api.flutterwave.com/v3/payments";
  const body = {
    tx_ref,
    amount: String(amount),
    currency,
    redirect_url,
    payment_options: "card,banktransfer,ussd,barter,mobilemoney",
    customer: { email: email || "customer@example.com", name: fullname || "Express AI user" }
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FLW_SECRET_KEY}` },
    body: JSON.stringify(body)
  });
  const j = await res.json();
  if (!res.ok && !j.status) throw new Error(`Flutterwave create failed: ${JSON.stringify(j)}`);
  return j;
}

async function flutterwaveVerifyByReference(tx_ref) {
  if (!FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY not configured");
  // endpoint: GET https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=<tx_ref>
  const url = `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(tx_ref)}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` } });
  const j = await r.json();
  return j;
}

async function flutterwaveVerifyById(id) {
  if (!FLW_SECRET_KEY) throw new Error("FLW_SECRET_KEY not configured");
  const url = `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(id)}/verify`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${FLW_SECRET_KEY}` } });
  const j = await r.json();
  return j;
}

// -------------------- Routes --------------------

// Chat proxy (AI)
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

// Subject AI
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

// Song generator
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

// Upload (local)
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

// Contact (local save)
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, message } = req.body;
    if (!name || !email || !message) return res.status(400).json({ error: "name,email,message required" });
    const contactsPath = path.join(__dirname, "data", "contacts.json");
    let arr = [];
    try { arr = JSON.parse(await fs.readFile(contactsPath, "utf8")); } catch(e){ arr = []; }
    const record = { id: crypto.randomUUID(), name, email, message, createdAt: new Date().toISOString() };
    arr.unshift(record);
    await fs.writeFile(contactsPath, JSON.stringify(arr, null, 2));
    res.json({ ok: true, record });
  } catch (err) {
    console.error("contact error", err);
    res.status(500).json({ error: String(err) });
  }
});

/*
  --------------- FLUTTERWAVE PAYMENT ENDPOINTS ---------------
*/

// Create payment (server creates Flutterwave checkout and returns payment_link + tx_ref)
// POST body: { amount: 10, currency: 'USD', email, name, redirect_url }
app.post("/api/pay/create", async (req, res) => {
  try {
    const { amount = 10, currency = "USD", email, name, redirect_url } = req.body;
    if (!FLW_SECRET_KEY) return res.status(500).json({ error: "FLW_SECRET_KEY not configured" });

    // create a unique tx_ref
    const tx_ref = `expressai_${Date.now()}_${Math.floor(Math.random()*10000)}`;

    // call Flutterwave create payment
    const result = await flutterwaveCreatePayment({ amount, currency, email, tx_ref, redirect_url: redirect_url || `${req.headers.origin || ""}/` , fullname: name });

    // Example response: result.data.link or result.data.checkout_url depending on API
    // We'll try known fields
    const data = result.data || {};
    const payment_link = data.link || data.checkout_url || data.payment_link || data.flw_ref || null;

    // Save payment record to Firestore server-side if available
    if (adminDb) {
      await adminDb.collection("payments").add({
        tx_ref,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        amount,
        currency,
        email,
        name,
        status: "created",
        flutterwave_response: result
      });
    }

    return res.json({ ok: true, result, payment_link, tx_ref });
  } catch (err) {
    console.error("pay/create error", err);
    return res.status(500).json({ error: String(err) });
  }
});

// Verify payment by tx_ref (client can poll this endpoint after user completes payment)
app.get("/api/pay/verify", async (req, res) => {
  try {
    const { tx_ref } = req.query;
    if (!tx_ref) return res.status(400).json({ error: "tx_ref required" });
    if (!FLW_SECRET_KEY) return res.status(500).json({ error: "FLW_SECRET_KEY not configured" });

    const verify = await flutterwaveVerifyByReference(tx_ref);

    // if adminDb available, update payments doc with status
    if (adminDb && verify.data) {
      // locate payment by tx_ref
      const snaps = await adminDb.collection("payments").where("tx_ref", "==", tx_ref).get();
      const status = (verify.data.status || verify.status) === "successful" || (verify.data && verify.data.status === "successful") ? "successful" : (verify.data.status || verify.status || "unknown");
      snaps.forEach(async s => {
        await s.ref.set({ verifyResponse: verify, status, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        // if successful, set user role
        if (status === "successful" && s.data().email && s.data().uid) {
          await adminDb.collection("users").doc(s.data().uid).set({ role: "member", name: s.data().name, email: s.data().email }, { merge: true });
        }
      });
    }

    return res.json({ ok: true, verify });
  } catch (err) {
    console.error("pay/verify error", err);
    return res.status(500).json({ error: String(err) });
  }
});

// Webhook: Flutterwave will POST here. Verify 'verif-hash' header equals your FLW_WEBHOOK_SECRET
// Configure the webhook URL in your Flutterwave dashboard and set the webhook secret
app.post("/api/pay/webhook", express.raw({ type: "*/*" }), async (req, res) => {
  try {
    const incomingSig = req.headers["verif-hash"] || req.headers["verif_hash"];
    if (!FLW_WEBHOOK_SECRET) {
      console.warn("FLW_WEBHOOK_SECRET not set - webhook will not be validated.");
    } else {
      if (!incomingSig || incomingSig !== FLW_WEBHOOK_SECRET) {
        console.warn("Invalid webhook signature", incomingSig);
        return res.status(400).send("invalid signature");
      }
    }

    // parse body (raw) then json
    const bodyStr = req.body.toString("utf8");
    let payload;
    try { payload = JSON.parse(bodyStr); } catch(e) { payload = null; }

    // Example payload: payload.data with status, flw_ref, tx_ref, amount...
    const data = payload && payload.data ? payload.data : null;
    if (!data) {
      console.warn("Webhook missing data");
      return res.status(400).send("no data");
    }

    const tx_ref = data.tx_ref || data.txref || data.reference;
    const flw_ref = data.id || data.flw_ref || data.reference;
    const status = data.status || data.payment_status || "";

    // Update Firestore payments record if adminDb available
    if (adminDb && tx_ref) {
      const snaps = await adminDb.collection("payments").where("tx_ref", "==", tx_ref).get();
      const newStatus = (status === "successful" || status === "completed") ? "successful" : status;
      snaps.forEach(async s => {
        await s.ref.set({ flutterwaveWebhook: data, status: newStatus, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        const rec = s.data();
        // If successful, set user role member
        if ((newStatus === "successful" || newStatus === "completed") && rec && rec.uid) {
          await adminDb.collection("users").doc(rec.uid).set({ role: "member", name: rec.name || null, email: rec.email || null }, { merge: true });
          // optional: announce to room
          await adminDb.collection("rooms").doc("college-group").collection("messages").add({
            sender: "System",
            text: `${rec.name || rec.email} payment confirmed — membership activated.`,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });
    }

    // respond quickly
    res.json({ ok: true });
  } catch (err) {
    console.error("webhook error", err);
    res.status(500).send("error");
  }
});

/*
  -------------------- Secure Admin Approve Endpoint --------------------
  POST /api/admin/approve
  Headers: Authorization: Bearer <Firebase ID token of admin>
  Body: { paymentId: "<docId>" }
*/
app.post("/api/admin/approve", async (req, res) => {
  try {
    if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin not configured on server" });
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Missing Authorization" });
    const idToken = authHeader.split("Bearer ")[1].trim();
    let decoded;
    try { decoded = await admin.auth().verifyIdToken(idToken); } catch (err) { return res.status(401).json({ error: "Invalid ID token" }); }
    const adminUid = process.env.ADMIN_UID;
    if (!adminUid) return res.status(500).json({ error: "ADMIN_UID not configured on server" });
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
      // announce
      await adminDb.collection("rooms").doc("college-group").collection("messages").add({
        sender: "System",
        text: `${p.name || p.email} approved as member by admin.`,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    }

    return res.json({ ok: true, paymentId, uid: p && p.uid });
  } catch (err) {
    console.error("admin/approve error", err);
    return res.status(500).json({ error: String(err) });
  }
});

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express-AI backend listening on ${PORT}`));
