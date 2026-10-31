import { productMap } from "./data.ts";
import type {
  AppState,
  Nutrition,
  Recipe,
  PlanEntry,
  Product,
  ShoppingItem,
} from "./types.ts";

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDate(d);
}
export function emptyState(): AppState {
  return {
    favorites: [],
    plan: [],
    pantry: [],
    shopping: [],
    checked: {},
    overrides: {},
    hidden: [],
    notes: {},
    recipes: [],
    history: [],
    preferences: {
      portions: 2,
      kcal: 2000,
      excluded: "",
      diet: "Любое питание",
      maxTime: 60,
      budget: 0,
      notifications: false,
    },
    includeStaples: false,
    savedMenus: [],
  };
}
export function nutrition(recipe: Recipe, portions = 1): Nutrition {
  const result = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const i of recipe.ingredients) {
    const p = productMap[i.productId];
    if (!p) continue;
    const ratio =
      ((i.quantity * p.gramsPerUnit) / 100 / recipe.portions) * portions;
    for (const key of Object.keys(result) as (keyof Nutrition)[])
      result[key] += p.nutrition[key] * ratio;
  }
  return result;
}
export function nutritionSum(entries: PlanEntry[]): Nutrition {
  return entries.reduce(
    (total, e) => {
      const n = nutrition(e.recipe, e.portions);
      for (const k of Object.keys(total) as (keyof Nutrition)[])
        total[k] += n[k];
      return total;
    },
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
}
export function recipeCost(recipe: Recipe, portions = 1): number {
  return (
    (recipe.ingredients.reduce(
      (sum, i) => sum + (productMap[i.productId]?.price || 0) * i.quantity,
      0,
    ) /
      recipe.portions) *
    portions
  );
}
export function availableStock(
  state: AppState,
  today = localDate(),
): Record<string, number> {
  return state.pantry
    .filter((s) => !s.expires || s.expires >= today)
    .reduce<Record<string, number>>((s, i) => {
      s[i.productId] = (s[i.productId] || 0) + i.quantity;
      return s;
    }, {});
}
export function missingIngredients(
  recipe: Recipe,
  state: AppState,
  portions = recipe.portions,
) {
  const stock = availableStock(state);
  return recipe.ingredients.filter(
    (i) =>
      !productMap[i.productId]?.staple &&
      (stock[i.productId] || 0) < (i.quantity / recipe.portions) * portions,
  );
}
export type ShoppingRow = {
  id: string;
  product: Product;
  quantity: number;
  purchased: number;
  checked: boolean;
  manual: boolean;
};
export function shoppingList(
  state: AppState,
  start: string,
  end: string,
): ShoppingRow[] {
  const required: Record<string, number> = {};
  for (const e of state.plan.filter((e) => e.date >= start && e.date <= end))
    for (const i of e.recipe.ingredients)
      required[i.productId] =
        (required[i.productId] || 0) +
        (i.quantity / e.recipe.portions) * e.portions;
  for (const i of state.shopping.filter((i) => i.source === "recipe"))
    required[i.productId] = (required[i.productId] || 0) + i.quantity;
  const stock = availableStock(state);
  const rows: ShoppingRow[] = [];
  for (const [id, total] of Object.entries(required)) {
    const p = productMap[id];
    if (!p || (p.staple && !state.includeStaples) || state.hidden.includes(id))
      continue;
    const quantity =
      state.overrides[id] ?? Math.max(0, total - (stock[id] || 0));
    if (quantity <= 0) continue;
    const purchased = state.checked[id] || 0;
    rows.push({
      id: `auto:${id}`,
      product: p,
      quantity,
      purchased: Math.min(purchased, quantity),
      checked: purchased >= quantity,
      manual: false,
    });
  }
  for (const i of state.shopping.filter((i) => i.source === "manual")) {
    const p = productMap[i.productId];
    if (p)
      rows.push({
        id: i.id,
        product: p,
        quantity: i.quantity,
        purchased: i.checked ? i.quantity : 0,
        checked: i.checked,
        manual: true,
      });
  }
  return rows.sort(
    (a, b) =>
      Number(a.checked) - Number(b.checked) ||
      a.product.category.localeCompare(b.product.category, "ru") ||
      a.product.name.localeCompare(b.product.name, "ru"),
  );
}
export function transferPurchases(state: AppState): AppState {
  const next = structuredClone(state);
  const bought: { productId: string; quantity: number }[] = Object.entries(
    next.checked,
  )
    .filter(([, q]) => q > 0)
    .map(([productId, quantity]) => ({ productId, quantity }));
  for (const i of next.shopping.filter(
    (i) => i.source === "manual" && i.checked,
  ))
    bought.push(i);
  for (const b of bought)
    next.pantry.push({
      id: crypto.randomUUID(),
      ...b,
      expires: "",
      note: "Из списка покупок",
      added: localDate(),
    });
  next.shopping = next.shopping.filter(
    (i) => !(i.source === "manual" && i.checked),
  );
  next.checked = {};
  next.overrides = {};
  return next;
}
export function subtractRecipe(
  state: AppState,
  recipe: Recipe,
  portions: number,
): AppState {
  const next = structuredClone(state);
  for (const ingredient of recipe.ingredients) {
    let remaining = (ingredient.quantity / recipe.portions) * portions;
    const stocks = next.pantry
      .filter(
        (i) =>
          i.productId === ingredient.productId &&
          (!i.expires || i.expires >= localDate()),
      )
      .sort((a, b) => (a.expires || "9999").localeCompare(b.expires || "9999"));
    for (const s of stocks) {
      const take = Math.min(s.quantity, remaining);
      s.quantity -= take;
      remaining -= take;
      if (remaining <= 0) break;
    }
  }
  next.pantry = next.pantry.filter((s) => s.quantity > 0.001);
  return next;
}
export function addRecipeShopping(
  state: AppState,
  recipe: Recipe,
  portions: number,
): AppState {
  const next = structuredClone(state);
  for (const i of recipe.ingredients) {
    if (productMap[i.productId]?.staple && !state.includeStaples) continue;
    const item: ShoppingItem = {
      id: crypto.randomUUID(),
      productId: i.productId,
      quantity: (i.quantity / recipe.portions) * portions,
      checked: false,
      source: "recipe",
    };
    next.shopping.push(item);
    next.hidden = next.hidden.filter((id) => id !== i.productId);
  }
  return next;
}
export function formatQuantity(q: number): string {
  return new Intl.NumberFormat("ru-RU", {
    maximumFractionDigits: q < 10 ? 1 : 0,
  }).format(q);
}
export function validateRecipe(value: unknown): value is Recipe {
  if (!value || typeof value !== "object") return false;
  const r = value as Recipe;
  return (
    typeof r.id === "string" &&
    r.id.length <= 100 &&
    typeof r.title === "string" &&
    r.title.length > 1 &&
    r.title.length <= 120 &&
    typeof r.description === "string" &&
    r.description.length <= 2000 &&
    typeof r.category === "string" &&
    typeof r.image === "string" &&
    r.image.length <= 2000 &&
    (r.image.startsWith("/images/") || r.image.startsWith("https://")) &&
    ["Легко", "Средне"].includes(r.difficulty) &&
    ["editorial", "personal", "ai"].includes(r.source) &&
    Number.isInteger(r.version) &&
    Number.isFinite(r.time) &&
    r.time > 0 &&
    r.time <= 1440 &&
    Number.isFinite(r.portions) &&
    r.portions >= 1 &&
    r.portions <= 30 &&
    (r.cookedWeight === undefined ||
      (Number.isFinite(r.cookedWeight) &&
        r.cookedWeight > 0 &&
        r.cookedWeight <= 100000)) &&
    Array.isArray(r.tags) &&
    r.tags.length <= 10 &&
    r.tags.every((t) => typeof t === "string" && t.length <= 80) &&
    Array.isArray(r.ingredients) &&
    r.ingredients.length > 0 &&
    r.ingredients.length <= 50 &&
    new Set(r.ingredients.map((i) => i.productId)).size ===
      r.ingredients.length &&
    r.ingredients.every(
      (i) =>
        i &&
        !!productMap[i.productId] &&
        Number.isFinite(i.quantity) &&
        i.quantity > 0 &&
        i.quantity <= 100000,
    ) &&
    Array.isArray(r.steps) &&
    r.steps.length > 0 &&
    r.steps.length <= 30 &&
    r.steps.every(
      (s) =>
        s &&
        typeof s.text === "string" &&
        s.text.length > 0 &&
        s.text.length <= 3000 &&
        (s.minutes === undefined ||
          (Number.isFinite(s.minutes) && s.minutes > 0 && s.minutes <= 1440)),
    )
  );
}
