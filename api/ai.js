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
              content:
                "You are Clyde AI Job Assistant, an expert career assistant specializing in job matching, resume analysis, application strategy, cover letters, and interview preparation.",
            },
            {
              role: "user",
              content: `Analyze the following job description.

Provide:

1. Overall job match assessment
2. Important required skills
3. Skills the candidate should highlight
4. Potential skill gaps
5. Application advice
6. Recommended next steps

Job Description:

${jobDescription}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 2000,
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

    const result =
      data.choices?.[0]?.message?.content ||
      "No response was generated.";

    return res.status(200).json({
      result,
    });

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Server error",
      message: error.message,
    });
  }
}
