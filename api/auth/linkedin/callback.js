import crypto from "node:crypto";

function getSecret() {
  const secret =
    process.env.LINKEDIN_STATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error("Missing LinkedIn state secret.");
  }

  return secret;
}

function decodeAndVerifyState(state) {
  const decoded = JSON.parse(
    Buffer.from(state, "base64url").toString("utf8")
  );

  if (!decoded.userId || !decoded.createdAt || !decoded.signature) {
    throw new Error("Invalid OAuth state.");
  }

  if (Date.now() - Number(decoded.createdAt) > 10 * 60 * 1000) {
    throw new Error("OAuth state expired. Please try again.");
  }

  const payload = `${decoded.userId}.${decoded.createdAt}`;
  const expected = crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");

  if (
    expected.length !== decoded.signature.length ||
    !crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(decoded.signature)
    )
  ) {
    throw new Error("Invalid OAuth state signature.");
  }

  return decoded;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export default async function handler(req, res) {
  const {
    code,
    state,
    error,
    error_description
  } = req.query;

  const appUrl = "https://clyde-ai-job-assistant.vercel.app";

  if (error) {
    return res.status(400).send(`
      <html><body style="font-family:Arial;padding:40px">
        <h1>LinkedIn connection cancelled</h1>
        <p>${escapeHtml(error_description || error)}</p>
        <p><a href="${appUrl}">Return to Clyde AI</a></p>
      </body></html>
    `);
  }

  if (!code || !state) {
    return res.status(400).send("Missing authorization code or state.");
  }

  try {
    const stateData = decodeAndVerifyState(state);

    const redirectUri =
      "https://clyde-ai-job-assistant.vercel.app/api/auth/linkedin/callback";

    const tokenResponse = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
          redirect_uri: redirectUri
        })
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("LinkedIn token exchange failed:", tokenData);
      return res.status(500).send("LinkedIn token exchange failed.");
    }

    const userResponse = await fetch(
      "https://api.linkedin.com/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      console.error("LinkedIn userinfo failed:", userData);
      return res.status(500).send("Could not retrieve your LinkedIn profile.");
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return res.status(500).send("Supabase server configuration is incomplete.");
    }

    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(stateData.userId)}&select=full_name,headline,resume_text`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`
        }
      }
    );

    const existingRows = profileResponse.ok
      ? await profileResponse.json()
      : [];

    const existing = existingRows[0] || {};

    const updates = {
      user_id: stateData.userId,
      full_name: userData.name || existing.full_name || null,
      headline: existing.headline || null,
      resume_text:
        existing.resume_text ||
        [
          "LinkedIn profile imported:",
          `Name: ${userData.name || "Not provided"}`,
          `Email: ${userData.email || "Not provided"}`
        ].join("\n")
    };

    const saveResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?on_conflict=user_id`,
      {
        method: "POST",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(updates)
      }
    );

    if (!saveResponse.ok) {
      console.error(
        "LinkedIn profile save failed:",
        await saveResponse.text()
      );
      return res.status(500).send("LinkedIn connected, but Clyde could not update your profile.");
    }

    return res.status(200).send(`
      <html>
        <body style="font-family:Arial;padding:40px;text-align:center">
          <h1>LinkedIn Connected! ✅</h1>
          <p>Your LinkedIn identity was connected to your Clyde AI profile.</p>
          <p>You can close this window and return to Clyde AI.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage(
                { type: "clyde-linkedin-connected" },
                "${appUrl}"
              );
              setTimeout(function () { window.close(); }, 700);
            }
          </script>
          <p><a href="${appUrl}">Return to Clyde AI</a></p>
        </body>
      </html>
    `);
  } catch (err) {
    console.error("LinkedIn callback error:", err);
    return res.status(500).send(
      escapeHtml(err.message || "LinkedIn connection failed.")
    );
  }
}
