export default async function handler(req, res) {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.status(400).send(`
      <h1>LinkedIn Authorization Failed</h1>
      <p>${error_description || error}</p>
    `);
  }

  if (!code) {
    return res.status(400).send("Missing authorization code.");
  }

  const redirectUri =
    "https://clyde-ai-job-assistant.vercel.app/api/auth/linkedin/callback";

  try {
    const tokenResponse = await fetch(
      "https://www.linkedin.com/oauth/v2/accessToken",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          client_id: process.env.LINKEDIN_CLIENT_ID,
          client_secret: process.env.LINKEDIN_CLIENT_SECRET,
          redirect_uri: redirectUri,
        }),
      }
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      return res.status(500).json({
        error: "Token exchange failed",
        details: tokenData,
      });
    }

    const userResponse = await fetch(
      "https://api.linkedin.com/v2/userinfo",
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      }
    );

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      return res.status(500).json({
        error: "Could not retrieve LinkedIn profile",
        details: userData,
      });
    }

    return res.status(200).send(`
      <html>
        <body style="font-family: Arial; padding: 40px;">
          <h1>LinkedIn Connected! ✅</h1>
          <h2>Welcome, ${userData.name || "LinkedIn user"}!</h2>
          ${
            userData.picture
              ? `<img src="${userData.picture}" width="100" style="border-radius:50%;">`
              : ""
          }
          <p>Your LinkedIn account has been successfully connected.</p>
          <p>Email: ${userData.email || "Not provided"}</p>
        </body>
      </html>
    `);
  } catch (err) {
    return res.status(500).send("Server error.");
  }
}
