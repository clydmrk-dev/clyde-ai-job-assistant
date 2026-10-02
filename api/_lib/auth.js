const SUPABASE_URL = "https://bicdawajnksfzvjmgjsk.supabase.co";

export async function requireUser(req, res) {
  const header = req.headers.authorization || "";
  const accessToken = header.startsWith("Bearer ")
    ? header.slice(7).trim()
    : "";

  if (!accessToken) {
    res.status(401).json({ error: "Authentication required. Please sign in again." });
    return null;
  }

  if (!process.env.SUPABASE_ANON_KEY) {
    console.error("SUPABASE_ANON_KEY is missing.");
    res.status(500).json({ error: "Authentication service is not configured." });
    return null;
  }

  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: process.env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`
      }
    });

    const data = await response.json().catch(() => null);

    if (!response.ok || !data?.id) {
      res.status(401).json({ error: "Your session is invalid or expired. Please sign in again." });
      return null;
    }

    return data;
  } catch (error) {
    console.error("Supabase auth verification error:", error);
    res.status(502).json({ error: "Unable to verify your session right now." });
    return null;
  }
}
