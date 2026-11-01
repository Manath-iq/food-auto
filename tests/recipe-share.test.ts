import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { recipes } from "../src/data.ts";
import { miniAppLink, recipeShareText } from "../src/sharing.ts";
import {
  prepareRecipeMessage,
  recipeInlineResult,
} from "../worker/recipe-share.ts";
import worker from "../worker/index.ts";

const recipe = recipes[0];
const bot = "food_autotest_bot";
const token = "test-only-fake-token";
const expires = () => Math.floor(Date.now() / 1000) + 300;

function signed() {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ id: 12345, first_name: "Тест" }),
  });
  const check = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b, "en"))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  params.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

test("only the recipe title is linked, with correct UTF-16 offsets and no bare URL or preview", () => {
  for (const title of [
    recipe.title,
    "🍽 Курица + овощи & соус",
    "Смотри, что нашёл 🍽",
  ]) {
    const result = recipeInlineResult({ ...recipe, title }, bot);
    const content = result.input_message_content;
    const entity = content.entities[0];
    assert.equal(
      content.message_text.slice(entity.offset, entity.offset + entity.length),
      title,
    );
    assert.equal(content.message_text, recipeShareText(title));
    assert.equal(entity.type, "text_link");
    assert.equal(entity.url, miniAppLink(bot, recipe.id));
    assert.ok(entity.offset > 0);
    assert.ok(!content.message_text.includes("https://"));
    assert.deepEqual(content.link_preview_options, { is_disabled: true });
  }
  assert.throws(() =>
    recipeInlineResult({ ...recipe, source: "personal" }, bot),
  );
});

test("preparation stores a formatted draft for the authenticated user without sending a message", async () => {
  let calls = 0;
  const expiration_date = expires();
  const send: typeof fetch = async (input, options) => {
    calls++;
    assert.equal(
      input,
      `https://api.telegram.org/bot${token}/savePreparedInlineMessage`,
    );
    assert.equal(options?.method, "POST");
    const body = JSON.parse(String(options?.body));
    assert.equal(body.user_id, 12345);
    assert.equal(body.result.title, recipe.title);
    assert.equal(
      body.result.input_message_content.entities[0].url,
      miniAppLink(bot, recipe.id),
    );
    assert.ok(!("chat_id" in body));
    return Response.json({
      ok: true,
      result: { id: "prepared", expiration_date },
    });
  };
  assert.deepEqual(
    await prepareRecipeMessage(12345, recipe, bot, token, send),
    { id: "prepared", expiration_date },
  );
  assert.equal(calls, 1);
});

test("invalid, expired and rejected preparation results are not passed to the client", async () => {
  for (const body of [
    null,
    { ok: false },
    { ok: true, result: { id: "", expiration_date: expires() } },
    { ok: true, result: { id: "expired", expiration_date: 1 } },
  ]) {
    await assert.rejects(
      prepareRecipeMessage(12345, recipe, bot, token, async () =>
        Response.json(body),
      ),
      /Не удалось подготовить/,
    );
  }
  await assert.rejects(
    prepareRecipeMessage(0, recipe, bot, token, async () => {
      assert.fail("Invalid user");
    }),
  );
});

function environment(published: boolean, seen: string[]) {
  return {
    BOT_TOKEN: token,
    BOT_USERNAME: bot,
    DB: {
      prepare: (sql: string) => ({
        bind: (id: string) => ({
          first: async () => {
            seen.push(id);
            assert.ok(sql.includes("published=1"));
            return published ? { data: JSON.stringify(recipe) } : null;
          },
        }),
      }),
    },
  } as unknown as Env;
}

async function request(
  body: unknown,
  auth: string,
  published: boolean,
  seen: string[] = [],
) {
  return worker.fetch(
    new Request("https://kitchen.test/api/share-recipe", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Telegram-Init-Data": auth,
      },
      body: JSON.stringify(body),
    }) as Parameters<typeof worker.fetch>[0],
    environment(published, seen),
    {} as ExecutionContext,
  );
}

test("the share endpoint rejects unauthenticated, malformed and unpublished recipes before contacting Telegram", async (t) => {
  t.mock.method(globalThis, "fetch", async () => {
    assert.fail("No Telegram request allowed");
  });
  const seen: string[] = [];
  assert.equal(
    (await request({ recipeId: recipe.id }, "", true, seen)).status,
    401,
  );
  assert.deepEqual(seen, []);
  for (const body of [null, {}, { recipeId: "../private" }, { recipeId: 42 }]) {
    assert.equal((await request(body, signed(), true, seen)).status, 400);
  }
  assert.deepEqual(seen, []);
  assert.equal(
    (await request({ recipeId: "unpublished" }, signed(), false, seen)).status,
    404,
  );
  assert.deepEqual(seen, ["unpublished"]);
});

test("the share endpoint uses the signed user and database recipe, ignoring client-supplied identity and links", async (t) => {
  const expiration_date = expires();
  t.mock.method(
    globalThis,
    "fetch",
    async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body));
      assert.equal(body.user_id, 12345);
      assert.equal(body.result.title, recipe.title);
      assert.equal(
        body.result.input_message_content.entities[0].url,
        miniAppLink(bot, recipe.id),
      );
      return Response.json({
        ok: true,
        result: { id: "prepared", expiration_date },
      });
    },
  );
  const response = await request(
    {
      recipeId: recipe.id,
      userId: 999,
      title: "Injected",
      url: "https://evil.test",
    },
    signed(),
    true,
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { id: "prepared", expiration_date });
});
