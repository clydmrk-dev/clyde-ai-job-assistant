```javascript
import profile from "../profile.js";

export default async function handler(req, res) {
  try {
    console.log("API /api/ai started");
    console.log("Profile loaded:", !!profile);
    console.log("Groq key exists:", !!process.env.GROQ_API_KEY);

    return res.status(200).json({
      success: true,
      profileLoaded: !!profile,
      groqKeyExists: !!process.env.GROQ_API_KEY,
      message: "API function is working."
    });

  } catch (error) {
    console.error("DEBUG ERROR:", error);

    return res.status(500).json({
      error: "Debug failed",
      message: error.message
    });
  }
}
```
