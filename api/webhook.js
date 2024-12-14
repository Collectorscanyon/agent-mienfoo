const crypto = require("crypto");
const rawBody = require("raw-body");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST method is allowed" });
  }

  const signature = req.headers["x-neynar-signature"];
  const secret = process.env.WEBHOOK_SECRET;

  if (!signature || !secret) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  try {
    const body = await rawBody(req);
    const hmac = crypto.createHmac("sha256", secret).update(body).digest("hex");

    if (
      crypto.timingSafeEqual(
        Buffer.from(signature, "hex"),
        Buffer.from(hmac, "hex")
      )
    ) {
      return res
        .status(200)
        .json({ status: "success", data: JSON.parse(body) });
    } else {
      return res.status(401).json({ error: "Signature mismatch" });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
