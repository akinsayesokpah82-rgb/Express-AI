// server.js — includes secure /api/admin/approve
import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import fetch from "node-fetch";
import multer from "multer";
import path from "path";
import fs from "fs-extra";
import { fileURLToPath } from "url";
import admin from "firebase-admin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static("public"));
app.use(rateLimit({ windowMs: 60 * 1000, max: 200 }));

// ---------- Initialize Firebase Admin from FIREBASE_SERVICE_ACCOUNT env var ----------
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error("FIREBASE_SERVICE_ACCOUNT env var is missing. Admin features will not work until set.");
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

// helper: get Firestore admin instance (only if initialized)
const adminDb = admin.apps.length ? admin.firestore() : null;

// ----------------- upload endpoint (keeps working) -----------------
const UPLOAD_DIR = path.join(__dirname, "public", "uploads");
fs.ensureDirSync(UPLOAD_DIR);
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

app.post("/api/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const url = `/uploads/${req.file.filename}`;
    return res.json({ ok: true, file: { name: req.file.originalname, url } });
  } catch (err) {
    console.error("upload error", err);
    return res.status(500).json({ error: String(err) });
  }
});

// ----------------- OpenAI chat proxy (existing) -----------------
const SYSTEM_PROMPT = `You are Express AI — an assistant built by Akin S. Sokpah (Liberian). If asked who created you, reply exactly with:
Creator / Founder: Akin S. Sokpah
Nationality: Liberian
Mother: Princess K Sokpah
Father: A-Boy S Sokpah

Only respond in the group when directly mentioned with @expressai or when asked directly.`;

async function callOpenAI(messages, model = "gpt-3.5-turbo") {
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
  return resp.json();
}

app.post("/api/chat", async (req, res) => {
  try {
    const { messages = [], model = "gpt-3.5-turbo" } = req.body;
    const final = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];
    const data = await callOpenAI(final, model);
    return res.json(data);
  } catch (err) {
    console.error("chat error", err);
    return res.status(500).json({ error: String(err) });
  }
});

// ----------------- Secure Admin Approve endpoint -----------------
// POST /api/admin/approve
// Body: { paymentId: "<docId>" }
// Authorization header: "Bearer <Firebase ID token of admin user>"
app.post("/api/admin/approve", async (req, res) => {
  try {
    if (!admin.apps.length) return res.status(500).json({ error: "Firebase Admin not configured on server" });

    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "Missing Authorization header" });
    const idToken = authHeader.split("Bearer ")[1].trim();

    // Verify token via Firebase Admin
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch (err) {
      console.warn("Invalid ID token:", err.message || err);
      return res.status(401).json({ error: "Invalid ID token" });
    }

    // Check admin UID
    const adminUid = process.env.ADMIN_UID;
    if (!adminUid) return res.status(500).json({ error: "ADMIN_UID not configured on server" });
    if (decoded.uid !== adminUid) return res.status(403).json({ error: "Not authorized (not admin)" });

    // Read paymentId
    const { paymentId } = req.body;
    if (!paymentId) return res.status(400).json({ error: "paymentId is required" });

    // Use admin Firestore to update payment doc and create user role
    const paymentRef = adminDb.collection("payments").doc(paymentId);
    const paymentDoc = await paymentRef.get();
    if (!paymentDoc.exists) return res.status(404).json({ error: "Payment record not found" });

    const paymentData = paymentDoc.data();
    const targetUid = paymentData.uid;
    if (!targetUid) return res.status(400).json({ error: "Payment record missing uid" });

    // Update payment status to approved and record approver
    await paymentRef.update({ status: "approved", approvedBy: decoded.uid, approvedAt: admin.firestore.FieldValue.serverTimestamp() });

    // Ensure user record and set role member
    const userRef = adminDb.collection("users").doc(targetUid);
    await userRef.set({ role: "member", name: paymentData.name || null, email: paymentData.email || null }, { merge: true });

    // Optionally: write a message to the room that the user is approved (not required)
    await adminDb.collection("rooms").doc("college-group").collection("messages").add({
      sender: "System",
      text: `${paymentData.name || paymentData.email} has been approved as a member.`,
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ ok: true, paymentId, uid: targetUid });
  } catch (err) {
    console.error("admin/approve error:", err);
    return res.status(500).json({ error: String(err) });
  }
});

// health
app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Express-AI server listening on ${PORT}`));
