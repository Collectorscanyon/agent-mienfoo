import * as crypto from "crypto";
import rawBody from "raw-body";
import { NeynarAPIClient } from "@neynar/nodejs-sdk";
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
    throw new Error(`Missing environment variables: ${missingEnvVars.join(", ")}`);
}
// Initialize logging
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || "info",
    format: winston.format.json(),
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
function verifySignature(req, rawBody) {
    const signature = req.headers["x-neynar-signature"];
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
        const isValid = crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(computedSignature, "hex"));
        if (!isValid) {
            logger.warn("Invalid signature", {
                provided: signature,
                expected: computedSignature,
            });
        }
        return isValid;
    }
    catch (error) {
        logger.error("Error verifying signature", { error });
        return false;
    }
}
// Generate bot response
async function generateBotResponse(text) {
    const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
            {
                role: "system",
                content: "You are Mienfoo, a knowledgeable and enthusiastic collector bot.",
            },
            { role: "user", content: text },
        ],
    });
    return (response.choices[0]?.message?.content ||
        "I'm not sure how to respond to that.");
}
// Main webhook handler
export default async function handler(req, res) {
    logger.info("Incoming request", { method: req.method, url: req.url });
    try {
        // Allow only POST requests
        if (req.method !== "POST") {
            logger.warn("Method not allowed", { method: req.method });
            res.writeHead(405, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Only POST method is allowed" }));
            return;
        }
        // Read the raw body
        const raw = await rawBody(req);
        logger.debug("Raw body received", { rawBody: raw.toString() });
        // Verify the signature
        if (!verifySignature(req, raw)) {
            logger.warn("Invalid signature");
            res.writeHead(401, { "Content-Type": "text/html" });
            res.end("<!doctype html><html><body><h1>401 Unauthorized</h1><p>Invalid signature.</p></body></html>");
            return;
        }
        // Parse JSON body
        const body = JSON.parse(raw.toString());
        logger.debug("Parsed body", body);
        if (body.type !== "cast.created") {
            logger.info("Event ignored", { reason: "not a cast event" });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ignored", reason: "not a cast event" }));
            return;
        }
        const cast = body.data;
        if (!cast.text.includes(`@${process.env.BOT_USERNAME}`)) {
            logger.info("Bot not mentioned", { cast: cast.text });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ status: "ignored", reason: "bot not mentioned" }));
            return;
        }
        const response = await generateBotResponse(cast.text);
        logger.debug("Generated response", { response });
        await neynar.publishCast({
            signerUuid: process.env.SIGNER_UUID || "",
            text: `@${cast.author.username} ${response}`,
            parent: cast.hash,
        });
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "success" }));
    }
    catch (error) {
        logger.error("Error handling webhook:", error);
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Internal Server Error" }));
    }
}
