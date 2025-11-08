// server.js
// Express AI — Backend Server (Fixed Firebase Admin Integration)

import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import admin from "firebase-admin";
import fetch from "node-fetch";

// Initialize Firebase Admin SDK
// Make sure you have your Firebase service account key in Render environment variables
// or you can safely use application default credentials if using Firebase Hosting
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const db = admin.firestore();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// 🔹 Simple endpoint to test backend
app.get("/", (req, res) => {
  res.send("🧠 Express AI backend is running successfully!");
});

// 🔹 Chat endpoint (handles user messages from frontend)
app.post("/api/chat", async (req, res) => {
  try {
    const { message, user } = req.body;

    // Only respond if message contains "@expressai"
    if (!message.toLowerCase().includes("@expressai")) {
      return res.json({ reply: "" });
    }

    // 🔹 Example of how you might connect to your AI model or API
    const aiReply = await generateAIReply(message);

    // Save chat in Firestore (optional)
    await db.collection("messages").add({
      user: user || "Anonymous",
      message,
      reply: aiReply,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ reply: aiReply });
  } catch (error) {
    console.error("Error in /api/chat:", error);
    res.status(500).json({ reply: "⚠️ Internal server error. Try again later." });
  }
});

// 🔹 AI reply simulation (replace with your OpenAI or Gemini API call)
async function generateAIReply(prompt) {
  // You can connect your actual AI key here.
  // For now we’ll use a placeholder smart response.
  if (prompt.toLowerCase().includes("who created you")) {
    return "I was created by Akin S. Sokpah from Liberia. My goal is to help you learn, create, and explore!";
  }

  // Simple mock logic for demonstration
  return "That's a great question! Express AI will continue to learn and improve to assist you better.";
}

// 🔹 Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Express AI backend running on port ${PORT}`));
