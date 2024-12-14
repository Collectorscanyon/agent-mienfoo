import crypto from "crypto";
import rawBody from "raw-body";
import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import OpenAI from "openai";
import winston from "winston";

// Validate Environment Variables
const requiredEnvVars = [
  "OPENAI_API_KEY",
  "NEYNAR_API_KEY",
  "BOT_USERNAME",
  "BOT_FID",
  "WEBHOOK_SECRET",
  "SIGNER_UUID",
];
const missingEnvVars = requiredEnvVars.filter((env) => !process.env[env]);
if (missingEnvVars.length > 0) {
  throw new Error(`Missing environment variables: ${missingEnvVars.join(", ")}`);
}

// Logging Setup
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// Initialize SDK Clients
const neynar = new NeynarAPIClient({ apiKey: process.env.NEYNAR_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Rate Limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;
const requestTimestamps = [];

// Caching Responses
const responseCache = new Map();

// Signature Verification
function verifySignature(req, rawBody) {
  const signature = req.headers["x-neynar-signature"];
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    logger.warn("Missing signature or webhook secret");
    return false;
  }

  try {
    const hmac = crypto.createHmac("sha256", webhookSecret);
    const computedSignature = hmac.update(rawBody).digest("hex");
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(computedSignature, "hex")
    );

    if (!isValid) {
      logger.warn("Signature mismatch", { provided: signature, expected: computedSignature });
    }
    return isValid;
  } catch (error) {
    logger.error("Signature verification failed", { error: error.stack });
    return false;
  }
}

// Rate Limit Check
function checkRateLimit() {
  const now = Date.now();
  requestTimestamps.push(now);

  // Remove timestamps older than the window
  requestTimestamps.splice(
    0,
    requestTimestamps.length - MAX_REQUESTS_PER_WINDOW
  );

  if (
    requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW &&
    now - requestTimestamps[0] <= RATE_LIMIT_WINDOW
  ) {
    logger.warn("Rate limit exceeded", { timestamp: new Date().toISOString() });
    return false;
  }
  return true;
}

// Generate Bot Response
async function generateBotResponse(text) {
  if (responseCache.has(text)) {
    logger.debug("Using cached response", { text });
    return responseCache.get(text);
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [
      {
        role: "system",
        content:
          "You are Mienfoo, a knowledgeable and enthusiastic collector bot.",
      },
      { role: "user", content: text },
    ],
  });

  const reply =
    response.choices[0]?.message?.content || "I'm not sure how to respond.";
  responseCache.set(text, reply);
  return reply;
}

// Health Check Endpoint
function healthCheckHandler(req, res) {
  const memory = process.memoryUsage();
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      status: "ok",
      environment: process.env.NODE_ENV || "development",
      memory: {
        heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)}MB`,
      },
    })
  );
}

// Webhook Handler
export default async function handler(req, res) {
  logger.info("Received request", { method: req.method, url: req.url });

  if (req.method === "GET") {
    return healthCheckHandler(req, res);
  }

  try {
    if (req.method !== "POST") {
      logger.warn("Invalid request method", { method: req.method });
      res.writeHead(405, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Only POST method allowed" }));
      return;
    }

    if (!checkRateLimit()) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Rate limit exceeded" }));
      return;
    }

    const raw = await rawBody(req);
    logger.debug("Raw body received", { rawBody: raw.toString() });

    if (!verifySignature(req, raw)) {
      logger.warn("Signature verification failed", { headers: req.headers });
      res.writeHead(401, { "Content-Type": "text/html" });
      res.end("<h1>401 Unauthorized</h1><p>Invalid signature.</p>");
      return;
    }

    const body = JSON.parse(raw.toString());
    logger.debug("Parsed body content", { body });

    if (body.type !== "cast.created") {
      logger.info("Ignored event type", { type: body.type });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ignored", reason: "not a cast event" }));
      return;
    }

    const cast = body.data;
    logger.info("Processing cast", { cast });

    if (!cast.text.includes(`@${process.env.BOT_USERNAME}`)) {
      logger.info("Bot not mentioned in cast", { castText: cast.text });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ status: "ignored", reason: "bot not mentioned" })
      );
      return;
    }

    const response = await generateBotResponse(cast.text);
    logger.info("Generated bot response", { response });

    await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID,
      text: `@${cast.author.username} ${response}`,
      parent: cast.hash,
    });

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "success" }));
  } catch (error) {
    logger.error("Error handling webhook", { error: error.stack });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal Server Error" }));
  }
}
