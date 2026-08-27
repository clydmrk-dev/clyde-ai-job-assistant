export default async function handler(req, res) {

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }

  const { mode, messages, jobDescription, analysis } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "No messages provided." });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    res.status(500).json({ error: "Missing GROQ_API_KEY on the server." });
    return;
  }

  const systemPrompt = buildSystemPrompt(mode, jobDescription, analysis);

  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...messages
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string"
      )
      .slice(-20)
  ];

  try {

    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: groqMessages,
          temperature: 0.6,
          max_tokens: 500
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const message =
        data?.error?.message || "The AI service returned an error.";
      res.status(response.status).json({ error: message });
      return;
    }

    const reply = data?.choices?.[0]?.message?.content?.trim();

    if (!reply) {
      res.status(500).json({ error: "The AI did not return a response." });
      return;
    }

    res.status(200).json({ reply });

  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: "Something went wrong talking to the AI." });
  }

}

function buildSystemPrompt(mode, jobDescription, analysis) {

  const base =
    "You are Clyde, the AI career assistant inside the Clyde AI job intelligence app. Be warm, direct, and practical. Keep replies concise — usually under 150 words unless the user asks for more detail.";

  if (mode === "interview") {

    let prompt =
      base +
      " You are running a live mock interview. Ask one interview question at a time based on the job description below, wait for the candidate's answer, give brief constructive feedback, then ask the next question. Do not ask more than one question per message.";

    if (jobDescription) {
      prompt += `\n\nJob description:\n${jobDescription}`;
    } else {
      prompt +=
        " No job description has been provided yet — ask the candidate to paste one and analyze it first before starting the interview.";
    }

    return prompt;

  }

  let prompt =
    base +
    " Help with general career advice: job searching, resumes, applications, negotiating, and career strategy.";

  if (jobDescription) {
    prompt += `\n\nThe user has analyzed this specific job description:\n${jobDescription}`;
  }

  if (analysis) {
    prompt += `\n\nHere is Clyde AI's analysis of that job:\n${JSON.stringify(analysis)}`;
  }

  if (!jobDescription) {
    prompt +=
      " No specific job has been analyzed yet, so keep advice general unless the user describes their situation.";
  }

  return prompt;

}
