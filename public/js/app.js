// --- in public/js/app.js (replace joinBtn.onclick) ---
joinBtn.onclick = async () => {
  if (!currentUser) return alert("Please sign in with Google first.");
  // amount: 10 USD (you can modify or ask user)
  const amount = prompt("Amount to pay (e.g., 10 for USD):", "10");
  if (!amount) return;
  const name = currentUser.displayName || prompt("Full name:", "");
  const email = currentUser.email || prompt("Email:", "");
  try {
    // create payment on server
    const resp = await fetch("/api/pay/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: Number(amount),
        currency: "USD",
        email,
        name,
        redirect_url: location.origin + "/" // user returns here after payment
      })
    });
    const j = await resp.json();
    if (!j.ok) {
      alert("Payment creation failed: " + (j.error || JSON.stringify(j)));
      return;
    }

    const { payment_link, tx_ref } = j;
    if (!payment_link) {
      // if link not present, inspect j.result.data.checkout_url or similar
      const link = j.result?.data?.link || j.result?.data?.checkout_url || j.result?.data?.payment_link || j.result?.data?.checkout?.url;
      if (link) window.open(link, "_blank");
      else {
        alert("Payment link missing. Inspect server response in logs.");
        console.log(j);
        return;
      }
    } else {
      window.open(payment_link, "_blank");
    }

    // Optionally store a local pending marker (optional)
    await addDoc(collection(db, "payments"), {
      tx_ref: tx_ref,
      uid: currentUser.uid,
      name,
      email,
      amount: Number(amount),
      currency: "USD",
      status: "pending",
      createdAt: serverTimestamp()
    });

    alert("Payment started. After completing payment, click OK then choose 'Verify payment' from the Admin UI or wait for webhook to auto-confirm.");
  } catch (err) {
    console.error("create payment error", err);
    alert("Payment failed: " + err.message);
  }
};

// Optional: user can verify one-off
async function verifyPaymentLocal(tx_ref) {
  const r = await fetch(`/api/pay/verify?tx_ref=${encodeURIComponent(tx_ref)}`);
  const j = await r.json();
  console.log("verify", j);
  alert("Verify result: " + (j.verify?.status || JSON.stringify(j.verify)));
}
