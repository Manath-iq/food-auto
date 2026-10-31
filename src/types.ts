export type Nutrition = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};
export type Product = {
  id: string;
  name: string;
  category: string;
  unit: "г" | "мл" | "шт";
  gramsPerUnit: number;
  nutrition: Nutrition;
  price: number;
  staple?: boolean;
  allergens: string[];
};
export type Ingredient = { productId: string; quantity: number };
export type Recipe = {
  id: string;
  title: string;
  description: string;
  category: string;
  image: string;
  time: number;
  portions: number;
  difficulty: "Легко" | "Средне";
  ingredients: Ingredient[];
  steps: { text: string; minutes?: number }[];
  tags: string[];
  source: "editorial" | "personal" | "ai";
  version: number;
  cookedWeight?: number;
};
export const meals = [
  "Завтрак",
  "Второй завтрак",
  "Обед",
  "Полдник",
  "Ужин",
  "Дополнительно",
] as const;
export type Meal = (typeof meals)[number];
export type PlanEntry = {
  id: string;
  date: string;
  meal: Meal;
  portions: number;
  recipe: Recipe;
};
export type StockItem = {
  id: string;
  productId: string;
  quantity: number;
  expires: string;
  note: string;
  added: string;
};
export type ShoppingItem = {
  id: string;
  productId: string;
  quantity: number;
  checked: boolean;
  source: "manual" | "recipe";
};
export type Preferences = {
  portions: number;
  kcal: number;
  excluded: string;
  diet: string;
  maxTime: number;
  budget: number;
  notifications: boolean;
};
export type AppState = {
  favorites: string[];
  plan: PlanEntry[];
  pantry: StockItem[];
  shopping: ShoppingItem[];
  checked: Record<string, number>;
  overrides: Record<string, number>;
  hidden: string[];
  notes: Record<string, string>;
  recipes: Recipe[];
  history: { id: string; recipeId: string; title: string; date: string }[];
  preferences: Preferences;
  includeStaples: boolean;
  savedMenus: { id: string; name: string; entries: PlanEntry[] }[];
};
export type AiProposal = {
  message: string;
  recipeIds: string[];
  plan: { recipeId: string; day: number; meal: Meal; portions: number }[];
  recipe?: Recipe;
};
export type TelegramUser = {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
};
