import * as crypto from "crypto";
import rawBody from "raw-body";
import { IncomingMessage, ServerResponse } from "http";
import { NeynarAPIClient, Configuration } from "@neynar/nodejs-sdk";
import OpenAI from "openai";
import winston from "winston";

export const config = {
  api: {
    bodyParser: false, // Disable Next.js built-in body parsing
  },
};

// Environment variable validation
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
  throw new Error(
    `Missing environment variables: ${missingEnvVars.join(", ")}`
  );
}

// Initialize logging
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(), // Send logs to console for Vercel
  ],
});

// Initialize clients
const neynar = new NeynarAPIClient({
  apiKey: process.env.NEYNAR_API_KEY || "",
});
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "" });

// HMAC signature verification
function verifySignature(req: IncomingMessage, rawBody: Buffer): boolean {
  const signature = req.headers["x-neynar-signature"] as string | undefined;
  const webhookSecret = process.env.WEBHOOK_SECRET;

  if (!signature) {
    logger.warn("Missing signature in headers");
    return false;
  }

  if (!webhookSecret) {
    logger.warn("Missing webhook secret in environment variables");
    return false;
  }

  try {
    const hmac = crypto.createHmac("sha256", webhookSecret);
    const computedSignature = hmac.update(rawBody).digest("hex");
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(computedSignature, "hex")
    );
  } catch (err) {
    logger.error("Error verifying signature", { error: err });
    return false;
  }
}

// Main webhook handler
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse
) {
  const timestamp = new Date().toISOString();
  logger.info(`Incoming request: ${req.method} ${req.url}`, { timestamp });

  if (req.method !== "POST") {
    logger.warn("Invalid HTTP method", { method: req.method });
    res.statusCode = 405;
    res.end(JSON.stringify({ error: "Only POST method is allowed" }));
    return;
  }

  try {
    // Parse raw body
    const body = await rawBody(req);

    // Verify the request signature
    if (!verifySignature(req, body)) {
      logger.warn("Invalid signature");
      res.statusCode = 401;
      res.end(JSON.stringify({ error: "Invalid signature" }));
      return;
    }

    // Process the webhook data
    const payload = JSON.parse(body.toString("utf8"));
    logger.info("Webhook payload received", { payload });

    // Respond to Neynar with success
    res.statusCode = 200;
    res.end(JSON.stringify({ status: "success", data: payload }));

    // Example Neynar usage
    if (payload.action === "cast") {
      await neynar.casts.create({
        text: `Hello from ${process.env.BOT_USERNAME}!`,
      });
      logger.info("Cast created successfully");
    }

    // Example OpenAI usage
    if (payload.action === "ai_prompt") {
      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [{ role: "user", content: payload.prompt }],
      });
      logger.info("AI Response", { aiResponse });
    }
  } catch (err) {
    logger.error("Error processing webhook", { error: err });

    res.statusCode = 500;
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
