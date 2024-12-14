import crypto from 'crypto';

async function handleWebhook(req: NextApiRequest, res: NextApiResponse) {
  try {
    const signature = req.headers['x-neynar-signature'];
    if (!signature) {
      console.warn('Missing Neynar signature');
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing Neynar signature',
      });
    }

    const rawBody = await getRawBody(req);
    const secret = process.env.WEBHOOK_SECRET; // Ensure this is defined in your .env or Vercel environment

    // Verify the signature
    const isValid = verifySignature(signature as string, rawBody, secret as string);
    if (!isValid) {
      console.error('Invalid signature');
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Signature verification failed',
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Webhook received and verified successfully',
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

function verifySignature(signature: string, rawBody: Buffer, secret: string): boolean {
  try {
    // Compute the HMAC hash using the secret
    const computedSignature = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex'); // Ensure this is in hex format

    // Perform a timing-safe comparison
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'), // Parse received signature as hex
      Buffer.from(computedSignature, 'hex') // Ensure computed signature is in hex
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}
