export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed. Use POST."
    });
  }

  try {
    const { ocrText } = req.body;

    if (!ocrText) {
      return res.status(400).json({
        error: "Missing ocrText"
      });
    }

    return res.status(200).json({
      message: "API route is working",
      receivedText: ocrText
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message
    });
  }
}
