import { recipes, products } from "../src/data.ts";
import { emptyState } from "../src/domain.ts";
import {
  meals,
  type AiProposal,
  type AppState,
  type Recipe,
} from "../src/types.ts";
import { validateTelegramData } from "./auth.ts";
import { validateState } from "./validation.ts";
import { prepareAiRecipe } from "./ai-recipe.ts";
import { prepareRecipeMessage } from "./recipe-share.ts";

const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: {
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
async function boundedJson(req: Request, limit = 420000): Promise<unknown> {
  if (!req.headers.get("content-type")?.includes("application/json"))
    throw new HttpError("Ожидается JSON.", 415);
  const reader = req.body?.getReader();
  if (!reader) throw new HttpError("Пустой запрос.", 400);
  let size = 0;
  const parts: Uint8Array[] = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError("Слишком много данных. Уменьшите размер.", 413);
    }
    parts.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const p of parts) {
    all.set(p, offset);
    offset += p.length;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all));
  } catch {
    throw new HttpError("Не удалось прочитать данные.", 400);
  }
}
class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
async function secretEquals(a: string, b: string) {
  const enc = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const kx = await crypto.subtle.importKey(
    "raw",
    x,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const ky = await crypto.subtle.importKey(
    "raw",
    y,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const msg = enc.encode("food-auto-webhook");
  return crypto.subtle.verify(
    "HMAC",
    ky,
    await crypto.subtle.sign("HMAC", kx, msg),
    msg,
  );
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path === "/api/health")
        return json({ ok: true, service: "food-auto" });
      if (path === "/api/catalog" && request.method === "GET") {
        const rows = await env.DB.prepare(
          "SELECT data FROM recipes WHERE published=1 ORDER BY sort_order",
        ).all<{ data: string }>();
        return json({
          recipes: rows.results.map((r) => JSON.parse(r.data)),
          products,
          botUsername: env.BOT_USERNAME,
        });
      }
      if (path === "/telegram/webhook" && request.method === "POST") {
        if (
          !(await secretEquals(
            request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "",
            env.WEBHOOK_SECRET,
          ))
        )
          return json({ error: "Forbidden" }, 403);
        const update = (await boundedJson(request, 20000)) as {
          update_id?: number;
          message?: { chat: { id: number; type: string }; text?: string };
        };
        const m = update.message;
        if (
          m?.chat.type === "private" &&
          /^\/(start|menu|help|privacy)(?:@\w+)?(?:\s|$)/.test(m.text || "")
        ) {
          const claim = await env.DB.prepare(
            "INSERT OR IGNORE INTO bot_updates(id) VALUES (?)",
          )
            .bind(update.update_id)
            .run();
          if (claim.meta.changes > 0)
            ctx.waitUntil(
              (async () => {
                const privacy = (m.text || "").startsWith("/privacy");
                const res = await fetch(
                  `https://api.telegram.org/bot${env.BOT_TOKEN}/sendMessage`,
                  {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                      chat_id: m.chat.id,
                      text: privacy
                        ? "Своя кухня хранит ваш Telegram ID, имя и данные о рецептах, меню и запасах. ИИ получает текст запроса, состав меню и пищевые предпочтения без вашего имени и Telegram ID. В бесплатном Gemini Google может использовать запросы для улучшения моделей. Удалить данные можно в профиле приложения."
                        : "Добро пожаловать в «Свою кухню»!\n\nНаходите рецепты, составляйте меню и покупайте только то, чего не хватает дома.\n\nОткройте приложение — ваша кухня уже ждёт.",
                      reply_markup: {
                        inline_keyboard: [
                          [
                            {
                              text: "Открыть свою кухню",
                              web_app: { url: url.origin },
                            },
                          ],
                        ],
                      },
                    }),
                    signal: AbortSignal.timeout(15000),
                  },
                );
                if (!res.ok) {
                  await env.DB.prepare("DELETE FROM bot_updates WHERE id=?")
                    .bind(update.update_id)
                    .run();
                  console.error(
                    JSON.stringify({
                      event: "bot_reply_failed",
                      status: res.status,
                    }),
                  );
                }
              })(),
            );
        }
        return json({ ok: true });
      }
      if (!path.startsWith("/api/"))
        return new Response("Not found", { status: 404 });
      const user = await validateTelegramData(
        request.headers.get("X-Telegram-Init-Data") || "",
        env.BOT_TOKEN,
      );
      if (!user)
        throw new HttpError(
          "Откройте приложение через Telegram. Если оно уже открыто, закройте и запустите снова.",
          401,
        );
      const id = String(user.id);
      if (path === "/api/session" && request.method === "GET")
        return json({ user });
      if (path === "/api/share-recipe" && request.method === "POST") {
        const body = await boundedJson(request, 1024);
        if (
          !body ||
          typeof body !== "object" ||
          !("recipeId" in body) ||
          typeof body.recipeId !== "string" ||
          !/^[A-Za-z0-9_-]{1,100}$/.test(body.recipeId)
        ) {
          throw new HttpError("Проверьте ссылку на рецепт.", 400);
        }
        const row = await env.DB.prepare(
          "SELECT data FROM recipes WHERE id=? AND published=1",
        )
          .bind(body.recipeId)
          .first<{ data: string }>();
        if (!row) throw new HttpError("Рецепт не найден.", 404);
        const recipe = JSON.parse(row.data) as Recipe;
        if (recipe.source !== "editorial")
          throw new HttpError("Рецепт не найден.", 404);
        return json(
          await prepareRecipeMessage(
            user.id,
            recipe,
            env.BOT_USERNAME,
            env.BOT_TOKEN,
          ),
        );
      }
      if (path === "/api/state" && request.method === "GET") {
        await env.DB.prepare(
          "INSERT OR IGNORE INTO users(id,name) VALUES (?,?)",
        )
          .bind(id, user.first_name.slice(0, 100))
          .run();
        await env.DB.prepare(
          "INSERT OR IGNORE INTO user_state(user_id,data,revision) VALUES (?,?,0)",
        )
          .bind(id, JSON.stringify(emptyState()))
          .run();
        const state = await env.DB.prepare(
          "SELECT data,revision FROM user_state WHERE user_id=?",
        )
          .bind(id)
          .first<{ data: string; revision: number }>();
        return json({
          state: JSON.parse(state!.data),
          revision: state!.revision,
          user,
        });
      }
      if (path === "/api/state" && request.method === "PUT") {
        const body = (await boundedJson(request)) as {
          state: AppState;
          revision: number;
        };
        if (
          !Number.isSafeInteger(body.revision) ||
          body.revision < 0 ||
          !validateState(body.state)
        )
          throw new HttpError(
            "Проверьте данные: часть полей заполнена неверно.",
            400,
          );
        const result = await env.DB.prepare(
          "UPDATE user_state SET data=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND revision=? RETURNING revision",
        )
          .bind(JSON.stringify(body.state), id, body.revision)
          .first<{ revision: number }>();
        if (!result)
          throw new HttpError(
            "Данные изменились на другом устройстве. Сохраните текущие изменения и обновите приложение.",
            409,
          );
        return json({ revision: result.revision });
      }
      if (path === "/api/account" && request.method === "DELETE") {
        await env.DB.batch([
          env.DB.prepare("DELETE FROM user_state WHERE user_id=?").bind(id),
          env.DB.prepare("DELETE FROM users WHERE id=?").bind(id),
        ]);
        return json({ ok: true });
      }
      if (path === "/api/ai" && request.method === "POST") {
        const body = (await boundedJson(request, 12000)) as {
          prompt: string;
          days?: number;
        };
        if (
          typeof body.prompt !== "string" ||
          body.prompt.trim().length < 2 ||
          body.prompt.length > 3000
        )
          throw new HttpError(
            "Напишите запрос длиной от 2 до 3000 символов.",
            400,
          );
        const day = new Date().toISOString().slice(0, 10);
        const counters = await env.DB.batch([
          env.DB.prepare(
            "INSERT INTO ai_usage(user_id,day,count) VALUES (?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 WHERE count<15 RETURNING count",
          ).bind(id, day),
          env.DB.prepare(
            "INSERT INTO ai_usage(user_id,day,count) VALUES (?,?,1) ON CONFLICT(user_id,day) DO UPDATE SET count=count+1 WHERE count<200 RETURNING count",
          ).bind("global", day),
        ]);
        if (counters.some((r) => r.results.length === 0))
          throw new HttpError(
            "Лимит запросов на сегодня исчерпан. Попробуйте завтра.",
            429,
          );
        const saved = await env.DB.prepare(
          "SELECT data FROM user_state WHERE user_id=?",
        )
          .bind(id)
          .first<{ data: string }>();
        const state: AppState = saved ? JSON.parse(saved.data) : emptyState();
        const catalog = [...recipes, ...state.recipes];
        const schema = {
          type: "OBJECT",
          properties: {
            message: { type: "STRING" },
            recipeIds: { type: "ARRAY", items: { type: "STRING" } },
            plan: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  recipeId: { type: "STRING" },
                  day: { type: "INTEGER" },
                  meal: { type: "STRING", enum: [...meals] },
                  portions: { type: "NUMBER" },
                },
                required: ["recipeId", "day", "meal", "portions"],
              },
            },
            newRecipe: {
              type: "OBJECT",
              properties: {
                title: { type: "STRING" },
                description: { type: "STRING" },
                category: { type: "STRING" },
                time: { type: "INTEGER" },
                portions: { type: "INTEGER" },
                ingredients: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      productId: {
                        type: "STRING",
                        enum: products.map((p) => p.id),
                      },
                      quantity: {
                        type: "NUMBER",
                        minimum: 0.1,
                        maximum: 100000,
                        description:
                          "Количество в единице продукта из справочника: г, мл или шт.",
                      },
                    },
                    required: ["productId", "quantity"],
                  },
                },
                steps: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      text: { type: "STRING" },
                      minutes: { type: "INTEGER", minimum: 1, maximum: 1440 },
                    },
                    required: ["text"],
                  },
                },
              },
              required: [
                "title",
                "description",
                "category",
                "time",
                "portions",
                "ingredients",
                "steps",
              ],
            },
          },
          required: ["message", "recipeIds", "plan"],
        };
        if (
          /(нов[ыо].*рецепт|придум.*(рецепт|завтрак)|созда.*рецепт)/i.test(
            body.prompt,
          )
        )
          schema.required.push("newRecipe");
        const prompt = `Ты — кулинарный помощник приложения «Своя кухня». Отвечай по-русски. Не давай медицинских рекомендаций. Никогда не утверждай, что уже изменил данные. Только предложи изменения: пользователь их подтвердит. Учитывай исключённые продукты, аллергены и диету. Предупреди, если точное соблюдение ограничений невозможно. Для меню используй только recipeId из каталога, day — смещение от выбранного дня 0..13. По запросу нового рецепта заполни newRecipe, используй ТОЛЬКО productId из списка продуктов. Количество — в единице продукта. Реалистичные количества и время; мясо и птица должны готовиться безопасно (птица 74 °C, рыба 63 °C); сырые яйца не предлагай. КБЖУ мы рассчитаем по ингредиентам, не придумывай их. Без изменений запасов и покупок.\nПродукты: ${JSON.stringify(products.map((p) => ({ id: p.id, name: p.name, unit: p.unit, allergens: p.allergens })))}\nКаталог: ${JSON.stringify(catalog.map((r) => ({ id: r.id, title: r.title, ingredients: r.ingredients, time: r.time, category: r.category })))}\nПредпочтения: ${JSON.stringify(state.preferences)}\nЗапасы: ${JSON.stringify(state.pantry.map((p) => ({ productId: p.productId, quantity: p.quantity, expires: p.expires })))}\nТекущее меню: ${JSON.stringify(state.plan.slice(-50).map((e) => ({ date: e.date, meal: e.meal, title: e.recipe.title })))}\nЗапрос: ${body.prompt}`;
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${env.GEMINI_MODEL}:generateContent`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-goog-api-key": env.GEMINI_API_KEY,
            },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: prompt }] }],
              generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema,
                maxOutputTokens: 6000,
                temperature: 0.65,
              },
            }),
            signal: AbortSignal.timeout(55000),
          },
        );
        if (!response.ok) {
          console.error(
            JSON.stringify({ event: "gemini_failed", status: response.status }),
          );
          throw new HttpError(
            response.status === 429
              ? "Gemini достиг бесплатного лимита. Попробуйте позже."
              : "Помощник сейчас недоступен. Попробуйте ещё раз.",
            response.status === 429 ? 429 : 502,
          );
        }
        const result = (await response.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const raw = JSON.parse(
          result.candidates?.[0]?.content?.parts
            ?.map((p) => p.text || "")
            .join("") || "{}",
        ) as AiProposal & { newRecipe?: Partial<Recipe> };
        if (typeof raw.message !== "string")
          throw new HttpError(
            "Помощник не смог подготовить ответ. Повторите запрос.",
            502,
          );
        const output: AiProposal = {
          message: raw.message.slice(0, 12000),
          recipeIds: (Array.isArray(raw.recipeIds) ? raw.recipeIds : [])
            .filter((id) => catalog.some((r) => r.id === id))
            .slice(0, 12),
          plan: (Array.isArray(raw.plan) ? raw.plan : [])
            .filter(
              (p) =>
                catalog.some((r) => r.id === p.recipeId) &&
                Number.isInteger(p.day) &&
                p.day >= 0 &&
                p.day <= 13 &&
                meals.includes(p.meal) &&
                Number.isFinite(p.portions) &&
                p.portions >= 1 &&
                p.portions <= 12,
            )
            .slice(0, 84),
        };
        if (raw.newRecipe) {
          const recipe = await prepareAiRecipe(raw.newRecipe);
          if (!recipe)
            throw new HttpError(
              "Gemini предложил рецепт с некорректным составом. Попросите другую версию.",
              502,
            );
          output.recipe = recipe;
        }
        return json(output);
      }
      return json({ error: "Такой страницы нет." }, 404);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(
        JSON.stringify({
          event: "request_failed",
          path,
          error: e instanceof Error ? e.name : "Unknown",
        }),
      );
      return json(
        {
          error:
            "Не удалось выполнить действие. Ваши изменения остались на устройстве. Попробуйте ещё раз.",
        },
        500,
      );
    }
  },
} satisfies ExportedHandler<Env>;
