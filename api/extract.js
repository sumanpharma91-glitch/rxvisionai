import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST.",
    });
  }

  try {
    const { ocrText } = req.body || {};

    if (typeof ocrText !== "string" || !ocrText.trim()) {
      return res.status(400).json({
        error: "Missing or invalid ocrText",
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a prescription data extraction assistant.

Extract only visible prescription and medication-order information into strict JSON.

GENERAL RULES:
- Never guess missing information.
- Use null when a field cannot be reliably determined.
- Preserve medication names, strengths, quantities, refills, and directions as closely as possible to the OCR text.
- Do not silently correct ambiguous OCR.
- Pharmacist verification is always required.
- Return JSON only.

CONFIDENCE RULES:
- Give each extracted field an estimated confidence score from 0 to 100.
- Confidence represents how clearly the value is supported by the supplied OCR text.
- Use 0 when the field is null or not present.
- Use 95 to 100 only when the field is explicit and unambiguous.
- Use 85 to 94 when the field is clear but has minor OCR uncertainty.
- Use 70 to 84 when review is advisable.
- Use below 70 when the field is unclear, incomplete, conflicting, or likely misread.
- Do not increase confidence because a value seems medically plausible.
- Confidence scores are review aids, not proof of correctness.

CONFIDENCE FLAGS:
- Add confidenceFlags for OCR uncertainty, unreadable text, conflicting text, missing critical fields, or likely misread values.
- Do not flag standard abbreviations such as PO, IV, BID, PRN, q6, or q12 unless the OCR text itself is unclear.
- Identify the medication and field whenever possible.
- Missing quantity or refills alone should not automatically be flagged when they are simply absent.
- Add a flag for any populated critical field with confidence below 85.
- Critical medication fields are drugName, strength, and directions.

REVIEW NOTES:
- Use reviewNotes for concise pharmacist-facing observations.
- Do not duplicate every confidence flag unless the note adds useful context.`,
        },
        {
          role: "user",
          content: `OCR text:

${ocrText}

Return JSON only using exactly this structure:

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
  "fieldConfidence": {
    "patient": {
      "name": 0,
      "dob": 0
    },
    "medications": [
      {
        "drugName": 0,
        "strength": 0,
        "quantity": 0,
        "refills": 0,
        "directions": 0
      }
    ],
    "prescriber": 0,
    "prescriptionDate": 0
  },
  "confidenceFlags": [],
  "reviewNotes": [],
  "verificationStatus": "requires_pharmacist_review",
  "safetyNote": "Prototype only. Verify every field against the original prescription before use."
}`,
        },
      ],
      temperature: 0,
      response_format: {
        type: "json_object",
      },
    });

    const text = response.choices?.[0]?.message?.content;

    if (!text) {
      throw new Error("The AI returned an empty response.");
    }

    let extracted;

    try {
      extracted = JSON.parse(text);
    } catch {
      throw new Error("The AI returned invalid JSON.");
    }

    extracted.verificationStatus = "requires_pharmacist_review";
    extracted.safetyNote =
      "Prototype only. Verify every field against the original prescription before use.";

    return res.status(200).json(extracted);
  } catch (error) {
    console.error("Prescription extraction error:", error);

    return res.status(500).json({
      error: "Prescription extraction failed.",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
}
