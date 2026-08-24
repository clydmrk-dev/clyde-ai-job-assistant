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
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "gpt-5.6",
          input: [
            {
              role: "system",
              content:
                "You are Clyde AI Job Assistant, an expert career assistant. Analyze job descriptions and help candidates determine how well their skills and experience match the role.",
            },
            {
              role: "user",
              content: `Analyze this job description and provide:
1. Match assessment
2. Required skills
3. Skills the candidate should highlight
4. Potential gaps
5. Application advice

Job Description:

${jobDescription}`,
            },
          ],
        }),
      }
    );

    const data = await response.json();

  if (!response.ok) {
  console.error("OpenAI API error:", data);

  return res.status(response.status).json({
    error: "OpenAI request failed",
    details: data,
  });
}

    return res.status(200).json({
      result: data.output_text,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Server error",
    });
  }
}
