import { validateRecipe } from "../src/domain.ts";
import { productMap } from "../src/data.ts";
import type { Recipe } from "../src/types.ts";

export async function prepareAiRecipe(
  raw: Partial<Recipe>,
): Promise<Recipe | null> {
  if (!Array.isArray(raw.ingredients) || !Array.isArray(raw.steps)) return null;
  if (
    typeof raw.title !== "string" ||
    !raw.steps.every((s) => s && typeof s.text === "string")
  )
    return null;
  const quantities: Record<string, number> = {};
  for (const i of raw.ingredients) {
    if (
      !i ||
      !productMap[i.productId] ||
      !Number.isFinite(i.quantity) ||
      i.quantity <= 0
    )
      return null;
    quantities[i.productId] = (quantities[i.productId] || 0) + i.quantity;
  }
  const ingredients = Object.entries(quantities)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([productId, quantity]) => ({ productId, quantity }));
  const fingerprint = JSON.stringify({
    title: raw.title?.trim().toLowerCase(),
    ingredients,
  });
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(fingerprint),
  );
  const stableId = [...new Uint8Array(hash)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 24);
  const recipe: Recipe = {
    id: `ai-${stableId}`,
    title: raw.title || "",
    description: raw.description || "",
    category: raw.category || "Основные блюда",
    time: raw.time || 0,
    portions: raw.portions || 0,
    ingredients,
    steps: raw.steps.map((s) => ({
      text: s.text,
      ...(s.minutes && s.minutes > 0 ? { minutes: s.minutes } : {}),
    })),
    image: "/images/bowl.jpg",
    source: "ai",
    difficulty: "Легко",
    version: 1,
    tags: ["Создан ИИ"],
  };
  return validateRecipe(recipe) ? recipe : null;
}
