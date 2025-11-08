// Use fetch streaming to get tokenized output from /api/chat/stream
async function triggerAIStreaming(userText) {
  // add a "thinking" doc to Firestore first so users see AI is preparing
  const thinkingRef = await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
    sender: "Express AI",
    text: "Express AI is thinking...", // temporary placeholder
    isThinking: true,
    timestamp: serverTimestamp()
  });

  try {
    const messages = [
      { role: "system", content: "You are Express AI, respond only when mentioned with @expressai. Provide helpful, polite, concise answers." },
      { role: "user", content: userText }
    ];
    const model = modelSelect.value || "gpt-4o-mini";

    // Send POST and read response stream
    const resp = await fetch("/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: (await getIdTokenHeader()) },
      body: JSON.stringify({ messages, model })
    });

    if (!resp.ok) {
      const err = await resp.json().catch(()=>({error: resp.statusText}));
      // replace thinking with error message
      await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
        sender: "Express AI",
        text: "Error: " + (err.error || err.detail || JSON.stringify(err)),
        timestamp: serverTimestamp()
      });
      return;
    }

    // Read streamed chunks from the response body
    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let accumulated = "";

    // Option: remove the thinking document after you start streaming (non-atomic simple method)
    // await deleteDoc(thinkingRef); // requires import of deleteDoc if you want to use

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      // OpenAI data may come as lines like: "data: {json}\n\n"
      // We forward raw chunks; here we will attempt to extract readable text pieces.
      // We'll append the chunk to accumulated and attempt to parse JSON objects inside "data: " lines.
      accumulated += chunk;

      // Break accumulated into lines
      const lines = accumulated.split(/\r?\n/);
      // process each line that begins with 'data: '
      for (const line of lines) {
        if (!line) continue;
        if (line.startsWith("data: ")) {
          const payload = line.replace(/^data: /, "").trim();
          if (payload === "[DONE]") {
            // done streaming
            accumulated = "";
            break;
          }
          try {
            // OpenAI streaming payloads contain JSON with choices[].delta.content
            const obj = JSON.parse(payload);
            const delta = obj.choices?.[0]?.delta;
            const text = delta?.content || "";
            if (text) {
              // append token to a temporary local assembly
              // For smooth UI: update a special 'stream' doc in Firestore or append incremental messages
              // Simpler approach: add new message for each chunk (or update a doc if you store its id)
              await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
                sender: "Express AI",
                text: text,
                streaming: true,
                timestamp: serverTimestamp()
              });
            }
          } catch (e) {
            // If parse fails, ignore (chunk may be partial)
          }
        } else {
          // Not a data: line — could be a raw text chunk; append as is
          try {
            const maybe = JSON.parse(line);
            const text = maybe.choices?.[0]?.delta?.content || "";
            if (text) {
              await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
                sender: "Express AI",
                text: text,
                streaming: true,
                timestamp: serverTimestamp()
              });
            }
          } catch (e) {
            // ignore
          }
        }
      } // end lines loop

      // empty accumulated to avoid reprocessing
      accumulated = "";
    } // end while

    // final marker: optionally add "[done]" or leave as is
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: "Express AI",
      text: "—",
      timestamp: serverTimestamp()
    });

  } catch (err) {
    console.error("triggerAIStreaming error", err);
    await addDoc(collection(db, "rooms", currentRoomId, "messages"), {
      sender: "Express AI",
      text: "Error generating response.",
      timestamp: serverTimestamp()
    });
  } finally {
    // optionally clear thinking flag if you updated a doc
  }
}

// helper to get Authorization header with Firebase ID token for secure endpoints
async function getIdTokenHeader() {
  if (!currentUser) return "";
  try {
    const token = await currentUser.getIdToken();
    return `Bearer ${token}`;
  } catch (e) {
    console.warn("Failed to get ID token:", e);
    return "";
  }
}
