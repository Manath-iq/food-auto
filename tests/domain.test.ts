import test from "node:test";
import assert from "node:assert/strict";
import { recipes } from "../src/data.ts";
import {
  addDays,
  emptyState,
  nutrition,
  shoppingList,
  transferPurchases,
  subtractRecipe,
  missingIngredients,
  validateRecipe,
} from "../src/domain.ts";
import { validateState } from "../worker/validation.ts";

const date = "2026-10-31";
test("all editorial recipes and the empty state pass server validation", () => {
  for (const r of recipes) assert.ok(validateRecipe(r), r.title);
  assert.ok(validateState(emptyState()));
});
test("portions scale all nutrition values proportionally", () => {
  const one = nutrition(recipes[0], 1),
    four = nutrition(recipes[0], 4);
  for (const k of Object.keys(one) as (keyof typeof one)[])
    assert.equal(four[k], one[k] * 4);
});
test("shopping combines ingredients across recipes and subtracts stock once", () => {
  const s = emptyState();
  const r = recipes[0];
  s.plan = [
    { id: "a", date, meal: "Обед", portions: 2, recipe: r },
    { id: "b", date, meal: "Ужин", portions: 2, recipe: r },
  ];
  s.pantry = [
    {
      id: "s",
      productId: "chicken",
      quantity: 100,
      expires: "2099-01-01",
      added: date,
      note: "",
    },
  ];
  assert.equal(
    shoppingList(s, date, date).find((i) => i.product.id === "chicken")
      ?.quantity,
    500,
  );
  assert.equal(
    shoppingList(s, date, date).find((i) => i.product.id === "salt"),
    undefined,
  );
});
test("expired stock is not treated as available", () => {
  const s = emptyState();
  s.plan = [{ id: "a", date, meal: "Обед", portions: 2, recipe: recipes[0] }];
  s.pantry = [
    {
      id: "s",
      productId: "chicken",
      quantity: 900,
      expires: "2000-01-01",
      added: date,
      note: "",
    },
  ];
  assert.equal(
    shoppingList(s, date, date).find((i) => i.product.id === "chicken")
      ?.quantity,
    300,
  );
  assert.ok(
    missingIngredients(recipes[0], s).some((i) => i.productId === "chicken"),
  );
});
test("purchased quantities survive plan increase and transfer without duplicate stock", () => {
  const s = emptyState();
  s.plan = [{ id: "a", date, meal: "Обед", portions: 4, recipe: recipes[0] }];
  s.checked.chicken = 300;
  const row = shoppingList(s, date, date).find(
    (i) => i.product.id === "chicken",
  )!;
  assert.equal(row.quantity, 600);
  assert.equal(row.purchased, 300);
  assert.equal(row.checked, false);
  const next = transferPurchases(s);
  assert.equal(
    next.pantry.find((i) => i.productId === "chicken")?.quantity,
    300,
  );
  assert.deepEqual(next.checked, {});
  assert.equal(
    shoppingList(next, date, date).find((i) => i.product.id === "chicken")
      ?.quantity,
    300,
  );
  assert.equal(transferPurchases(next).pantry.length, next.pantry.length);
});
test("manual purchases transfer only checked items", () => {
  const s = emptyState();
  s.shopping = [
    {
      id: "a",
      productId: "milk",
      quantity: 1000,
      source: "manual",
      checked: true,
    },
    {
      id: "b",
      productId: "egg",
      quantity: 6,
      source: "manual",
      checked: false,
    },
  ];
  const next = transferPurchases(s);
  assert.equal(next.pantry[0].quantity, 1000);
  assert.deepEqual(
    next.shopping.map((i) => i.id),
    ["b"],
  );
});
test("cooking uses earliest expiry first and never makes stock negative", () => {
  const s = emptyState();
  s.pantry = [
    {
      id: "a",
      productId: "chicken",
      quantity: 200,
      expires: "2099-02-01",
      added: date,
      note: "",
    },
    {
      id: "b",
      productId: "chicken",
      quantity: 200,
      expires: "2099-01-01",
      added: date,
      note: "",
    },
  ];
  const next = subtractRecipe(s, recipes[0], 2);
  assert.equal(next.pantry.length, 1);
  assert.equal(next.pantry[0].id, "a");
  assert.equal(next.pantry[0].quantity, 100);
  assert.equal(s.pantry[0].quantity, 200);
});
test("date arithmetic works across month/year boundaries", () => {
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});
test("malformed client state and recipe data are rejected", () => {
  assert.equal(validateState({}), false);
  const s = emptyState();
  s.preferences.portions = -1;
  assert.equal(validateState(s), false);
  assert.equal(
    validateRecipe({
      ...recipes[0],
      ingredients: [{ productId: "fake", quantity: 100 }],
    }),
    false,
  );
  assert.equal(
    validateRecipe({ ...recipes[0], steps: [{ text: "", minutes: -2 }] }),
    false,
  );
});
test("menu recipe snapshots do not change after editing originals", () => {
  const r = structuredClone(recipes[0]);
  const s = emptyState();
  s.plan = [
    { id: "a", date, meal: "Обед", portions: 2, recipe: structuredClone(r) },
  ];
  r.ingredients[0].quantity = 999;
  assert.equal(s.plan[0].recipe.ingredients[0].quantity, 300);
});
