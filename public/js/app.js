// public/js/app.js
import { auth, googleLogin, googleLogout, db, onAuth } from "./firebase.js";
import {
  collection, addDoc, doc, setDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
const currentRoomId = "college-group";

const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const authButtons = document.getElementById("authButtons");
const presenceList = document.getElementById("presenceList");
const modelSelect = document.getElementById("modelSelect");
const joinBtn = document.getElementById("joinBtn");
const newsBtn = document.getElementById("newsBtn");
const sportsBtn = document.getElementById("sportsBtn");
const weatherBtn = document.getElementById("weatherBtn");
const nursingBtn = document.getElementById("nursingBtn");
const mathBtn = document.getElementById("mathBtn");
const englishBtn = document.getElementById("englishBtn");
const monetizeBtn = document.getElementById("monetizeBtn");
const songBtn = document.getElementById("songBtn");

const contactForm = document.getElementById("contactForm");
const contactName = document.getElementById("contactName");
const contactEmail = document.getElementById("contactEmail");
const contactMessage = document.getElementById("contactMessage");
const contactSubmit = document.getElementById("contactSubmit");
const contactStatus = document.getElementById("contactStatus");

// ensure room doc exists (client-side friendly)
async function ensureRoom() {
  try {
    await setDoc(doc(db, "rooms", currentRoomId), { id: currentRoomId, title: "College Students Group Chat", public: true }, { merge: true });
  } catch(e){}
}
ensureRoom();

// listen messages
const msgsRef = collection(db, "rooms", currentRoomId, "messages");
const q = query(msgsRef, orderBy("timestamp"));
onSnapshot(q, snap => {
  messagesEl.innerHTML = "";
  snap.forEach(d => renderMessage(d.data()));
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

// render a message
function renderMessage(m) {
  const wrap = document.createElement("div");
  wrap.className = "flex " + ((currentUser && m.sender === currentUser.displayName) ? "justify-end" : "justify-start");
  const bubble = document.createElement("div");
  bubble.className = "bubble " + (m.sender === "Express AI" ? "bg-blue-700" : "bg-gray-700");
  const ts = m.timestamp && m.timestamp.toDate ? new Date(m.timestamp.toDate()).toLocaleTimeString() : "";
  bubble.innerHTML = `<div class="text-xs text-white/60"><strong>${m.sender}</strong> ${ts}</div><div style="white-space:pre-wrap">${m.text}</div>`;
  if (m.fileUrl) {
    const a = document.createElement("a");
    a.href = m.fileUrl;
    a.target = "_blank";
    a.textContent = `Attachment: ${m.fileName}`;
    a.className = "block mt-2 underline text-sm";
    bubble.appendChild(a);
  }
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
}

// sending messages
sendBtn.onclick = async () => {
  const text = chatInput.value.trim();
  if (!text) return;
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
    sender: currentUser ? currentUser.displayName : "Anonymous",
    text,
    fileUrl: null,
    fileName: null,
    timestamp: serverTimestamp()
  });
  chatInput.value = "";
  // trigger AI only when tagged
  if (text.toLowerCase().includes("@expressai")) {
    triggerAI(text);
  }
};

// file upload
fileBtn.onclick = () => fileInput.click();
fileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: fd });
  const j = await res.json();
  if (j.ok) {
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: currentUser ? currentUser.displayName : "Anonymous",
      text: `[Uploaded file: ${j.file.name}]`,
      fileUrl: j.file.url,
      fileName: j.file.name,
      timestamp: serverTimestamp()
    });
  } else alert("Upload failed");
};

// AI trigger via backend
async function triggerAI(userText) {
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
    sender: "Express AI",
    text: "Express AI is thinking...",
    timestamp: serverTimestamp()
  });

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: userText }], model: modelSelect.value || "gpt-3.5-turbo" })
    });
    const data = await resp.json();
    const reply = data.choices?.[0]?.message?.content || "Sorry, I couldn't generate a reply.";
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: "Express AI",
      text: reply,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("AI error", err);
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: "Express AI",
      text: "Error generating response.",
      timestamp: serverTimestamp()
    });
  }
}

// Subject buttons
async function askSubject(subject) {
  const q = prompt(`Ask ${subject} AI:`, "");
  if (!q) return;
  const r = await fetch("/api/subject", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, messages: [{ role: "user", content: q }] }) });
  const j = await r.json();
  if (!j.ok) return alert("Subject AI failed");
  const reply = j.data?.choices?.[0]?.message?.content || JSON.stringify(j.data);
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: `${subject} AI`, text: reply, timestamp: serverTimestamp() });
}
nursingBtn.onclick = () => askSubject("nursing");
mathBtn.onclick = () => askSubject("math");
englishBtn.onclick = () => askSubject("english");
monetizeBtn.onclick = () => askSubject("monetize");

// Song generator
songBtn.onclick = async () => {
  const promptText = prompt("Song idea/theme:");
  if (!promptText) return;
  const style = prompt("Style (pop, reggae, gospel...):", "pop");
  const length = prompt("Structure (verse-chorus):", "verse-chorus");
  const r = await fetch("/api/song", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: promptText, style, length }) });
  const j = await r.json();
  if (!j.ok) return alert("Song failed");
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: "Song AI", text: j.lyrics || "No lyrics", timestamp: serverTimestamp() });
};

// News / Weather / Sports
newsBtn.onclick = async () => {
  const q = prompt("Search news for (leave blank for top headlines):", "");
  const url = "/api/news" + (q ? `?q=${encodeURIComponent(q)}` : "");
  const r = await fetch(url);
  const j = await r.json();
  if (!j.ok) return alert("News error");
  const items = j.data.articles?.slice(0,6) || [];
  const txt = items.map(a => `${a.title}\n${a.url}`).join("\n\n") || "No news";
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: "News", text: txt, timestamp: serverTimestamp() });
};
weatherBtn.onclick = async () => {
  const city = prompt("City:", "Monrovia");
  const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
  const j = await r.json();
  if (!j.ok) return alert("Weather error");
  const d = j.data;
  const txt = `${d.name}: ${d.weather?.[0]?.description}. Temp: ${d.main?.temp}°C`;
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: "Weather", text: txt, timestamp: serverTimestamp() });
};
sportsBtn.onclick = async () => {
  const q = prompt("League or team query (example: EPL):", "");
  const r = await fetch(`/api/sports?league=${encodeURIComponent(q)}`);
  const j = await r.json();
  if (!j.ok) return alert("Sports error");
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: "Sports", text: JSON.stringify(j.data).slice(0,1200), timestamp: serverTimestamp() });
};

// Join / Contact flow
joinBtn.onclick = async () => {
  alert("To join, please fill the Contact form on the right and press Send Request. Admin will review and respond.");
};

contactSubmit.onclick = async () => {
  const name = contactName.value.trim();
  const email = contactEmail.value.trim();
  const message = contactMessage.value.trim();
  if (!name || !email || !message) return contactStatus.textContent = "Please complete all fields.";
  contactStatus.textContent = "Sending...";
  try {
    const r = await fetch("/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, email, message }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error || "Failed");
    contactStatus.textContent = "Request sent. Admin will review.";
    contactName.value = contactEmail.value = contactMessage.value = "";
  } catch (err) {
    contactStatus.textContent = "Error sending request.";
  }
};

// Auth UI
onAuth(user => {
  currentUser = user;
  if (user) {
    authButtons.innerHTML = `<img src="${user.photoURL}" class="w-8 h-8 rounded-full inline mr-2" /> ${user.displayName} <button id="logoutBtn" class="ml-2 px-3 py-1 bg-red-600 rounded">Logout</button>`;
    document.getElementById("logoutBtn").onclick = async () => { await googleLogout(); };
    addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: "System", text: `${user.displayName} joined the room.`, timestamp: serverTimestamp() });
  } else {
    authButtons.innerHTML = `<button id="loginBtn" class="px-3 py-1 bg-green-600 rounded">Sign in with Google</button>`;
    document.getElementById("loginBtn").onclick = async () => { await googleLogin(); };
  }
});
