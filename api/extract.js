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
          content: content: `OCR text:
${ocrText}

Extract all visible prescription information.

Return strict JSON with exactly this structure:

{
  "patient": {
    "name": null,
    "dob": null
  },
  "medications": [
    {
      "drugName": null,
      "strength": null,
      "quantity": null,
      "refills": null,
      "directions": null
    }
  ],
  "prescriber": null,
  "prescriptionDate": null,
  "confidenceFlags": [],
  "verificationStatus": "requires_pharmacist_review",
  "safetyNote": "Prototype only. Verify every field against the original prescription before use."
}

Rules:
- Extract every visible medication order.
- Do not guess missing information.
- Use null when uncertain.
- Preserve medication strength exactly as visible.
- Preserve directions exactly as visible.
- Return JSON only.`,
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
