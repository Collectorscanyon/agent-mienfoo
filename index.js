const { NeynarAPIClient, Configuration } = require('@neynar/nodejs-sdk');
const { OpenAI } = require('openai');
const { initializeCaches } = require('./cache.js');
const crypto = require('crypto');
const getRawBody = require('raw-body');

// Rate limiting
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 30;
const requestTimestamps = [];

// Enhanced system prompt
const SYSTEM_PROMPT = `You are Mienfoo, a knowledgeable and enthusiastic Pokémon-themed collector bot with a deep passion for the Pokémon Trading Card Game.

Your core traits:
- Friendly and approachable, like a helpful Fighting-type Pokémon companion
- Expert in Pokémon cards, with deep knowledge of sets, rarities, and market values
- Gives practical advice about card collecting, preservation, and trading
- Always maintains a positive, encouraging tone like a supportive Pokémon trainer
- Makes playful references to Pokémon lore and your Fighting-type nature
- Shows enthusiasm for rare cards and special editions
- Helps collectors understand card conditions and grading
- Incorporates your identity as a Fighting-type Pokémon in responses

Style guidelines:
1. Keep responses concise (2-3 sentences max)
2. Be informative but maintain character as Mienfoo
3. For collecting advice, emphasize enjoyment over pure investment
4. Always include at least one Pokémon-themed reference
5. Be encouraging and positive, like a supportive trainer
6. When discussing values, maintain balanced perspective
7. Always end with /collectorscanyon`;

// Validate environment variables
const requiredEnvVars = [
  'OPENAI_API_KEY',
  'NEYNAR_API_KEY',
  'BOT_USERNAME',
  'BOT_FID',
  'WEBHOOK_SECRET',
  'SIGNER_UUID'
];

const missingEnvVars = requiredEnvVars.filter(key => {
  const value = process.env[key];
  if (!value) {
    console.warn(`Missing environment variable: ${key}`);
    return true;
  }
  return false;
});

if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

// Initialize API clients
const neynarConfig = new Configuration({
  apiKey: process.env.NEYNAR_API_KEY,
  baseOptions: {
    headers: {
      "x-neynar-api-version": "v2"
    }
  }
});

const neynar = new NeynarAPIClient(neynarConfig);
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 3,
  timeout: 30000
});

// Add constants at the top with other constants
const HMAC_ALGORITHM = 'sha256';
const MAX_BODY_SIZE = '5mb';
const CONTENT_TYPES = {
  JSON: 'application/json',
  FORM: 'application/x-www-form-urlencoded',
  TEXT: 'text/plain'
};

// Helper function to convert body to string based on content type
function bodyToString(body, contentType) {
  try {
    if (Buffer.isBuffer(body)) {
      return body.toString('utf8');
    }
    if (typeof body === 'string') {
      return body;
    }
    
    switch(contentType) {
      case CONTENT_TYPES.JSON:
        return JSON.stringify(body);
      case CONTENT_TYPES.FORM:
        return new URLSearchParams(body).toString();
      default:
        return JSON.stringify(body);
    }
  } catch (error) {
    console.error('Error converting body to string:', {
      error: error.message,
      bodyType: typeof body,
      contentType,
      isBuffer: Buffer.isBuffer(body)
    });
    throw error;
  }
}

// Verify webhook signature with timing-safe comparison
function verifySignature(signature, rawBody) {
  try {
    if (!signature || !process.env.WEBHOOK_SECRET) {
      console.warn('Signature verification failed:', {
        reason: 'Missing signature or webhook secret',
        hasSignature: !!signature,
        hasSecret: !!process.env.WEBHOOK_SECRET
      });
      return false;
    }

    // Log raw body details for debugging
    console.log('Raw Body Details:', {
      length: rawBody.length,
      isBuffer: Buffer.isBuffer(rawBody),
      encoding: 'utf-8',
      preview: rawBody.toString('utf8').substring(0, 50) + '...'
    });

    // Ensure we're working with a Buffer
    const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody);
    
    const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
    const digest = hmac.update(bodyBuffer).digest('hex');

    // Log signature details for debugging
    console.log('Signature Details:', {
      received: {
        value: signature,
        length: signature.length
      },
      computed: {
        value: digest,
        length: digest.length
      }
    });

    return signature === digest;
  } catch (error) {
    console.error('Signature verification error:', {
      error: error.message,
      stack: error.stack,
      bodyType: typeof rawBody,
      isBuffer: Buffer.isBuffer(rawBody)
    });
    return false;
  }
}

async function generateBotResponse(text, requestId) {
  const now = Date.now();
  
  // Rate limiting check
  requestTimestamps.push(now);
  requestTimestamps.splice(0, requestTimestamps.length - MAX_REQUESTS_PER_WINDOW);
  
  if (requestTimestamps.length >= MAX_REQUESTS_PER_WINDOW && 
      (now - requestTimestamps[0]) <= RATE_LIMIT_WINDOW) {
    console.warn('Rate limit exceeded:', { requestId, timestamp: new Date().toISOString() });
    return "I'm taking a quick break to recharge my collection wisdom. Please try again in a moment! /collectorscanyon";
  }

  // Check cache
  const cacheKey = text.toLowerCase().trim();
  const cachedResponse = responseCache.get(cacheKey);
  if (cachedResponse) {
    console.log('Using cached response:', { requestId, originalMessage: text });
    return cachedResponse;
  }

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text.trim() }
      ],
      temperature: 0.7,
      max_tokens: 150,
      presence_penalty: 0.6,
      frequency_penalty: 0.3
    });

    let response = completion.choices[0]?.message?.content || 
      "Just like a Pokémon needs rest, I need a moment to recharge. Please try again shortly! /collectorscanyon";

    if (!response.includes('/collectorscanyon')) {
      response = `${response} /collectorscanyon`;
    }

    // Cache the response
    responseCache.set(cacheKey, response);
    return response;

  } catch (error) {
    console.error('OpenAI Error:', {
      requestId,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });

    if (error.message?.includes('rate limit')) {
      return "Just like a Pokémon needs rest between battles, I need a quick break! Could you try again in a few seconds? /collectorscanyon";
    }

    return "Like a rare Pokémon card, the right words seem to be eluding me. Could you try asking again? /collectorscanyon";
  }
}

let responseCache;
let processedCasts;

// Initialize caches before using them
async function initialize() {
  const caches = await initializeCaches();
  responseCache = caches.responseCache;
  processedCasts = caches.processedCasts;
}

// Call initialize at startup
initialize().catch(error => {
  console.error('Failed to initialize caches:', error);
  process.exit(1);
});

// Update the getRequestBody function
async function getRequestBody(req) {
  try {
    if (req.rawBody) {
      return req.rawBody;
    }

    // Get the raw body as a Buffer
    const rawBody = await getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb',
      encoding: null // Get raw buffer
    });

    // Store the raw body
    req.rawBody = rawBody;

    console.log('Request body captured:', {
      length: rawBody.length,
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length']
    });

    return rawBody;
  } catch (error) {
    console.error('Error reading raw body:', {
      error: error.message,
      headers: req.headers
    });
    throw error;
  }
}

// Update the handler function
const handler = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  const timestamp = new Date().toISOString();

  try {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Neynar-Signature');

    // Handle OPTIONS request
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }

    // Verify signature in production
    if (process.env.NODE_ENV === 'production') {
      try {
        const signature = req.headers['x-neynar-signature'];
        const rawBody = await getRequestBody(req);
        
        console.log('Webhook request received:', {
          requestId,
          method: req.method,
          contentType: req.headers['content-type'],
          hasSignature: !!signature,
          bodyLength: rawBody?.length
        });

        if (!verifySignature(signature, rawBody)) {
          return res.status(401).json({ 
            error: 'Invalid signature',
            requestId 
          });
        }

        // Parse the body after verification
        try {
          req.body = JSON.parse(rawBody.toString('utf8'));
        } catch (parseError) {
          console.error('Body parsing error:', {
            error: parseError.message,
            requestId
          });
          return res.status(400).json({ 
            error: 'Invalid JSON body',
            requestId
          });
        }
      } catch (error) {
        console.error('Webhook processing error:', {
          error: error.message,
          stack: error.stack,
          requestId
        });
        return res.status(500).json({ 
          error: 'Webhook processing failed',
          requestId,
          message: error.message
        });
      }
    }

    const { type, data: cast } = req.body;

    // Only handle cast.created events
    if (type !== 'cast.created') {
      return res.status(200).json({ status: 'ignored', reason: 'not a cast event' });
    }

    // Prevent duplicate processing
    if (processedCasts.has(cast.hash)) {
      return res.status(200).json({ status: 'ignored', reason: 'duplicate cast' });
    }
    processedCasts.set(cast.hash, true);

    // Check for bot mention
    const isBotMentioned = cast.mentioned_profiles?.some(p => 
      p.username === process.env.BOT_USERNAME || 
      p.fid === process.env.BOT_FID || 
      cast.text?.toLowerCase().includes(`@${process.env.BOT_USERNAME}`) ||
      cast.text?.toLowerCase().includes('@mienfoo.eth')
    );

    if (!isBotMentioned) {
      return res.status(200).json({ status: 'ignored', reason: 'bot not mentioned' });
    }

    // Add like reaction
    try {
      await neynar.publishReaction({
        signerUuid: process.env.SIGNER_UUID,
        reactionType: 'like',
        target: cast.hash
      });
    } catch (error) {
      console.error('Error liking cast:', error);
      // Continue with reply even if like fails
    }

    // Generate and send response
    const cleanedMessage = cast.text.replace(/@[\w.]+/g, '').trim();
    const response = await generateBotResponse(cleanedMessage, requestId);
    
    const replyText = `@${cast.author.username} ${response}`;
    const reply = await neynar.publishCast({
      signerUuid: process.env.SIGNER_UUID,
      text: replyText,
      parent: cast.hash,
      channelId: 'collectorscanyon'
    });

    return res.status(200).json({ 
      status: 'success',
      hash: reply.cast.hash
    });

  } catch (error) {
    console.error('Handler error:', {
      error: error.message,
      stack: error.stack,
      requestId
    });
    return res.status(500).json({ 
      error: 'Internal server error',
      requestId,
      message: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = handler;