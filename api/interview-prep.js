import profile from "../profile.js";

const GROQ_URL =
  "https://api.groq.com/openai/v1/chat/completions";

const MODEL = "openai/gpt-oss-120b";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { jobDescription } = req.body || {};

    if (!jobDescription || !jobDescription.trim()) {
      return res.status(400).json({
        error: "Job description is required.",
      });
    }

    if (!process.env.GROQ_API_KEY) {
      console.error("GROQ_API_KEY is missing.");

      return res.status(500).json({
        error: "Groq API key is not configured.",
      });
    }

    const profileContext = JSON.stringify(
      profile,
      null,
      2
    );

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 30000);

    let response;

    try {
      response = await fetch(
        GROQ_URL,
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
            Authorization:
              `Bearer ${process.env.GROQ_API_KEY}`,
          },

          body: JSON.stringify({
            model: MODEL,

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

          signal: controller.signal,
        }
      );
    } finally {
      clearTimeout(timeout);
    }

    const data =
      await response.json().catch(() => ({}));

    /*
     * ============================
     * GROQ RATE LIMIT
     * ============================
     */

    if (response.status === 429) {
      console.error(
        "Groq rate limit:",
        data
      );

      const retryAfter =
        response.headers.get("retry-after");

      return res.status(429).json({
        error:
          "Clyde is temporarily rate-limited by Groq. Please wait a moment and try again.",

        retryAfter: retryAfter
          ? Number(retryAfter)
          : null,
      });
    }

    /*
     * ============================
     * OTHER GROQ ERRORS
     * ============================
     */

    if (!response.ok) {
      console.error(
        "Groq API error:",
        {
          status: response.status,
          data,
        }
      );

      return res.status(502).json({
        error:
          data?.error?.message ||
          "Groq request failed. Please try again.",
      });
    }

    /*
     * ============================
     * EXTRACT RESPONSE
     * ============================
     */

    let result =
      data.choices?.[0]?.message?.content ||
      "";

    result = result
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    /*
     * ============================
     * PARSE JSON
     * ============================
     */

    let parsed;

    try {
      parsed = JSON.parse(result);
    } catch (parseError) {
      console.error(
        "JSON parsing failed:",
        result
      );

      return res.status(500).json({
        error:
          "AI returned invalid JSON.",
      });
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error(
      "Server error:",
      error
    );

    if (error.name === "AbortError") {
      return res.status(504).json({
        error:
          "The interview preparation request took too long. Please try again.",
      });
    }

    return res.status(500).json({
      error:
        "Unable to prepare the interview right now.",
    });
  }
}
