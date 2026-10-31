import test from "node:test";
import assert from "node:assert/strict";
import { prepareAiRecipe } from "../worker/ai-recipe.ts";
const draft = {
  title: "Творожные оладьи",
  description: "С яблоком",
  category: "Завтраки",
  time: 25,
  portions: 2,
  ingredients: [
    { productId: "cottage", quantity: 200 },
    { productId: "egg", quantity: 1 },
  ],
  steps: [
    {
      text: "Смешайте продукты и приготовьте до полной готовности.",
      minutes: 0,
    },
  ],
};
test("AI recipe with an optional zero-minute step is usable", async () => {
  const r = await prepareAiRecipe(draft);
  assert.ok(r);
  assert.equal(r.steps[0].minutes, undefined);
  assert.equal(r.source, "ai");
});
test("reordered duplicate ingredients resolve to one stable recipe", async () => {
  const a = await prepareAiRecipe(draft);
  const b = await prepareAiRecipe({
    ...draft,
    ingredients: [
      { productId: "egg", quantity: 1 },
      { productId: "cottage", quantity: 100 },
      { productId: "cottage", quantity: 100 },
    ],
  });
  assert.equal(a?.id, b?.id);
  assert.equal(b?.ingredients.length, 2);
});
test("unknown product IDs are rejected, rather than assigned invented nutrition", async () =>
  assert.equal(
    await prepareAiRecipe({
      ...draft,
      ingredients: [{ productId: "неизвестный продукт", quantity: 100 }],
    }),
    null,
  ));
