import test from "node:test";
import assert from "node:assert/strict";
import {
  launchRecipeId,
  miniAppLink,
  recipeShareText,
  sendRecipeShare,
} from "../src/sharing.ts";

const title = "Боул с курицей & киноа";
const url = miniAppLink("food_autotest_bot", "green-bowl");
const payload = { title, text: recipeShareText(title), url };

test("shared recipe opens the bot's Mini App with the recipe ID", () => {
  const link = new URL(url);
  assert.equal(link.origin, "https://t.me");
  assert.equal(link.pathname, "/food_autotest_bot");
  assert.equal(link.searchParams.get("startapp"), "recipe_green-bowl");
  assert.equal(
    launchRecipeId("", "", link.searchParams.get("startapp")!),
    "green-bowl",
  );
  assert.equal(miniAppLink("@food_autotest_bot", "green-bowl"), url);
});

test("launch accepts Telegram SDK, query and fragment parameters and legacy links", () => {
  assert.equal(launchRecipeId("", "", "recipe_green-bowl"), "green-bowl");
  assert.equal(
    launchRecipeId("?tgWebAppStartParam=recipe_green-bowl", ""),
    "green-bowl",
  );
  assert.equal(
    launchRecipeId("", "#tgWebAppStartParam=recipe_green-bowl"),
    "green-bowl",
  );
  assert.equal(launchRecipeId("?recipe=green-bowl", ""), "green-bowl");
  assert.equal(
    launchRecipeId("?recipe=another-recipe", "", "recipe_green-bowl"),
    "green-bowl",
  );
  assert.equal(
    launchRecipeId("?tgWebAppStartParam=recipe_%3Cscript%3E", ""),
    null,
  );
  assert.equal(launchRecipeId("", "", "recipe_"), null);
  assert.equal(launchRecipeId("", "", `recipe_${"a".repeat(506)}`), null);
  assert.throws(() => miniAppLink("https://example.com", "green-bowl"));
  assert.throws(() => miniAppLink("food_autotest_bot", "../private"));
});

test("Telegram sends a prepared message through its native chooser", async () => {
  const calls: string[] = [];
  const result = await sendRecipeShare(payload, {
    telegram: {
      initData: "telegram-session",
      isVersionAtLeast: (version) => version === "8.0",
      shareMessage: (id, callback) => {
        calls.push(id);
        callback(true);
      },
    },
    prepare: async () => {
      calls.push("prepare");
      return { id: "prepared-message" };
    },
    share: async () => {
      assert.fail("Use Telegram's formatted message");
    },
    copy: async () => {
      assert.fail("No duplicate clipboard message");
    },
  });
  assert.equal(result, "telegram");
  assert.deepEqual(calls, ["prepare", "prepared-message"]);
});

test("cancelling Telegram's chooser does not trigger a fallback or copy", async () => {
  assert.equal(
    await sendRecipeShare(payload, {
      telegram: {
        initData: "session",
        shareMessage: (_id, callback) => callback(false),
      },
      prepare: async () => ({ id: "prepared" }),
      share: async () => {
        assert.fail("Cancelled by user");
      },
      copy: async () => {
        assert.fail("Cancelled by user");
      },
    }),
    "cancelled",
  );
});

test("preparation and SDK failures fall back to plain text with the address at the bottom", async () => {
  for (const failPreparation of [true, false]) {
    let shared: unknown;
    const result = await sendRecipeShare(payload, {
      telegram: {
        initData: "session",
        shareMessage: () => {
          throw new Error("unsupported");
        },
      },
      prepare: async () => {
        if (failPreparation) throw new Error("offline");
        return { id: "prepared" };
      },
      share: async (value) => {
        shared = value;
      },
    });
    assert.equal(result, "shared");
    assert.deepEqual(shared, { title, text: `${payload.text}\n\n${url}` });
    assert.ok(!("url" in (shared as object)));
  }
});

test("the Telegram SDK loaded in an ordinary browser does not trigger Telegram methods", async () => {
  let shared: unknown;
  const result = await sendRecipeShare(payload, {
    telegram: {
      initData: "",
      shareMessage: () => {
        assert.fail("Not inside Telegram");
      },
    },
    share: async (value) => {
      shared = value;
    },
  });
  assert.equal(result, "shared");
  assert.deepEqual(shared, { title, text: `${payload.text}\n\n${url}` });
});

test("personal recipes remain text and do not get inaccessible Mini App recipe links", async () => {
  const personal = {
    title: "Семейный рецепт",
    text: "Семейный рецепт\n\nЯйцо — 2 шт\n\n1. Приготовьте блюдо.",
  };
  let shared: unknown;
  await sendRecipeShare(personal, {
    telegram: {
      initData: "telegram-session",
      shareMessage: () => {
        assert.fail("No public recipe link");
      },
    },
    share: async (value) => {
      shared = value;
    },
  });
  assert.deepEqual(shared, personal);
  let copied = "";
  assert.equal(
    await sendRecipeShare(personal, {
      copy: async (value) => {
        copied = value;
      },
    }),
    "copied",
  );
  assert.equal(copied, personal.text);
});

test("cancelling the system share sheet does not overwrite the clipboard", async () => {
  const result = await sendRecipeShare(payload, {
    share: async () => {
      throw Object.assign(new Error("cancelled"), { name: "AbortError" });
    },
    copy: async () => {
      assert.fail("Cancellation must not copy");
    },
  });
  assert.equal(result, "cancelled");
});

test("unsupported sharing copies the invitation together with the Telegram Mini App link", async () => {
  let copied = "";
  const result = await sendRecipeShare(payload, {
    telegram: {
      initData: "telegram-session",
      isVersionAtLeast: () => false,

      shareMessage: () => {
        assert.fail("Unsupported SDK");
      },
    },
    prepare: async () => {
      assert.fail("Unsupported clients must not prepare a message");
    },
    share: async () => {
      throw new Error("Share unavailable");
    },
    copy: async (value) => {
      copied = value;
    },
  });
  assert.equal(result, "copied");
  assert.equal(copied, `${payload.text}\n\n${url}`);
});
