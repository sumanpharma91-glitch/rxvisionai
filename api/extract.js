import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { ocrText } = req.body;

    if (!ocrText) {
      return res.status(400).json({ error: "Missing ocrText" });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Extract prescription/order information into strict JSON only. Use null when unsure. Do not guess. Pharmacist verification is required.",
        },
        {
          role: "user",
          content: `OCR text:\n${ocrText}\n\nReturn JSON with: patient{name,dob}, medication{drugName,strength,quantity,refills,directions}, prescriber, prescriptionDate, confidenceFlags, verificationStatus, safetyNote.`,
        },
      ],
      temperature: 0,
    });

    const text = response.choices[0].message.content;

    const cleaned = text
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    return res.status(200).json(JSON.parse(cleaned));
  } catch (error) {
    return res.status(500).json({
      error: error.message,
    });
  }
}
