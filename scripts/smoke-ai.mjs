import fs from "node:fs";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:5173";
const { BOT_TOKEN } = JSON.parse(fs.readFileSync(".secrets.json"));
const p = new URLSearchParams({
  auth_date: String(Math.floor(Date.now() / 1000)),
  user: JSON.stringify({ id: 9000000000003, first_name: "Локальная проверка" }),
});
const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
p.set(
  "hash",
  createHmac("sha256", secret)
    .update(
      [...p.entries()]
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    )
    .digest("hex"),
);
const headers = {
  "content-type": "application/json",
  "X-Telegram-Init-Data": p.toString(),
};
try {
  await fetch(base + "/api/state", { headers });
  for (const prompt of [
    "Составь меню на 2 дня, завтрак, обед и ужин. Выбери блюда из каталога. На 2 порции.",
    "Придумай совершенно новый рецепт завтрака из творога, яйца и яблока. Заполни newRecipe с ингредиентами и шагами.",
  ]) {
    const r = await fetch(base + "/api/ai", {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(65000),
    });
    const d = await r.json();
    assert.equal(r.status, 200, JSON.stringify(d));
    console.log({
      prompt: prompt.slice(0, 40),
      planEntries: d.plan?.length,
      newRecipe: d.recipe?.title,
    });
    if (prompt.startsWith("Составь")) assert.ok(d.plan.length >= 6);
    else assert.ok(d.recipe, JSON.stringify(d));
  }
  const after = await (await fetch(base + "/api/state", { headers })).json();
  assert.equal(after.state.plan.length, 0);
  assert.equal(after.state.recipes.length, 0);
  console.log("AI drafts do not change saved user state — passed.");
} finally {
  await fetch(base + "/api/account", { method: "DELETE", headers });
}
