export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const drugName = String(req.body?.drugName || "").trim();

    if (!drugName) {
      return res.status(400).json({
        error: "Drug name is required"
      });
    }

    const productUrl =
      "https://health-products.canada.ca/api/drug/drugproduct/" +
      `?brandname=${encodeURIComponent(drugName)}` +
      "&lang=en&type=json";

    const ingredientUrl =
      "https://health-products.canada.ca/api/drug/activeingredient/" +
      `?ingredientname=${encodeURIComponent(drugName)}` +
      "&lang=en&type=json";

    const [productResponse, ingredientResponse] = await Promise.all([
      fetch(productUrl),
      fetch(ingredientUrl)
    ]);

    if (!productResponse.ok || !ingredientResponse.ok) {
      throw new Error("Health Canada API request failed");
    }

    const products = await productResponse.json();
    const ingredients = await ingredientResponse.json();

    return res.status(200).json({
      source: "Health Canada Drug Product Database",
      searchedDrugName: drugName,
      recognized:
        products.length > 0 || ingredients.length > 0,
      products: products.slice(0, 10),
      ingredients: ingredients.slice(0, 10)
    });
  } catch (error) {
    console.error("Drug validation error:", error);

    return res.status(500).json({
      error: "Unable to validate medication",
      details: error.message
    });
  }
}
