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
    const { imageBase64 } = req.body || {};

    if (typeof imageBase64 !== "string" || !imageBase64.trim()) {
      return res.status(400).json({
        error: "Missing or invalid imageBase64",
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a prescription image extraction assistant.

Extract only information that is visibly supported by the prescription or medication-order image.

GENERAL RULES:
- Never guess missing information.
- Use null when a value cannot be reliably determined.
- Preserve medication names, strengths, quantities, refills, and directions as closely as possible to the image.
- Do not silently correct unclear handwriting or ambiguous text.
- Pharmacist verification is always required.
- Return valid JSON only.

CONFIDENCE RULES:
- Give every field an estimated confidence score from 0 to 100.
- Use 0 when the field is null, absent, or unreadable.
- Use 95 to 100 only when the value is clearly visible and unambiguous.
- Use 85 to 94 when the value appears clear but has minor uncertainty.
- Use 70 to 84 when pharmacist review is advisable.
- Use below 70 when the field is unclear, incomplete, conflicting, or likely misread.
- Confidence must reflect image clarity, not medical plausibility.
- Confidence scores are review aids and are not proof of correctness.

CONFIDENCE FLAGS:
- Add a confidence flag for populated critical fields below 85.
- Critical medication fields are drugName, strength, and directions.
- Identify the medication and field whenever possible.
- Flag unreadable text, conflicting information, ambiguous characters, and missing critical information.
- Do not flag standard abbreviations such as PO, IV, BID, PRN, q6, or q12 unless the image is unclear.
- Missing quantity or refills should not automatically be flagged when not present.

REVIEW NOTES:
- Add brief pharmacist-facing review notes only when useful.
- Do not duplicate every confidence flag unnecessarily.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract the prescription information from this image.

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
            {
              type: "image_url",
              image_url: {
                url: imageBase64,
                detail: "high",
              },
            },
          ],
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

    const extracted = JSON.parse(text);

    extracted.verificationStatus = "requires_pharmacist_review";
    extracted.safetyNote =
      "Prototype only. Verify every field against the original prescription before use.";

    return res.status(200).json(extracted);
  } catch (error) {
    console.error("Vision extraction error:", error);

    return res.status(500).json({
      error: "Prescription image extraction failed.",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
}
