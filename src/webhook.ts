const crypto = require("crypto");
const rawBody = require("raw-body");

// Helper to verify signature
const verifyWebhookSignature = (req, secret) => {
  const signature = req.headers["x-neynar-signature"];
  if (!signature || !secret) throw new Error("Invalid signature or missing secret");

  const body = req.rawBody || "";
  const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(hmac, "hex"))) {
    throw new Error("Signature mismatch");
  }
};

module.exports = async (req, res) => {
  try {
    // Ensure the method is POST
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Only POST method is allowed" });
    }

    // Parse raw body and make it available for signature verification
    req.rawBody = await rawBody(req);

    // Retrieve and validate environment variables
    const secret = process.env.WEBHOOK_SECRET;
    if (!secret) {
      console.error("🚨 WEBHOOK_SECRET is not set in environment variables.");
      return res.status(500).json({ error: "Server configuration error" });
    }

    // Verify signature
    try {
      verifyWebhookSignature(req, secret);
    } catch (error) {
      console.error("❌ Signature validation failed:", error.message);
      return res.status(401).json({ error: error.message });
    }

    // Route to the appropriate API based on the URL
    const urlPath = req.url;
    console.log(`📩 Incoming request: ${req.method} ${urlPath}`);

    if (urlPath === "/api/endpoint1") {
      // Logic for Endpoint 1
      return res.status(200).json({ message: "Endpoint 1 handled successfully" });
    } else if (urlPath === "/api/endpoint2") {
      // Logic for Endpoint 2
      return res.status(200).json({ message: "Endpoint 2 handled successfully" });
    } else if (urlPath === "/api/endpoint3") {
      // Logic for Endpoint 3
      return res.status(200).json({ message: "Endpoint 3 handled successfully" });
    } else {
      console.warn(`⚠️ Unknown API path: ${urlPath}`);
      return res.status(404).json({ error: "Endpoint not found" });
    }
  } catch (err) {
    console.error("❌ Unexpected error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
