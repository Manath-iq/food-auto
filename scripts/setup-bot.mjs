import { readFileSync } from "node:fs";
const origin = process.argv[2];
if (!origin || !/^https:\/\/[\w.-]+$/.test(origin))
  throw new Error(
    "Передайте HTTPS-адрес приложения: npm run bot:setup -- https://example.workers.dev",
  );
const secrets = JSON.parse(readFileSync(".secrets.json", "utf8"));
async function call(method, body = {}) {
  const r = await fetch(
    `https://api.telegram.org/bot${secrets.BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    },
  );
  const d = await r.json();
  if (!d.ok) throw new Error(`${method}: ${d.description}`);
  return d.result;
}
await call("setWebhook", {
  url: `${origin}/telegram/webhook`,
  secret_token: secrets.WEBHOOK_SECRET,
  allowed_updates: ["message"],
  drop_pending_updates: false,
});
await call("setChatMenuButton", {
  menu_button: {
    type: "web_app",
    text: "Своя кухня",
    web_app: { url: origin },
  },
});
await call("setMyCommands", {
  commands: [
    { command: "start", description: "Открыть свою кухню" },
    { command: "menu", description: "Рецепты, меню и покупки" },
    { command: "help", description: "Как пользоваться приложением" },
    { command: "privacy", description: "Хранение и удаление данных" },
  ],
});
await call("setMyDescription", {
  description:
    "Ваша домашняя кухня в одном приложении: рецепты, меню на неделю, покупки и запасы. Gemini-повар поможет придумать что-нибудь вкусное.",
});
await call("setMyName", { name: "Своя кухня" });
await call("setMyShortDescription", {
  short_description:
    "Рецепты, меню, покупки и Gemini-повар. Для вкусной повседневности.",
});
const [bot, menu, webhook] = await Promise.all([
  call("getMe"),
  call("getChatMenuButton"),
  call("getWebhookInfo"),
]);
console.log(
  JSON.stringify(
    {
      bot: `https://t.me/${bot.username}`,
      menu,
      webhook: {
        url: webhook.url,
        pending_update_count: webhook.pending_update_count,
        last_error_message: webhook.last_error_message,
      },
    },
    null,
    2,
  ),
);
