
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const interactionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    provider: {
      type: "string"
    },
    checkedAt: {
      type: "string"
    },
    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        major: { type: "integer" },
        moderate: { type: "integer" },
        minor: { type: "integer" },
        informational: { type: "integer" }
      },
      required: ["major", "moderate", "minor", "informational"]
    },
    interactions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          drug1: { type: "string" },
          drug2: { type: "string" },
          severity: {
            type: "string",
            enum: [
              "major",
              "moderate",
              "minor",
              "informational"
            ]
          },
          clinicalEffect: { type: "string" },
          mechanism: { type: "string" },
          recommendation: { type: "string" },
          evidenceLimitations: { type: "string" },
          requiresPharmacistReview: { type: "boolean" }
        },
        required: [
          "drug1",
          "drug2",
          "severity",
          "clinicalEffect",
          "mechanism",
          "recommendation",
          "evidenceLimitations",
          "requiresPharmacistReview"
        ]
      }
    },
    duplicateTherapyWarnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          medications: {
            type: "array",
            items: { type: "string" }
          },
          reason: { type: "string" },
          recommendation: { type: "string" }
        },
        required: [
          "medications",
          "reason",
          "recommendation"
        ]
      }
    },
    reviewNotes: {
      type: "array",
      items: { type: "string" }
    },
    disclaimer: {
      type: "string"
    }
  },
  required: [
    "provider",
    "checkedAt",
    "summary",
    "interactions",
    "duplicateTherapyWarnings",
    "reviewNotes",
    "disclaimer"
  ]
};

function cleanMedication(medication) {
  return {
    drugName: String(medication?.drugName || "").trim(),
    strength: String(medication?.strength || "").trim(),
    dosageForm: String(medication?.dosageForm || "").trim(),
    directions: String(medication?.directions || "").trim()
  };
}

function countBySeverity(interactions) {
  const summary = {
    major: 0,
    moderate: 0,
    minor: 0,
    informational: 0
  };

  interactions.forEach(interaction => {
    if (summary[interaction.severity] !== undefined) {
      summary[interaction.severity] += 1;
    }
  });

  return summary;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const medications = Array.isArray(req.body?.medications)
      ? req.body.medications.map(cleanMedication)
      : [];

    const validMedications = medications.filter(
      medication => medication.drugName
    );

    if (validMedications.length < 2) {
      return res.status(200).json({
        provider: "openai_prototype",
        checkedAt: new Date().toISOString(),
        summary: {
          major: 0,
          moderate: 0,
          minor: 0,
          informational: 0
        },
        interactions: [],
        duplicateTherapyWarnings: [],
        reviewNotes: [
          "At least two medications are required for interaction screening."
        ],
        disclaimer:
          "Prototype AI screening only. This is not a substitute for an approved drug-interaction database or pharmacist assessment."
      });
    }

    const response = await openai.responses.create({
      model: process.env.OPENAI_INTERACTION_MODEL || "gpt-5",
      input: [
        {
          role: "developer",
          content: `
You are assisting a licensed pharmacist with preliminary medication-interaction screening.

Analyze only the medications supplied by the application.

Rules:
- Identify drug-drug interactions and possible duplicate therapy.
- Do not claim that the list is exhaustive.
- Do not approve or reject a prescription.
- Do not fabricate an interaction when evidence is uncertain.
- Use conservative severity classification.
- Major means the combination could cause serious harm or generally requires avoidance, urgent intervention, or a substantial therapy change.
- Moderate means monitoring, dose adjustment, timing separation, or additional clinical assessment may be needed.
- Minor means limited clinical significance but may still require counselling or observation.
- Informational means a noteworthy consideration that is not clearly a clinically significant interaction.
- Recommendations must be directed to pharmacist review.
- Mention evidence limitations when patient factors, dose, route, duration, indication, renal function, laboratory values, or timing are unavailable.
- Every detected interaction must require pharmacist review.
- Return no patient-identifying information.
          `.trim()
        },
        {
          role: "user",
          content: JSON.stringify({
            medications: validMedications
          })
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "drug_interaction_screen",
          strict: true,
          schema: interactionSchema
        }
      }
    });

    if (!response.output_text) {
      throw new Error("The interaction model returned no output.");
    }

    const result = JSON.parse(response.output_text);

    result.provider = "openai_prototype";
    result.checkedAt = new Date().toISOString();
    result.summary = countBySeverity(result.interactions || []);
    result.disclaimer =
      "Prototype AI screening only. Results may be incomplete or inaccurate. Verify all findings using an approved drug-information source and pharmacist assessment.";

    return res.status(200).json(result);
  } catch (error) {
    console.error("Interaction checker error:", error);

    return res.status(500).json({
      error: "Interaction screening failed.",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined
    });
  }
}
