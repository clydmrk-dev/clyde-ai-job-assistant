export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }
  try {
    const { jobDescription, profileContext } = req.body;

    if (!jobDescription) {
      return res.status(400).json({
        error: "Job description is required.",
      });
    }

    if (!profileContext || !profileContext.trim()) {
      return res.status(400).json({
        error:
          "Add your profile first (click your name in the top right → Profile) so Clyde AI can write a cover letter that's actually about you.",
      });
    }

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b",
          messages: [
            {
              role: "system",
              content: `
You are Clyde, an AI career assistant.
Write a professional, personalized job application
cover letter using ONLY information contained in the
candidate profile.
IMPORTANT RULES:
- Never invent experience.
- Never invent employers.
- Never invent skills.
- Never invent tools.
- Never invent achievements.
- Never invent metrics.
- Never claim the candidate used a technology unless
  it appears in the profile.
- Do not copy the job description word-for-word.
- Do not use generic filler.
- Make the letter sound natural and human.
- Focus on the strongest genuine connection between
  the candidate and the role.
Candidate profile:
${profileContext}
Write a concise professional cover letter.
The cover letter should:
1. Start with a strong opening.
2. Explain why the candidate is a good fit.
3. Mention relevant experience and tools.
4. Connect the candidate's experience to the employer's needs.
5. Avoid unsupported claims.
6. End with a professional call to action.
Do NOT include:
- Subject lines
- Placeholder text
- Fake company information
- Fake achievements
Return ONLY valid JSON.
Use exactly:
{
  "coverLetter": "string"
}
`,
            },
            {
              role: "user",
              content: `
Create a tailored cover letter for this job:
${jobDescription}
`,
            },
          ],
          temperature: 0.4,
          max_tokens: 1800,
        }),
      }
    );
    const data = await response.json();
    if (!response.ok) {
      console.error("Groq API error:", data);
      return res.status(response.status).json({
        error: "Groq request failed",
        details: data,
      });
    }
    let result =
      data.choices?.[0]?.message?.content || "";
    result = result
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    let parsed;
    try {
      parsed = JSON.parse(result);
    } catch (parseError) {
      console.error("JSON parsing failed:", result);
      return res.status(500).json({
        error: "AI returned invalid JSON.",
      });
    }
    return res.status(200).json(parsed);
  } catch (error) {
    console.error("Server error:", error);
    return res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
}
