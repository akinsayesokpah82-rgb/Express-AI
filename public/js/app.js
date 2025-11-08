import { auth, googleLogin, googleLogout, db } from "./firebase.js";
import {
  collection, addDoc, query, orderBy, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const chatContainer = document.getElementById("chatContainer");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const authButtons = document.getElementById("authButtons");

const messagesRef = collection(db, "groupMessages");
let currentUser = null;

// Render messages from Firestore in real time
const q = query(messagesRef, orderBy("timestamp"));
onSnapshot(q, (snapshot) => {
  chatContainer.innerHTML = "";
  snapshot.forEach((doc) => {
    const data = doc.data();
    const div = document.createElement("div");
    div.className = "p-2 rounded-lg break-words";
    div.classList.add(
      data.sender === "Express AI" ? "bg-blue-700" : "bg-gray-700"
    );
    div.innerHTML = `<strong>${data.sender}:</strong> ${data.text}`;
    chatContainer.appendChild(div);
  });
  chatContainer.scrollTop = chatContainer.scrollHeight;
});

// Send a new message
async function sendMessage(text) {
  if (!text.trim()) return;
  await addDoc(messagesRef, {
    sender: currentUser ? currentUser.displayName : "Anonymous",
    text: text.trim(),
    timestamp: serverTimestamp(),
  });
  chatInput.value = "";

  // Check if message tags the AI
  if (text.toLowerCase().includes("@expressai")) {
    triggerAIResponse(text);
  }
}

// AI response handler
async function triggerAIResponse(userText) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are Express AI, an assistant built by Akin S. Sokpah (Liberian). Only respond when tagged with @expressai. Help politely, correct misunderstandings, and guide discussions.",
        },
        { role: "user", content: userText },
      ],
    }),
  });

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content ?? "🤖 (no response)";
  await addDoc(messagesRef, {
    sender: "Express AI",
    text: reply,
    timestamp: serverTimestamp(),
  });
}

// Event listeners
sendBtn.addEventListener("click", () => sendMessage(chatInput.value));
chatInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") sendMessage(chatInput.value);
});

// Firebase Auth UI
auth.onAuthStateChanged((user) => {
  if (user) {
    currentUser = user;
    authButtons.innerHTML = `
      <img src="${user.photoURL}" class="w-8 h-8 rounded-full inline-block mr-2" />
      <span>${user.displayName}</span>
      <button class="ml-2 px-3 py-1 bg-red-600 rounded" id="logoutBtn">Logout</button>`;
    document.getElementById("logoutBtn").onclick = googleLogout;

    addDoc(messagesRef, {
      sender: "System",
      text: `👋 ${user.displayName} joined the College Students Group Chat.`,
      timestamp: serverTimestamp(),
    });
  } else {
    currentUser = null;
    authButtons.innerHTML = `
      <button class="px-4 py-2 bg-green-600 rounded" id="loginBtn">
        Sign in with Google
      </button>`;
    document.getElementById("loginBtn").onclick = googleLogin;
  }
});
