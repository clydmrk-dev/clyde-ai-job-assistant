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
You are Clyde, an AI career assistant helping a candidate
prepare for a job interview.

Analyze the job description and the candidate profile.

IMPORTANT:
- Never invent candidate experience.
- Never invent employers.
- Never invent skills.
- Never invent tools.
- Never invent achievements.
- Never invent metrics.
- Only use information contained in the candidate profile.
- Questions should be relevant to the actual job description.
- Suggested answers should be based only on the candidate's real experience.
- Keep answers concise but useful.
- Make the answers sound natural and conversational.

Candidate profile:

${profileContext}

Return ONLY valid JSON.

Use exactly this structure:

{
  "questions": [
    {
      "question": "string",
      "type": "Behavioral",
      "why": "string",
      "suggestedAnswer": "string"
    }
  ],
  "technicalQuestions": [
    {
      "question": "string",
      "suggestedAnswer": "string"
    }
  ],
  "questionsToAsk": [
    "string"
  ],
  "interviewTips": [
    "string"
  ]
}

Rules:

- questions: 5 to 7 items.
- type must be one of:
  "Behavioral",
  "Experience",
  "Technical",
  "Situational".
- technicalQuestions: 3 to 5 items.
- questionsToAsk: 3 to 5 items.
- interviewTips: 3 to 5 items.
- Keep every answer concise.
- Do not use Markdown.
- Do not use code fences.
`,
            },

            {
              role: "user",
              content: `
Prepare me for an interview for this job:

${jobDescription}
`,
            },
          ],

          temperature: 0.4,
          max_tokens: 3000,
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
