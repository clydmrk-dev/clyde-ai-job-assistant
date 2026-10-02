const SUPABASE_URL = "https://bicdawajnksfzvjmgjsk.supabase.co";

const PRICE_IDS = {
  monthly: process.env.STRIPE_PRICE_ID_MONTHLY,
  annual: process.env.STRIPE_PRICE_ID_ANNUAL
};

function json(res, status, body) {
  return res.status(status).json(body);
}

async function getUser(accessToken) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: process.env.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) return null;
  return response.json();
}

async function stripeRequest(path, params) {
  return fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params)
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  try {
    const { plan, accessToken } = req.body || {};

    if (!["monthly", "annual"].includes(plan)) {
      return json(res, 400, { error: "Invalid subscription plan." });
    }

    if (!accessToken) {
      return json(res, 401, { error: "Authentication required." });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return json(res, 500, { error: "Stripe is not configured on the server." });
    }

    const priceId = PRICE_IDS[plan];

    if (!priceId) {
      return json(res, 500, {
        error: `Stripe price ID for the ${plan} plan is not configured.`
      });
    }

    const user = await getUser(accessToken);

    if (!user?.id || !user.email) {
      return json(res, 401, { error: "Your session is invalid. Please sign in again." });
    }

    const params = {
      mode: "subscription",
      "line_items[0][price]": priceId,
      "line_items[0][quantity]": "1",
      customer_email: user.email,
      client_reference_id: user.id,
      "metadata[user_id]": user.id,
      "metadata[plan]": plan,
      success_url: "https://clyde-ai-job-assistant.vercel.app/?checkout=success",
      cancel_url: "https://clyde-ai-job-assistant.vercel.app/?checkout=cancelled",
      "subscription_data[metadata][user_id]": user.id,
      "subscription_data[metadata][plan]": plan
    };

    const response = await stripeRequest("checkout/sessions", params);
    const data = await response.json();

    if (!response.ok) {
      console.error("Stripe checkout error:", data);
      return json(res, 502, {
        error: data?.error?.message || "Could not create the checkout session."
      });
    }

    return json(res, 200, { url: data.url });
  } catch (error) {
    console.error("Checkout session error:", error);
    return json(res, 500, { error: "Unable to start checkout right now." });
  }
}
