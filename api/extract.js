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
  content: `You are a prescription data extraction assistant.

Extract visible prescription and medication-order information into strict JSON.

Rules:
- Never guess missing information.
- Use null when a field cannot be reliably determined.
- Preserve medication names, strengths, quantities, refills, and directions as closely as possible to the source text.
- Do not silently correct ambiguous OCR.
- If any field is uncertain, ambiguous, partially unreadable, conflicting, or likely affected by OCR error, add a specific message to confidenceFlags.
- Confidence flags must identify the medication and field when possible.
- Missing quantity or refills alone should not automatically be flagged if those fields are simply not present.
- Flag potentially ambiguous abbreviations or unclear characters for pharmacist review.
- Pharmacist verification is always required.
- Return JSON only.`
},
        {
          role: "user",
          content: `OCR text:
${ocrText}

Return JSON only with this structure:
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
}`
        }
      ],
      temperature: 0
    });

    const text = response.choices[0].message.content || "{}";
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();

    return res.status(200).json(JSON.parse(cleaned));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
