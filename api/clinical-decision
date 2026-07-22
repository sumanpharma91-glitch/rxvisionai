import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const clinicalDecisionSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    provider: {
      type: "string"
    },

    checkedAt: {
      type: "string"
    },

    interactionAnalysis: {
      type: "object",
      additionalProperties: false,
      properties: {
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

        summary: {
          type: "object",
          additionalProperties: false,
          properties: {
            major: { type: "integer" },
            moderate: { type: "integer" },
            minor: { type: "integer" },
            informational: { type: "integer" }
          },
          required: [
            "major",
            "moderate",
            "minor",
            "informational"
          ]
        }
      },

      required: [
        "interactions",
        "summary"
      ]
    },

    duplicateTherapy: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          medications: {
            type: "array",
            items: { type: "string" }
          },

          therapeuticClass: { type: "string" },
          reason: { type: "string" },
          recommendation: { type: "string" },
          requiresPharmacistReview: { type: "boolean" }
        },

        required: [
          "medications",
          "therapeuticClass",
          "reason",
          "recommendation",
          "requiresPharmacistReview"
        ]
      }
    },

    highRiskAlerts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          medication: { type: "string" },
          category: { type: "string" },
          risk: { type: "string" },
          recommendation: { type: "string" },
          requiresPharmacistReview: { type: "boolean" }
        },

        required: [
          "medication",
          "category",
          "risk",
          "recommendation",
          "requiresPharmacistReview"
        ]
      }
    },

    controlledSubstanceAlerts: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          medication: { type: "string" },
          possibleControlledStatus: { type: "boolean" },
          jurisdictionNote: { type: "string" },
          recommendation: { type: "string" }
        },

        required: [
          "medication",
          "possibleControlledStatus",
          "jurisdictionNote",
          "recommendation"
        ]
      }
    },

    clinicalWarnings: {
      type: "array",
      items: { type: "string" }
    },

    pharmacistRecommendations: {
      type: "array",
      items: { type: "string" }
    },

    summary: {
      type: "object",
      additionalProperties: false,
      properties: {
        overallRisk: {
          type: "string",
          enum: [
            "low",
            "moderate",
            "high",
            "critical"
          ]
        },

        requiresPharmacistReview: {
          type: "boolean"
        },

        reason: {
          type: "string"
        }
      },

      required: [
        "overallRisk",
        "requiresPharmacistReview",
        "reason"
      ]
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
    "interactionAnalysis",
    "duplicateTherapy",
    "highRiskAlerts",
    "controlledSubstanceAlerts",
    "clinicalWarnings",
    "pharmacistRecommendations",
    "summary",
    "reviewNotes",
    "disclaimer"
  ]
};

function cleanText(value) {
  return String(value || "").trim();
}

function cleanMedication(medication) {
  return {
    drugName: cleanText(medication?.drugName),
    strength: cleanText(medication?.strength),
    dosageForm: cleanText(medication?.dosageForm),
    quantity: cleanText(medication?.quantity),
    refills: cleanText(medication?.refills),
    directions: cleanText(medication?.directions),

    din: cleanText(
      medication?.healthCanadaValidation?.bestMatch?.din ||
      medication?.healthCanadaValidation?.products?.[0]
        ?.drug_identification_number ||
      medication?.healthCanadaValidation?.products?.[0]?.din
    ),

    genericName: cleanText(
      medication?.healthCanadaValidation?.ingredients?.[0]
        ?.ingredient_name
    )
  };
}

function countInteractions(interactions = []) {
  const summary = {
    major: 0,
    moderate: 0,
    minor: 0,
    informational: 0
  };

  interactions.forEach(interaction => {
    const severity = interaction?.severity;

    if (Object.prototype.hasOwnProperty.call(summary, severity)) {
      summary[severity] += 1;
    }
  });

  return summary;
}

function calculateOverallRisk(result) {
  const interactions =
    result?.interactionAnalysis?.interactions || [];

  const hasMajorInteraction = interactions.some(
    interaction => interaction.severity === "major"
  );

  const hasModerateInteraction = interactions.some(
    interaction => interaction.severity === "moderate"
  );

  if (hasMajorInteraction) {
    return {
      overallRisk: "high",
      requiresPharmacistReview: true,
      reason:
        "One or more potentially major medication interactions were identified."
    };
  }

  if (
    hasModerateInteraction ||
    result.duplicateTherapy?.length > 0 ||
    result.highRiskAlerts?.length > 0
  ) {
    return {
      overallRisk: "moderate",
      requiresPharmacistReview: true,
      reason:
        "One or more clinical findings require pharmacist assessment."
    };
  }

  if (
    interactions.length > 0 ||
    result.controlledSubstanceAlerts?.length > 0 ||
    result.clinicalWarnings?.length > 0
  ) {
    return {
      overallRisk: "moderate",
      requiresPharmacistReview: true,
      reason:
        "Clinical considerations were identified for pharmacist review."
    };
  }

  return {
    overallRisk: "low",
    requiresPharmacistReview: true,
    reason:
      "No significant preliminary findings were identified, but pharmacist verification remains required."
  };
}

function createEmptyResult(message) {
  return {
    provider: "openai_prototype",
    checkedAt: new Date().toISOString(),

    interactionAnalysis: {
      interactions: [],
      summary: {
        major: 0,
        moderate: 0,
        minor: 0,
        informational: 0
      }
    },

    duplicateTherapy: [],
    highRiskAlerts: [],
    controlledSubstanceAlerts: [],
    clinicalWarnings: [],

    pharmacistRecommendations: [
      "Verify the prescription and medication profile using an approved clinical drug-information source."
    ],

    summary: {
      overallRisk: "low",
      requiresPharmacistReview: true,
      reason: message
    },

    reviewNotes: [message],

    disclaimer:
      "Prototype AI clinical screening only. This result may be incomplete or inaccurate and must not replace pharmacist assessment or an approved clinical drug-information database."
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const rawMedications = Array.isArray(req.body?.medications)
      ? req.body.medications
      : [];

    const medications = rawMedications
      .map(cleanMedication)
      .filter(medication => medication.drugName);

    if (medications.length === 0) {
      return res.status(200).json(
        createEmptyResult(
          "No medications were available for clinical screening."
        )
      );
    }

    const response = await openai.responses.create({
      model:
        process.env.OPENAI_CLINICAL_MODEL ||
        process.env.OPENAI_INTERACTION_MODEL ||
        "gpt-5",

      input: [
        {
          role: "developer",
          content: `
You are providing preliminary clinical decision support to a licensed pharmacist.

Analyze only the medication information supplied by the application.

Your task is to identify:

1. Potential drug-drug interactions.
2. Possible duplicate therapy.
3. High-risk medications.
4. Medications that may be controlled substances.
5. Important clinical warnings.
6. Concise pharmacist-oriented recommendations.

Important rules:

- This is screening support only.
- Do not approve, reject, authorize, dispense, prescribe, or change therapy.
- Do not state that the analysis is complete or exhaustive.
- Do not fabricate an interaction or warning.
- When evidence is uncertain, clearly state the limitation.
- Use conservative severity classification.
- Major interactions generally involve a risk of serious harm, avoidance, urgent intervention, or substantial therapy modification.
- Moderate interactions may require monitoring, dose adjustment, timing separation, or patient-specific assessment.
- Minor interactions have limited clinical significance but may require counselling or observation.
- Informational findings are noteworthy but are not clearly clinically significant interactions.
- Consider dose, strength, dosage form, directions, and route when supplied.
- Do not assume patient age, diagnosis, allergies, pregnancy status, renal function, hepatic function, laboratory values, or complete medication history.
- Controlled-substance status varies by jurisdiction. Do not state a definitive Canadian legal schedule unless confirmed by an authoritative source.
- Every clinical finding must remain subject to pharmacist verification.
- Do not include patient-identifying information.
- Keep recommendations concise and actionable for a pharmacist.
          `.trim()
        },

        {
          role: "user",
          content: JSON.stringify({
            medications,
            jurisdiction: cleanText(req.body?.jurisdiction) || "Canada",
            province: cleanText(req.body?.province) || "Ontario",
            purpose:
              "Preliminary pharmacist clinical decision support"
          })
        }
      ],

      text: {
        format: {
          type: "json_schema",
          name: "rxvision_clinical_decision",
          strict: true,
          schema: clinicalDecisionSchema
        }
      }
    });

    if (!response.output_text) {
      throw new Error(
        "The clinical decision model returned no output."
      );
    }

    const result = JSON.parse(response.output_text);

    result.provider = "openai_prototype";
    result.checkedAt = new Date().toISOString();

    const interactions =
      result?.interactionAnalysis?.interactions || [];

    result.interactionAnalysis.summary =
      countInteractions(interactions);

    result.summary = calculateOverallRisk(result);

    result.disclaimer =
      "Prototype AI clinical screening only. Findings may be incomplete or inaccurate. Verify all findings with an approved clinical drug-information source, applicable Canadian requirements, and pharmacist assessment.";

    return res.status(200).json(result);
  } catch (error) {
    console.error("Clinical decision support error:", error);

    return res.status(500).json({
      error: "Clinical decision screening failed.",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined
    });
  }
}
