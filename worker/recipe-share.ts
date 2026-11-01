import type { Recipe } from "../src/types.ts";
import { miniAppLink, recipeShareText } from "../src/sharing.ts";

export function recipeInlineResult(recipe: Recipe, botUsername: string) {
  if (
    recipe.source !== "editorial" ||
    !recipe.title ||
    recipe.title.length > 120
  ) {
    throw new Error("Можно отправить только опубликованный рецепт.");
  }
  const message = recipeShareText(recipe.title);
  return {
    type: "article",
    id: crypto.randomUUID(),
    title: recipe.title,
    input_message_content: {
      message_text: message,
      // Telegram entities use UTF-16 offsets, the same units as JS strings.
      entities: [
        {
          type: "text_link",
          offset: message.indexOf("\n\n") + 2,
          length: recipe.title.length,
          url: miniAppLink(botUsername, recipe.id),
        },
      ],
      link_preview_options: { is_disabled: true },
    },
  };
}

export async function prepareRecipeMessage(
  userId: number,
  recipe: Recipe,
  botUsername: string,
  botToken: string,
  send: typeof fetch = fetch,
): Promise<{ id: string; expiration_date: number }> {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    throw new Error("Откройте приложение через Telegram.");
  }
  const result = recipeInlineResult(recipe, botUsername);
  const response = await send(
    `https://api.telegram.org/bot${botToken}/savePreparedInlineMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        result,
        allow_user_chats: true,
        allow_group_chats: true,
        allow_channel_chats: true,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  const data = (await response.json()) as {
    ok?: boolean;
    result?: { id?: unknown; expiration_date?: unknown };
  } | null;
  const prepared = data?.result;
  if (
    !response.ok ||
    !data?.ok ||
    !prepared ||
    typeof prepared.id !== "string" ||
    !prepared.id ||
    typeof prepared.expiration_date !== "number" ||
    !Number.isSafeInteger(prepared.expiration_date) ||
    prepared.expiration_date <= Date.now() / 1000
  ) {
    // Never expose the token-bearing request URL or Telegram's raw response.
    throw new Error("Не удалось подготовить сообщение Telegram.");
  }
  return { id: prepared.id, expiration_date: prepared.expiration_date };
}
