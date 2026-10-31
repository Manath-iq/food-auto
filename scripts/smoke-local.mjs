import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
const origin = process.argv[2] || "http://127.0.0.1:5173";
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw new Error("This script only writes to a local test Worker.");
const { BOT_TOKEN } = JSON.parse(readFileSync(".secrets.json", "utf8"));
const sign = (id) => {
  const p = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id, first_name: "Локальный тест" }),
  });
  const text = [...p.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  p.set("hash", createHmac("sha256", secret).update(text).digest("hex"));
  return p.toString();
};
const a = sign(9000000000001),
  b = sign(9000000000002);
async function call(path, auth, method = "GET", body) {
  const r = await fetch(origin + path, {
    method,
    headers: {
      "content-type": "application/json",
      "X-Telegram-Init-Data": auth || "",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(65000),
  });
  return { status: r.status, data: await r.json() };
}
const catalog = await call("/api/catalog");
assert.equal(catalog.status, 200);
assert.equal(catalog.data.recipes.length, 16);
assert.equal((await call("/api/state")).status, 401);
const first = await call("/api/state", a);
assert.equal(first.status, 200);
first.data.state.favorites = ["green-bowl"];
first.data.state.plan = [
  {
    id: "test-entry",
    date: "2026-10-31",
    meal: "Обед",
    portions: 4,
    recipe: catalog.data.recipes[0],
  },
];
const saved = await call("/api/state", a, "PUT", {
  state: first.data.state,
  revision: first.data.revision,
});
assert.equal(saved.status, 200);
assert.equal(
  (
    await call("/api/state", a, "PUT", {
      state: first.data.state,
      revision: first.data.revision,
    })
  ).status,
  409,
);
const reload = await call("/api/state", a);
assert.equal(reload.data.state.plan[0].portions, 4);
const isolated = await call("/api/state", b);
assert.deepEqual(isolated.data.state.favorites, []);
assert.equal(isolated.data.state.plan.length, 0);
assert.equal(
  (
    await call("/api/state", a, "PUT", {
      state: { favorites: [] },
      revision: saved.data.revision,
    })
  ).status,
  400,
);
assert.equal(
  (await call("/telegram/webhook", null, "POST", { update_id: 1 })).status,
  403,
);
if (process.argv.includes("--ai")) {
  const ai = await call("/api/ai", a, "POST", {
    prompt: "Предложи один быстрый завтрак из каталога. Не составляй меню.",
  });
  assert.equal(ai.status, 200, JSON.stringify(ai.data));
  assert.ok(ai.data.message.length > 5);
  console.log("Gemini proposal:", {
    recipes: ai.data.recipeIds.length,
    plan: ai.data.plan.length,
    message: ai.data.message.slice(0, 100),
  });
}
await call("/api/account", a, "DELETE");
await call("/api/account", b, "DELETE");
console.log(
  "Local runtime: catalog, auth, persistence, snapshots, revision conflicts, user isolation, validation, webhook auth — passed.",
);
