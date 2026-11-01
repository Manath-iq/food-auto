# Рецепты по ссылке внутри Telegram

Кнопка «Поделиться» для рецептов общего каталога формирует ссылку:

`https://t.me/food_autotest_bot?startapp=recipe_green-bowl`

В Telegram 8.0+ открывается выбор чата через `WebApp.shareMessage`. Название блюда — ссылка типа `text_link`: длинный адрес не появляется в тексте. Превью ссылки отключено, чтобы оно не занимало место над приглашением. Отправку подтверждает сам пользователь.

Перед открытием выбора чата клиент отправляет только `recipeId` на `POST /api/share-recipe`. Сервер проверяет подпись Telegram, берёт пользователя из проверенного `initData`, а рецепт — из опубликованного каталога базы. Затем вызывает `savePreparedInlineMessage` и возвращает временный ID сообщения, привязанный к этому пользователю. Переданные клиентом имя, URL и ID пользователя не используются. Подготовка сообщения ничего не отправляет в чаты. Отмена выбора чата не запускает повторную отправку или копирование.

В старых клиентах и браузере используется системная отправка обычного текста со ссылкой последней строкой. Отдельный параметр `url` не передаётся, чтобы приложение-получатель не переставляло его наверх. При недоступной системной отправке тот же текст копируется. Ссылка ведёт в Mini App.

Текст общего рецепта:

> Смотри, что нашёл 🍽
>
> [Курица с овощами в пергаменте](https://t.me/food_autotest_bot?startapp=recipe_steamed-chicken-parcels)
>
> Давай приготовим! Ингредиенты и шаги — в «Своей кухне».

Обычный `t.me/share/url` больше не используется: по спецификации Telegram он всегда ставит URL в начало и не принимает форматирование ссылки в названии. Форматированное сообщение передаётся как JSON с сущностями; смещения и длины `text_link` считаются в UTF-16, включая эмодзи и кириллицу.

При запуске приложение читает `start_param` из SDK, `tgWebAppStartParam` из query/hash и прежний параметр `?recipe=...`. Рецепт открывается один раз, когда он появился в каталоге, включая случай позднего ответа `/api/catalog`.

Личные и созданные ИИ рецепты отправляются текстом с ингредиентами и шагами. Чужой аккаунт не имеет доступа к личной библиотеке автора, поэтому недоступная публичная ссылка для них не создаётся.

## Обязательная настройка бота

Для ссылок `?startapp=...` у бота должен быть включён **Main Mini App**. Кнопка меню `setChatMenuButton` сама по себе этого не включает.

В BotFather: `/mybots` → `@food_autotest_bot` → Bot Settings → Configure Mini App → Enable Mini App. Адрес приложения: `https://food-auto.todominate-ai.workers.dev`.

Main Mini App включён через BotFather с разрешения Максима. Проверка `getMe` подтвердила `has_main_web_app: true`. Перед повторной настройкой проверять текущее состояние. Токен бота в код, ссылки, логи и документацию не включается.

Источники: [Main Mini App и startapp](https://core.telegram.org/bots/webapps#launching-the-main-mini-app), [shareMessage](https://core.telegram.org/bots/webapps#initializing-mini-apps), [savePreparedInlineMessage](https://core.telegram.org/bots/api#savepreparedinlinemessage), [text_link](https://core.telegram.org/bots/api#messageentity), [порядок текста в обычном share URL](https://core.telegram.org/api/links#share-links), [поле has_main_web_app](https://core.telegram.org/bots/api#user).
