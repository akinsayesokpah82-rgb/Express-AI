import { auth, googleLogin, googleLogout } from "./firebase.js";

const chatContainer = document.getElementById("chatContainer");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const authButtons = document.getElementById("authButtons");

let currentUser = null;
let groupMessages = [];

// Simulate a global group chat stored in memory for demo
function renderMessages() {
  chatContainer.innerHTML = "";
  groupMessages.forEach(m => {
    const div = document.createElement("div");
    div.className = "p-2 rounded-lg";
    div.classList.add(m.sender === "Express AI" ? "bg-blue-700" : "bg-gray-700");
    div.innerHTML = `<strong>${m.sender}:</strong> ${m.text}`;
    chatContainer.appendChild(div);
  });
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

function postMessage(sender, text) {
  groupMessages.push({ sender, text });
  renderMessages();
}

sendBtn.addEventListener("click", async () => {
  const text = chatInput.value.trim();
  if (!text) return;
  postMessage(currentUser?.displayName || "Anonymous", text);
  chatInput.value = "";
  await aiObserver(text);
});

async function aiObserver(userText) {
  // AI monitors the chat and replies if needed
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are Express AI observing a group chat. Help, clarify, or correct misunderstandings politely." },
        { role: "user", content: userText }
      ]
    })
  });
  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content ?? "🤖 (no response)";
  postMessage("Express AI", reply);
}

// Firebase Auth UI
auth.onAuthStateChanged(user => {
  if (user) {
    currentUser = user;
    authButtons.innerHTML = `
      <img src="${user.photoURL}" class="w-8 h-8 rounded-full inline-block mr-2" />
      <span>${user.displayName}</span>
      <button class="ml-2 px-3 py-1 bg-red-600 rounded" id="logoutBtn">Logout</button>`;
    document.getElementById("logoutBtn").onclick = googleLogout;
    postMessage("System", `👋 ${user.displayName} joined the College Students Group Chat`);
  } else {
    currentUser = null;
    authButtons.innerHTML = `<button class="px-4 py-2 bg-green-600 rounded" id="loginBtn">Sign in with Google</button>`;
    document.getElementById("loginBtn").onclick = googleLogin;
  }
});
