// --- News
document.getElementById("newsBtn").onclick = async () => {
  try {
    const q = prompt("Search news for (leave blank for top headlines):", "");
    const url = "/api/news" + (q ? "?q=" + encodeURIComponent(q) : "");
    const r = await fetch(url);
    const j = await r.json();
    if (!j.ok) return alert("News failed: " + (j.error||""));
    // show headlines in a simple modal or chat
    const articles = j.data.articles || [];
    const top = articles.slice(0, 6).map(a => `${a.title} — ${a.source.name}\n${a.url}`).join("\n\n");
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: "News",
      text: top || "No news",
      timestamp: serverTimestamp()
    });
  } catch (e) { alert("News error: "+e.message); }
};

// --- Weather
document.getElementById("weatherBtn").onclick = async () => {
  try {
    const city = prompt("Enter city (e.g., Monrovia):", "Monrovia");
    const r = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
    const j = await r.json();
    if (!j.ok) return alert("Weather failed: " + (j.error||""));
    const d = j.data;
    const txt = `${d.name}: ${d.weather?.[0]?.description || ""}. Temp: ${d.main?.temp} °C, Humidity: ${d.main?.humidity}%`;
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: "Weather", text: txt, timestamp: serverTimestamp() });
  } catch (e) { alert("Weather error: "+e.message); }
};

// --- Sports
document.getElementById("sportsBtn").onclick = async () => {
  try {
    const league = prompt("Enter league or team query (example: EPL or Liverpool):", "");
    const url = `/api/sports?league=${encodeURIComponent(league)}`;
    const r = await fetch(url);
    const j = await r.json();
    if (!j.ok) return alert("Sports failed: "+(j.error||""));
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: "Sports", text: JSON.stringify(j.data).slice(0,1500), timestamp: serverTimestamp() });
  } catch (e) { alert("Sports error: "+e.message); }
};

// --- Subject bots helper
async function askSubject(subject) {
  const q = prompt(`Ask ${subject} AI:`, "");
  if (!q) return;
  try {
    const resp = await fetch("/api/subject", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ subject, messages: [{ role: "user", content: q }] }) });
    const j = await resp.json();
    if (!j.ok) return alert("Subject AI failed: " + (j.error||""));
    const reply = j.data.choices?.[0]?.message?.content || JSON.stringify(j.data);
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), { sender: `${subject} AI`, text: reply, timestamp: serverTimestamp() });
  } catch (e) { alert("Subject error: "+e.message); }
}
document.getElementById("nursingBtn").onclick = ()=>askSubject("nursing");
document.getElementById("mathBtn").onclick = ()=>askSubject("math");
document.getElementById("englishBtn").onclick = ()=>askSubject("english");
document.getElementById("monetizeBtn").onclick = ()=>askSubject("monetize");

// --- Song generator
document.getElementById("songBtn").onclick = async () => {
  const promptText = prompt("Enter song idea / theme (e.g., 'love and freedom'):");
  if (!promptText) return;
  const style = prompt("Enter style (pop, reggae, hiphop, gospel...):", "pop");
  const length = prompt("Structure (verse-chorus, chorus-verse-chorus):", "verse-chorus");
  try {
    const r = await fetch("/api/song", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: promptText, style, length }) });
    const j = await r.json();
    if (!j.ok) return alert("Song failed: " + (j.error||""));
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: "Song AI",
      text: j.lyrics || "No lyrics",
      timestamp: serverTimestamp()
    });
  } catch (e) { alert("Song error: "+e.message); }
};
