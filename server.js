const http = require("http");
const handler = require("./index.js");

// Enhanced logging for uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ Unhandled promise rejection:", { reason, promise });
});

// Log environment variables for debugging runtime in Vercel
console.log(`🌍 Runtime Environment Variables: ${JSON.stringify(process.env, null, 2)}`);
console.log(`Loaded WEBHOOK_SECRET: ${process.env.WEBHOOK_SECRET}`); // Add debug log for WEBHOOK_SECRET

// Function to verify the webhook secret
const verifyWebhookSecret = (req) => {
  const secret = req.headers["authorization"];
  console.log(`🔑 Authorization Header: ${secret}`);
  if (!secret || secret !== process.env.WEBHOOK_SECRET) {
    throw new Error("Unauthorized");
  }
};

// Create the HTTP server
const server = http.createServer(async (req, res) => {
  try {
    console.log(`📩 Incoming request: ${req.method} ${req.url}`);

    // Verify the secret before proceeding
    try {
      verifyWebhookSecret(req);
    } catch (err) {
      console.error("🚫 Unauthorized request:", err.message);
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    // Call the handler
    await handler(req, res);
    console.log(`✅ Request handled successfully: ${req.method} ${req.url}`);
  } catch (error) {
    console.error("❌ Server error:", error);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
});

// Improved logging for server startup
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
