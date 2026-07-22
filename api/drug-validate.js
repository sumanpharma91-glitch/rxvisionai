const HEALTH_CANADA_BASE =
  "https://health-products.canada.ca/api/drug";

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[®™]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeStrength(value) {
  const text = String(value || "")
    .toLowerCase()
    .replace(/micrograms?/g, "mcg")
    .replace(/milligrams?/g, "mg")
    .replace(/grams?/g, "g")
    .replace(/millilit(?:er|re)s?/g, "ml")
    .replace(/international units?/g, "iu")
    .replace(/\s+/g, " ")
    .trim();

  const match = text.match(
    /(\d+(?:\.\d+)?)\s*(mcg|mg|g|kg|ml|l|unit|units|iu|%|meq|mmol)\b/i
  );

  if (!match) {
    return {
      raw: value || null,
      value: null,
      unit: null,
      canonical: null
    };
  }

  const numericValue = Number(match[1]);
  let unit = match[2].toLowerCase();

  if (unit === "units") unit = "unit";

  return {
    raw: value,
    value: numericValue,
    unit,
    canonical: `${numericValue} ${unit}`
  };
}

function strengthsAreEqual(first, second) {
  if (!first?.canonical || !second?.canonical) return false;

  return (
    first.value === second.value &&
    first.unit === second.unit
  );
}

function uniqueStrings(values) {
  return [...new Set(values.filter(Boolean))];
}

function inferRouteFromDirections(directions) {
  const text = normalizeText(directions);

  const routePatterns = [
    { route: "ORAL", pattern: /\b(po|oral|orally|by mouth)\b/i },
    { route: "INTRAVENOUS", pattern: /\b(iv|intravenous)\b/i },
    { route: "INTRAMUSCULAR", pattern: /\b(im|intramuscular)\b/i },
    {
      route: "SUBCUTANEOUS",
      pattern: /\b(sc|sq|subcut|subcutaneous)\b/i
    },
    {
      route: "SUBLINGUAL",
      pattern: /\b(sl|sublingual|under the tongue)\b/i
    },
    { route: "TOPICAL", pattern: /\b(topical|topically|apply)\b/i },
    { route: "OPHTHALMIC", pattern: /\b(ophthalmic|eye|eyes)\b/i },
    { route: "OTIC", pattern: /\b(otic|ear|ears)\b/i },
    { route: "NASAL", pattern: /\b(nasal|nostril|nostrils)\b/i },
    {
      route: "INHALATION",
      pattern: /\b(inhale|inhaled|inhalation|puff|puffs)\b/i
    },
    { route: "RECTAL", pattern: /\b(rectal|rectally)\b/i },
    { route: "VAGINAL", pattern: /\b(vaginal|vaginally)\b/i }
  ];

  return routePatterns.find(item => item.pattern.test(text))?.route || null;
}

async function fetchHealthCanada(path, parameters = {}) {
  const url = new URL(`${HEALTH_CANADA_BASE}/${path}/`);

  Object.entries({
    ...parameters,
    lang: "en",
    type: "json"
  }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `Health Canada ${path} request failed with status ${response.status}`
    );
  }

  const data = await response.json();

  return Array.isArray(data) ? data : data ? [data] : [];
}

async function getProductDetailsByIngredient(ingredientResults) {
  const drugCodes = [
    ...new Set(
      ingredientResults
        .map(item => item?.drug_code)
        .filter(Boolean)
    )
  ].slice(0, 20);

  const results = await Promise.allSettled(
    drugCodes.map(code =>
      fetchHealthCanada("drugproduct", { id: code })
    )
  );

  return results.flatMap(result =>
    result.status === "fulfilled" ? result.value : []
  );
}

async function enrichProduct(product) {
  const drugCode = product?.drug_code;

  if (!drugCode) {
    return {
      ...product,
      activeIngredients: [],
      dosageForms: [],
      routes: [],
      statuses: []
    };
  }

  const [
    ingredientResult,
    dosageFormResult,
    routeResult,
    statusResult
  ] = await Promise.allSettled([
    fetchHealthCanada("activeingredient", { id: drugCode }),
    fetchHealthCanada("form", { id: drugCode }),
    fetchHealthCanada("route", { id: drugCode }),
    fetchHealthCanada("status", { id: drugCode })
  ]);

  return {
    ...product,

    activeIngredients:
      ingredientResult.status === "fulfilled"
        ? ingredientResult.value
        : [],

    dosageForms:
      dosageFormResult.status === "fulfilled"
        ? dosageFormResult.value
        : [],

    routes:
      routeResult.status === "fulfilled"
        ? routeResult.value
        : [],

    statuses:
      statusResult.status === "fulfilled"
        ? statusResult.value
        : []
  };
}

function getIngredientStrengths(product) {
  return (product.activeIngredients || []).map(ingredient => {
    const value =
      ingredient.strength ??
      ingredient.dosage_value ??
      "";

    const unit =
      ingredient.strength_unit ??
      ingredient.dosage_unit ??
      "";

    const display = `${value} ${unit}`.trim();
    const normalized = normalizeStrength(display);

    return {
      ingredientName: ingredient.ingredient_name || null,
      display: display || null,
      normalized
    };
  });
}

function calculateNameScore(searchName, product) {
  const searched = normalizeText(searchName);
  const brand = normalizeText(product.brand_name);

  const ingredientNames = (product.activeIngredients || [])
    .map(item => normalizeText(item.ingredient_name))
    .filter(Boolean);

  if (!searched) return 0;

  if (brand === searched) return 100;
  if (ingredientNames.includes(searched)) return 100;

  if (brand.includes(searched) || searched.includes(brand)) {
    return 92;
  }

  if (
    ingredientNames.some(
      name => name.includes(searched) || searched.includes(name)
    )
  ) {
    return 92;
  }

  const searchedWords = searched.split(" ").filter(Boolean);
  const searchableText = [
    brand,
    ...ingredientNames
  ].join(" ");

  if (
    searchedWords.length &&
    searchedWords.every(word => searchableText.includes(word))
  ) {
    return 85;
  }

  return 65;
}

function scoreProduct(product, drugName, requestedStrength, inferredRoute) {
  const ingredientStrengths = getIngredientStrengths(product);

  const exactStrengthMatch =
    Boolean(requestedStrength?.canonical) &&
    ingredientStrengths.some(item =>
      strengthsAreEqual(requestedStrength, item.normalized)
    );

  const productRoutes = (product.routes || []).map(route =>
    normalizeText(
      route.route_name ||
      route.route_of_administration_name ||
      route.route
    )
  );

  const routeMatch =
    !inferredRoute ||
    productRoutes.some(route =>
      route.includes(normalizeText(inferredRoute))
    );

  const nameScore = calculateNameScore(drugName, product);

  let score = nameScore;

  if (requestedStrength?.canonical) {
    score += exactStrengthMatch ? 25 : -15;
  }

  if (inferredRoute) {
    score += routeMatch ? 10 : -5;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    ...product,
    matchScore: score,
    exactStrengthMatch,
    routeMatch,
    ingredientStrengths
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", ["POST"]);

    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const drugName = String(req.body?.drugName || "").trim();
    const strength = String(req.body?.strength || "").trim();
    const directions = String(req.body?.directions || "").trim();

    if (!drugName) {
      return res.status(400).json({
        error: "Drug name is required"
      });
    }

    const requestedStrength = normalizeStrength(strength);
    const inferredRoute = inferRouteFromDirections(directions);

    const [brandProducts, ingredientSearchResults] =
      await Promise.all([
        fetchHealthCanada("drugproduct", {
          brandname: drugName
        }),

        fetchHealthCanada("activeingredient", {
          ingredientname: drugName
        })
      ]);

    const genericProducts =
      await getProductDetailsByIngredient(
        ingredientSearchResults
      );

    const productsByCode = new Map();

    [...brandProducts, ...genericProducts].forEach(product => {
      const key =
        product.drug_code ||
        product.drug_identification_number ||
        product.brand_name;

      if (key && !productsByCode.has(key)) {
        productsByCode.set(key, product);
      }
    });

    const candidateProducts = [
      ...productsByCode.values()
    ].slice(0, 20);

    const enrichedResults = await Promise.allSettled(
      candidateProducts.map(enrichProduct)
    );

    const enrichedProducts = enrichedResults
      .filter(result => result.status === "fulfilled")
      .map(result => result.value);

    const scoredProducts = enrichedProducts
      .map(product =>
        scoreProduct(
          product,
          drugName,
          requestedStrength,
          inferredRoute
        )
      )
      .sort((a, b) => b.matchScore - a.matchScore);

    const exactStrengthProducts = scoredProducts.filter(
      product => product.exactStrengthMatch
    );

    const availableStrengths = uniqueStrings(
      scoredProducts.flatMap(product =>
        product.ingredientStrengths.map(item => item.display)
      )
    );

    const dosageForms = uniqueStrings(
      scoredProducts.flatMap(product =>
        (product.dosageForms || []).map(
          form =>
            form.pharmaceutical_form_name ||
            form.dosage_form_name ||
            form.form_name
        )
      )
    );

    const routes = uniqueStrings(
      scoredProducts.flatMap(product =>
        (product.routes || []).map(
          route =>
            route.route_name ||
            route.route_of_administration_name ||
            route.route
        )
      )
    );

    const bestMatch = scoredProducts[0] || null;
    const recognized = scoredProducts.length > 0;

    let matchType = "no_match";
    const warnings = [];

    if (recognized && exactStrengthProducts.length > 0) {
      matchType = "exact_strength_match";
    } else if (
      recognized &&
      requestedStrength.canonical &&
      availableStrengths.length > 0
    ) {
      matchType = "strength_mismatch";

      warnings.push(
        `The extracted strength "${strength}" was not found among the matched Health Canada products.`
      );

      warnings.push(
        "Possible OCR or handwriting interpretation error. Review the original prescription."
      );
    } else if (recognized) {
      matchType = "drug_name_match";
    }

    if (!strength) {
      warnings.push(
        "No strength was supplied for comparison."
      );
    }

    if (
      inferredRoute &&
      bestMatch &&
      !bestMatch.routeMatch
    ) {
      warnings.push(
        `The route inferred from the directions (${inferredRoute}) did not match the best product result.`
      );
    }

    const overallScore = bestMatch?.matchScore || 0;

    return res.status(200).json({
      source: "Health Canada Drug Product Database",

      searchedDrugName: drugName,
      searchedStrength: strength || null,
      searchedDirections: directions || null,

      recognized,
      matchType,
      overallScore,

      extracted: {
        drugName,
        strength: strength || null,
        normalizedStrength:
          requestedStrength.canonical,
        inferredRoute
      },

      bestMatch: bestMatch
        ? {
            productName:
              bestMatch.brand_name || null,

            din:
              bestMatch.drug_identification_number || null,

            drugCode:
              bestMatch.drug_code || null,

            companyName:
              bestMatch.company_name || null,

            matchScore:
              bestMatch.matchScore,

            exactStrengthMatch:
              bestMatch.exactStrengthMatch,

            ingredientStrengths:
              bestMatch.ingredientStrengths,

            dosageForms:
              bestMatch.dosageForms || [],

            routes:
              bestMatch.routes || [],

            statuses:
              bestMatch.statuses || []
          }
        : null,

      availableStrengths,
      dosageForms,
      routes,
      warnings,

      requiresPharmacistReview:
        !recognized ||
        matchType !== "exact_strength_match" ||
        warnings.length > 0,

      // Retained for compatibility with your current frontend.
      products: scoredProducts.slice(0, 10),

      ingredients: ingredientSearchResults.slice(0, 10)
    });
  } catch (error) {
    console.error("Drug validation error:", error);

    return res.status(500).json({
      error: "Unable to validate medication",
      details:
        process.env.NODE_ENV === "development"
          ? error.message
          : undefined
    });
  }
}
