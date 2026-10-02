import { requireUser } from "./auth.js";

const SUPABASE_URL = "https://bicdawajnksfzvjmgjsk.supabase.co";
const TRIAL_DAYS = 3;

async function supabaseGet(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_ANON_KEY}`
    }
  });

  if (!response.ok) {
    throw new Error("Supabase request failed.");
  }

  return response.json();
}

export async function requireActiveAccess(req, res) {
  const user = await requireUser(req, res);
  if (!user) return null;

  try {
    const rows = await supabaseGet(
      `subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=status,plan&limit=1`
    );

    const subscription = rows?.[0] || null;
    const subscribed =
      subscription &&
      (subscription.status === "active" || subscription.status === "trialing");

    if (subscribed) {
      return {
        user,
        access: {
          tier: "pro",
          plan: subscription.plan || null,
          active: true,
          expired: false
        }
      };
    }

    const createdAt = new Date(user.created_at).getTime();
    const elapsedDays =
      (Date.now() - createdAt) / (24 * 60 * 60 * 1000);

    if (elapsedDays < TRIAL_DAYS) {
      return {
        user,
        access: {
          tier: "trial",
          plan: null,
          active: true,
          expired: false
        }
      };
    }

    res.status(403).json({
      error: "Your free trial has ended. Subscribe to continue using Clyde AI."
    });

    return null;
  } catch (error) {
    console.error("Access check error:", error);
    res.status(502).json({
      error: "Unable to verify your account access right now."
    });
    return null;
  }
}
