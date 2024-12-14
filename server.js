const http = require("http");
const handler = require("./index.js");

// Enhanced logging for uncaught exceptions
process.on("uncaughtException", (error) => {
  console.error("🔥 Uncaught exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ Unhandled promise rejection:", { reason, promise });
});

// Create the HTTP server
const server = http.createServer(async (req, res) => {
  try {
    console.log(`📩 Incoming request: ${req.method} ${req.url}`);
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
