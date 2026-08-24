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
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
        process.env.GEMINI_API_KEY,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `You are Clyde AI Job Assistant, an expert career assistant.

Analyze the following job description.

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
            },
          ],
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", data);

      return res.status(response.status).json({
        error: "Gemini request failed",
        details: data,
      });
    }

    const result =
      data.candidates?.[0]?.content?.parts?.[0]?.text ||
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
