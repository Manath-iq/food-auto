import { emptyState, validateRecipe } from "../src/domain.ts";
import { productMap } from "../src/data.ts";
import { meals } from "../src/types.ts";
import type { AppState, PlanEntry } from "../src/types.ts";
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max = 500): v is string =>
  typeof v === "string" && v.length <= max;
const quantity = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 100000;
const date = (v: unknown) =>
  text(v, 10) &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const entry = (e: PlanEntry) =>
  record(e) &&
  text(e.id, 100) &&
  date(e.date) &&
  meals.includes(e.meal) &&
  quantity(e.portions) &&
  e.portions <= 30 &&
  validateRecipe(e.recipe);
export function validateState(v: unknown): v is AppState {
  try {
    if (!record(v) || Object.keys(emptyState()).some((k) => !(k in v)))
      return false;
    const s = v as AppState;
    return (
      Array.isArray(s.favorites) &&
      s.favorites.length <= 1000 &&
      s.favorites.every((i) => text(i, 100)) &&
      Array.isArray(s.plan) &&
      s.plan.length <= 1500 &&
      s.plan.every(entry) &&
      Array.isArray(s.recipes) &&
      s.recipes.length <= 100 &&
      s.recipes.every(validateRecipe) &&
      Array.isArray(s.pantry) &&
      s.pantry.length <= 500 &&
      s.pantry.every(
        (i) =>
          record(i) &&
          text(i.id, 100) &&
          !!productMap[i.productId] &&
          quantity(i.quantity) &&
          (!i.expires || date(i.expires)) &&
          date(i.added) &&
          text(i.note, 500),
      ) &&
      Array.isArray(s.shopping) &&
      s.shopping.length <= 1000 &&
      s.shopping.every(
        (i) =>
          record(i) &&
          text(i.id, 100) &&
          !!productMap[i.productId] &&
          quantity(i.quantity) &&
          typeof i.checked === "boolean" &&
          ["manual", "recipe"].includes(i.source),
      ) &&
      ["checked", "overrides"].every(
        (k) =>
          record(v[k]) &&
          Object.entries(v[k]).length <= 200 &&
          Object.entries(v[k]).every(
            ([id, n]) =>
              !!productMap[id] &&
              typeof n === "number" &&
              Number.isFinite(n) &&
              n >= 0 &&
              n <= 100000,
          ),
      ) &&
      record(s.notes) &&
      Object.entries(s.notes).length <= 1000 &&
      Object.entries(s.notes).every(
        ([id, n]) => text(id, 100) && text(n, 3000),
      ) &&
      Array.isArray(s.hidden) &&
      s.hidden.length <= 200 &&
      s.hidden.every((i) => text(i, 100) && !!productMap[i]) &&
      Array.isArray(s.history) &&
      s.history.length <= 1000 &&
      s.history.every(
        (i) =>
          record(i) &&
          text(i.id, 100) &&
          text(i.recipeId, 100) &&
          text(i.title, 120) &&
          date(i.date),
      ) &&
      Array.isArray(s.savedMenus) &&
      s.savedMenus.length <= 30 &&
      s.savedMenus.every(
        (m) =>
          record(m) &&
          text(m.id, 100) &&
          text(m.name, 100) &&
          Array.isArray(m.entries) &&
          m.entries.length <= 100 &&
          m.entries.every(entry),
      ) &&
      typeof s.includeStaples === "boolean" &&
      record(s.preferences) &&
      quantity(s.preferences.portions) &&
      s.preferences.portions <= 30 &&
      quantity(s.preferences.kcal) &&
      s.preferences.kcal >= 500 &&
      s.preferences.kcal <= 6000 &&
      text(s.preferences.excluded, 1000) &&
      text(s.preferences.diet, 100) &&
      quantity(s.preferences.maxTime) &&
      s.preferences.maxTime <= 1440 &&
      typeof s.preferences.budget === "number" &&
      s.preferences.budget >= 0 &&
      s.preferences.budget <= 100000 &&
      typeof s.preferences.notifications === "boolean"
    );
  } catch {
    return false;
  }
}
