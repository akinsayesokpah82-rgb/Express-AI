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
const adminPanel = document.getElementById("adminPanel");

// Ensure room exists (client-side convenience)
(async function ensureRoom() {
  try { await setDoc(doc(db, "rooms", currentRoomId), { id: currentRoomId, title: "College Students Group Chat", public: true }, { merge: true }); } catch(e){}
})();

// Listen messages in real time
const msgsRef = collection(db, "rooms", currentRoomId, "messages");
const q = query(msgsRef, orderBy("timestamp"));
onSnapshot(q, snap => {
  messagesEl.innerHTML = "";
  snap.forEach(d => renderMessage(d.data()));
  messagesEl.scrollTop = messagesEl.scrollHeight;
});

// Render message
function renderMessage(m) {
  const wrapper = document.createElement("div");
  wrapper.className = (currentUser && m.sender === currentUser.displayName) ? "message user" : (m.sender === "Express AI" ? "message ai" : "message");
  const header = `<div class="text-xs text-white/60"><strong>${m.sender}</strong> ${m.timestamp ? (m.timestamp.toDate ? new Date(m.timestamp.toDate()).toLocaleTimeString() : "") : ""}</div>`;
  const content = `<div>${escapeHtml(m.text)}</div>`;
  wrapper.innerHTML = header + content;
  if (m.fileUrl) {
    const a = document.createElement("a");
    a.href = m.fileUrl;
    a.target = "_blank";
    a.textContent = `Attachment: ${m.fileName}`;
    a.className = "block mt-2 underline text-sm";
    wrapper.appendChild(a);
  }
  messagesEl.appendChild(wrapper);
}

// Escape HTML
function escapeHtml(s){ if(!s) return ""; return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// Send message
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

  // If message mentions @expressai, call server to generate reply and save it
  if (text.toLowerCase().includes("@expressai")) {
    // server will add "thinking..." and reply into Firestore
    try {
      await fetch("/api/room/ai-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: currentRoomId, userMessage: text, model: modelSelect.value })
      });
    } catch (err) {
      console.error("AI trigger error", err);
    }
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
  } else alert("Upload failed");
};

// Subject helpers
async function askSubject(subject) {
  const q = prompt(`Ask ${subject} AI:`, "");
  if (!q) return;
  try {
    const r = await fetch("/api/subject", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ subject, messages: [{ role:"user", content: q }], model: modelSelect.value }) });
    const j = await r.json();
    if (!j.ok) return alert("Subject AI failed");
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: `${subject} AI`, text: j.reply || "No reply", timestamp: serverTimestamp() });
  } catch (err) { alert("Subject error"); }
}
nursingBtn.onclick = () => askSubject("nursing");
mathBtn.onclick = () => askSubject("math");
englishBtn.onclick = () => askSubject("english");
monetizeBtn.onclick = () => askSubject("monetize");

// Song generator
songBtn.onclick = async () => {
  const prompt = prompt("Song idea/theme:");
  if (!prompt) return;
  const style = prompt("Style (pop, reggae, gospel...):", "pop");
  const length = prompt("Structure (verse-chorus):", "verse-chorus");
  try {
    const r = await fetch("/api/song", { method: "POST", headers: { "Content-Type":"application/json" }, body: JSON.stringify({ prompt, style, length, model: modelSelect.value }) });
    const j = await r.json();
    if (!j.ok) return alert("Song error");
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: "Song AI", text: j.lyrics || "No lyrics", timestamp: serverTimestamp() });
  } catch (e) { alert("Song error"); }
};

// News/Weather/Sports
newsBtn.onclick = async () => {
  const q = prompt("Search news for (leave blank for headlines):","");
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
  const q = prompt("League/team:", "");
  const r = await fetch(`/api/sports?league=${encodeURIComponent(q)}`);
  const j = await r.json();
  if (!j.ok) return alert("Sports error");
  await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: "Sports", text: JSON.stringify(j.data).slice(0,1200), timestamp: serverTimestamp() });
};

// Contact / Join requests (no direct payment here — payments flow below)
const contactForm = document.getElementById("contactForm");
const contactName = document.getElementById("contactName");
const contactEmail = document.getElementById("contactEmail");
const contactMessage = document.getElementById("contactMessage");
const contactSubmit = document.getElementById("contactSubmit");
const contactStatus = document.getElementById("contactStatus");

contactSubmit.onclick = async () => {
  const name = contactName.value.trim();
  const email = contactEmail.value.trim();
  const message = contactMessage.value.trim();
  if (!name || !email || !message) { contactStatus.textContent = "Complete all fields."; return; }
  contactStatus.textContent = "Sending...";
  try {
    const r = await fetch("/api/contact", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ name, email, message }) });
    const j = await r.json();
    if (!j.ok) throw new Error(j.error||"Failed");
    contactStatus.textContent = "Request sent. Admin will review.";
    contactName.value = contactEmail.value = contactMessage.value = "";
  } catch (err) {
    contactStatus.textContent = "Error sending request.";
  }
};

// Payment flow with Flutterwave (client creates server payment, opens link)
joinBtn.onclick = async () => {
  if (!currentUser) { alert("Sign in with Google first."); return; }
  const amount = prompt("Enter amount in USD (e.g., 10):", "10");
  if (!amount) return;
  const name = currentUser.displayName || prompt("Full name:", "");
  const email = currentUser.email || prompt("Your email:", "");
  try {
    const resp = await fetch("/api/pay/create", {
      method: "POST", headers: { "Content-Type":"application/json" },
      body: JSON.stringify({ amount: Number(amount), currency: "USD", email, name, redirect_url: location.origin + "/" })
    });
    const j = await resp.json();
    if (!j.ok) throw new Error(j.error || JSON.stringify(j));
    // open checkout link from flutterwave (depends on API response)
    const link = j.result?.data?.link || j.result?.data?.checkout_url || j.result?.data?.payment_link || j.result?.data?.flw_ref;
    if (link) window.open(link, "_blank");
    else alert("Payment link returned. Check server logs.");
    // create a local payment record in Firestore for admin view
    await addDoc(collection(db, "payments"), { tx_ref: j.tx_ref, uid: currentUser.uid, email, name, amount: Number(amount), currency: "USD", status: "pending", createdAt: serverTimestamp() });
    alert("Payment started. Admin will approve after verification or webhook.");
  } catch (err) {
    console.error("pay create error", err);
    alert("Payment initiation failed.");
  }
};

// Admin Panel: list pending payments (client-side convenience only)
const ADMIN_UID = (typeof ADMIN_UID !== "undefined") ? ADMIN_UID : null;
async function loadPendingPaymentsAdmin() {
  // only show to admin (client-side check; server enforces security)
  if (!currentUser || (ADMIN_UID && currentUser.uid !== ADMIN_UID)) return;
  adminPanel.innerHTML = "<h4 class='font-semibold'>Pending Payments</h4>";
  const snaps = await getDocs(collection(db, "payments"));
  const list = [];
  snaps.forEach(s => list.push({ id: s.id, ...s.data() }));
  list.filter(p => p.status === "pending" || p.status === "created").forEach(p => {
    const div = document.createElement("div");
    div.className = "p-2 mb-2 bg-white/5 rounded";
    div.innerHTML = `<div><strong>${p.name||p.email}</strong></div><div>Amount:${p.amount} ${p.currency}</div><a href="${p.proofUrl||'#'}" target="_blank">proof</a>
      <div class="mt-2"><button class="approveBtn mr-2 px-2 py-1 bg-green-600 rounded">Approve</button><button class="rejectBtn px-2 py-1 bg-red-600 rounded">Reject</button></div>`;
    adminPanel.appendChild(div);
    div.querySelector(".approveBtn").onclick = async () => {
      if (!confirm("Approve this payment?")) return;
      try {
        const idToken = await currentUser.getIdToken();
        const r = await fetch("/api/admin/approve", { method: "POST", headers: { "Content-Type":"application/json", "Authorization": `Bearer ${idToken}` }, body: JSON.stringify({ paymentId: p.id }) });
        const j = await r.json();
        if (!j.ok) throw new Error(j.error||JSON.stringify(j));
        alert("Approved");
        loadPendingPaymentsAdmin();
      } catch (err) { alert("Approve failed"); }
    };
    div.querySelector(".rejectBtn").onclick = async () => {
      if (!confirm("Reject this payment?")) return;
      await setDoc(doc(db, "payments", p.id), { status: "rejected", reviewedAt: serverTimestamp() }, { merge: true });
      loadPendingPaymentsAdmin();
    };
  });
}

// Auth UI
onAuth(user => {
  currentUser = user;
  if (user) {
    authButtons.innerHTML = `<img src="${user.photoURL}" class="w-8 h-8 rounded-full inline mr-2" /> ${user.displayName} <button id="logoutBtn" class="ml-2 px-3 py-1 bg-red-600 rounded">Logout</button>`;
    document.getElementById("logoutBtn").onclick = async () => { await googleLogout(); };
    addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: "System", text: `${user.displayName} joined the room.`, timestamp: serverTimestamp() });
    loadPendingPaymentsAdmin();
  } else {
    authButtons.innerHTML = `<button id="loginBtn" class="px-3 py-1 bg-green-600 rounded">Sign in with Google</button>`;
    document.getElementById("loginBtn").onclick = async () => { await googleLogin(); };
  }
});
