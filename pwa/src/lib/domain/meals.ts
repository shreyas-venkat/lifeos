/**
 * Meal plan logic -- pantry deduction when a meal is marked as cooked.
 *
 * Ported from src/api/routes/meals.ts (updateStatus cooked logic)
 */
import { query } from '$lib/db';

export async function deductPantryForMeal(mealPlanId: string): Promise<void> {
  const plans = await query(
    `SELECT recipe_id FROM lifeos.meal_plans WHERE id = $1`,
    mealPlanId,
  );
  const plan = plans[0] as { recipe_id?: string } | undefined;

  if (!plan?.recipe_id) return;

  const recipes = await query(
    `SELECT ingredients FROM lifeos.recipes WHERE id = $1`,
    plan.recipe_id,
  );
  const recipe = recipes[0] as { ingredients?: string } | undefined;

  if (!recipe?.ingredients) return;

  const ingredients =
    typeof recipe.ingredients === 'string'
      ? JSON.parse(recipe.ingredients)
      : recipe.ingredients;

  if (!Array.isArray(ingredients)) return;

  for (const ingredient of ingredients) {
    const name =
      typeof ingredient === 'string'
        ? ingredient
        : ingredient?.name || ingredient?.item;
    if (!name) continue;

    const pantryItems = await query(
      `SELECT id, quantity FROM lifeos.pantry
       WHERE LOWER(item) = LOWER($1) AND quantity > 0`,
      String(name),
    );

    if (pantryItems.length > 0) {
      const item = pantryItems[0] as {
        id: string;
        quantity: number;
      };
      const qty =
        typeof ingredient === 'object' && ingredient?.quantity
          ? Number(ingredient.quantity)
          : 1;
      const newQty = Math.max(0, item.quantity - qty);
      await query(
        `UPDATE lifeos.pantry SET quantity = $1 WHERE id = $2`,
        newQty,
        item.id,
      );
    }
  }
}
