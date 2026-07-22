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

Medication Extraction Rules:
- Return ONLY the medication or active ingredient name in "drugName".
- Do NOT include strength, dosage form, quantity, refills, or directions inside "drugName".
- Extract the dosage form separately into "dosageForm".
- Preserve the original strength exactly as written.
- Preserve the original quantity exactly as written.
- Preserve the original directions exactly as written.
- Preserve the original refill information exactly as written.

Dosage Form Rules:

- Always extract dosageForm whenever it can be determined.
- If the prescription explicitly states Tablet, Capsule, Cream, Ointment, Inhaler, Injection, Suspension, Syrup, Patch, Drops, Solution, Powder, or Lotion, return that value.
- If the dosage form is obvious from the medication wording (for example "Metformin tablets", "Amoxicillin capsules", "Ventolin HFA inhaler"), return the dosage form.
- If the dosage form truly cannot be determined, return null.
- Never include dosage form inside drugName.

Examples:

Input:
Metformin 500 mg tablets

Output:
drugName = "Metformin"
strength = "500 mg"
dosageForm = "Tablet"

Input:
Amoxicillin 250 mg capsules

Output:
drugName = "Amoxicillin"
strength = "250 mg"
dosageForm = "Capsule"

Input:
Ventolin HFA 100 mcg inhaler

Output:
drugName = "Ventolin HFA"
strength = "100 mcg"
dosageForm = "Inhaler"

- Do not silently correct ambiguous OCR.
- Add confidenceFlags only for OCR uncertainty, unreadable text, conflicting text, missing critical fields, or values that may have been misread.
- Do not flag standard prescription abbreviations by themselves, such as PO, IV, BID, PRN, q6, or q12, unless the OCR text is unclear.
- Each confidence flag should identify the medication and field when possible.
- If a drug name, strength, quantity, refill, or direction appears uncertain, add a specific review message.
- Confidence flags must identify the medication and field when possible.
- Missing quantity or refills alone should not automatically be flagged if those fields are simply not present.
- Flag potentially ambiguous abbreviations or unclear characters for pharmacist review.
- Pharmacist verification is always required.
Return valid JSON only.

Do not wrap the JSON in markdown.

Do not include explanations.

Return exactly the schema requested by the user.

If multiple medications exist, return one medication object for each.

Never combine strength, dosage form, quantity, or directions into drugName.
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
  "drugName": "Metformin",
  "strength": "500 mg",
  "dosageForm": "Tablet",
  "quantity": "60 tablets",
  "refills": "3",
  "directions": "Take one tablet PO BID"
}
  ],
  "prescriber": null,
  "prescriptionDate": null,
  "confidenceFlags": [],
"reviewNotes": [],
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
