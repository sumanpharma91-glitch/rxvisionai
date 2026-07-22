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

    if (!imageBase64.startsWith("data:image/")) {
      return res.status(400).json({
        error: "imageBase64 must be a valid image data URL.",
      });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      temperature: 0,

      messages: [
        {
          role: "system",
          content: `You are a prescription image extraction assistant for a Canadian pharmacy prototype.

Extract only information that is visibly supported by the prescription or medication-order image.

GENERAL RULES:
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
- Do not confuse patient information with prescriber or clinic information.
- Do not confuse a phone number, fax number, licence number, DIN, billing number, or postal code.
- Do not expand standard prescription abbreviations unless expansion is explicitly visible.
- Pharmacist verification is always required.
Return valid JSON only.

Do not wrap the JSON in markdown.

Do not include explanations.

Return exactly the schema requested by the user.

If multiple medications exist, return one medication object for each.

Never combine strength, dosage form, quantity, or directions into drugName.

CONFIDENCE RULES:
- Give every requested field a confidence score from 0 to 100.
- Use 0 when the field is null, absent, or unreadable.
- Use 95 to 100 only when the value is clearly visible and unambiguous.
- Use 85 to 94 when the value appears clear but has minor uncertainty.
- Use 70 to 84 when pharmacist review is advisable.
- Use below 70 when the field is unclear, incomplete, conflicting, or likely misread.
- Confidence must reflect image clarity and extraction certainty, not medical plausibility.

CONFIDENCE FLAGS:
- Add a confidence flag for populated critical fields below 85.
- Critical fields include patient name, prescriber name, drug name, strength, and directions.
- Identify the medication number and field whenever possible.
- Flag unreadable text, conflicting information, ambiguous characters, and missing critical information.
- Do not flag standard abbreviations such as PO, IV, IM, SC, BID, TID, QID, PRN, q6h, or q12h merely because they are abbreviated.
- Missing quantity or refills should not automatically be flagged when they are not present on the image.

REVIEW NOTES:
- Add brief pharmacist-facing review notes only when useful.
- Do not duplicate every confidence flag.
- Do not provide treatment recommendations, diagnosis, approval, or dispensing authorization.`,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Extract all information exactly as visibly written on the prescription image.

PATIENT
- Full name
- Date of birth
- Full address
- Phone number

PRESCRIBER
- Prescriber name
- Clinic name
- Licence number
- Full address
- Phone number
- Fax number

PRESCRIPTION
- Prescription date

MEDICATIONS
- Drug name
- Strength
- Dosage form
- Quantity
- Refills
- Directions

Return null for any field that is not visible or cannot be reliably determined.

Return JSON only using exactly this structure:

{
  "patient": {
    "name": null,
    "dob": null,
    "address": null,
    "phone": null
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
  "prescriber": {
    "name": null,
    "clinicName": null,
    "licenseNumber": null,
    "address": null,
    "phone": null,
    "fax": null
  },
  "prescriptionDate": null,
  "fieldConfidence": {
    "patient": {
      "name": 0,
      "dob": 0,
      "address": 0,
      "phone": 0
    },
    "medications": [
     {
  "drugName": 0,
  "strength": 0,
  "dosageForm": 0,
  "quantity": 0,
  "refills": 0,
  "directions": 0
}
    ],
    "prescriber": {
      "name": 0,
      "clinicName": 0,
      "licenseNumber": 0,
      "address": 0,
      "phone": 0,
      "fax": 0
    },
    "prescriptionDate": 0
  },
  "confidenceFlags": [],
  "reviewNotes": [],
  "verificationStatus": "requires_pharmacist_review",
  "safetyNote": "Prototype only. Verify every field against the original prescription before use."
}

Important:
- Include one medication object for every current medication order visibly present.
- If no medication order is visible, return an empty medications array.
- Keep fieldConfidence.medications in the same order and with the same number of objects as medications.
- Do not include Markdown code fences.
- Do not include explanations before or after the JSON.`,
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

    extracted.patient = {
      name: extracted.patient?.name ?? null,
      dob: extracted.patient?.dob ?? null,
      address: extracted.patient?.address ?? null,
      phone: extracted.patient?.phone ?? null,
    };

    extracted.prescriber = {
      name: extracted.prescriber?.name ?? null,
      clinicName: extracted.prescriber?.clinicName ?? null,
      licenseNumber: extracted.prescriber?.licenseNumber ?? null,
      address: extracted.prescriber?.address ?? null,
      phone: extracted.prescriber?.phone ?? null,
      fax: extracted.prescriber?.fax ?? null,
    };

    extracted.prescriptionDate = extracted.prescriptionDate ?? null;

    extracted.medications = Array.isArray(extracted.medications)
  ? extracted.medications.map((medication) => ({
      drugName: medication?.drugName ?? null,
      strength: medication?.strength ?? null,
      dosageForm: medication?.dosageForm ?? null,
      quantity: medication?.quantity ?? null,
      refills: medication?.refills ?? null,
      directions: medication?.directions ?? null,
    }))
  : [];

    const medicationConfidence = Array.isArray(
      extracted.fieldConfidence?.medications
    )
      ? extracted.fieldConfidence.medications
      : [];

    extracted.fieldConfidence = {
      patient: {
        name: normalizeConfidence(
          extracted.fieldConfidence?.patient?.name,
          extracted.patient.name
        ),
        dob: normalizeConfidence(
          extracted.fieldConfidence?.patient?.dob,
          extracted.patient.dob
        ),
        address: normalizeConfidence(
          extracted.fieldConfidence?.patient?.address,
          extracted.patient.address
        ),
        phone: normalizeConfidence(
          extracted.fieldConfidence?.patient?.phone,
          extracted.patient.phone
        ),
      },

      medications: extracted.medications.map((medication, index) => {
        const confidence = medicationConfidence[index] || {};

        return {
          drugName: normalizeConfidence(
            confidence.drugName,
            medication.drugName
          ),
          strength: normalizeConfidence(
            confidence.strength,
            medication.strength
          ),
          quantity: normalizeConfidence(
            confidence.quantity,
            medication.quantity
          ),
          refills: normalizeConfidence(
            confidence.refills,
            medication.refills
          ),
          directions: normalizeConfidence(
            confidence.directions,
            medication.directions
          ),
        };
      }),

      prescriber: {
        name: normalizeConfidence(
          extracted.fieldConfidence?.prescriber?.name,
          extracted.prescriber.name
        ),
        clinicName: normalizeConfidence(
          extracted.fieldConfidence?.prescriber?.clinicName,
          extracted.prescriber.clinicName
        ),
        licenseNumber: normalizeConfidence(
          extracted.fieldConfidence?.prescriber?.licenseNumber,
          extracted.prescriber.licenseNumber
        ),
        address: normalizeConfidence(
          extracted.fieldConfidence?.prescriber?.address,
          extracted.prescriber.address
        ),
        phone: normalizeConfidence(
          extracted.fieldConfidence?.prescriber?.phone,
          extracted.prescriber.phone
        ),
        fax: normalizeConfidence(
          extracted.fieldConfidence?.prescriber?.fax,
          extracted.prescriber.fax
        ),
      },

      prescriptionDate: normalizeConfidence(
        extracted.fieldConfidence?.prescriptionDate,
        extracted.prescriptionDate
      ),
    };

    extracted.confidenceFlags = Array.isArray(extracted.confidenceFlags)
      ? extracted.confidenceFlags.filter(
          (flag) => typeof flag === "string" && flag.trim()
        )
      : [];

    extracted.reviewNotes = Array.isArray(extracted.reviewNotes)
      ? extracted.reviewNotes.filter(
          (note) => typeof note === "string" && note.trim()
        )
      : [];

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

function normalizeConfidence(score, value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  const number = Number(score);

  if (!Number.isFinite(number)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}
