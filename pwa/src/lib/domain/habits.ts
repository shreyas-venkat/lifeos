/**
 * Habit completion logic -- streak increment upsert.
 *
 * Ported from src/api/routes/habits.ts (complete endpoint)
 */
import { query } from '$lib/db';

export async function completeHabit(
  habitId: string,
): Promise<{ success: boolean; completed: number }> {
  // Check habit exists and is active
  const habits = await query(
    `SELECT id, target_per_day FROM lifeos.habits WHERE id = $1 AND active = true`,
    habitId,
  );

  if (habits.length === 0) {
    throw new Error('Habit not found or inactive');
  }

  // Check for existing log entry today
  const existing = await query(
    `SELECT id, completed FROM lifeos.habit_log WHERE habit_id = $1 AND log_date = (NOW() AT TIME ZONE 'America/Edmonton')::DATE`,
    habitId,
  );

  let completed: number;

  if (existing.length > 0) {
    const row = existing[0] as Record<string, unknown>;
    completed = (Number(row.completed) || 0) + 1;
    await query(
      `UPDATE lifeos.habit_log SET completed = $1 WHERE id = $2`,
      completed,
      row.id as string,
    );
  } else {
    completed = 1;
    const logId = crypto.randomUUID();
    await query(
      `INSERT INTO lifeos.habit_log (id, habit_id, log_date, completed)
       VALUES ($1, $2, (NOW() AT TIME ZONE 'America/Edmonton')::DATE, 1)`,
      logId,
      habitId,
    );
  }

  return { success: true, completed };
}
