import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  X,
  Minus,
  Plus,
  Clock,
  Fire,
  Heart,
  ArrowUpRight,
  CookingPot,
  Check,
} from "@phosphor-icons/react";
import { motion } from "motion/react";
import type { Recipe, AppState, Nutrition } from "./types.ts";
import { nutrition } from "./domain.ts";

export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-inner">
        <header className="modal-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            className="icon-button"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </header>
        {children}
      </div>
    </dialog>
  );
}
export function Stepper({
  value,
  onChange,
  max = 30,
}: {
  value: number;
  onChange: (n: number) => void;
  max?: number;
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label="Уменьшить порции"
        disabled={value <= 1}
        onClick={() => onChange(Math.max(1, value - 1))}
      >
        <Minus size={16} />
      </button>
      <span>{value}</span>
      <button
        type="button"
        aria-label="Увеличить порции"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
      >
        <Plus size={16} />
      </button>
    </div>
  );
}
export function NutritionBar({
  value,
  target = 2000,
}: {
  value: Nutrition;
  target?: number;
}) {
  return (
    <div className="nutrition">
      <div className="nutrition-main">
        <span>
          <Fire size={19} /> <b>{Math.round(value.kcal)}</b>
          <small> / {target} ккал</small>
        </span>
        <span className="muted">за день</span>
      </div>
      <div className="progress-track">
        <span
          style={{ transform: `scaleX(${Math.min(1, value.kcal / target)})` }}
        />
      </div>
      <div className="macros">
        {(
          [
            ["Белки", value.protein],
            ["Жиры", value.fat],
            ["Углеводы", value.carbs],
          ] as const
        ).map(([label, v], i) => (
          <div key={label}>
            <i className={`macro-dot m${i}`} />
            <span>{label}</span>
            <b>{Math.round(v)} г</b>
          </div>
        ))}
      </div>
    </div>
  );
}
export function RecipeCard({
  recipe,
  state,
  onOpen,
  onFavorite,
  onPlan,
  index = 0,
}: {
  recipe: Recipe;
  state: AppState;
  onOpen: (r: Recipe) => void;
  onFavorite: (r: Recipe) => void;
  onPlan: (r: Recipe) => void;
  index?: number;
}) {
  const saved = state.favorites.includes(recipe.id);
  const n = nutrition(recipe);
  return (
    <motion.article
      layout="position"
      className={`recipe-card recipe-tone-${index % 3}`}
      initial={false}
      transition={{ duration: 0.2 }}
      draggable
      onDragStart={(e) => {
        (e as unknown as React.DragEvent).dataTransfer?.setData(
          "text/recipe",
          recipe.id,
        );
      }}
    >
      <div className="recipe-photo">
        <button
          className="photo-link"
          onClick={() => onOpen(recipe)}
          aria-label={`Открыть рецепт: ${recipe.title}`}
        >
          <img
            src={recipe.image}
            alt={recipe.title}
            loading="lazy"
            width={1100}
            height={733}
          />
        </button>
        <button
          className={`favorite-button ${saved ? "saved" : ""}`}
          aria-label={saved ? "Убрать из избранного" : "В избранное"}
          aria-pressed={saved}
          onClick={() => onFavorite(recipe)}
        >
          <Heart size={21} weight={saved ? "fill" : "regular"} />
        </button>
      </div>
      <div className="recipe-info">
        <span className="photo-tag">
          {recipe.time <= 15 ? "Быстро и просто" : recipe.tags[0]}
        </span>
        <button className="recipe-title" onClick={() => onOpen(recipe)}>
          {recipe.title}
        </button>
        <div className="recipe-meta">
          <span>
            <Clock size={15} />
            {recipe.time} мин
          </span>
          <span>
            <Fire size={15} />
            {Math.round(n.kcal)} ккал
          </span>
          <button
            className="recipe-add"
            aria-label={`Добавить в меню: ${recipe.title}`}
            onClick={() => onPlan(recipe)}
          >
            <Plus size={18} />
          </button>
        </div>
      </div>
    </motion.article>
  );
}
export function Empty({
  title,
  text,
  action,
  onAction,
}: {
  title: string;
  text: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <CookingPot size={32} weight="light" />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action && (
        <button className="button primary" onClick={onAction}>
          {action}
          <ArrowUpRight size={17} />
        </button>
      )}
    </div>
  );
}
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="toggle-row"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
    >
      <span>{label}</span>
      <span className={`toggle ${checked ? "on" : ""}`}>
        <span>{checked && <Check size={10} />}</span>
      </span>
    </button>
  );
}
export function TimerPill({
  id,
  title,
  end,
  onRemove,
}: {
  id: string;
  title: string;
  end: number;
  onRemove: (id: string) => void;
}) {
  const [left, setLeft] = useState(
    Math.max(0, Math.ceil((end - Date.now()) / 1000)),
  );
  useEffect(() => {
    const interval = setInterval(
      () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000))),
      500,
    );
    return () => clearInterval(interval);
  }, [end]);
  return (
    <div className={`timer-pill ${left === 0 ? "finished" : ""}`} role="status">
      <Clock size={16} />
      <span>
        {left === 0
          ? "Таймер завершён"
          : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`}
      </span>
      <small>{title}</small>
      <button
        className="icon-button"
        aria-label="Удалить таймер"
        onClick={() => onRemove(id)}
      >
        <X size={14} />
      </button>
    </div>
  );
}
