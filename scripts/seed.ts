import { writeFileSync } from "node:fs";
import { products, recipes } from "../src/data.ts";
const q = (s: string) => `'${s.replaceAll("'", "''")}'`;
const sql = [
  ...products.map(
    (p) =>
      `INSERT OR IGNORE INTO products(id,data) VALUES (${q(p.id)},${q(JSON.stringify(p))});`,
  ),
  ...recipes.map(
    (r, i) =>
      `INSERT OR IGNORE INTO recipes(id,data,sort_order) VALUES (${q(r.id)},${q(JSON.stringify(r))},${i});`,
  ),
];
writeFileSync("migrations/0002_catalog.sql", sql.join("\n") + "\n");
console.log(
  `Каталог: ${recipes.length} рецептов, ${products.length} продуктов.`,
);
