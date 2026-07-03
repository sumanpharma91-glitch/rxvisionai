import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { imageBase64 } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing imageBase64" });
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "Extract visible prescription/order information from the image into strict JSON only. Do not guess. Use null when unsure. Pharmacist verification is required.",
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Return JSON only with this structure:
{
  "patient": {"name": null, "dob": null},
  "medications": [
    {"drugName": null, "strength": null, "quantity": null, "refills": null, "directions": null}
  ],
  "prescriber": null,
  "prescriptionDate": null,
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
              },
            },
          ],
        },
      ],
      temperature: 0,
    });

    const text = response.choices[0].message.content || "{}";
    const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();

    return res.status(200).json(JSON.parse(cleaned));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
