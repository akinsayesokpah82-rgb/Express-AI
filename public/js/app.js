// public/js/app.js
import { auth, provider, db, googleLogin, googleLogout, setPresence, clearPresence } from "./firebase.js";
import {
  collection, addDoc, doc, setDoc, query, orderBy, onSnapshot, serverTimestamp, where, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let currentRoomId = "college-group"; // default room id
const roomsList = document.getElementById("roomsList");
const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const micBtn = document.getElementById("micBtn");
const modelSelect = document.getElementById("modelSelect");
const authButtons = document.getElementById("authButtons");
const presenceList = document.getElementById("presenceList");
const roomTitle = document.getElementById("roomTitle");
const newRoomBtn = document.getElementById("newRoomBtn");
const announceBtn = document.getElementById("announceBtn");
const adminPanel = document.getElementById("adminPanel");

const roomsRef = collection(db, "rooms");
const presenceRef = collection(db, "presence");

// create default room doc if missing (safe to call multiple times)
async function ensureDefaultRoom() {
  const r = doc(db, "rooms", currentRoomId);
  await setDoc(r, { id: currentRoomId, title: "College Students Group Chat", public: true }, { merge: true });
}
ensureDefaultRoom();

// Rooms list (simple)
async function loadRooms() {
  const snapshot = await getDocs(roomsRef);
  roomsList.innerHTML = "";
  snapshot.forEach(docSnap => {
    const d = docSnap.data();
    const btn = document.createElement("button");
    btn.className = "w-full text-left p-2 rounded hover:bg-white/3 mb-1";
    btn.textContent = d.title || d.id;
    btn.onclick = () => { switchRoom(d.id, d.title); };
    roomsList.appendChild(btn);
  });
}
loadRooms();

// switch room
async function switchRoom(roomId, title) {
  currentRoomId = roomId;
  roomTitle.textContent = title || roomId;
  listenMessages(roomId);
}

// listen messages for room
let unsubscribeMessages = null;
function listenMessages(roomId) {
  if (unsubscribeMessages) unsubscribeMessages();
  messagesEl.innerHTML = "";
  const msgsRef = collection(db, "rooms", roomId, "messages");
  const q = query(msgsRef, orderBy("timestamp"));
  unsubscribeMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";
    snap.forEach(d => {
      const data = d.data();
      renderMessage(data);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}
listenMessages(currentRoomId);

// render a message
function renderMessage(m) {
  const wrap = document.createElement("div");
  wrap.className = "flex " + (m.sender === (currentUser?.displayName || "Anonymous") ? "justify-end" : "justify-start");
  const bubble = document.createElement("div");
  bubble.className = "bubble " + (m.sender === "Express AI" ? "bg-blue-700" : "bg-gray-700");
  const ts = m.timestamp && m.timestamp.toDate ? new Date(m.timestamp.toDate()).toLocaleTimeString() : "";
  bubble.innerHTML = `<div class="text-xs text-white/60"><strong>${m.sender}</strong> ${ts}</div><div style="white-space:pre-wrap">${m.text}</div>`;
  if (m.fileUrl) {
    const a = document.createElement("a");
    a.href = m.fileUrl;
    a.textContent = `Attachment: ${m.fileName}`;
    a.target = "_blank";
    bubble.appendChild(a);
  }
  wrap.appendChild(bubble);
  messagesEl.appendChild(wrap);
}

// send message
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
  // if tagged with @expressai -> trigger AI
  if (text.toLowerCase().includes("@expressai")) {
    triggerAI(text);
  }
};

// file upload (client -> server)
fileBtn.onclick = () => fileInput.click();
fileInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const form = new FormData();
  form.append("file", file);
  const resp = await fetch("/api/upload", { method: "POST", body: form });
  const j = await resp.json();
  if (j.ok) {
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: currentUser ? currentUser.displayName : "Anonymous",
      text: `[Uploaded file: ${j.file.name}]`,
      fileUrl: j.file.url,
      fileName: j.file.name,
      timestamp: serverTimestamp()
    });
  } else {
    alert("Upload failed");
  }
};

// AI trigger
async function triggerAI(userText) {
  // show "thinking" message immediately
  const thinkingRef = await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
    sender: "Express AI",
    text: "Express AI is thinking...",
    timestamp: serverTimestamp()
  });

  try {
    const messages = [
      { role: "system", content: "You are Express AI, respond only when mentioned with @expressai. Provide helpful, polite, concise answers. Use only recent chat context if needed." },
      { role: "user", content: userText }
    ];
    const model = modelSelect.value || "gpt-4o-mini";
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, model, provider: "openai" })
    });
    const j = await resp.json();
    const reply = j.choices?.[0]?.message?.content ?? "Sorry, I couldn't produce a response.";
    // replace thinking message with final content (simple approach: add new and leave thinking)
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: "Express AI",
      text: reply,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error(err);
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: "Express AI",
      text: "Error generating response.",
      timestamp: serverTimestamp()
    });
  }
}

// voice input using Web Speech API
let recognition = null;
if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;
  micBtn.onclick = () => {
    recognition.start();
    micBtn.textContent = "🎙️ Recording...";
  };
  recognition.onresult = (e) => {
    const text = e.results[0][0].transcript;
    chatInput.value = text;
    micBtn.textContent = "🎤";
  };
  recognition.onerror = () => { micBtn.textContent = "🎤"; };
  recognition.onend = () => { micBtn.textContent = "🎤"; };
} else {
  micBtn.style.display = "none";
}

// speech synthesis for Express AI replies
// listen for new Express AI messages and speak them
const speakOnAI = true;
const aiMsgsRef = query(collection(db, "rooms", currentRoomId, "messages"), orderBy("timestamp"));
onSnapshot(aiMsgsRef, (snap) => {
  // handled above by messages listener; here we optionally play voices for latest AI messages
  snap.docChanges().forEach(change => {
    if (change.type === "added") {
      const m = change.doc.data();
      if (m.sender === "Express AI" && speakOnAI) {
        const utter = new SpeechSynthesisUtterance(m.text);
        speechSynthesis.speak(utter);
      }
    }
  });
});

// presence list (typing/online)
const presQ = query(presenceRef, orderBy("lastSeen"));
onSnapshot(presQ, (snap) => {
  presenceList.innerHTML = "";
  snap.forEach(s => {
    const d = s.data();
    const div = document.createElement("div");
    div.className = "py-1";
    div.textContent = `${d.displayName || s.id} ${d.typing ? "• typing…" : d.online ? "• online" : ""}`;
    presenceList.appendChild(div);
  });
});

// presence + typing (update Firestore on auth state)
auth.onAuthStateChanged(async (user) => {
  if (user) {
    currentUser = user;
    // mark presence
    await setPresence(user.uid, { displayName: user.displayName, online: true, typing: false });
    authButtons.innerHTML = `<img src="${user.photoURL}" class="w-8 h-8 rounded-full inline mr-2" /> <span>${user.displayName}</span> <button id="logout">Logout</button>`;
    document.getElementById("logout").onclick = async () => {
      await clearPresence(user.uid);
      googleLogout();
    };
    // announce join
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: "System",
      text: `👋 ${user.displayName} joined the room.`,
      timestamp: serverTimestamp()
    });
  } else {
    currentUser = null;
    authButtons.innerHTML = `<button id="login" class="px-3 py-1 bg-green-600 rounded">Sign in with Google</button>`;
    document.getElementById("login").onclick = () => googleLogin();
  }
});

// simple new room creator
newRoomBtn.onclick = async () => {
  const id = prompt("Enter room id (eg. math-101):");
  if (!id) return;
  const title = prompt("Room title:", id) || id;
  await setDoc(doc(db, "rooms", id), { id, title, public: true });
  await loadRooms();
  switchRoom(id, title);
};

// announce button -> admin only: posts to top room and to /api/admin/announce
announceBtn.onclick = async () => {
  const msg = prompt("Enter announcement:");
  if (!msg) return;
  // post to current room
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
    sender: "Announcement",
    text: msg,
    timestamp: serverTimestamp()
  });
  // call backend to validate admin (backend checks ADMIN_UID)
  const uid = currentUser?.uid;
  await fetch("/api/admin/announce", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ uid, message: msg }) });
};

// keep rooms list up to date
onSnapshot(collection(db, "rooms"), () => loadRooms());
