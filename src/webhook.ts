const crypto = require("crypto");
const rawBody = require("raw-body");

// Notification function (Optional, replace with your service)
async function sendNotification(message) {
  console.log(`📧 Notification: ${message}`);
  // Implement logic for notifications here (e.g., send to Slack, email, etc.)
}

// Debug logger
const debugLog = (message, data = null) => {
  if (process.env.DEBUG_MODE === "true") {
    console.log(`[DEBUG] ${message}`, data || "");
  }
};

// Webhook handler
module.exports = async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`📩 [${timestamp}] Incoming Request: ${req.method} ${req.url}`);

  // Health check endpoint
  if (req.method === "GET") {
    return res.status(200).json({ status: "ok", message: "Webhook server is running" });
  }

  if (req.method !== "POST") {
    console.warn(`⚠️ [${timestamp}] Method Not Allowed: ${req.method}`);
    return res.status(405).json({ error: "Only POST method is allowed" });
  }

  const signature = req.headers["x-neynar-signature"];
  const secret = process.env.WEBHOOK_SECRET;

  if (!signature || !secret) {
    console.error(`🚨 [${timestamp}] Missing Signature or Secret`);
    return res.status(401).json({ error: "Invalid signature" });
  }

  try {
    // Read and verify the raw body
    const body = await rawBody(req);
    const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");

    if (
      crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(hmac, "hex")
      )
    ) {
      const parsedBody = JSON.parse(body);
      console.log(`✅ [${timestamp}] Signature Verified`);
      debugLog("Payload Received", parsedBody);

      // Respond with success
      return res.status(200).json({ status: "success", data: parsedBody });
    } else {
      console.error(`❌ [${timestamp}] Signature Mismatch`);
      debugLog("Expected HMAC", hmac);
      debugLog("Provided Signature", signature);

      // Optional: Notify about the mismatch
      await sendNotification("Webhook Signature Mismatch Detected");
      return res.status(401).json({ error: "Signature mismatch" });
    }
  } catch (err) {
    console.error(`🔥 [${timestamp}] Internal Server Error: ${err.message}`);
    console.error(err.stack);

    // Optional: Notify about the error
    await sendNotification(`Webhook Server Error: ${err.message}`);
    return res.status(500).json({ error: "Internal server error" });
  }
};
