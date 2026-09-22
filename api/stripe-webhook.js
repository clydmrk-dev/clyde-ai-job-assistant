// Receives events from Stripe when a checkout completes or a subscription
// changes/cancels, verifies they genuinely came from Stripe, and writes
// the result to the Supabase "subscriptions" table using the service role
// key (which bypasses RLS — this is the ONLY place in the app that writes
// to that table, deliberately, so a user can never grant themselves Pro
// status by calling an API directly).
//
// Required environment variables (set in Vercel):
//   STRIPE_SECRET_KEY            — same key used by create-checkout-session.js
//   STRIPE_WEBHOOK_SECRET        — from Stripe Dashboard → Developers → Webhooks
//                                  → your endpoint → Signing secret (whsec_...)
//   SUPABASE_SERVICE_ROLE_KEY    — from Supabase Dashboard → Settings → API
//                                  → service_role key. NEVER expose this to
//                                  the frontend — it bypasses all RLS.
//
// In Stripe Dashboard → Developers → Webhooks, point the endpoint at:
//   https://yourdomain.com/api/stripe-webhook
// and select these events: checkout.session.completed,
// customer.subscription.updated, customer.subscription.deleted,
// invoice.payment_failed

import crypto from "crypto";

const SUPABASE_URL = "https://bicdawajnksfzvjmgjsk.supabase.co";
const STRIPE_PRICE_ID_ANNUAL = process.env.STRIPE_PRICE_ID_ANNUAL;

// Stripe's own SDKs reject events whose signed timestamp is older than
// this — without it, a captured request could be replayed indefinitely.
const SIGNATURE_TOLERANCE_SECONDS = 300;

// Stripe needs the raw, unparsed request body to verify the signature —
// re-serializing parsed JSON would produce different bytes and always fail.
export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function verifyStripeSignature(rawBody, signatureHeader, secret) {

  if (!signatureHeader) return false;

  const parts = signatureHeader.split(",").reduce(function (acc, part) {
    const [key, value] = part.split("=");
    acc[key] = value;
    return acc;
  }, {});

  const timestamp = parts.t;
  const v1Signature = parts.v1;

  if (!timestamp || !v1Signature) return false;

  const timestampAge = Math.floor(Date.now() / 1000) - Number(timestamp);

  if (!Number.isFinite(timestampAge) || timestampAge > SIGNATURE_TOLERANCE_SECONDS) {
    return false;
  }

  const signedPayload = `${timestamp}.${rawBody}`;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const expectedBuffer = Buffer.from(expectedSignature, "utf8");
  const actualBuffer = Buffer.from(v1Signature, "utf8");

  if (expectedBuffer.length !== actualBuffer.length) return false;

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);

}

async function upsertSubscription(row) {

  const response = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
    method: "POST",
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    },
    body: JSON.stringify({
      ...row,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error("Supabase upsert failed: " + errText);
  }

}

async function createServerNotification(userId, title, body, type) {

  try {

    await fetch(`${SUPABASE_URL}/rest/v1/notifications`, {
      method: "POST",
      headers: {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: userId,
        title: title,
        body: body,
        type: type || "warning",
      }),
    });

  } catch (error) {

    // Notification failing shouldn't fail the whole webhook — the
    // subscription status update below is the part that actually matters.
    console.error("Create server notification error:", error);

  }

}

async function findUserIdByCustomerId(customerId) {

  try {

    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?stripe_customer_id=eq.${customerId}&select=user_id`,
      {
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    const rows = await response.json();

    return rows?.[0]?.user_id || null;

  } catch (error) {

    console.error("Find user by customer id error:", error);

    return null;

  }

}

async function fetchStripeSubscription(subscriptionId) {

  const response = await fetch(
    `https://api.stripe.com/v1/subscriptions/${subscriptionId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      },
    }
  );

  return response.json();

}

function planFromPriceId(priceId) {
  return priceId === STRIPE_PRICE_ID_ANNUAL ? "annual" : "monthly";
}

export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET is not set.");
    return res.status(500).json({ error: "Webhook secret not configured." });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY is not set.");
    return res.status(500).json({ error: "Supabase service role key not configured." });
  }

  let rawBody;

  try {
    rawBody = await getRawBody(req);
  } catch (error) {
    console.error("Failed to read webhook body:", error);
    return res.status(400).json({ error: "Invalid request body." });
  }

  const signature = req.headers["stripe-signature"];

  const isValid = verifyStripeSignature(
    rawBody,
    signature,
    process.env.STRIPE_WEBHOOK_SECRET
  );

  if (!isValid) {
    console.error("Invalid Stripe webhook signature.");
    return res.status(400).json({ error: "Invalid signature." });
  }

  let event;

  try {
    event = JSON.parse(rawBody);
  } catch (error) {
    return res.status(400).json({ error: "Invalid JSON." });
  }

  try {

    if (event.type === "checkout.session.completed") {

      const session = event.data.object;

      const userId = session.client_reference_id || session.metadata?.user_id;
      const customerId = session.customer;
      const subscriptionId = session.subscription;

      if (userId && subscriptionId) {

        const subscription = await fetchStripeSubscription(subscriptionId);

        const priceId = subscription?.items?.data?.[0]?.price?.id;

        await upsertSubscription({
          user_id: userId,
          stripe_customer_id: customerId,
          stripe_subscription_id: subscriptionId,
          plan: planFromPriceId(priceId),
          status: subscription.status,
          current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
        });

      }

    } else if (
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {

      const subscription = event.data.object;

      const userId = subscription.metadata?.user_id;

      if (userId) {

        const priceId = subscription?.items?.data?.[0]?.price?.id;

        await upsertSubscription({
          user_id: userId,
          stripe_customer_id: subscription.customer,
          stripe_subscription_id: subscription.id,
          plan: planFromPriceId(priceId),
          status: subscription.status,
          current_period_end: subscription.current_period_end
            ? new Date(subscription.current_period_end * 1000).toISOString()
            : null,
        });

      }

    } else if (event.type === "invoice.payment_failed") {

      const invoice = event.data.object;

      const customerId = invoice.customer;

      const userId = await findUserIdByCustomerId(customerId);

      if (userId) {

        await createServerNotification(
          userId,
          "Payment failed",
          "We couldn't process your latest payment. Update your payment method from Settings → Billing to keep your Pro access.",
          "warning"
        );

      }

    }

    return res.status(200).json({ received: true });

  } catch (error) {

    console.error("Webhook processing error:", error);

    return res.status(500).json({ error: "Webhook processing failed." });

  }

}
