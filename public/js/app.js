// public/js/app.js
import { auth, googleLogin, googleLogout, db, onAuth } from "./firebase.js";
import {
  collection, addDoc, doc, setDoc, query, orderBy, onSnapshot, serverTimestamp, getDocs
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

let currentUser = null;
let currentRoomId = "college-group";

const roomsListEl = document.getElementById("roomsList");
const messagesEl = document.getElementById("messages");
const chatInput = document.getElementById("chatInput");
const sendBtn = document.getElementById("sendBtn");
const fileBtn = document.getElementById("fileBtn");
const fileInput = document.getElementById("fileInput");
const authButtons = document.getElementById("authButtons");
const presenceList = document.getElementById("presenceList");
const roomTitle = document.getElementById("roomTitle");
const newRoomBtn = document.getElementById("newRoomBtn");
const modelSelect = document.getElementById("modelSelect");
const announceBtn = document.getElementById("announceBtn");

// ensure default room
async function ensureRoom(id) {
  const r = doc(db, "rooms", id);
  await setDoc(r, { id, title: "College Students Group Chat", public: true }, { merge: true });
}
ensureRoom(currentRoomId);

// load list of rooms
async function loadRooms() {
  const snap = await getDocs(collection(db, "rooms"));
  roomsListEl.innerHTML = "";
  snap.forEach(d => {
    const data = d.data();
    const b = document.createElement("button");
    b.textContent = data.title || data.id;
    b.className = "w-full text-left p-2 rounded hover:bg-white/3 mb-1";
    b.onclick = () => switchRoom(data.id, data.title);
    roomsListEl.appendChild(b);
  });
}
loadRooms();

// switch room and start listening
let unsubMessages = null;
function switchRoom(roomId, title) {
  currentRoomId = roomId;
  roomTitle.textContent = title || roomId;
  if (unsubMessages) unsubMessages();
  const msgsRef = collection(db, "rooms", roomId, "messages");
  const q = query(msgsRef, orderBy("timestamp"));
  unsubMessages = onSnapshot(q, (snap) => {
    messagesEl.innerHTML = "";
    snap.forEach(docSnap => {
      const m = docSnap.data();
      renderMessage(m);
    });
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}
switchRoom(currentRoomId, "College Students Group Chat");

// render message
function renderMessage(m) {
  const wrapper = document.createElement("div");
  wrapper.className = "flex " + ((currentUser && m.sender === currentUser.displayName) ? "justify-end" : "justify-start");
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
  wrapper.appendChild(bubble);
  messagesEl.appendChild(wrapper);
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

  // trigger AI only if message contains @expressai (case-insensitive)
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
  const resp = await fetch("/api/upload", { method: "POST", body: fd });
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

// trigger AI via backend
async function triggerAI(userText) {
  // add a quick thinking notice (so users see AI is responding)
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
    sender: "Express AI",
    text: "Express AI is thinking...",
    timestamp: serverTimestamp()
  });

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: userText }],
        model: modelSelect.value || "gpt-3.5-turbo"
      })
    });
    const data = await resp.json();
    const reply = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "Sorry, I couldn't generate a reply.";

    // post AI reply
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

// Auth UI - show login/logout and presence
onAuth((user) => {
  currentUser = user;
  if (user) {
    authButtons.innerHTML = `<img src="${user.photoURL}" class="w-8 h-8 rounded-full inline-block mr-2" /> ${user.displayName} <button id="logoutBtn" class="ml-2 px-3 py-1 bg-red-600 rounded">Logout</button>`;
    document.getElementById("logoutBtn").onclick = async () => { await googleLogout(); };
    // announce join
    addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: "System",
      text: `👋 ${user.displayName} joined the room.`,
      timestamp: serverTimestamp()
    });
  } else {
    authButtons.innerHTML = `<button id="loginBtn" class="px-3 py-1 bg-green-600 rounded">Sign in with Google</button>`;
    document.getElementById("loginBtn").onclick = async () => { await googleLogin(); };
  }
});

// new room creator
newRoomBtn.onclick = async () => {
  const id = prompt("Enter room id (eg. math-101):");
  if (!id) return;
  const title = prompt("Room title:", id) || id;
  await setDoc(doc(db, "rooms", id), { id, title, public: true });
  loadRooms();
  switchRoom(id, title);
};

// announce (simple)
announceBtn.onclick = async () => {
  const msg = prompt("Enter announcement:");
  if (!msg) return;
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
    sender: "Announcement",
    text: msg,
    timestamp: serverTimestamp()
  });
};

// listen for rooms updates
onSnapshot(collection(db, "rooms"), () => loadRooms());
