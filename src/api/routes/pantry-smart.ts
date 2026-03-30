import { Router, Request, Response } from 'express';
import { query } from '../db.js';

export const pantrySmartRouter = Router();

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

// GET /alerts — expiring, depleted, and stale pantry items
pantrySmartRouter.get('/alerts', async (_req: Request, res: Response) => {
  try {
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

    res.json({ data: { expiring, depleted, stale } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /suggestions — recipe suggestions based on pantry contents
pantrySmartRouter.get('/suggestions', async (_req: Request, res: Response) => {
  try {
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
        times_cooked: number;
        prep_time_min: number | null;
        cook_time_min: number | null;
        servings: number | null;
        tags: string[] | null;
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
          times_cooked: recipe.times_cooked,
          prep_time_min: recipe.prep_time_min,
          cook_time_min: recipe.cook_time_min,
          servings: recipe.servings,
          tags: recipe.tags,
        },
        match_pct: matchPct,
        missing,
      });
    }

    suggestions.sort((a, b) => b.match_pct - a.match_pct);

    res.json({ data: suggestions.slice(0, 5) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.status(500).json({ error: message });
  }
});

// GET /shopping-needs — ingredients needed from this week's meal plan
pantrySmartRouter.get(
  '/shopping-needs',
  async (_req: Request, res: Response) => {
    try {
      // Get this week's meal plan recipe IDs
      const mealPlanRows = await query<{ recipe_id: string | null }>(
        `SELECT recipe_id
         FROM lifeos.meal_plans
         WHERE week_start BETWEEN CURRENT_DATE - INTERVAL '6' DAY
                               AND CURRENT_DATE + INTERVAL '6' DAY`,
      );

      const recipeIds = mealPlanRows
        .map((r) => r.recipe_id)
        .filter((id): id is string => id !== null);

      if (recipeIds.length === 0) {
        res.json({ data: [] });
        return;
      }

      // Fetch recipes for those IDs
      const placeholders = recipeIds.map((_, i) => `$${i + 1}`).join(', ');
      const recipes = await query<{
        id: string;
        name: string;
        ingredients: string | null;
      }>(
        `SELECT id, name, ingredients
         FROM lifeos.recipes
         WHERE id IN (${placeholders})`,
        ...recipeIds,
      );

      // Collect all unique ingredients across all recipes
      const allIngredients = new Map<string, string[]>();
      for (const recipe of recipes) {
        const ingredients = parseIngredients(recipe.ingredients);
        for (const ing of ingredients) {
          const lower = ing.toLowerCase();
          if (!allIngredients.has(lower)) {
            allIngredients.set(lower, []);
          }
          allIngredients.get(lower)!.push(recipe.name);
        }
      }

      // Get pantry items
      const pantryItems = await query<PantryRow>(
        `SELECT id, item, quantity, unit, category, expiry_date, updated_at
         FROM lifeos.pantry`,
      );
      const pantryNames = pantryItems.map((p) => p.item.toLowerCase());

      // Find ingredients not in pantry
      const needs: Array<{ ingredient: string; needed_for: string[] }> = [];
      for (const [ingredient, recipesNeeded] of allIngredients) {
        if (!ingredientMatchesPantry(ingredient, pantryNames)) {
          needs.push({ ingredient, needed_for: recipesNeeded });
        }
      }

      needs.sort((a, b) => a.ingredient.localeCompare(b.ingredient));

      res.json({ data: needs });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      res.status(500).json({ error: message });
    }
  },
);
