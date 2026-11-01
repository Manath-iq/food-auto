import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  Heart,
  MagnifyingGlass,
  Plus,
  SlidersHorizontal,
  Sparkle,
} from "@phosphor-icons/react";
import { MotionConfig } from "motion/react";
import {
  Empty,
  Modal,
  NutritionBar,
  RecipeCard,
  Stepper,
  Toggle,
} from "./components.tsx";
import { RecipeDetail } from "./App.tsx";
import { recipes } from "./data.ts";
import { emptyState } from "./domain.ts";
import type { Recipe } from "./types.ts";
import "./design-system.css";

const palette = [
  ["Фон", "--bg"],
  ["Поверхность", "--paper"],
  ["Акцент", "--green"],
  ["Текст", "--ink"],
  ["Сливочный", "--cream"],
  ["Овсяный", "--peach"],
  ["Эвкалипт", "--sage"],
  ["Подписи", "--muted"],
];

function readPalette() {
  const styles = getComputedStyle(document.documentElement);
  return Object.fromEntries(
    palette.map(([, token]) => [
      token,
      styles.getPropertyValue(token).trim().toUpperCase(),
    ]),
  );
}

export default function DesignSystem() {
  const [colors, setColors] = useState(readPalette);
  useEffect(() => {
    const refresh = () => setColors(readPalette());
    window.addEventListener("kitchen-theme-changed", refresh);
    return () => window.removeEventListener("kitchen-theme-changed", refresh);
  }, []);
  const [state, setState] = useState(emptyState);
  const [portions, setPortions] = useState(2);
  const [checked, setChecked] = useState(true);
  const [category, setCategory] = useState("Все рецепты");
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [sheet, setSheet] = useState(false);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState(false);
  return (
    <MotionConfig reducedMotion="user">
      <main className="design-system">
        <header className="ds-header">
          <a className="button small" href="/">
            <ArrowLeft size={17} /> В приложение
          </a>
          <span>своя кухня. / 01</span>
        </header>
        <div className="ds-intro">
          <span className="eyebrow">ДИЗАЙН-СИСТЕМА</span>
          <h1>
            Меньше хлопот.
            <br />
            <span>Больше вкуса.</span>
          </h1>
          <p>
            Мобильный интерфейс с тёплым характером. Те же компоненты, которые
            работают в приложении. Здесь можно нажимать всё: изменения остаются
            только на этом стенде.
          </p>
        </div>
        <section className="ds-section" aria-labelledby="ds-colors">
          <div className="ds-section-heading">
            <span>01</span>
            <h2 id="ds-colors">Цвет и настроение</h2>
          </div>
          <nav className="ds-theme-options" aria-label="Тема стенда">
            {[
              ["Авто", ""],
              ["Светлая", "light"],
              ["Тёмная", "dark"],
            ].map(([label, theme]) => (
              <a
                key={label}
                className="button small"
                href={`/?design=1${theme ? `&theme=${theme}` : ""}`}
                aria-current={
                  (new URLSearchParams(location.search).get("theme") || "") ===
                  theme
                    ? "true"
                    : undefined
                }
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="ds-palette">
            {palette.map(([name, token]) => (
              <div key={token} className="ds-swatch">
                <div style={{ "--swatch": `var(${token})` } as CSSProperties} />
                <b>{name}</b>
                <small>{colors[token]}</small>
              </div>
            ))}
          </div>
          <p className="helper">
            В приложении тема следует настройкам Telegram, в браузере —
            настройкам устройства. На стенде можно сравнить обе палитры.
          </p>
        </section>
        <section className="ds-section" aria-labelledby="ds-type">
          <div className="ds-section-heading">
            <span>02</span>
            <h2 id="ds-type">Типографика</h2>
          </div>
          <div className="ds-type-panel">
            <span className="ds-type-display">Что приготовим?</span>
            <span className="ds-type-heading">Вкусное на каждый день</span>
            <p>Простые рецепты, любимые продукты и немного заботы о себе.</p>
            <small>
              Manrope · 400 / 600 / 750 / 800 · основной текст 14–16 px
            </small>
          </div>
        </section>
        <section className="ds-section" aria-labelledby="ds-controls">
          <div className="ds-section-heading">
            <span>03</span>
            <h2 id="ds-controls">Действия и формы</h2>
          </div>
          <div className="ds-panel">
            <div className="button-row">
              <button className="button primary" onClick={() => setSheet(true)}>
                Добавить в меню <Plus size={18} />
              </button>
              <button
                className="button"
                onClick={() => setMessage("Пример рецепта сохранён на стенде")}
              >
                Сохранить <Heart size={18} />
              </button>
              <button className="button" disabled>
                Сохраняем…
              </button>
            </div>
            <div className="search-row">
              <label className="search-field">
                <MagnifyingGlass size={20} />
                <input
                  aria-label="Поиск на стенде"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Рецепт или ингредиент…"
                />
              </label>
              <button
                className={`filter-button ${filter ? "selected" : ""}`}
                aria-label="Пример активного фильтра"
                aria-pressed={filter}
                onClick={() => setFilter(!filter)}
              >
                <SlidersHorizontal size={21} />
                {filter && <i />}
              </button>
            </div>
            <div
              className="category-scroll"
              role="group"
              aria-label="Примеры категорий"
            >
              {["Все рецепты", "Завтраки", "Обеды", "Ужины"].map((c) => (
                <button
                  key={c}
                  className={category === c ? "active" : ""}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="label-row">
              <span>Количество порций</span>
              <Stepper value={portions} onChange={setPortions} />
            </div>
            <Toggle
              checked={checked}
              onChange={() => setChecked(!checked)}
              label="Учитывать домашние запасы"
            />
          </div>
        </section>
        <section className="ds-section" aria-labelledby="ds-cards">
          <div className="ds-section-heading">
            <span>04</span>
            <h2 id="ds-cards">Карточки рецептов</h2>
          </div>
          <div className="recipe-grid">
            {recipes
              .slice(0, 3)
              .filter(
                (r) =>
                  r.title.toLowerCase().includes(query.toLowerCase()) &&
                  (category === "Все рецепты" || r.category === category),
              )
              .map((r, index) => (
                <RecipeCard
                  key={r.id}
                  recipe={r}
                  state={state}
                  index={index}
                  onOpen={setSelected}
                  onPlan={() => setSheet(true)}
                  onFavorite={(recipe) =>
                    setState((s) => ({
                      ...s,
                      favorites: s.favorites.includes(recipe.id)
                        ? s.favorites.filter((id) => id !== recipe.id)
                        : [...s.favorites, recipe.id],
                    }))
                  }
                />
              ))}
          </div>
        </section>
        <section className="ds-section" aria-labelledby="ds-states">
          <div className="ds-section-heading">
            <span>05</span>
            <h2 id="ds-states">Состояния и данные</h2>
          </div>
          <NutritionBar
            value={{ kcal: 1340, protein: 87, fat: 46, carbs: 144 }}
            target={2000}
          />
          <Empty
            title="Здесь будут любимые блюда"
            text="Сохраните рецепт, чтобы легко вернуться к нему."
            action="Выбрать рецепт"
            onAction={() => setSelected(recipes[0])}
          />
          <div className="ds-loading">
            <div className="skeleton big" />
            <div className="skeleton" />
            <div className="skeleton short" />
            <span className="helper">Загрузка</span>
          </div>
          <div className="error-box" role="note">
            <p>
              Не удалось сохранить изменения. Проверьте соединение и попробуйте
              ещё раз.
            </p>
            <button
              className="text-button"
              onClick={() => setMessage("Пример: соединение восстановлено")}
            >
              Повторить <ArrowUpRight size={17} />
            </button>
          </div>
        </section>
        <footer className="ds-footer">
          <Sparkle size={20} />
          <p>Округлые формы. Читаемый текст. Действия под рукой.</p>
          <a href="/">
            Открыть приложение <ArrowUpRight size={18} />
          </a>
        </footer>
      </main>
      {sheet && (
        <Modal title="Добавить в меню" onClose={() => setSheet(false)}>
          <div className="form-stack">
            <p className="paragraph">
              Пример нижнего окна: крупные поля, короткий путь к действию и
              удобная кнопка закрытия.
            </p>
            <div className="form-grid">
              <label>
                Когда
                <input type="date" defaultValue="2026-10-31" />
              </label>
              <label>
                Приём пищи
                <select defaultValue="Обед">
                  <option>Завтрак</option>
                  <option>Обед</option>
                  <option>Ужин</option>
                </select>
              </label>
            </div>
            <div className="label-row">
              <span>Порции</span>
              <Stepper value={portions} onChange={setPortions} />
            </div>
            <button
              className="button primary full"
              onClick={() => {
                setSheet(false);
                setMessage("Блюдо добавлено в пример меню");
              }}
            >
              Добавить <Plus size={18} />
            </button>
          </div>
        </Modal>
      )}
      {selected && (
        <RecipeDetail
          recipe={selected}
          state={state}
          onClose={() => setSelected(null)}
          onFavorite={() =>
            setState((s) => ({
              ...s,
              favorites: s.favorites.includes(selected.id)
                ? s.favorites.filter((id) => id !== selected.id)
                : [...s.favorites, selected.id],
            }))
          }
          onPlan={() => {
            setSelected(null);
            setSheet(true);
          }}
          onShopping={() => setMessage("Продукты добавлены в пример покупок")}
          onNote={(note) =>
            setState((s) => ({
              ...s,
              notes: { ...s.notes, [selected.id]: note },
            }))
          }
          onShare={() => setMessage("Это пример рецепта на стенде")}
          onCook={() => setMessage("Приготовление отмечено на стенде")}
          onTimer={() => setMessage("Таймеры доступны в приложении")}
        />
      )}
      {message && (
        <div className="toast" role="status">
          <Check size={18} />
          <span>{message}</span>
          <button onClick={() => setMessage("")}>Понятно</button>
        </div>
      )}
    </MotionConfig>
  );
}
