import { requireUser } from "../_lib/auth.js";
import crypto from "node:crypto";

function getSecret() {
  const secret =
    process.env.LINKEDIN_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Missing LINKEDIN_STATE_SECRET or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return secret;
}

function signState(userId, createdAt) {
  const payload = `${userId}.${createdAt}`;
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");

  return Buffer.from(
    JSON.stringify({ userId, createdAt, signature })
  ).toString("base64url");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed."
    });
  }

  try {
    const { user } = await requireUser(req, res);
    if (!user) return;

    if (
      !process.env.LINKEDIN_CLIENT_ID ||
      !process.env.LINKEDIN_CLIENT_SECRET
    ) {
      return res.status(500).json({
        error: "LinkedIn OAuth is not configured on the server."
      });
    }

    const createdAt = Date.now();
    const state = signState(user.id, createdAt);

    const redirectUri =
      "https://clyde-ai-job-assistant.vercel.app/api/auth/linkedin/callback";

    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID,
      redirect_uri: redirectUri,
      state,
      scope: "openid profile email"
    });

    return res.status(200).json({
      url:
        "https://www.linkedin.com/oauth/v2/authorization?" +
        params.toString()
    });

  } catch (error) {

    console.error(
      "LinkedIn OAuth start error:",
      error
    );

    return res.status(500).json({
      error: "Could not start LinkedIn connection."
    });

  }
}
