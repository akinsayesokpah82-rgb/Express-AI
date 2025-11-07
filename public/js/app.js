// public/js/app.js
const chatWindow = document.getElementById("chatWindow");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const modelSelect = document.getElementById("modelSelect");
const fileInput = document.getElementById("fileInput");

let conversation = [];

function appendMessage(role, text) {
  const wrapper = document.createElement("div");
  wrapper.className = `msg ${role === "user" ? "user" : "assistant"}`;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = text;

  wrapper.appendChild(bubble);
  chatWindow.appendChild(wrapper);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;

  appendMessage("user", text);
  conversation.push({ role: "user", content: text });
  messageInput.value = "";

  // If file attached, we could handle it here (this demo only informs)
  if (fileInput.files.length) {
    const f = fileInput.files[0];
    appendMessage("assistant", `⚠️ Note: file "${f.name}" received by client, but this demo does not upload files to server. To enable file upload, add backend handling.`);
  }

  appendMessage("assistant", "… Thinking …");

  try {
    const resp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelSelect.value,
        messages: conversation
      })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(()=>({error:"unknown"}));
      throw new Error(err?.error || err?.detail || resp.statusText);
    }

    const data = await resp.json();
    // Extract assistant message
    const assistantMsg = data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : JSON.stringify(data);

    // remove the "… Thinking …" message (last assistant bubble)
    const lastBubble = Array.from(chatWindow.querySelectorAll(".msg.assistant .bubble")).pop();
    if (lastBubble && lastBubble.textContent === "… Thinking …") {
      lastBubble.textContent = assistantMsg;
    } else {
      appendMessage("assistant", assistantMsg);
    }

    conversation.push({ role: "assistant", content: assistantMsg });

  } catch (err) {
    console.error(err);
    appendMessage("assistant", "Error: " + String(err.message || err));
  }
});

// lightweight enter-to-send
messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    chatForm.dispatchEvent(new Event("submit", { cancelable: true }));
  }
});
