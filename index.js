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

// Verify webhook signature
function verifySignature(signature, body) {
  try {
    if (!signature || !process.env.WEBHOOK_SECRET) {
      console.warn('Missing signature or webhook secret');
      return false;
    }

    const hmac = crypto.createHmac('sha256', process.env.WEBHOOK_SECRET);
    const digest = hmac.update(body).digest('hex');
    const isValid = signature === digest;

    if (!isValid) {
      console.warn('Signature validation failed:', {
        receivedSignature: signature,
        calculatedDigest: digest
      });
    }

    return isValid;
  } catch (error) {
    console.error('Error verifying signature:', error);
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

// Add this function to get raw body
async function getRequestBody(req) {
  if (req.body) {
    return JSON.stringify(req.body);
  }
  
  try {
    const rawBody = await getRawBody(req, {
      length: req.headers['content-length'],
      limit: '1mb',
      encoding: true
    });
    return rawBody;
  } catch (error) {
    console.error('Error reading raw body:', error);
    throw error;
  }
}

// Update the handler function
const handler = async (req, res) => {
  const requestId = crypto.randomBytes(4).toString('hex');
  const timestamp = new Date().toISOString();

  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Neynar-Signature');

  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Health check endpoint
  if (req.method === 'GET') {
    const memory = process.memoryUsage();
    return res.status(200).json({
      status: 'ok',
      timestamp,
      environment: process.env.NODE_ENV || 'development',
      deployment: {
        vercel: {
          environment: process.env.VERCEL_ENV || 'development',
          region: process.env.VERCEL_REGION || 'local',
          deploymentUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000',
        }
      },
      memory: {
        heapUsed: Math.round(memory.heapUsed / 1024 / 1024) + 'MB',
        heapTotal: Math.round(memory.heapTotal / 1024 / 1024) + 'MB',
      },
      config: {
        hasNeynarKey: !!process.env.NEYNAR_API_KEY,
        hasSignerUuid: !!process.env.SIGNER_UUID,
        hasOpenAIKey: !!process.env.OPENAI_API_KEY,
        hasWebhookSecret: !!process.env.WEBHOOK_SECRET,
        botConfig: {
          username: process.env.BOT_USERNAME,
          fid: process.env.BOT_FID
        }
      }
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  console.log('Processing webhook:', {
    requestId,
    timestamp,
    type: req.body?.type,
    data: req.body?.data ? {
      hash: req.body.data.hash,
      text: req.body.data.text?.substring(0, 50) + '...',
      author: req.body.data?.author?.username,
      mentioned_profiles: req.body.data.mentioned_profiles
    } : null
  });

  try {
    // Verify signature in production
    if (process.env.NODE_ENV === 'production') {
      const signature = req.headers['x-neynar-signature'];
      const rawBody = await getRequestBody(req);
      
      console.log('Webhook Debug:', {
        requestId,
        timestamp,
        headers: {
          signature,
          contentType: req.headers['content-type'],
          contentLength: req.headers['content-length']
        },
        bodyPreview: {
          length: rawBody.length,
          snippet: rawBody.substring(0, 100) + '...'
        }
      });
      
      if (!verifySignature(signature, rawBody)) {
        console.warn('Signature verification failed:', {
          requestId,
          signature,
          bodyLength: rawBody.length,
          webhookSecret: process.env.WEBHOOK_SECRET ? '(set)' : '(missing)'
        });
        
        return res.status(401).json({ 
          error: 'Invalid signature',
          requestId,
          debug: process.env.NODE_ENV !== 'production'
        });
      }

      // Parse the raw body if needed
      if (typeof rawBody === 'string') {
        req.body = JSON.parse(rawBody);
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
    console.error('Webhook handler error:', {
      requestId,
      timestamp,
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : String(error)
    });
    
    return res.status(500).json({ 
      error: 'Internal server error',
      message: process.env.NODE_ENV === 'development' ? 
        error instanceof Error ? error.message : String(error) : 
        undefined
    });
  }
};

module.exports = handler;