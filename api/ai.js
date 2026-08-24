import profile from "../profile.js";
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { jobDescription } = req.body;

    if (!jobDescription) {
      return res.status(400).json({
        error: "Job description is required.",
      });
    }

    const profileContext = JSON.stringify(profile, null, 2);

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

Your job is to compare a job description against the candidate's
REAL professional profile.

IMPORTANT:
- Only use information contained in the candidate profile.
- NEVER invent experience, employers, tools, education, achievements,
  metrics, certifications, or skills.
- If something is not in the profile, treat it as unknown.
- Do not assume that the candidate knows a tool just because it is
  similar to another tool they know.
- Be honest about gaps.
- Do not give the candidate credit for requirements they do not
  actually have evidence for.
- Match the candidate based on actual evidence from the profile.

The candidate's professional profile is:

${profileContext}

Analyze the job description against this profile.

Return ONLY valid JSON.

Do not use Markdown.
Do not use code fences.

Use exactly this structure:

{
  "jobTitle": "string",
  "matchScore": 0,
  "matchLevel": "Excellent Match",
  "summary": "string",
  "strengths": [
    {
      "title": "string",
      "description": "string"
    }
  ],
  "skills": [
    {
      "name": "string",
      "importance": "High"
    }
  ],
  "gaps": [
    {
      "title": "string",
      "description": "string"
    }
  ],
  "recommendation": "APPLY",
  "recommendationReason": "string"
}

Rules:

- matchScore must be a number from 0 to 100.
- matchLevel must be one of:
  "Excellent Match",
  "Strong Match",
  "Moderate Match",
  "Low Match".

- recommendation must be one of:
  "APPLY",
  "CONSIDER",
  "SKIP".

- strengths should contain 3 to 5 items.
- skills should contain 4 to 8 items.
- gaps should contain 1 to 4 items.

- Skills should represent important requirements from the job
  that are relevant to the candidate.

- Strengths must specifically explain why THIS candidate matches
  THIS job.

- Gaps must identify requirements from the job description that
  are missing, weak, or not clearly demonstrated in the profile.

- The summary should be personalized to this candidate.

- Keep descriptions concise and useful.

- Do not fabricate numerical performance metrics.
`,
            },

            {
              role: "user",

              content: `
Analyze this job description against the candidate profile:

${jobDescription}
`,
            },
          ],

          temperature: 0.2,

          max_tokens: 2500,
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
      console.error(
        "JSON parsing failed:",
        result
      );

      return res.status(500).json({
        error: "AI returned invalid JSON.",
      });
    }

    return res.status(200).json(parsed);

  } catch (error) {

    console.error(
      "Server error:",
      error
    );

    return res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
}
