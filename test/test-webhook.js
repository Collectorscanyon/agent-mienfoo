require('dotenv').config();
const crypto = require('crypto');
const fetch = require('node-fetch');

// Test configuration
const config = {
  webhookUrl: process.env.WEBHOOK_URL || 'http://localhost:3000',
  webhookSecret: process.env.WEBHOOK_SECRET || 'your-test-secret',
  testPayload: {
    type: 'cast.created',
    data: {
      hash: 'test-' + Date.now(),
      text: '@mienfoo.eth test webhook message',
      author: {
        username: 'testuser'
      },
      mentioned_profiles: [
        {
          username: process.env.BOT_USERNAME || 'mienfoo.eth',
          fid: process.env.BOT_FID || '123456'
        }
      ]
    }
  }
};

// Update the server check
async function checkServer(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const response = await fetch(url);
      return true;
    } catch (error) {
      console.log(`Attempt ${i + 1}: Server not ready...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}

async function testWebhook() {
  try {
    console.log('Testing webhook endpoint:', config.webhookUrl);
    
    // Check if server is running
    const isServerRunning = await checkServer(config.webhookUrl);
    if (!isServerRunning) {
      console.error('Server not running:', {
        url: config.webhookUrl
      });
      console.log('\nPlease start the server with: npm run start');
      process.exit(1);
    }

    // Convert payload to string
    const bodyString = JSON.stringify(config.testPayload);
    
    // Calculate signature
    const hmac = crypto.createHmac('sha256', config.webhookSecret);
    const signature = hmac.update(bodyString).digest('hex');
    
    console.log('Sending test request:', {
      url: config.webhookUrl,
      signatureLength: signature.length,
      bodyLength: bodyString.length,
      headers: {
        'Content-Type': 'application/json',
        'x-neynar-signature': signature?.substring(0, 10) + '...'
      }
    });

    // Send test request
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-neynar-signature': signature
      },
      body: bodyString
    });

    // Log raw response first
    const rawResponse = await response.text();
    console.log('Raw response:', rawResponse);

    try {
      // Try to parse JSON response
      const jsonResponse = JSON.parse(rawResponse);
      console.log('Response:', {
        status: response.status,
        headers: response.headers.raw(),
        data: jsonResponse
      });
    } catch (parseError) {
      console.error('Failed to parse response as JSON:', {
        status: response.status,
        headers: response.headers.raw(),
        rawResponse,
        parseError: parseError.message
      });
    }

  } catch (error) {
    console.error('Test failed:', {
      error: error.message,
      stack: error.stack
    });
  }
}

// Run the test
testWebhook();