import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  House,
  CalendarBlank,
  Sparkle,
  Basket as ShoppingBasket,
  Snowflake,
  Heart,
  ArrowUpRight,
  MagnifyingGlass,
  SlidersHorizontal,
  Plus,
  X,
  Clock,
  Fire,
  ArrowLeft,
  ArrowRight,
  Check,
  Trash,
  ShareNetwork,
  ArrowClockwise,
  ChefHat,
  DownloadSimple,
  Leaf,
  NotePencil,
  Copy,
  BookOpen,
  CookingPot,
  Timer,
  CheckCircle,
  CaretDown,
} from "@phosphor-icons/react";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { products, productMap, categories } from "./data.ts";
import {
  addDays,
  localDate,
  nutrition,
  nutritionSum,
  recipeCost,
  missingIngredients,
  shoppingList,
  formatQuantity,
  transferPurchases,
  subtractRecipe,
  addRecipeShopping,
  availableStock,
  emptyState,
} from "./domain.ts";
import type {
  Recipe,
  Meal,
  PlanEntry,
  AppState,
  StockItem,
  AiProposal,
} from "./types.ts";
import { meals } from "./types.ts";
import { api, useKitchen } from "./useKitchen.ts";
import {
  Modal,
  Stepper,
  NutritionBar,
  RecipeCard,
  Empty,
  Toggle,
  TimerPill,
} from "./components.tsx";

type Page =
  "recipes" | "menu" | "ai" | "shopping" | "pantry" | "favorites" | "profile";
const nav = [
  { id: "recipes", label: "Рецепты", icon: House },
  { id: "menu", label: "Моё меню", icon: CalendarBlank },
  { id: "ai", label: "ИИ-повар", icon: Sparkle },
  { id: "shopping", label: "Покупки", icon: ShoppingBasket },
  { id: "pantry", label: "Холодильник", icon: Snowflake },
] as const;
const dateLabel = (
  date: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" },
) => new Date(date + "T12:00:00").toLocaleDateString("ru-RU", options);
const uid = () => crypto.randomUUID();
function download(data: unknown, name: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const kitchen = useKitchen();
  const { state, update, catalog, user, ready, status, error, botUsername } =
    kitchen;
  const [page, setPage] = useState<Page>("recipes");
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("Все рецепты");
  const [filters, setFilters] = useState({
    time: 120,
    kcal: 1500,
    diet: "Все",
    difficulty: "Любая",
    count: 50,
    cost: 1000,
    ingredient: "",
    fridge: "Все",
  });
  const [showFilters, setShowFilters] = useState(false),
    [selected, setSelected] = useState<Recipe | null>(null),
    [planRecipe, setPlanRecipe] = useState<Recipe | null>(null);
  const [date, setDate] = useState(localDate()),
    [planDate, setPlanDate] = useState(localDate()),
    [planMeal, setPlanMeal] = useState<Meal>("Обед"),
    [planPortions, setPlanPortions] = useState(state.preferences.portions);
  const [week, setWeek] = useState(false),
    [picker, setPicker] = useState<Meal | null>(null),
    [stockForm, setStockForm] = useState<StockItem | null | false>(false),
    [shoppingForm, setShoppingForm] = useState(false);
  const [editRecipe, setEditRecipe] = useState<Recipe | null | false>(false),
    [stockQuery, setStockQuery] = useState("");
  const [period, setPeriod] = useState(14),
    [rangeStart, setRangeStart] = useState(localDate()),
    [rangeEnd, setRangeEnd] = useState(addDays(localDate(), 13)),
    [customRange, setCustomRange] = useState(false);
  const [toast, setToast] = useState(""),
    [undo, setUndo] = useState<(() => void) | null>(null);
  const [timers, setTimers] = useState<
    { id: string; title: string; end: number }[]
  >([]);
  const [aiPrompt, setAiPrompt] = useState(""),
    [aiBusy, setAiBusy] = useState(false),
    [aiResult, setAiResult] = useState<AiProposal | null>(null),
    [aiError, setAiError] = useState(""),
    [aiApplied, setAiApplied] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    title: string;
    text: string;
    action: () => void;
  } | null>(null);
  const [copyDate, setCopyDate] = useState("");
  const allRecipes = useMemo(
    () => [...catalog, ...state.recipes],
    [catalog, state.recipes],
  );
  const todayEntries = state.plan.filter((e) => e.date === localDate());
  const todayNutrition = nutritionSum(todayEntries);
  const basket = useMemo(
    () => shoppingList(state, rangeStart, rangeEnd),
    [state, rangeStart, rangeEnd],
  );
  const activeFilters =
    filters.time < 120 ||
    filters.kcal < 1500 ||
    filters.diet !== "Все" ||
    filters.difficulty !== "Любая" ||
    filters.count < 50 ||
    filters.cost < 1000 ||
    filters.ingredient !== "" ||
    filters.fridge !== "Все";
  const list = useMemo(() => {
    const terms = query
      .toLowerCase()
      .split(/[,\s]+/)
      .filter(Boolean);
    return allRecipes
      .filter((r) => {
        const searchable = [
          r.title,
          r.description,
          r.category,
          ...r.tags,
          ...r.ingredients.map((i) => productMap[i.productId]?.name),
        ]
          .join(" ")
          .toLowerCase();
        const n = nutrition(r);
        if (!terms.every((t) => searchable.includes(t))) return false;
        if (category !== "Все рецепты" && r.category !== category) return false;
        if (page === "favorites" && !state.favorites.includes(r.id))
          return false;
        if (
          r.time > filters.time ||
          n.kcal > filters.kcal ||
          r.ingredients.length > filters.count ||
          recipeCost(r) > filters.cost ||
          (filters.difficulty !== "Любая" &&
            r.difficulty !== filters.difficulty)
        )
          return false;
        if (
          filters.ingredient &&
          !r.ingredients.some((i) => i.productId === filters.ingredient)
        )
          return false;
        if (
          filters.diet === "Без мяса" &&
          r.ingredients.some((i) =>
            ["Мясо и птица", "Рыба"].includes(
              productMap[i.productId]?.category,
            ),
          )
        )
          return false;
        if (
          filters.diet === "Без молока" &&
          r.ingredients.some((i) =>
            productMap[i.productId]?.allergens.includes("Молоко"),
          )
        )
          return false;
        if (
          filters.diet === "Без глютена" &&
          r.ingredients.some((i) =>
            productMap[i.productId]?.allergens.includes("Глютен"),
          )
        )
          return false;
        if (filters.diet === "Много белка" && n.protein < 25) return false;
        if (filters.diet === "До 400 ккал" && n.kcal > 400) return false;
        const missing = missingIngredients(
          r,
          state,
          state.preferences.portions,
        ).length;
        if (filters.fridge === "Всё есть" && missing > 0) return false;
        if (filters.fridge === "Не хватает до 2" && missing > 2) return false;
        return true;
      })
      .sort((a, b) =>
        filters.fridge === "Больше совпадений"
          ? missingIngredients(a, state).length -
            missingIngredients(b, state).length
          : 0,
      );
  }, [allRecipes, query, category, page, state, filters]);
  const notice = (text: string, undoFn?: () => void) => {
    setToast(text);
    setUndo(undoFn ? () => undoFn : null);
  };
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => {
      setToast("");
      setUndo(null);
    }, 6000);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    const back = () => {
      setSelected(null);
      setPage("recipes");
    };
    if (selected || page !== "recipes") tg.BackButton.show();
    else tg.BackButton.hide();
    tg.BackButton.onClick(back);
    return () => tg.BackButton.offClick(back);
  }, [page, selected]);
  useEffect(() => {
    if (!ready) return;
    const start =
      new URLSearchParams(location.search).get("recipe") ||
      window.Telegram?.WebApp.initDataUnsafe.start_param?.replace(
        /^recipe_/,
        "",
      );
    if (start) {
      const r = allRecipes.find((r) => r.id === start);
      if (r) setSelected(r);
    }
  }, [ready]);
  const go = (p: Page) => {
    setPage(p);
    setQuery("");
    setCategory("Все рецепты");
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const favorite = (r: Recipe) => {
    const exists = state.favorites.includes(r.id);
    update((s) => ({
      ...s,
      favorites: exists
        ? s.favorites.filter((id) => id !== r.id)
        : [...s.favorites, r.id],
    }));
    notice(exists ? "Рецепт убран из избранного" : "Сохранено в избранное");
  };
  const plan = (r: Recipe, meal: Meal = "Обед") => {
    setPlanRecipe(r);
    setPlanDate(date);
    setPlanMeal(meal);
    setPlanPortions(state.preferences.portions);
  };
  const addPlan = () => {
    if (!planRecipe) return;
    update((s) => ({
      ...s,
      plan: [
        ...s.plan,
        {
          id: uid(),
          date: planDate,
          meal: planMeal,
          portions: planPortions,
          recipe: structuredClone(planRecipe),
        },
      ],
    }));
    setPlanRecipe(null);
    setPicker(null);
    notice(`Добавлено в меню на ${dateLabel(planDate)}`);
  };
  const removePlan = (e: PlanEntry) => {
    update((s) => ({ ...s, plan: s.plan.filter((i) => i.id !== e.id) }));
    notice("Блюдо удалено из меню", () =>
      update((s) => ({ ...s, plan: [...s.plan, e] })),
    );
  };
  const share = async (r?: Recipe) => {
    const url = r
      ? `${location.origin}/?recipe=${encodeURIComponent(r.id)}`
      : location.origin;
    const personal = r && r.source !== "editorial";
    const text = personal
      ? `${r.title}\n\n${r.ingredients.map((i) => `${productMap[i.productId].name} — ${formatQuantity(i.quantity)} ${productMap[i.productId].unit}`).join("\n")}\n\n${r.steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n")}`
      : r?.title || "Готовим с удовольствием";
    try {
      if (navigator.share)
        await navigator.share({
          title: r?.title || "Своя кухня",
          text,
          ...(!personal ? { url } : {}),
        });
      else {
        await navigator.clipboard.writeText(personal ? text : url);
        notice(personal ? "Рецепт скопирован" : "Ссылка скопирована");
      }
    } catch {}
  };
  const ask = async (prompt = aiPrompt) => {
    if (!prompt.trim()) return;
    if (!user) {
      notice("Откройте приложение в Telegram, чтобы поговорить с ИИ");
      return;
    }
    setAiPrompt(prompt);
    setAiBusy(true);
    setAiError("");
    setAiResult(null);
    setAiApplied(false);
    try {
      setAiResult(await kitchen.ask(prompt));
    } catch (e) {
      setAiError((e as Error).message);
    } finally {
      setAiBusy(false);
    }
  };
  const applyAI = () => {
    if (!aiResult || aiApplied) return;
    update((s) => ({
      ...s,
      recipes:
        aiResult.recipe && !s.recipes.some((r) => r.id === aiResult.recipe!.id)
          ? [...s.recipes, aiResult.recipe]
          : s.recipes,
      plan: [
        ...s.plan,
        ...aiResult.plan.map((p) => ({
          id: uid(),
          date: addDays(date, p.day),
          meal: p.meal,
          portions: p.portions,
          recipe: structuredClone(allRecipes.find((r) => r.id === p.recipeId)!),
        })),
      ],
    }));
    setAiApplied(true);
    notice("Предложение сохранено");
  };
  const titles: Record<Page, string> = {
    recipes: "Что приготовим сегодня?",
    menu: "Меню без лишних забот",
    ai: "Ваш помощник на кухне",
    shopping: "Всё нужное — в списке",
    pantry: "То, что уже есть дома",
    favorites: "Ваши любимые рецепты",
    profile: "Ваша кухня, ваши правила",
  };
  if (!ready)
    return (
      <div className="bootstrap">
        <div className="brand">
          <CookingPot size={32} />
          <span>
            своя кухня<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="skeleton big" />
        <div className="skeleton" />
        <div className="skeleton" />
      </div>
    );
  if (window.Telegram?.WebApp.initData && !user)
    return (
      <div className="bootstrap">
        <h1>Не удалось открыть кухню</h1>
        <p>{error}</p>
        <button className="button primary" onClick={() => location.reload()}>
          Попробовать снова
        </button>
      </div>
    );
  return (
    <MotionConfig reducedMotion="user">
      <div className="app-shell">
        <aside className="sidebar">
          <button
            className="brand"
            onClick={() => go("recipes")}
            aria-label="Своя кухня — главная"
          >
            <span className="brand-mark">
              <CookingPot size={27} weight="light" />
            </span>
            <span>
              своя кухня<span className="brand-dot">.</span>
            </span>
          </button>
          <div className="sidebar-caption">МЕНЬШЕ ХЛОПОТ. БОЛЬШЕ ВКУСА.</div>
          <nav className="side-nav">
            {nav.map((n) => (
              <button
                key={n.id}
                className={page === n.id ? "active" : ""}
                onClick={() => go(n.id)}
              >
                <n.icon size={21} weight={page === n.id ? "fill" : "regular"} />
                <span>{n.label}</span>
                {n.id === "shopping" &&
                  basket.filter((i) => !i.checked).length > 0 && (
                    <small>{basket.filter((i) => !i.checked).length}</small>
                  )}
                {n.id === "ai" && <span className="new-tag">Gemini</span>}
              </button>
            ))}
            <div className="nav-divider" />
            <button
              className={page === "favorites" ? "active" : ""}
              onClick={() => go("favorites")}
            >
              <Heart
                size={21}
                weight={page === "favorites" ? "fill" : "regular"}
              />
              Избранное
              {state.favorites.length > 0 && (
                <small>{state.favorites.length}</small>
              )}
            </button>
            <button
              className={page === "profile" ? "active" : ""}
              onClick={() => go("profile")}
            >
              <NotePencil size={21} />
              Мои рецепты и настройки
            </button>
          </nav>
          <div className="sidebar-bottom">
            <div className="little-note">
              <Leaf size={25} weight="light" />
              <p>
                Хорошая еда начинается
                <br />с простого плана.
              </p>
            </div>
            <button className="profile-mini" onClick={() => go("profile")}>
              <Avatar name={user?.first_name || "Г"} photo={user?.photo_url} />
              <span>
                <b>{user?.first_name || "Гость на кухне"}</b>
                <small>
                  {status === "saved"
                    ? "Всё сохранено"
                    : status === "saving"
                      ? "Сохраняем…"
                      : status === "local"
                        ? "На этом устройстве"
                        : "Есть несохранённые изменения"}
                </small>
              </span>
              <CaretDown size={15} />
            </button>
          </div>
        </aside>
        <div className="workspace">
          <header className="topbar">
            <div>
              <span className="breadcrumb">Своя кухня</span>
              <span className="breadcrumb-slash">/</span>
              <span>
                {nav.find((n) => n.id === page)?.label ||
                  (page === "favorites" ? "Избранное" : "Профиль")}
              </span>
            </div>
            <div className="topbar-actions">
              <span className="today-label">
                {dateLabel(localDate(), {
                  day: "numeric",
                  month: "long",
                  weekday: "short",
                })}
              </span>
              <button
                className="icon-button mobile-favorite"
                aria-label="Избранное"
                onClick={() => go("favorites")}
              >
                <Heart size={21} />
              </button>
              <button
                className="avatar-button"
                onClick={() => go("profile")}
                aria-label="Открыть профиль"
              >
                <Avatar
                  name={user?.first_name || "Г"}
                  photo={user?.photo_url}
                />
              </button>
            </div>
          </header>
          <main className={`main ${page === "recipes" ? "with-rail" : ""}`}>
            <div className="main-content">
              <div className="page-intro">
                <p className="eyebrow">
                  {page === "recipes"
                    ? "ВДОХНОВЕНИЕ ДЛЯ КАЖДОГО ДНЯ"
                    : page === "ai"
                      ? "МАЛЕНЬКАЯ ПОМОЩЬ. БОЛЬШЕ ВОЗМОЖНОСТЕЙ."
                      : "ВАША ДОМАШНЯЯ КУХНЯ"}
                </p>
                <div className="intro-title">
                  <h1>{titles[page]}</h1>
                  {["pantry", "shopping", "profile"].includes(page) && (
                    <button
                      className="round-add"
                      aria-label={
                        page === "profile"
                          ? "Создать рецепт"
                          : "Добавить продукт"
                      }
                      onClick={() =>
                        page === "pantry"
                          ? setStockForm(null)
                          : page === "shopping"
                            ? setShoppingForm(true)
                            : setEditRecipe(null)
                      }
                    >
                      <Plus size={23} />
                    </button>
                  )}
                </div>
                <p className="intro-text">
                  {page === "recipes"
                    ? "Простые рецепты, свежие идеи и немного заботы о себе."
                    : page === "menu"
                      ? "Планируйте с удовольствием. Остальное мы посчитаем."
                      : page === "shopping"
                        ? "Ингредиенты из меню с учётом ваших домашних запасов."
                        : page === "pantry"
                          ? "Используйте продукты вовремя и покупайте только необходимое."
                          : page === "favorites"
                            ? "Всё, что хочется приготовить ещё раз."
                            : page === "ai"
                              ? "Подберём рецепт, соберём меню или найдём применение остаткам."
                              : "Сохранённые блюда и привычки, которые делают готовку приятнее."}
                </p>
              </div>
              {status === "local" && (
                <div className="guest-note">
                  <span className="status-dot" />
                  Гостевой режим · данные на этом устройстве
                  <button
                    onClick={() =>
                      window.open(
                        `https://t.me/${botUsername}`,
                        "_blank",
                        "noopener,noreferrer",
                      )
                    }
                  >
                    Открыть в Telegram <ArrowUpRight size={14} />
                  </button>
                </div>
              )}
              {(status === "error" || status === "conflict") && (
                <div className="error-box" role="alert">
                  <p>{error}</p>
                  <div className="button-row">
                    <button
                      className="button small"
                      onClick={() => download(state, "kitchen-backup.json")}
                    >
                      <DownloadSimple size={16} />
                      Скачать копию
                    </button>
                    <button
                      className="button small"
                      onClick={() =>
                        status === "conflict"
                          ? setConfirmation({
                              title: "Загрузить серверную версию?",
                              text: "Текущие изменения на устройстве заменятся данными с сервера. Сначала скачайте копию, если хотите их сохранить.",
                              action: () => {
                                void kitchen
                                  .reload()
                                  .catch((e) => notice(e.message));
                              },
                            })
                          : kitchen.retry()
                      }
                    >
                      {status === "conflict"
                        ? "Загрузить с сервера"
                        : "Повторить сохранение"}
                    </button>
                  </div>
                </div>
              )}
              {(page === "recipes" || page === "favorites") && (
                <>
                  {page === "recipes" &&
                    !query &&
                    !activeFilters &&
                    category === "Все рецепты" && (
                      <section className="hero-feature">
                        <img
                          src="/images/bowl.jpg"
                          alt="Боул с киноа и свежими овощами"
                        />
                        <div className="hero-shade" />
                        <div className="hero-content">
                          <span className="feature-badge">
                            <Leaf size={13} />
                            РЕЦЕПТ ДНЯ
                          </span>
                          <h2>
                            Свежий взгляд
                            <br />
                            на обычный обед.
                          </h2>
                          <p>
                            Боул с курицей, киноа
                            <br className="desktop-break" /> и вашими любимыми
                            овощами.
                          </p>
                          <button
                            className="button hero-button"
                            onClick={() => setSelected(catalog[0])}
                          >
                            Будем готовить
                            <ArrowUpRight size={18} />
                          </button>
                        </div>
                        <span className="hero-meta">
                          <Clock size={15} />
                          30 минут<span>·</span>Легко
                        </span>
                      </section>
                    )}
                  <div className="search-row">
                    <label className="search-field">
                      <MagnifyingGlass size={21} />
                      <input
                        aria-label="Поиск рецептов"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Блюдо, продукт или настроение…"
                      />
                      {query && (
                        <button
                          aria-label="Очистить поиск"
                          onClick={() => setQuery("")}
                        >
                          <X size={17} />
                        </button>
                      )}
                    </label>
                    <button
                      className={`filter-button ${activeFilters ? "selected" : ""}`}
                      onClick={() => setShowFilters(true)}
                      aria-label="Фильтры рецептов"
                    >
                      <SlidersHorizontal size={21} />
                      <span>Фильтры</span>
                      {activeFilters && <i />}
                    </button>
                  </div>
                  <div
                    className="category-scroll"
                    role="group"
                    aria-label="Категории рецептов"
                  >
                    {categories.map((c) => (
                      <button
                        key={c}
                        className={category === c ? "active" : ""}
                        onClick={() => setCategory(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  <div className="section-heading">
                    <div>
                      <h2>
                        {category === "Все рецепты"
                          ? page === "favorites"
                            ? "Сохранено с любовью"
                            : "Вдохновение на каждый день"
                          : category}
                      </h2>
                      <span>{list.length} рецептов · КБЖУ на порцию</span>
                    </div>
                    {page === "recipes" && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setQuery("");
                          setCategory("Все рецепты");
                          setShowFilters(true);
                        }}
                      >
                        Подобрать
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </div>
                  {list.length ? (
                    <div className="recipe-grid">
                      {list.map((r, i) => (
                        <RecipeCard
                          key={r.id}
                          recipe={r}
                          state={state}
                          onOpen={setSelected}
                          onFavorite={favorite}
                          onPlan={plan}
                          index={i}
                        />
                      ))}
                    </div>
                  ) : (
                    <Empty
                      title={
                        page === "favorites"
                          ? "Любимые блюда будут здесь"
                          : "Пока ничего не нашлось"
                      }
                      text={
                        page === "favorites"
                          ? "Нажмите сердечко на рецепте, чтобы сохранить его."
                          : "Попробуйте другое название или уберите часть фильтров."
                      }
                      action={
                        page === "favorites" ? "Найти рецепт" : "Сбросить поиск"
                      }
                      onAction={() => {
                        go("recipes");
                        setFilters({
                          time: 120,
                          kcal: 1500,
                          diet: "Все",
                          difficulty: "Любая",
                          count: 50,
                          cost: 1000,
                          ingredient: "",
                          fridge: "Все",
                        });
                      }}
                    />
                  )}
                  <div className="catalog-footnote">
                    <Leaf size={16} />
                    Пищевая ценность и стоимость рассчитаны по ингредиентам и
                    могут отличаться. Фото иллюстрируют блюда.
                  </div>
                </>
              )}
              {page === "menu" && (
                <>
                  <div className="date-toolbar">
                    <div className="date-select">
                      <button
                        className="icon-button"
                        aria-label="Предыдущий день"
                        onClick={() => setDate(addDays(date, week ? -7 : -1))}
                      >
                        <ArrowLeft size={18} />
                      </button>
                      <label className="date-input">
                        <span>{dateLabel(date)}</span>
                        <input
                          type="date"
                          aria-label="Дата меню"
                          value={date}
                          onChange={(e) =>
                            e.target.value && setDate(e.target.value)
                          }
                        />
                        <CalendarBlank size={17} />
                      </label>
                      <button
                        className="icon-button"
                        aria-label="Следующий день"
                        onClick={() => setDate(addDays(date, week ? 7 : 1))}
                      >
                        <ArrowRight size={18} />
                      </button>
                    </div>
                    <button
                      className="text-button"
                      onClick={() => setDate(localDate())}
                    >
                      Сегодня
                    </button>
                    <div className="segmented">
                      <button
                        className={!week ? "active" : ""}
                        onClick={() => setWeek(false)}
                      >
                        День
                      </button>
                      <button
                        className={week ? "active" : ""}
                        onClick={() => setWeek(true)}
                      >
                        Неделя
                      </button>
                    </div>
                  </div>
                  <div className="week-strip">
                    {Array.from({ length: 7 }, (_, i) => {
                      const d = addDays(
                        date,
                        i - ((new Date(date + "T12:00:00").getDay() + 6) % 7),
                      );
                      return (
                        <button
                          className={date === d ? "active" : ""}
                          key={d}
                          onClick={() => setDate(d)}
                        >
                          <small>{dateLabel(d, { weekday: "short" })}</small>
                          <b>{new Date(d + "T12:00:00").getDate()}</b>
                          <i
                            className={
                              state.plan.some((p) => p.date === d)
                                ? "has-plan"
                                : ""
                            }
                          />
                        </button>
                      );
                    })}
                  </div>
                  <NutritionBar
                    value={nutritionSum(
                      state.plan.filter(
                        (e) =>
                          e.date >= date &&
                          e.date <= addDays(date, week ? 6 : 0),
                      ),
                    )}
                    target={state.preferences.kcal * (week ? 7 : 1)}
                  />
                  <div className="button-row menu-actions">
                    <button
                      className="button"
                      onClick={() => {
                        go("ai");
                        setAiPrompt(
                          `Составь меню на ${week ? 7 : 1} дней, 3 приёма пищи в день, около ${state.preferences.kcal} ккал в сутки на человека, на ${state.preferences.portions} порции.`,
                        );
                      }}
                    >
                      <Sparkle size={18} />
                      Собрать с ИИ
                    </button>
                    <button
                      className="button"
                      onClick={() => setCopyDate(addDays(date, 1))}
                    >
                      <Copy size={17} />
                      Копировать день
                    </button>
                    <button
                      className="button"
                      onClick={() => {
                        const entries = state.plan.filter(
                          (e) => e.date >= date && e.date <= addDays(date, 6),
                        );
                        if (!entries.length) {
                          notice("Сначала добавьте блюда в меню");
                          return;
                        }
                        update((s) => ({
                          ...s,
                          savedMenus: [
                            ...s.savedMenus,
                            {
                              id: uid(),
                              name: `Меню от ${dateLabel(date)}`,
                              entries: structuredClone(entries),
                            },
                          ].slice(-30),
                        }));
                        notice("Меню сохранено в профиле");
                      }}
                    >
                      <BookOpen size={17} />
                      Сохранить меню
                    </button>
                  </div>
                  {Array.from({ length: week ? 7 : 1 }, (_, i) =>
                    addDays(date, i),
                  ).map((day) => (
                    <div key={day} className="day-menu">
                      {week && (
                        <div className="section-heading">
                          <h2>
                            {dateLabel(day, {
                              weekday: "long",
                              day: "numeric",
                              month: "long",
                            })}
                          </h2>
                          <span>
                            {Math.round(
                              nutritionSum(
                                state.plan.filter((e) => e.date === day),
                              ).kcal,
                            )}{" "}
                            ккал
                          </span>
                        </div>
                      )}
                      {meals.map((meal, index) => (
                        <details
                          key={meal}
                          className="meal-section"
                          open={["Завтрак", "Обед", "Ужин"].includes(meal)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            const r = allRecipes.find(
                              (r) =>
                                r.id === e.dataTransfer.getData("text/recipe"),
                            );
                            if (r) {
                              setDate(day);
                              plan(r, meal);
                              setPlanDate(day);
                            }
                          }}
                        >
                          <summary>
                            <span className="meal-number">0{index + 1}</span>
                            <b>{meal}</b>
                            <small>
                              {state.plan.filter(
                                (e) => e.date === day && e.meal === meal,
                              ).length || ""}
                            </small>
                            <CaretDown size={16} />
                          </summary>
                          <div className="meal-body">
                            {state.plan
                              .filter((e) => e.date === day && e.meal === meal)
                              .map((e) => (
                                <div className="planned-recipe" key={e.id}>
                                  <button
                                    className="planned-photo"
                                    onClick={() => setSelected(e.recipe)}
                                  >
                                    <img src={e.recipe.image} alt="" />
                                  </button>
                                  <div className="planned-info">
                                    <button
                                      className="planned-title"
                                      onClick={() => setSelected(e.recipe)}
                                    >
                                      {e.recipe.title}
                                    </button>
                                    <small>
                                      {Math.round(
                                        nutrition(e.recipe, e.portions).kcal,
                                      )}{" "}
                                      ккал · {e.recipe.time} мин
                                    </small>
                                    <label className="move-meal">
                                      Приём пищи
                                      <select
                                        aria-label="Переместить блюдо"
                                        value={e.meal}
                                        onChange={(ev) =>
                                          update((s) => ({
                                            ...s,
                                            plan: s.plan.map((p) =>
                                              p.id === e.id
                                                ? {
                                                    ...p,
                                                    meal: ev.target
                                                      .value as Meal,
                                                  }
                                                : p,
                                            ),
                                          }))
                                        }
                                      >
                                        {meals.map((m) => (
                                          <option key={m}>{m}</option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                  <div className="planned-actions">
                                    <Stepper
                                      value={e.portions}
                                      onChange={(portions) =>
                                        update((s) => ({
                                          ...s,
                                          plan: s.plan.map((p) =>
                                            p.id === e.id
                                              ? { ...p, portions }
                                              : p,
                                          ),
                                        }))
                                      }
                                    />
                                    <button
                                      className="icon-button danger"
                                      aria-label="Удалить блюдо из меню"
                                      onClick={() => removePlan(e)}
                                    >
                                      <Trash size={17} />
                                    </button>
                                  </div>
                                </div>
                              ))}
                            <button
                              className="add-meal"
                              onClick={() => {
                                setDate(day);
                                setPicker(meal);
                              }}
                            >
                              <Plus size={19} />
                              Добавить блюдо
                            </button>
                          </div>
                        </details>
                      ))}
                    </div>
                  ))}
                  <button
                    className="button primary full"
                    onClick={() => {
                      setRangeStart(date);
                      setRangeEnd(addDays(date, week ? 6 : 0));
                      setCustomRange(true);
                      go("shopping");
                    }}
                  >
                    <ShoppingBasket size={19} />
                    Что нужно купить для меню
                    <ArrowRight size={18} />
                  </button>
                </>
              )}
              {page === "shopping" && (
                <>
                  <div className="shopping-period">
                    <span>Покупки на</span>
                    <div className="category-scroll">
                      {[1, 3, 7, 14].map((n) => (
                        <button
                          key={n}
                          className={
                            !customRange && period === n ? "active" : ""
                          }
                          onClick={() => {
                            setPeriod(n);
                            setCustomRange(false);
                            setRangeStart(localDate());
                            setRangeEnd(addDays(localDate(), n - 1));
                          }}
                        >
                          {n === 1
                            ? "день"
                            : n === 7
                              ? "неделю"
                              : n === 14
                                ? "2 недели"
                                : `${n} дня`}
                        </button>
                      ))}
                      <button
                        className={customRange ? "active" : ""}
                        onClick={() => setCustomRange(true)}
                      >
                        Свой период
                      </button>
                    </div>
                  </div>
                  {customRange && (
                    <div className="form-grid">
                      <label>
                        С
                        <input
                          type="date"
                          value={rangeStart}
                          onChange={(e) => {
                            if (e.target.value) {
                              setRangeStart(e.target.value);
                              if (e.target.value > rangeEnd)
                                setRangeEnd(e.target.value);
                            }
                          }}
                        />
                      </label>
                      <label>
                        По
                        <input
                          type="date"
                          min={rangeStart}
                          value={rangeEnd}
                          onChange={(e) =>
                            e.target.value && setRangeEnd(e.target.value)
                          }
                        />
                      </label>
                    </div>
                  )}
                  <div className="shopping-summary">
                    <div>
                      <span className="eyebrow">ВАШ СПИСОК</span>
                      <h2>
                        {basket.filter((i) => !i.checked).length} продуктов
                        осталось
                      </h2>
                      <p>
                        Примерно{" "}
                        {Math.round(
                          basket
                            .filter((i) => !i.checked)
                            .reduce(
                              (s, i) =>
                                s +
                                (i.quantity - i.purchased) * i.product.price,
                              0,
                            ),
                        ).toLocaleString("ru-RU")}{" "}
                        ₽ · {dateLabel(rangeStart)} — {dateLabel(rangeEnd)}
                      </p>
                    </div>
                    <ShoppingBasket size={52} weight="light" />
                  </div>
                  {basket.length ? (
                    Array.from(
                      new Set(basket.map((i) => i.product.category)),
                    ).map((cat) => (
                      <section className="product-group" key={cat}>
                        <h3>{cat}</h3>
                        {basket
                          .filter((i) => i.product.category === cat)
                          .map((item) => (
                            <div
                              className={`shopping-row ${item.checked ? "checked" : ""}`}
                              key={item.id}
                            >
                              <button
                                className="check-control"
                                aria-label={`${item.checked ? "Не куплено" : "Куплено"}: ${item.product.name}`}
                                aria-pressed={item.checked}
                                onClick={() =>
                                  update((s) =>
                                    item.manual
                                      ? {
                                          ...s,
                                          shopping: s.shopping.map((i) =>
                                            i.id === item.id
                                              ? { ...i, checked: !i.checked }
                                              : i,
                                          ),
                                        }
                                      : {
                                          ...s,
                                          checked: {
                                            ...s.checked,
                                            [item.product.id]: item.checked
                                              ? 0
                                              : item.quantity,
                                          },
                                        },
                                  )
                                }
                              >
                                {item.checked && (
                                  <Check size={16} weight="bold" />
                                )}
                              </button>
                              <div className="shopping-name">
                                <b>{item.product.name}</b>
                                {item.purchased > 0 && !item.checked && (
                                  <small>
                                    Уже куплено {formatQuantity(item.purchased)}{" "}
                                    {item.product.unit}
                                  </small>
                                )}
                              </div>
                              <input
                                className="quantity-input"
                                type="number"
                                min="0.1"
                                max="100000"
                                step="any"
                                aria-label={`Количество: ${item.product.name}`}
                                value={Number(item.quantity.toFixed(1))}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (n > 0 && n <= 100000)
                                    update((s) =>
                                      item.manual
                                        ? {
                                            ...s,
                                            shopping: s.shopping.map((i) =>
                                              i.id === item.id
                                                ? { ...i, quantity: n }
                                                : i,
                                            ),
                                          }
                                        : {
                                            ...s,
                                            overrides: {
                                              ...s.overrides,
                                              [item.product.id]: n,
                                            },
                                          },
                                    );
                                }}
                              />
                              <span className="unit">{item.product.unit}</span>
                              <button
                                className="icon-button"
                                aria-label={`Убрать ${item.product.name}`}
                                onClick={() => {
                                  update((s) =>
                                    item.manual
                                      ? {
                                          ...s,
                                          shopping: s.shopping.filter(
                                            (i) => i.id !== item.id,
                                          ),
                                        }
                                      : {
                                          ...s,
                                          hidden: [
                                            ...s.hidden,
                                            item.product.id,
                                          ],
                                        },
                                  );
                                  notice("Продукт убран из списка", () =>
                                    update((s) =>
                                      item.manual
                                        ? {
                                            ...s,
                                            shopping: [
                                              ...s.shopping,
                                              {
                                                id: item.id,
                                                productId: item.product.id,
                                                quantity: item.quantity,
                                                checked: item.checked,
                                                source: "manual",
                                              },
                                            ],
                                          }
                                        : {
                                            ...s,
                                            hidden: s.hidden.filter(
                                              (id) => id !== item.product.id,
                                            ),
                                          },
                                    ),
                                  );
                                }}
                              >
                                <X size={17} />
                              </button>
                            </div>
                          ))}
                      </section>
                    ))
                  ) : (
                    <Empty
                      title="В списке пока тихо"
                      text="Добавьте блюда в меню — нужные продукты появятся здесь. Или добавьте покупку вручную."
                      action="Добавить продукт"
                      onAction={() => setShoppingForm(true)}
                    />
                  )}
                  <div className="button-row">
                    <button
                      className="button"
                      onClick={() => setShoppingForm(true)}
                    >
                      <Plus size={18} />
                      Добавить продукт
                    </button>
                    <button
                      className="button"
                      onClick={() => {
                        const text = basket
                          .map(
                            (i) =>
                              `${i.checked ? "[x]" : "[ ]"} ${i.product.name} — ${formatQuantity(i.quantity)} ${i.product.unit}`,
                          )
                          .join("\n");
                        if (navigator.share)
                          void navigator
                            .share({ title: "Покупки · Своя кухня", text })
                            .catch(() => {});
                        else
                          void navigator.clipboard
                            .writeText(text)
                            .then(() => notice("Список скопирован"));
                      }}
                    >
                      <ShareNetwork size={18} />
                      Поделиться списком
                    </button>
                  </div>
                  {Object.values(state.checked).some((q) => q > 0) ||
                  state.shopping.some((i) => i.checked) ? (
                    <button
                      className="button primary full mt"
                      onClick={() =>
                        setConfirmation({
                          title: "Убрать покупки в холодильник?",
                          text: "Купленные продукты появятся в запасах. Список покупок автоматически пересчитается.",
                          action: () => {
                            update(transferPurchases);
                            notice("Покупки добавлены в холодильник");
                          },
                        })
                      }
                    >
                      <Snowflake size={19} />
                      Перенести купленное в холодильник
                    </button>
                  ) : null}
                  <div className="shopping-settings">
                    <Toggle
                      checked={state.includeStaples}
                      onChange={() =>
                        update((s) => ({
                          ...s,
                          includeStaples: !s.includeStaples,
                        }))
                      }
                      label="Добавлять соль, перец и воду"
                    />
                    {(state.hidden.length > 0 ||
                      Object.keys(state.overrides).length > 0) && (
                      <button
                        className="text-button"
                        onClick={() => {
                          update((s) => ({ ...s, hidden: [], overrides: {} }));
                          notice("Список пересчитан по меню");
                        }}
                      >
                        <ArrowClockwise size={16} />
                        Вернуть скрытые и сбросить количества
                      </button>
                    )}
                    <button
                      className="text-button danger"
                      onClick={() =>
                        setConfirmation({
                          title: "Очистить список покупок?",
                          text: "Ручные позиции будут удалены, а продукты из текущего меню — скрыты. Меню останется на месте.",
                          action: () => {
                            const before = state;
                            update((s) => ({
                              ...s,
                              shopping: [],
                              hidden: [
                                ...new Set([
                                  ...s.hidden,
                                  ...basket
                                    .filter((i) => !i.manual)
                                    .map((i) => i.product.id),
                                ]),
                              ],
                              checked: {},
                              overrides: {},
                            }));
                            notice("Список очищен", () =>
                              update((s) => ({
                                ...s,
                                shopping: before.shopping,
                                hidden: before.hidden,
                                checked: before.checked,
                                overrides: before.overrides,
                              })),
                            );
                          },
                        })
                      }
                    >
                      Очистить список
                    </button>
                  </div>
                </>
              )}
              {page === "pantry" && (
                <>
                  <div className="pantry-callout">
                    <div className="pantry-icon">
                      <Snowflake size={35} weight="light" />
                    </div>
                    <div>
                      <h2>Вкусное уже рядом</h2>
                      <p>Подберём блюда из того, что есть дома.</p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => {
                        go("recipes");
                        setFilters((f) => ({
                          ...f,
                          fridge: "Больше совпадений",
                        }));
                      }}
                    >
                      Что приготовить
                      <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <label className="search-field">
                    <MagnifyingGlass size={20} />
                    <input
                      aria-label="Поиск в холодильнике"
                      placeholder="Найти продукт в холодильнике"
                      value={stockQuery}
                      onChange={(e) => setStockQuery(e.target.value)}
                    />
                  </label>
                  {state.pantry.length ? (
                    <div className="stock-list">
                      {state.pantry
                        .filter((i) =>
                          productMap[i.productId]?.name
                            .toLowerCase()
                            .includes(stockQuery.toLowerCase()),
                        )
                        .sort((a, b) =>
                          (a.expires || "9999").localeCompare(
                            b.expires || "9999",
                          ),
                        )
                        .map((item) => {
                          const p = productMap[item.productId];
                          const expired =
                            item.expires && item.expires < localDate();
                          const soon =
                            item.expires &&
                            item.expires <= addDays(localDate(), 2);
                          return (
                            <div className="stock-row" key={item.id}>
                              <div className="stock-initial">
                                {p.name.slice(0, 1)}
                              </div>
                              <button
                                className="stock-details"
                                onClick={() => setStockForm(item)}
                              >
                                <b>{p.name}</b>
                                <span>
                                  {item.expires ? (
                                    <small
                                      className={
                                        expired ? "expired" : soon ? "soon" : ""
                                      }
                                    >
                                      {expired
                                        ? "Срок истёк"
                                        : item.expires === localDate()
                                          ? "Использовать сегодня"
                                          : `До ${dateLabel(item.expires)}`}
                                    </small>
                                  ) : (
                                    <small>{p.category}</small>
                                  )}
                                </span>
                                {item.note && <small>{item.note}</small>}
                              </button>
                              <b className="stock-quantity">
                                {formatQuantity(item.quantity)}{" "}
                                <small>{p.unit}</small>
                              </b>
                              <button
                                className="icon-button"
                                aria-label={`Изменить ${p.name}`}
                                onClick={() => setStockForm(item)}
                              >
                                <NotePencil size={18} />
                              </button>
                              <button
                                className="icon-button danger"
                                aria-label={`Удалить ${p.name}`}
                                onClick={() => {
                                  update((s) => ({
                                    ...s,
                                    pantry: s.pantry.filter(
                                      (i) => i.id !== item.id,
                                    ),
                                  }));
                                  notice("Продукт убран", () =>
                                    update((s) => ({
                                      ...s,
                                      pantry: [...s.pantry, item],
                                    })),
                                  );
                                }}
                              >
                                <Trash size={17} />
                              </button>
                            </div>
                          );
                        })}
                    </div>
                  ) : (
                    <Empty
                      title="Давайте заглянем в холодильник"
                      text="Добавьте продукты, которые уже есть дома. Мы учтём их в покупках и подборе рецептов."
                      action="Добавить первый продукт"
                      onAction={() => setStockForm(null)}
                    />
                  )}
                  <button
                    className="button dashed full"
                    onClick={() => setStockForm(null)}
                  >
                    <Plus size={19} />
                    Добавить продукт
                  </button>
                  <p className="helper">
                    Продукты с истёкшим сроком не учитываются как доступные.
                    Сроки годности можно изменить нажатием на продукт.
                  </p>
                </>
              )}
              {page === "ai" && (
                <>
                  <section className="ai-welcome">
                    <div className="ai-orb">
                      <Sparkle size={38} weight="light" />
                    </div>
                    <span className="eyebrow">GEMINI НА ВАШЕЙ КУХНЕ</span>
                    <h2>
                      Вдохновение,
                      <br />
                      когда оно нужно.
                    </h2>
                    <p>
                      Расскажите, чего хочется. Я учту ваши продукты,
                      <br className="desktop-break" /> предпочтения и время на
                      готовку.
                    </p>
                  </section>
                  <div className="prompt-grid">
                    {[
                      [
                        "Меню на неделю",
                        "Составь разнообразное меню на 7 дней, три приёма пищи в день, с учётом моих предпочтений.",
                      ],
                      [
                        "Из того, что есть",
                        "Что приготовить из моих продуктов в холодильнике? Предложи три рецепта.",
                      ],
                      [
                        "Ужин за 20 минут",
                        "Посоветуй ужин до 20 минут приготовления с большим количеством белка.",
                      ],
                      [
                        "Придумать рецепт",
                        "Придумай новый рецепт из доступных продуктов и моих запасов.",
                      ],
                    ].map(([label, prompt], i) => (
                      <button
                        key={label}
                        disabled={aiBusy}
                        onClick={() => void ask(prompt)}
                      >
                        <span className="prompt-number">0{i + 1}</span>
                        {label}
                        <ArrowUpRight size={18} />
                      </button>
                    ))}
                  </div>
                  <form
                    className="ai-composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void ask();
                    }}
                  >
                    <label htmlFor="ai-prompt">О чём подумаем вместе?</label>
                    <textarea
                      id="ai-prompt"
                      value={aiPrompt}
                      maxLength={3000}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      placeholder="Например: составь меню на три дня без молочных продуктов…"
                      rows={3}
                    />
                    <div>
                      <small>
                        План начнётся {dateLabel(date)} · до 15 запросов в день
                      </small>
                      <button
                        className="button primary"
                        disabled={aiBusy || aiPrompt.trim().length < 2}
                        type="submit"
                      >
                        {aiBusy ? "Думаю…" : "Отправить"}
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                  </form>
                  {aiBusy && (
                    <div className="ai-loading" role="status">
                      <span className="skeleton" />
                      <span className="skeleton" />
                      <span className="skeleton short" />
                      <p>Подбираю что-нибудь вкусное…</p>
                    </div>
                  )}
                  {aiError && (
                    <div className="error-box" role="alert">
                      {aiError}
                      <button
                        className="text-button"
                        onClick={() => void ask()}
                      >
                        Попробовать снова
                      </button>
                    </div>
                  )}
                  {aiResult && (
                    <div className="ai-answer">
                      <div className="answer-title">
                        <Sparkle size={21} />
                        <b>Вот что я предлагаю</b>
                      </div>
                      <p className="preserve-lines">{aiResult.message}</p>
                      {aiResult.recipeIds.map((id) => {
                        const r = allRecipes.find((r) => r.id === id);
                        return r ? (
                          <button
                            className="ai-recipe-link"
                            key={id}
                            onClick={() => setSelected(r)}
                          >
                            <img src={r.image} alt="" />
                            <span>
                              {r.title}
                              <small>
                                {r.time} мин · {Math.round(nutrition(r).kcal)}{" "}
                                ккал
                              </small>
                            </span>
                            <ArrowUpRight size={19} />
                          </button>
                        ) : null;
                      })}
                      {aiResult.plan.length > 0 && (
                        <div className="proposal-plan">
                          {aiResult.plan.map((p, i) => (
                            <div key={i}>
                              <small>
                                {dateLabel(addDays(date, p.day))} · {p.meal}
                              </small>
                              <b>
                                {
                                  allRecipes.find((r) => r.id === p.recipeId)
                                    ?.title
                                }
                              </b>
                              <span>{p.portions} порц.</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {aiResult.recipe && (
                        <div className="new-ai-recipe">
                          <h3>{aiResult.recipe.title}</h3>
                          <p>{aiResult.recipe.description}</p>
                          <p>
                            {aiResult.recipe.time} мин · ≈{" "}
                            {Math.round(nutrition(aiResult.recipe).kcal)} ккал /
                            порция
                          </p>
                          <button
                            className="button"
                            onClick={() => setSelected(aiResult.recipe!)}
                          >
                            Посмотреть рецепт
                          </button>
                        </div>
                      )}
                      {(aiResult.plan.length > 0 || aiResult.recipe) && (
                        <>
                          <p className="helper">
                            {aiResult.plan.length
                              ? `Будет добавлено блюд: ${aiResult.plan.length}. `
                              : ""}
                            {aiResult.recipe
                              ? "Новый рецепт будет сохранён в вашу библиотеку. "
                              : ""}
                            Текущие данные сохранятся.
                          </p>
                          <button
                            className="button primary full"
                            disabled={aiApplied}
                            onClick={() =>
                              setConfirmation({
                                title: "Сохранить предложение?",
                                text: `${aiResult.plan.length ? `В меню появится ${aiResult.plan.length} блюд с ${dateLabel(date)}. ` : ""}${aiResult.recipe ? "Новый рецепт появится в ваших рецептах." : ""}`,
                                action: applyAI,
                              })
                            }
                          >
                            {aiApplied ? (
                              <>
                                <Check size={18} />
                                Сохранено
                              </>
                            ) : (
                              <>
                                Подтвердить и сохранить
                                <Check size={18} />
                              </>
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  <p className="helper ai-privacy">
                    Gemini получает ваш запрос, меню, запасы и пищевые
                    предпочтения без имени и Telegram ID. На бесплатном тарифе
                    Google может использовать эти данные для улучшения моделей.
                    Рекомендации и расчёты ИИ приблизительны.
                  </p>
                </>
              )}
              {page === "profile" && (
                <>
                  <div className="profile-header">
                    <Avatar
                      name={user?.first_name || "Гость"}
                      photo={user?.photo_url}
                    />
                    <div>
                      <h2>{user?.first_name || "Гость на кухне"}</h2>
                      <p>
                        {user?.username
                          ? `@${user.username}`
                          : "Ваша личная кулинарная книга"}
                      </p>
                    </div>
                    <button className="button" onClick={() => go("favorites")}>
                      <Heart size={18} />
                      {state.favorites.length} в избранном
                    </button>
                  </div>
                  <PreferencesForm
                    state={state}
                    onSave={(preferences) => {
                      update((s) => ({ ...s, preferences }));
                      notice("Предпочтения сохранены");
                    }}
                  />
                  <div className="section-heading">
                    <h2>Мои рецепты</h2>
                    <button
                      className="text-button"
                      onClick={() => setEditRecipe(null)}
                    >
                      <Plus size={18} />
                      Создать
                    </button>
                  </div>
                  {state.recipes.length ? (
                    <div className="personal-recipes">
                      {state.recipes.map((r) => (
                        <div className="personal-row" key={r.id}>
                          <button onClick={() => setSelected(r)}>
                            <img src={r.image} alt="" />
                            <span>
                              {r.title}
                              <small>
                                {r.source === "ai"
                                  ? "Создан ИИ"
                                  : "Собственный рецепт"}
                              </small>
                            </span>
                          </button>
                          <button
                            className="icon-button"
                            aria-label="Редактировать рецепт"
                            onClick={() => setEditRecipe(r)}
                          >
                            <NotePencil size={18} />
                          </button>
                          <button
                            className="icon-button danger"
                            aria-label="Удалить собственный рецепт"
                            onClick={() =>
                              setConfirmation({
                                title: "Удалить рецепт?",
                                text: "Он исчезнет из вашей библиотеки и избранного. Блюда в ранее составленном меню сохранятся.",
                                action: () => {
                                  update((s) => ({
                                    ...s,
                                    recipes: s.recipes.filter(
                                      (i) => i.id !== r.id,
                                    ),
                                    favorites: s.favorites.filter(
                                      (id) => id !== r.id,
                                    ),
                                  }));
                                  notice("Рецепт удалён");
                                },
                              })
                            }
                          >
                            <Trash size={18} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="muted paragraph">
                      Здесь будут ваши семейные рецепты и сохранённые идеи ИИ.
                    </p>
                  )}
                  <div className="section-heading">
                    <h2>Сохранённые меню</h2>
                  </div>
                  {state.savedMenus.length ? (
                    state.savedMenus.map((menu) => (
                      <div className="saved-menu" key={menu.id}>
                        <span>
                          <b>{menu.name}</b>
                          <small>{menu.entries.length} блюд</small>
                        </span>
                        <button
                          className="button small"
                          onClick={() =>
                            setConfirmation({
                              title: "Добавить сохранённое меню?",
                              text: `${menu.entries.length} блюд будут скопированы, начиная с ${dateLabel(date)}.`,
                              action: () => {
                                const first = menu.entries
                                  .map((e) => e.date)
                                  .sort()[0];
                                update((s) => ({
                                  ...s,
                                  plan: [
                                    ...s.plan,
                                    ...menu.entries.map((e) => ({
                                      ...structuredClone(e),
                                      id: uid(),
                                      date: addDays(
                                        date,
                                        Math.round(
                                          (new Date(
                                            e.date + "T12:00:00Z",
                                          ).getTime() -
                                            new Date(
                                              first + "T12:00:00Z",
                                            ).getTime()) /
                                            86400000,
                                        ),
                                      ),
                                    })),
                                  ],
                                }));
                                notice("Меню скопировано");
                              },
                            })
                          }
                        >
                          Использовать
                        </button>
                        <button
                          className="icon-button"
                          aria-label="Удалить сохранённое меню"
                          onClick={() =>
                            update((s) => ({
                              ...s,
                              savedMenus: s.savedMenus.filter(
                                (m) => m.id !== menu.id,
                              ),
                            }))
                          }
                        >
                          <X size={17} />
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="muted paragraph">
                      Сохраните меню в планировщике, чтобы повторить его позже.
                    </p>
                  )}
                  <div className="section-heading">
                    <h2>Недавно готовили</h2>
                  </div>
                  {state.history.length ? (
                    state.history
                      .slice(-10)
                      .reverse()
                      .map((h) => (
                        <div className="history-row" key={h.id}>
                          <CheckCircle size={19} />
                          <span>{h.title}</span>
                          <small>{dateLabel(h.date)}</small>
                        </div>
                      ))
                  ) : (
                    <p className="muted paragraph">
                      Отметьте «Я приготовил» на странице рецепта — история
                      появится здесь.
                    </p>
                  )}
                  <div className="profile-data">
                    <button
                      className="button"
                      onClick={() => download(state, "my-kitchen.json")}
                    >
                      <DownloadSimple size={18} />
                      Скачать мои данные
                    </button>
                    <button
                      className="text-button danger"
                      onClick={() =>
                        setConfirmation({
                          title: "Удалить все личные данные?",
                          text: "Ваши меню, избранное, рецепты и запасы будут удалены. Это действие нельзя отменить. При необходимости сначала скачайте копию.",
                          action: () => {
                            void (
                              user
                                ? api("/api/account", { method: "DELETE" })
                                : Promise.resolve()
                            )
                              .then(() => {
                                localStorage.removeItem(
                                  user
                                    ? `kitchen-user-${user.id}`
                                    : "kitchen-demo",
                                );
                                location.reload();
                              })
                              .catch((e) => notice(e.message));
                          },
                        })
                      }
                    >
                      Удалить мои данные
                    </button>
                  </div>
                </>
              )}
            </div>
            {page === "recipes" && (
              <aside className="daily-rail">
                <div className="daily-card">
                  <div className="rail-heading">
                    <span className="mini-icon">
                      <CalendarBlank size={20} />
                    </span>
                    <h2>Ваш день</h2>
                    <small>Сегодня</small>
                  </div>
                  <NutritionBar
                    value={todayNutrition}
                    target={state.preferences.kcal}
                  />
                  <div className="daily-meals">
                    {(["Завтрак", "Обед", "Ужин"] as Meal[]).map((meal, i) => (
                      <div className="daily-meal" key={meal}>
                        <span className="daily-meal-index">0{i + 1}</span>
                        <div>
                          <b>{meal}</b>
                          {todayEntries.filter((e) => e.meal === meal)
                            .length ? (
                            todayEntries
                              .filter((e) => e.meal === meal)
                              .map((e) => (
                                <button
                                  key={e.id}
                                  onClick={() => setSelected(e.recipe)}
                                >
                                  {e.recipe.title}
                                </button>
                              ))
                          ) : (
                            <span>Пока без планов</span>
                          )}
                        </div>
                        <button
                          className="icon-button"
                          aria-label={`Добавить ${meal.toLowerCase()} на сегодня`}
                          onClick={() => {
                            setDate(localDate());
                            go("menu");
                            setPicker(meal);
                          }}
                        >
                          <Plus size={17} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="button rail-link full"
                    onClick={() => {
                      setDate(localDate());
                      go("menu");
                    }}
                  >
                    Открыть моё меню
                    <ArrowRight size={17} />
                  </button>
                </div>
                <button className="ai-teaser" onClick={() => go("ai")}>
                  <span className="ai-teaser-top">
                    <Sparkle size={27} weight="light" />
                    <ArrowUpRight size={21} />
                  </span>
                  <h3>
                    А что есть
                    <br />в холодильнике?
                  </h3>
                  <p>
                    ИИ-повар найдёт вкусное
                    <br />
                    применение вашим продуктам.
                  </p>
                  <span className="ai-teaser-bottom">
                    Спросить помощника
                    <ArrowRight size={16} />
                  </span>
                </button>
                <div className="rail-tip">
                  <Leaf size={19} />
                  <p>
                    Добавьте продукты в холодильник — и в покупках останется
                    только нужное.
                  </p>
                </div>
              </aside>
            )}
          </main>
          <footer className="footer">
            <span>своя кухня.</span>
            <span>Для вкусной повседневности</span>
          </footer>
        </div>
        <nav className="mobile-nav" aria-label="Основная навигация">
          {nav.map((n) => (
            <button
              className={`${page === n.id ? "active" : ""} ${n.id === "ai" ? "ai-nav" : ""}`}
              key={n.id}
              onClick={() => go(n.id)}
            >
              <span>
                <n.icon size={23} weight={page === n.id ? "fill" : "regular"} />
              </span>
              <small>
                {n.id === "menu"
                  ? "Меню"
                  : n.id === "pantry"
                    ? "Запасы"
                    : n.label}
              </small>
            </button>
          ))}
        </nav>
        <div className="timer-stack">
          {timers.map((t) => (
            <TimerPill
              key={t.id}
              {...t}
              onRemove={(id) => setTimers((v) => v.filter((t) => t.id !== id))}
            />
          ))}
        </div>
        <AnimatePresence>
          {toast && (
            <motion.div
              className="toast"
              role="status"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
            >
              <CheckCircle size={20} />
              <span>{toast}</span>
              {undo && (
                <button
                  onClick={() => {
                    undo();
                    setUndo(null);
                    setToast("Действие отменено");
                  }}
                >
                  Вернуть
                </button>
              )}
              <button
                aria-label="Закрыть уведомление"
                onClick={() => setToast("")}
              >
                <X size={17} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
        {selected && (
          <RecipeDetail
            recipe={selected}
            state={state}
            onClose={() => setSelected(null)}
            onFavorite={() => favorite(selected)}
            onPlan={(portions) => {
              plan(selected);
              setPlanPortions(portions);
            }}
            onShopping={(portions) => {
              update((s) => addRecipeShopping(s, selected, portions));
              notice("Ингредиенты добавлены в покупки");
            }}
            onNote={(note) =>
              update((s) => ({
                ...s,
                notes: { ...s.notes, [selected.id]: note },
              }))
            }
            onShare={() => void share(selected)}
            onCook={(portions, subtract) => {
              const r = selected;
              setConfirmation({
                title: "Записать приготовление?",
                text: subtract
                  ? "Использованные ингредиенты будут списаны из запасов, начиная с продуктов с ближайшим сроком годности."
                  : "Блюдо появится в истории приготовлений.",
                action: () => {
                  update((s) => ({
                    ...(subtract ? subtractRecipe(s, r, portions) : s),
                    history: [
                      ...s.history,
                      {
                        id: uid(),
                        recipeId: r.id,
                        title: r.title,
                        date: localDate(),
                      },
                    ].slice(-1000),
                  }));
                  notice("Приятного аппетита!");
                },
              });
            }}
            onTimer={(title, minutes) => {
              setTimers((t) => [
                ...t,
                { id: uid(), title, end: Date.now() + minutes * 60000 },
              ]);
              notice(`Таймер на ${minutes} минут запущен`);
            }}
          />
        )}
        {showFilters && (
          <Modal
            title="Подберём по вашему вкусу"
            onClose={() => setShowFilters(false)}
          >
            <div className="filter-form">
              <label>
                Время приготовления: до {filters.time} мин
                <input
                  type="range"
                  min="5"
                  max="120"
                  step="5"
                  value={filters.time}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, time: Number(e.target.value) }))
                  }
                />
              </label>
              <label>
                Калорийность: до {filters.kcal} ккал на порцию
                <input
                  type="range"
                  min="100"
                  max="1500"
                  step="50"
                  value={filters.kcal}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, kcal: Number(e.target.value) }))
                  }
                />
              </label>
              <div className="form-grid">
                <label>
                  Особенности
                  <select
                    value={filters.diet}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, diet: e.target.value }))
                    }
                  >
                    {[
                      "Все",
                      "Без мяса",
                      "Без молока",
                      "Без глютена",
                      "Много белка",
                      "До 400 ккал",
                    ].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Сложность
                  <select
                    value={filters.difficulty}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, difficulty: e.target.value }))
                    }
                  >
                    {["Любая", "Легко", "Средне"].map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Не больше ингредиентов
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={filters.count}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        count: Number(e.target.value),
                      }))
                    }
                  />
                </label>
                <label>
                  До ₽ за порцию
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    value={filters.cost}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        cost: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              </div>
              <label>
                Основной продукт
                <select
                  value={filters.ingredient}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, ingredient: e.target.value }))
                  }
                >
                  <option value="">Любой</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Из моего холодильника
                <select
                  value={filters.fridge}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, fridge: e.target.value }))
                  }
                >
                  {[
                    "Все",
                    "Всё есть",
                    "Не хватает до 2",
                    "Больше совпадений",
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <button
                className="button primary full"
                onClick={() => setShowFilters(false)}
              >
                Показать рецепты
              </button>
              <button
                className="text-button centered"
                onClick={() =>
                  setFilters({
                    time: 120,
                    kcal: 1500,
                    diet: "Все",
                    difficulty: "Любая",
                    count: 50,
                    cost: 1000,
                    ingredient: "",
                    fridge: "Все",
                  })
                }
              >
                Сбросить фильтры
              </button>
            </div>
          </Modal>
        )}
        {planRecipe && (
          <Modal
            title="Добавить в моё меню"
            onClose={() => setPlanRecipe(null)}
          >
            <div className="mini-recipe">
              <img src={planRecipe.image} alt="" />
              <h3>{planRecipe.title}</h3>
            </div>
            <div className="form-stack">
              <label>
                Когда готовим?
                <input
                  type="date"
                  required
                  value={planDate}
                  onChange={(e) =>
                    e.target.value && setPlanDate(e.target.value)
                  }
                />
              </label>
              <label>
                Приём пищи
                <select
                  value={planMeal}
                  onChange={(e) => setPlanMeal(e.target.value as Meal)}
                >
                  {meals.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </label>
              <div className="label-row">
                <span>Количество порций</span>
                <Stepper value={planPortions} onChange={setPlanPortions} />
              </div>
              <p className="helper">
                {Math.round(nutrition(planRecipe, planPortions).kcal)} ккал на{" "}
                {planPortions} порц. Продукты появятся в списке покупок.
              </p>
              <button className="button primary full" onClick={addPlan}>
                Добавить в меню
                <Plus size={18} />
              </button>
            </div>
          </Modal>
        )}
        {picker && (
          <Modal
            title={`Выбрать блюдо · ${picker.toLowerCase()}`}
            wide
            onClose={() => setPicker(null)}
          >
            <RecipePicker
              recipes={allRecipes}
              favorites={state.favorites}
              onSelect={(r) => plan(r, picker)}
            />
          </Modal>
        )}
        {stockForm !== false && (
          <ProductForm
            title={stockForm ? "Изменить продукт" : "Добавить в холодильник"}
            stock={stockForm}
            onClose={() => setStockForm(false)}
            onSubmit={(productId, quantity, expires, note) => {
              const item = {
                id: stockForm?.id || uid(),
                productId,
                quantity,
                expires,
                note,
                added: stockForm?.added || localDate(),
              };
              update((s) => ({
                ...s,
                pantry: stockForm
                  ? s.pantry.map((i) => (i.id === stockForm.id ? item : i))
                  : [...s.pantry, item],
              }));
              setStockForm(false);
              notice("Продукт сохранён");
            }}
          />
        )}
        {shoppingForm && (
          <ProductForm
            title="Добавить в покупки"
            shopping
            onClose={() => setShoppingForm(false)}
            onSubmit={(productId, quantity) => {
              update((s) => ({
                ...s,
                shopping: [
                  ...s.shopping,
                  {
                    id: uid(),
                    productId,
                    quantity,
                    checked: false,
                    source: "manual",
                  },
                ],
              }));
              setShoppingForm(false);
              notice("Добавлено в покупки");
            }}
          />
        )}
        {editRecipe !== false && (
          <RecipeForm
            recipe={editRecipe}
            onClose={() => setEditRecipe(false)}
            onSave={(r) => {
              update((s) => ({
                ...s,
                recipes: editRecipe
                  ? s.recipes.map((i) => (i.id === r.id ? r : i))
                  : [...s.recipes, r],
              }));
              setEditRecipe(false);
              notice("Рецепт сохранён. КБЖУ пересчитаны.");
            }}
          />
        )}
        {copyDate && (
          <Modal title="Повторить меню дня" onClose={() => setCopyDate("")}>
            <div className="form-stack">
              <p>
                Все блюда за {dateLabel(date)} будут добавлены на выбранный
                день.
              </p>
              <label>
                Новая дата
                <input
                  type="date"
                  value={copyDate}
                  onChange={(e) =>
                    e.target.value && setCopyDate(e.target.value)
                  }
                />
              </label>
              <button
                className="button primary"
                onClick={() => {
                  const entries = state.plan.filter((e) => e.date === date);
                  update((s) => ({
                    ...s,
                    plan: [
                      ...s.plan,
                      ...entries.map((e) => ({
                        ...structuredClone(e),
                        id: uid(),
                        date: copyDate,
                      })),
                    ],
                  }));
                  setCopyDate("");
                  notice(`Скопировано блюд: ${entries.length}`);
                }}
              >
                Скопировать
              </button>
            </div>
          </Modal>
        )}
        {confirmation && (
          <Modal
            title={confirmation.title}
            onClose={() => setConfirmation(null)}
          >
            <p className="paragraph">{confirmation.text}</p>
            <div className="button-row">
              <button className="button" onClick={() => setConfirmation(null)}>
                Отмена
              </button>
              <button
                className="button primary"
                onClick={() => {
                  const action = confirmation.action;
                  setConfirmation(null);
                  action();
                }}
              >
                Подтвердить
                <Check size={17} />
              </button>
            </div>
          </Modal>
        )}
      </div>
    </MotionConfig>
  );
}

function Avatar({ name, photo }: { name: string; photo?: string }) {
  return photo ? (
    <img className="avatar" src={photo} alt="" referrerPolicy="no-referrer" />
  ) : (
    <span className="avatar">{name.slice(0, 1).toUpperCase()}</span>
  );
}

function RecipeDetail({
  recipe: r,
  state,
  onClose,
  onFavorite,
  onPlan,
  onShopping,
  onNote,
  onShare,
  onCook,
  onTimer,
}: {
  recipe: Recipe;
  state: AppState;
  onClose: () => void;
  onFavorite: () => void;
  onPlan: (portions: number) => void;
  onShopping: (n: number) => void;
  onNote: (n: string) => void;
  onShare: () => void;
  onCook: (n: number, subtract: boolean) => void;
  onTimer: (title: string, minutes: number) => void;
}) {
  const [portions, setPortions] = useState(r.portions),
    [step, setStep] = useState(0),
    [done, setDone] = useState<number[]>([]),
    [tab, setTab] = useState("Ингредиенты"),
    [subtract, setSubtract] = useState(true),
    [note, setNote] = useState(state.notes[r.id] || "");
  const n = nutrition(r);
  const stock = availableStock(state);
  const saved = state.favorites.includes(r.id);
  const totalGrams =
    r.cookedWeight ||
    r.ingredients.reduce(
      (s, i) => s + i.quantity * productMap[i.productId].gramsPerUnit,
      0,
    );
  return (
    <Modal title="Готовим с удовольствием" onClose={onClose} wide>
      <img className="detail-image" src={r.image} alt={r.title} />
      <div className="detail-meta">
        <span>
          {r.source === "ai"
            ? "Создан ИИ"
            : r.source === "personal"
              ? "Ваш рецепт"
              : "Домашняя коллекция"}
        </span>
        <button
          className={`icon-button ${saved ? "heart-saved" : ""}`}
          aria-label="Избранное"
          onClick={onFavorite}
        >
          <Heart size={22} weight={saved ? "fill" : "regular"} />
        </button>
        <button
          className="icon-button"
          aria-label="Поделиться рецептом"
          onClick={onShare}
        >
          <ShareNetwork size={21} />
        </button>
      </div>
      <h1 className="detail-title">{r.title}</h1>
      <p className="detail-description">{r.description}</p>
      <div className="detail-stats">
        <span>
          <Clock size={17} />
          {r.time} мин
        </span>
        <span>
          <ChefHat size={18} />
          {r.difficulty}
        </span>
        <span>≈ {Math.round(recipeCost(r))} ₽ / порция</span>
      </div>
      <div className="detail-nutrition">
        {(
          [
            ["Ккал", n.kcal],
            ["Белки, г", n.protein],
            ["Жиры, г", n.fat],
            ["Углеводы, г", n.carbs],
          ] as const
        ).map(([label, n]) => (
          <div key={label}>
            <b>{Math.round(n)}</b>
            <small>{label}</small>
          </div>
        ))}
      </div>
      <p className="helper">
        Расчёт на 1 порцию. На 100 г{" "}
        {r.cookedWeight ? "готового блюда" : "исходных ингредиентов"}: ≈{" "}
        {Math.round(((n.kcal * r.portions) / totalGrams) * 100)} ккал.{" "}
        {r.cookedWeight ? "" : "Готовый вес не измерен."}
      </p>
      <div className="detail-tabs">
        <button
          className={tab === "Ингредиенты" ? "active" : ""}
          onClick={() => setTab("Ингредиенты")}
        >
          Ингредиенты
        </button>
        <button
          className={tab === "Приготовление" ? "active" : ""}
          onClick={() => setTab("Приготовление")}
        >
          Приготовление<span>{r.steps.length}</span>
        </button>
      </div>
      {tab === "Ингредиенты" ? (
        <>
          <div className="label-row">
            <span>Количество порций</span>
            <Stepper value={portions} onChange={setPortions} />
          </div>
          <div className="ingredient-list">
            {r.ingredients.map((i) => {
              const p = productMap[i.productId];
              const q = (i.quantity / r.portions) * portions;
              return (
                <div key={i.productId}>
                  <span>
                    {p.name}
                    {(stock[p.id] || 0) >= q && (
                      <small className="in-stock">
                        <Check size={11} />
                        есть дома
                      </small>
                    )}
                  </span>
                  <span className="ingredient-dots" />
                  <b>
                    {formatQuantity(q)} {p.unit}
                  </b>
                </div>
              );
            })}
          </div>
          <button className="button full" onClick={() => onShopping(portions)}>
            <ShoppingBasket size={18} />
            Недостающие продукты в покупки
          </button>
          <p className="helper">
            Запасы учтутся автоматически. Соль, перец и вода — по настройке
            списка.
          </p>
          <button
            className="button primary full"
            onClick={() => setTab("Приготовление")}
          >
            Начать готовить
            <ArrowRight size={18} />
          </button>
        </>
      ) : (
        <div className="cooking">
          <div className="cooking-progress">
            {r.steps.map((s, i) => (
              <button
                className={`${step === i ? "current" : ""} ${done.includes(i) ? "done" : ""}`}
                key={i}
                onClick={() => setStep(i)}
                aria-label={`Шаг ${i + 1}`}
              >
                {done.includes(i) ? <Check size={14} /> : i + 1}
              </button>
            ))}
          </div>
          <span className="eyebrow">
            ШАГ {step + 1} ИЗ {r.steps.length}
          </span>
          <p className="cooking-text">{r.steps[step].text}</p>
          {r.steps[step].minutes && (
            <button
              className="button timer-button"
              onClick={() =>
                onTimer(`${r.title}: шаг ${step + 1}`, r.steps[step].minutes!)
              }
            >
              <Timer size={19} />
              Запустить таймер · {r.steps[step].minutes} мин
            </button>
          )}
          <div className="button-row">
            <button
              className="button"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft size={17} />
              Назад
            </button>
            <button
              className="button primary"
              onClick={() => {
                setDone((v) => [...new Set([...v, step])]);
                if (step < r.steps.length - 1) setStep((s) => s + 1);
              }}
            >
              {step === r.steps.length - 1 ? "Шаг выполнен" : "Следующий шаг"}
              <Check size={17} />
            </button>
          </div>
          <Toggle
            checked={subtract}
            label="Списать ингредиенты из холодильника"
            onChange={() => setSubtract((v) => !v)}
          />
          <button
            className="button full"
            onClick={() => onCook(portions, subtract)}
          >
            <CheckCircle size={19} />Я приготовил
          </button>
        </div>
      )}
      <div className="recipe-note">
        <label htmlFor="recipe-note">Заметка для следующего раза</label>
        <textarea
          id="recipe-note"
          rows={2}
          maxLength={3000}
          placeholder="Например: чуть меньше соли, побольше зелени…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => {
            if (note !== (state.notes[r.id] || "")) onNote(note);
          }}
        />
      </div>
      <button className="button primary full" onClick={() => onPlan(portions)}>
        <CalendarBlank size={19} />
        Добавить в моё меню
        <Plus size={17} />
      </button>
    </Modal>
  );
}

function RecipePicker({
  recipes,
  favorites,
  onSelect,
}: {
  recipes: Recipe[];
  favorites: string[];
  onSelect: (r: Recipe) => void;
}) {
  const [q, setQ] = useState(""),
    [onlyFav, setOnlyFav] = useState(false);
  return (
    <>
      <label className="search-field">
        <MagnifyingGlass size={19} />
        <input
          autoFocus
          placeholder="Найти блюдо"
          aria-label="Найти блюдо для меню"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>
      <Toggle
        checked={onlyFav}
        label="Только избранное"
        onChange={() => setOnlyFav((v) => !v)}
      />
      <div className="picker-list">
        {recipes
          .filter(
            (r) =>
              r.title.toLowerCase().includes(q.toLowerCase()) &&
              (!onlyFav || favorites.includes(r.id)),
          )
          .map((r) => (
            <button key={r.id} onClick={() => onSelect(r)}>
              <img src={r.image} alt="" />
              <span>
                <b>{r.title}</b>
                <small>
                  {r.time} мин · {Math.round(nutrition(r).kcal)} ккал
                </small>
              </span>
              <Plus size={19} />
            </button>
          ))}
      </div>
    </>
  );
}

function ProductForm({
  title,
  stock,
  shopping = false,
  onClose,
  onSubmit,
}: {
  title: string;
  stock?: StockItem | null;
  shopping?: boolean;
  onClose: () => void;
  onSubmit: (
    id: string,
    quantity: number,
    expires: string,
    note: string,
  ) => void;
}) {
  const [productId, setProductId] = useState(
      stock?.productId || products[0].id,
    ),
    [quantity, setQuantity] = useState(stock?.quantity || 100),
    [expires, setExpires] = useState(stock?.expires || ""),
    [note, setNote] = useState(stock?.note || ""),
    [q, setQ] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (quantity > 0) onSubmit(productId, quantity, expires, note);
        }}
      >
        <label>
          Поиск продукта
          <input
            placeholder="Начните вводить название"
            value={q}
            onChange={(e) => {
              const query = e.target.value;
              setQ(query);
              const found = products.find((p) =>
                p.name.toLowerCase().includes(query.toLowerCase()),
              );
              if (found) setProductId(found.id);
            }}
          />
        </label>
        <label>
          Продукт
          <select
            required
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
          >
            {products
              .filter(
                (p) =>
                  p.id === productId ||
                  p.name.toLowerCase().includes(q.toLowerCase()),
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Количество, {productMap[productId].unit}
          <input
            type="number"
            step="any"
            min="0.1"
            max="100000"
            required
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </label>
        <p className="helper">
          {productMap[productId].category} · Все разделы используют одно
          название продукта.
        </p>
        {!shopping && (
          <>
            <label>
              Годен до <span className="muted">(необязательно)</span>
              <input
                type="date"
                value={expires}
                onChange={(e) => setExpires(e.target.value)}
              />
            </label>
            <label>
              Заметка
              <textarea
                maxLength={500}
                rows={2}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Например: на верхней полке"
              />
            </label>
          </>
        )}
        <button className="button primary full" type="submit">
          {stock ? "Сохранить изменения" : "Добавить продукт"}
          <Check size={18} />
        </button>
      </form>
    </Modal>
  );
}

function PreferencesForm({
  state,
  onSave,
}: {
  state: AppState;
  onSave: (p: AppState["preferences"]) => void;
}) {
  const [p, setP] = useState(state.preferences);
  return (
    <form
      className="preferences form-stack"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(p);
      }}
    >
      <h2>Пищевые привычки</h2>
      <div className="form-grid">
        <label>
          Обычно готовлю порций
          <input
            type="number"
            min="1"
            max="30"
            required
            value={p.portions}
            onChange={(e) =>
              setP((v) => ({ ...v, portions: Number(e.target.value) }))
            }
          />
        </label>
        <label>
          Цель на день, ккал
          <input
            type="number"
            min="500"
            max="6000"
            required
            value={p.kcal}
            onChange={(e) =>
              setP((v) => ({ ...v, kcal: Number(e.target.value) }))
            }
          />
        </label>
        <label>
          Питание
          <select
            value={p.diet}
            onChange={(e) => setP((v) => ({ ...v, diet: e.target.value }))}
          >
            {[
              "Любое питание",
              "Без мяса",
              "Без молока",
              "Без глютена",
              "Больше белка",
            ].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          Время на готовку, мин
          <input
            type="number"
            min="5"
            max="1440"
            required
            value={p.maxTime}
            onChange={(e) =>
              setP((v) => ({ ...v, maxTime: Number(e.target.value) }))
            }
          />
        </label>
      </div>
      <label>
        Исключённые продукты и аллергены
        <textarea
          rows={2}
          maxLength={1000}
          placeholder="Например: арахис, креветки, грибы"
          value={p.excluded}
          onChange={(e) => setP((v) => ({ ...v, excluded: e.target.value }))}
        />
      </label>
      <label>
        Бюджет на день, ₽ <span className="muted">(0 — не ограничивать)</span>
        <input
          type="number"
          min="0"
          max="100000"
          value={p.budget}
          onChange={(e) =>
            setP((v) => ({ ...v, budget: Number(e.target.value) }))
          }
        />
      </label>
      <p className="helper">
        Цель КБЖУ задаёте вы. ИИ учитывает эти предпочтения в предложениях.
        Проверяйте состав блюд при аллергии.
      </p>
      <button className="button primary" type="submit">
        Сохранить предпочтения
        <Check size={18} />
      </button>
    </form>
  );
}

function RecipeForm({
  recipe,
  onClose,
  onSave,
}: {
  recipe: Recipe | null;
  onClose: () => void;
  onSave: (r: Recipe) => void;
}) {
  const [r, setR] = useState<Recipe>(
    recipe || {
      id: `personal-${uid()}`,
      title: "",
      description: "",
      category: "Основные блюда",
      image: "/images/bowl.jpg",
      time: 25,
      portions: 2,
      difficulty: "Легко",
      ingredients: [{ productId: "chicken", quantity: 200 }],
      steps: [{ text: "" }],
      tags: [],
      source: "personal",
      version: 1,
    },
  );
  const [error, setError] = useState("");
  const n = nutrition(r);
  return (
    <Modal
      title={recipe ? "Изменить свой рецепт" : "Семейный рецепт"}
      wide
      onClose={onClose}
    >
      <form
        className="form-stack"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          if (
            new Set(r.ingredients.map((i) => i.productId)).size !==
            r.ingredients.length
          ) {
            setError("Объедините повторяющиеся ингредиенты в одну строку.");
            return;
          }
          onSave({ ...r, version: (recipe?.version || 0) + 1 });
        }}
      >
        <label>
          Название
          <input
            required
            minLength={2}
            maxLength={120}
            value={r.title}
            onChange={(e) => setR((v) => ({ ...v, title: e.target.value }))}
          />
        </label>
        <label>
          Коротко о блюде
          <textarea
            maxLength={2000}
            rows={2}
            value={r.description}
            onChange={(e) =>
              setR((v) => ({ ...v, description: e.target.value }))
            }
          />
        </label>
        <label>
          Ссылка на фотографию{" "}
          <span className="muted">(необязательно, HTTPS)</span>
          <input
            type="url"
            placeholder="https://…"
            value={r.image.startsWith("https://") ? r.image : ""}
            pattern="https://.*"
            onChange={(e) =>
              setR((v) => ({
                ...v,
                image: e.target.value || "/images/bowl.jpg",
              }))
            }
          />
        </label>
        <div className="form-grid">
          <label>
            Категория
            <select
              value={r.category}
              onChange={(e) =>
                setR((v) => ({ ...v, category: e.target.value }))
              }
            >
              {categories.slice(1).map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label>
            Время, мин
            <input
              type="number"
              required
              min="1"
              max="1440"
              value={r.time}
              onChange={(e) =>
                setR((v) => ({ ...v, time: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Порции
            <input
              type="number"
              required
              min="1"
              max="30"
              value={r.portions}
              onChange={(e) =>
                setR((v) => ({ ...v, portions: Number(e.target.value) }))
              }
            />
          </label>
          <label>
            Готовый вес, г
            <input
              type="number"
              min="1"
              max="100000"
              placeholder="Если измеряли"
              value={r.cookedWeight || ""}
              onChange={(e) =>
                setR((v) => ({
                  ...v,
                  cookedWeight: Number(e.target.value) || undefined,
                }))
              }
            />
          </label>
        </div>
        <h3>Ингредиенты</h3>
        {r.ingredients.map((i, index) => (
          <div className="recipe-form-row" key={index}>
            <label>
              Продукт
              <select
                value={i.productId}
                onChange={(e) =>
                  setR((v) => ({
                    ...v,
                    ingredients: v.ingredients.map((item, j) =>
                      j === index
                        ? { ...item, productId: e.target.value }
                        : item,
                    ),
                  }))
                }
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {productMap[i.productId]?.unit}
              <input
                type="number"
                step="any"
                min="0.1"
                max="100000"
                required
                value={i.quantity}
                onChange={(e) =>
                  setR((v) => ({
                    ...v,
                    ingredients: v.ingredients.map((item, j) =>
                      j === index
                        ? { ...item, quantity: Number(e.target.value) }
                        : item,
                    ),
                  }))
                }
              />
            </label>
            <button
              className="icon-button"
              type="button"
              disabled={r.ingredients.length <= 1}
              aria-label="Удалить ингредиент"
              onClick={() =>
                setR((v) => ({
                  ...v,
                  ingredients: v.ingredients.filter((_, j) => j !== index),
                }))
              }
            >
              <X size={17} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          disabled={r.ingredients.length >= 50}
          onClick={() =>
            setR((v) => ({
              ...v,
              ingredients: [
                ...v.ingredients,
                {
                  productId:
                    products.find(
                      (p) => !v.ingredients.some((i) => i.productId === p.id),
                    )?.id || "salt",
                  quantity: 100,
                },
              ],
            }))
          }
        >
          <Plus size={17} />
          Ещё ингредиент
        </button>
        <p className="nutrition-preview">
          На порцию: ≈ {Math.round(n.kcal)} ккал · Б {Math.round(n.protein)} · Ж{" "}
          {Math.round(n.fat)} · У {Math.round(n.carbs)}
        </p>
        <h3>Приготовление</h3>
        {r.steps.map((s, index) => (
          <div className="form-step" key={index}>
            <label>
              Шаг {index + 1}
              <textarea
                required
                maxLength={3000}
                rows={2}
                value={s.text}
                onChange={(e) =>
                  setR((v) => ({
                    ...v,
                    steps: v.steps.map((item, j) =>
                      j === index ? { ...item, text: e.target.value } : item,
                    ),
                  }))
                }
              />
            </label>
            <button
              className="icon-button"
              type="button"
              aria-label="Удалить шаг"
              disabled={r.steps.length <= 1}
              onClick={() =>
                setR((v) => ({
                  ...v,
                  steps: v.steps.filter((_, j) => j !== index),
                }))
              }
            >
              <X size={17} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          disabled={r.steps.length >= 30}
          onClick={() =>
            setR((v) => ({ ...v, steps: [...v.steps, { text: "" }] }))
          }
        >
          <Plus size={17} />
          Добавить шаг
        </button>
        {error && <p className="error-box">{error}</p>}
        <button className="button primary full" type="submit">
          Сохранить рецепт
          <Check size={18} />
        </button>
      </form>
    </Modal>
  );
}
