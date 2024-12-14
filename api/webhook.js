"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
exports.default = handler;
const crypto_1 = __importDefault(require("crypto"));
const raw_body_1 = __importDefault(require("raw-body"));
// Disable Next.js body parsing
exports.config = {
    api: {
        bodyParser: false,
    },
};
function verifySignature(req) {
    // Log all headers to check exact signature header name and format
    console.log('Debug - All Headers:', Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [
        key,
        key.toLowerCase().includes('signature')
            ? `${String(value).substring(0, 10)}...`
            : value
    ])));
    const signature = req.headers['x-neynar-signature'];
    const webhookSecret = process.env.WEBHOOK_SECRET;
    // Debug environment and signature presence
    console.log('Debug - Verification:', {
        hasSignature: !!signature,
        signatureType: typeof signature,
        hasSecret: !!webhookSecret,
        secretLength: (webhookSecret === null || webhookSecret === void 0 ? void 0 : webhookSecret.length) || 0,
        method: req.method,
        url: req.url
    });
    if (!signature || !webhookSecret) {
        return false;
    }
    try {
        const hmac = crypto_1.default.createHmac('sha256', webhookSecret);
        const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        const computedSignature = hmac.update(body).digest('hex');
        // Debug signature comparison
        console.log('Debug - Signatures:', {
            receivedLength: String(signature).length,
            computedLength: computedSignature.length,
            receivedPrefix: String(signature).substring(0, 10) + '...',
            computedPrefix: computedSignature.substring(0, 10) + '...'
        });
        return crypto_1.default.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(computedSignature, 'hex'));
    }
    catch (error) {
        console.error('Signature verification error:', error);
        return false;
    }
}
function handler(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        // Debug environment variables (safely)
        console.log('Environment Check:', {
            hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
            hasNeynarKey: !!process.env.NEYNAR_API_KEY,
            hasSignerUUID: !!process.env.SIGNER_UUID,
            hasBotUsername: !!process.env.BOT_USERNAME,
            hasBotFID: !!process.env.BOT_FID,
            nodeEnv: process.env.NODE_ENV,
            port: process.env.PORT
        });
        // Ignore favicon requests
        if (req.url === '/favicon.ico' || req.url === '/favicon.png') {
            return res.status(404).json({ error: 'Not Found' });
        }
        // Strict method checking
        if (req.method !== 'POST') {
            return res
                .status(405)
                .setHeader('Allow', 'POST')
                .json({ error: 'Method not allowed', message: 'Only POST requests are accepted' });
        }
        // Retrieve and log headers (safely - without showing full signature)
        console.log('All request headers:', Object.assign(Object.assign({}, req.headers), { 'x-neynar-signature': req.headers['x-neynar-signature']
                ? `${req.headers['x-neynar-signature'].toString().substring(0, 10)}...`
                : 'None' }));
        const signature = req.headers['x-neynar-signature'];
        const webhookSecret = process.env.WEBHOOK_SECRET;
        if (!signature) {
            console.warn('Missing signature header');
            return res.status(401).json({
                error: 'Missing signature',
                message: 'x-neynar-signature header is required.'
            });
        }
        if (!webhookSecret) {
            console.error('WEBHOOK_SECRET is not set');
            return res.status(500).json({
                error: 'Server misconfiguration',
                message: 'Missing webhook secret in the environment.'
            });
        }
        // Read raw body
        let rawBody;
        try {
            rawBody = yield (0, raw_body_1.default)(req);
            console.log('Raw body preview:', rawBody.slice(0, 100).toString() + '...');
        }
        catch (error) {
            console.error('Error reading raw body:', error);
            return res.status(400).json({ error: 'Invalid body', message: 'Failed to read request body' });
        }
        // Verify signature
        if (!verifySignature(req)) {
            return res.status(401).json({
                error: 'Invalid signature',
                message: 'Signature verification failed'
            });
        }
        try {
            // Parse and process body
            const body = JSON.parse(rawBody.toString());
            const result = yield processWebhook(body);
            return res.status(200).json(result);
        }
        catch (error) {
            console.error('Webhook processing error:', error);
            return res.status(500).json({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    });
}
function processWebhook(body) {
    return __awaiter(this, void 0, void 0, function* () {
        // Your webhook processing logic
        return {
            status: 'success',
            // ... other response data
        };
    });
}
