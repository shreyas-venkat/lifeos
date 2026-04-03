/**
 * Pantry smart features -- expiry alerts, recipe suggestions based
 * on pantry contents, and ingredient matching.
 *
 * Ported from src/api/routes/pantry-smart.ts
 */
import { query } from '$lib/db';

interface PantryRow {
  id: string;
  item: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  expiry_date: string | null;
  updated_at: string;
}

interface RecipeRow {
  id: string;
  name: string;
  calories_per_serving: number | null;
  rating: number | null;
  times_cooked: number;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings: number | null;
  tags: string[] | null;
  ingredients: string | null;
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function parseIngredients(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v: unknown) => typeof v === 'string');
  } catch {
    return [];
  }
}

function ingredientMatchesPantry(
  ingredient: string,
  pantryNames: string[],
): boolean {
  const lower = ingredient.toLowerCase();
  return pantryNames.some(
    (name) => lower.includes(name) || name.includes(lower),
  );
}

export interface PantryAlerts {
  expiring: PantryRow[];
  depleted: PantryRow[];
  stale: PantryRow[];
}

export async function getPantryAlerts(): Promise<PantryAlerts> {
  const items = await query<PantryRow>(
    `SELECT id, item, quantity, unit, category, expiry_date, updated_at
     FROM lifeos.pantry
     ORDER BY item ASC`,
  );

  const now = Date.now();
  const expiring: PantryRow[] = [];
  const depleted: PantryRow[] = [];
  const stale: PantryRow[] = [];

  for (const item of items) {
    if (item.expiry_date) {
      const expiryMs = new Date(item.expiry_date).getTime();
      const diff = expiryMs - now;
      if (diff > 0 && diff <= THREE_DAYS_MS) {
        expiring.push(item);
      }
    }

    if (item.quantity === 0) {
      depleted.push(item);
    }

    if (item.updated_at) {
      const updatedMs = new Date(item.updated_at).getTime();
      if (now - updatedMs > THIRTY_DAYS_MS) {
        stale.push(item);
      }
    }
  }

  return { expiring, depleted, stale };
}

export interface RecipeSuggestion {
  recipe: {
    id: string;
    name: string;
    calories_per_serving: number | null;
    rating: number | null;
  };
  match_pct: number;
  missing: string[];
}

export async function getRecipeSuggestions(): Promise<RecipeSuggestion[]> {
  const pantryItems = await query<PantryRow>(
    `SELECT id, item, quantity, unit, category, expiry_date, updated_at
     FROM lifeos.pantry
     ORDER BY item ASC`,
  );

  const recipes = await query<RecipeRow>(
    `SELECT id, name, calories_per_serving, rating, times_cooked,
            prep_time_min, cook_time_min, servings, tags, ingredients
     FROM lifeos.recipes`,
  );

  const pantryNames = pantryItems.map((p) => p.item.toLowerCase());

  const suggestions: Array<{
    recipe: {
      id: string;
      name: string;
      calories_per_serving: number | null;
      rating: number | null;
    };
    match_pct: number;
    missing: string[];
  }> = [];

  for (const recipe of recipes) {
    const ingredients = parseIngredients(recipe.ingredients);
    if (ingredients.length === 0) continue;

    const matched: string[] = [];
    const missing: string[] = [];

    for (const ing of ingredients) {
      if (ingredientMatchesPantry(ing, pantryNames)) {
        matched.push(ing);
      } else {
        missing.push(ing);
      }
    }

    const matchPct = Math.round((matched.length / ingredients.length) * 100);
    if (matchPct === 0) continue;

    suggestions.push({
      recipe: {
        id: recipe.id,
        name: recipe.name,
        calories_per_serving: recipe.calories_per_serving,
        rating: recipe.rating,
      },
      match_pct: matchPct,
      missing,
    });
  }

  suggestions.sort((a, b) => b.match_pct - a.match_pct);

  return suggestions.slice(0, 5);
}
