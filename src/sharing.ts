const recipePrefix = "recipe_";
const recipeIdPattern = /^[A-Za-z0-9_-]{1,505}$/;

export function miniAppLink(botUsername: string, recipeId?: string): string {
  const username = botUsername.replace(/^@/, "");
  if (!/^[A-Za-z0-9_]{5,32}$/.test(username)) {
    throw new Error("Не удалось создать ссылку на приложение");
  }
  if (recipeId !== undefined && !recipeIdPattern.test(recipeId)) {
    throw new Error("Не удалось создать ссылку на рецепт");
  }
  const url = new URL(`https://t.me/${username}`);
  url.searchParams.set(
    "startapp",
    recipeId ? `${recipePrefix}${recipeId}` : "",
  );
  return url.toString();
}

export function launchRecipeId(
  search: string,
  hash: string,
  startParam?: string,
): string | null {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const launch =
    startParam ||
    query.get("tgWebAppStartParam") ||
    fragment.get("tgWebAppStartParam");
  if (launch?.startsWith(recipePrefix)) {
    const id = launch.slice(recipePrefix.length);
    if (recipeIdPattern.test(id)) return id;
  }
  // Keep existing website recipe links working as well.
  const legacy = query.get("recipe");
  return legacy && recipeIdPattern.test(legacy) ? legacy : null;
}

type SharePayload = { title: string; text: string; url?: string };
type ShareChannels = {
  telegram?: {
    initData: string;
    isVersionAtLeast?(version: string): boolean;
    openTelegramLink?(url: string): void;
  };
  share?: (payload: SharePayload) => Promise<void>;
  copy?: (text: string) => Promise<void>;
};

export async function sendRecipeShare(
  payload: SharePayload,
  channels: ShareChannels,
): Promise<"telegram" | "shared" | "copied" | "cancelled"> {
  const tg = channels.telegram;
  if (
    payload.url &&
    tg?.initData &&
    tg.openTelegramLink &&
    (!tg.isVersionAtLeast || tg.isVersionAtLeast("6.1"))
  ) {
    const url = new URL("https://t.me/share/url");
    url.searchParams.set("url", payload.url);
    url.searchParams.set("text", payload.text);
    try {
      tg.openTelegramLink(url.toString());
      return "telegram";
    } catch {
      // Older clients can still use the system share sheet or clipboard.
    }
  }
  if (channels.share) {
    try {
      await channels.share(payload);
      return "shared";
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        error.name === "AbortError"
      ) {
        return "cancelled";
      }
    }
  }
  if (!channels.copy) throw new Error("Поделиться сейчас не получилось");
  await channels.copy(payload.url || payload.text);
  return "copied";
}
