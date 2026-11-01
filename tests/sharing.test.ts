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

test("Telegram opens its chat picker with a Mini App link instead of the OS share sheet", async () => {
  let opened = "";
  const result = await sendRecipeShare(payload, {
    telegram: {
      initData: "telegram-session",
      openTelegramLink: (value) => {
        opened = value;
      },
    },
    share: async () => {
      assert.fail("Telegram must use its own chooser");
    },
    copy: async () => {
      assert.fail("A working Telegram chooser must not copy");
    },
  });
  const chooser = new URL(opened);
  assert.equal(result, "telegram");
  assert.equal(chooser.origin + chooser.pathname, "https://t.me/share/url");
  assert.equal(chooser.searchParams.get("url"), url);
  assert.equal(chooser.searchParams.get("text"), payload.text);
  // Match Telegram's URI decoding rather than URLSearchParams' form decoding,
  // which would hide a regression where spaces turn into literal plus signs.
  const encodedText = opened.split("&text=")[1];
  assert.equal(decodeURIComponent(encodedText), payload.text);
  assert.ok(encodedText.includes("%20"));
  assert.ok(!encodedText.includes("+"));
});

test("the invitation keeps Cyrillic, line breaks and literal punctuation intact in Telegram", async () => {
  const title = "Курица с овощами в пергаменте + соус & зелень";
  const text = recipeShareText(title);
  assert.ok(text.startsWith("Смотри, что нашёл 🍽\n\n"));
  assert.ok(text.includes(`\n\n${title}\n\n`));
  assert.ok(text.includes("«Своей кухне»"));
  let opened = "";
  await sendRecipeShare(
    { title, text, url },
    {
      telegram: {
        initData: "session",
        openTelegramLink: (value) => {
          opened = value;
        },
      },
    },
  );
  assert.equal(decodeURIComponent(opened.split("&text=")[1]), text);
  assert.ok(opened.includes("%2B"));
  assert.ok(opened.includes("%26"));
  assert.ok(opened.includes("%0A%0A"));
});

test("the Telegram SDK loaded in an ordinary browser does not trigger Telegram methods", async () => {
  let shared: unknown;
  const result = await sendRecipeShare(payload, {
    telegram: {
      initData: "",
      openTelegramLink: () => {
        assert.fail("Not inside Telegram");
      },
    },
    share: async (value) => {
      shared = value;
    },
  });
  assert.equal(result, "shared");
  assert.deepEqual(shared, payload);
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
      openTelegramLink: () => {
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
      openTelegramLink: () => {
        assert.fail("Unsupported SDK");
      },
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
