const SUPABASE_URL = "https://bicdawajnksfzvjmgjsk.supabase.co";

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
    const { accessToken } = req.body || {};

    if (!accessToken) {
      return json(res, 401, { error: "Authentication required." });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return json(res, 500, { error: "Stripe is not configured on the server." });
    }

    const user = await getUser(accessToken);

    if (!user?.id || !user.email) {
      return json(res, 401, { error: "Your session is invalid. Please sign in again." });
    }

    const customerLookup = await fetch(
      `https://api.stripe.com/v1/customers?email=${encodeURIComponent(user.email)}&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`
        }
      }
    );

    const customers = await customerLookup.json();

    if (!customerLookup.ok) {
      console.error("Stripe customer lookup error:", customers);
      return json(res, 502, {
        error: customers?.error?.message || "Could not find your billing account."
      });
    }

    const customer = (customers.data || []).find(
      (item) => item.metadata?.user_id === user.id
    ) || customers.data?.[0];

    if (!customer?.id) {
      return json(res, 404, {
        error: "No Stripe subscription was found for this account."
      });
    }

    const response = await stripeRequest("billing_portal/sessions", {
      customer: customer.id,
      return_url: "https://clyde-ai-job-assistant.vercel.app/"
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Stripe portal error:", data);
      return json(res, 502, {
        error: data?.error?.message || "Could not open the billing portal."
      });
    }

    return json(res, 200, { url: data.url });
  } catch (error) {
    console.error("Billing portal error:", error);
    return json(res, 500, { error: "Unable to open billing right now." });
  }
}
