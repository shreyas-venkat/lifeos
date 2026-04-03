import { query, queryOrDefault } from '$lib/db';
import { getHealthContext } from '$lib/domain/health-insights';
import { getAllStreaks, getStreakHistory } from '$lib/domain/streaks';
import {
  getCurrentWeeklyReport,
  getWeeklyReportHistory,
} from '$lib/domain/weekly-report';
import { getSleepInsights } from '$lib/domain/sleep-insights';
import { getSpendingForecast } from '$lib/domain/spending-forecast';
import {
  getPantryAlerts,
  getRecipeSuggestions,
} from '$lib/domain/pantry-smart';
import { deductPantryForMeal } from '$lib/domain/meals';
import { completeHabit } from '$lib/domain/habits';

const BASE = '/api';

/** Get local date string (YYYY-MM-DD) -- avoids UTC midnight crossover issues */
export function localDateStr(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('lifeos_token') || '';
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': token,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  // API routes wrap results in { data: [...] } -- unwrap if present
  if (json && typeof json === 'object' && 'data' in json) {
    return json.data as T;
  }
  return json as T;
}

/** Safe wrapper: returns fallback on any error */
async function fetchSafe<T>(
  path: string,
  fallback: T,
  options?: RequestInit,
): Promise<T> {
  try {
    const result = await fetchApi<T>(path, options);
    if (result === null || result === undefined) return fallback;
    return result;
  } catch {
    return fallback;
  }
}

// --- TypeScript interfaces matching actual MotherDuck columns ---

export interface HealthMetric {
  metric_type: string;
  value: number;
  unit: string | null;
  recorded_at: string;
}

export interface HealthHistoryPoint {
  date: string;
  metric_type: string;
  avg_value: number;
  min_value: number;
  max_value: number;
  readings: number;
}

export interface MealPlanRecord {
  id: string;
  week_start: string;
  day_of_week: number;
  meal_type: string;
  status: string;
  notes: string | null;
  servings: number;
  recipe_id: string | null;
  recipe_name: string | null;
  calories_per_serving: number | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
}

export interface RecipeSummary {
  id: string;
  name: string;
  calories_per_serving: number | null;
  rating: number | null;
  times_cooked: number;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings: number | null;
  tags: string[] | null;
  favorited?: boolean;
}

export interface RecipeDetail {
  id: string;
  name: string;
  ingredients: string[];
  instructions: string;
  calories_per_serving: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  prep_time_min: number | null;
  cook_time_min: number | null;
  servings: number | null;
  rating: number | null;
  tags: string[] | null;
}

export interface CalorieEntry {
  id: string;
  meal_type: string;
  description: string | null;
  source: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  created_at: string;
}

export interface DailyCalorieSummary {
  log_date: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  entries: number;
}

export interface PantryItem {
  id: string;
  item: string;
  quantity: number | null;
  unit: string | null;
  category: string | null;
  expiry_date: string | null;
  updated_at: string;
}

export interface PantryAlerts {
  expiring: PantryItem[];
  depleted: PantryItem[];
  stale: PantryItem[];
}

export interface RecipeSuggestion {
  recipe: { id: string; name: string; calories_per_serving: number | null; rating: number | null };
  match_pct: number;
  missing: string[];
}

export interface SupplementWithStatus {
  supplement_id: string;
  name: string;
  default_dosage: number;
  unit: string;
  time_of_day: string;
  log_id: string | null;
  recommended_dosage: number | null;
  reason: string | null;
  taken: boolean;
  log_date: string | null;
}

export interface PreferenceRow {
  key: string;
  value: string;
  skill: string;
}

export interface Transaction {
  id: string;
  amount: number;
  merchant: string | null;
  category: string | null;
  description: string | null;
  transaction_date: string;
  source: string;
  created_at: string;
}

export interface CategorySummary {
  category: string;
  total: number;
  count: number;
}

export interface MonthlyTotal {
  month: string;
  total: number;
}

export interface BudgetInfo {
  budget: number;
  spent: number;
  remaining: number;
  percent_used: number;
}

export interface ForecastCategoryProjection {
  category: string;
  total: number;
  projected: number;
}

export interface SpendingForecast {
  current_month_total: number;
  days_elapsed: number;
  daily_average: number;
  projected_total: number;
  last_month_total: number;
  change_pct: number;
  by_category: ForecastCategoryProjection[];
}

// --- Habits ---
export interface Habit {
  id: string;
  name: string;
  description: string | null;
  frequency: string;
  target_per_day: number;
  color: string;
  icon: string;
  active: boolean;
  created_at: string;
  /** Populated via LEFT JOIN with habit_log for today */
  completed: number;
  notes?: string | null;
}

export interface HabitHistoryEntry {
  /** Habit ID (from habits table) */
  id: string;
  habit_id?: string;
  name: string;
  color: string;
  icon: string;
  target_per_day: number;
  log_date: string;
  completed: number;
}

// --- Exercise ---
export interface ExerciseLogEntry {
  id: string;
  log_date: string;
  exercise_type: string;
  duration_min: number | null;
  sets: number | null;
  reps: number | null;
  weight_kg: number | null;
  distance_km: number | null;
  calories_burned: number | null;
  notes: string | null;
  created_at: string;
}

export interface ExerciseHistoryDay {
  log_date: string;
  exercise_count: number;
  total_duration: number;
  total_calories: number;
}

export interface ExerciseTemplate {
  id: string;
  name: string;
  category: string;
  default_sets: number | null;
  default_reps: number | null;
  muscles_targeted: string[] | null;
  created_at: string;
}

// --- Body ---
export interface BodyMetricLatest {
  metric_type: string;
  value: number;
  unit: string | null;
  recorded_at: string;
}

export interface BodyHistoryPoint {
  date: string;
  metric_type: string;
  avg_value: number;
}

// --- Sleep ---
export interface SleepMetric {
  metric_type: string;
  value: number;
  unit: string | null;
  recorded_at: string;
}

export interface SleepHistoryPoint {
  date: string;
  metric_type: string;
  avg_value: number;
  min_value: number;
  max_value: number;
  /** Alias for avg_value -- Svelte pages use .value */
  value: number;
}

export interface SleepInsight {
  text: string;
  type: string;
  source: string;
}

// --- Calendar ---
export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  /** Google Calendar API returns camelCase */
  startTime: string;
  /** Google Calendar API returns camelCase */
  endTime: string;
  location: string | null;
  description: string | null;
}

// --- Reminders ---
export interface Reminder {
  id: string;
  message: string;
  due_at: string;
  recurring_cron: string | null;
  status: string;
  created_at: string;
}

// --- Streaks ---
export interface Streak {
  type: string;
  current: number;
  longest: number;
  last_completed: string | null;
  /** Alias -- Svelte StreakCard uses .currentStreak */
  currentStreak: number;
  /** Alias -- Svelte StreakCard uses .longestStreak */
  longestStreak: number;
}

export interface StreakHistoryDay {
  date: string;
  completed: boolean;
}

// --- Bills ---
export interface Bill {
  id: string;
  name: string;
  amount: number | null;
  merchant: string | null;
  due_date: string | null;
  recurring: string | null;
  status: string;
  created_at: string;
}

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  url: string | null;
  created_at: string;
}

export interface UsageSummary {
  period: string;
  totals: {
    total_cost: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_requests: number;
  };
  byTask: Array<{
    task_id: string | null;
    cost: number;
    input_tokens: number;
    output_tokens: number;
    requests: number;
  }>;
  byModel: Array<{
    model: string | null;
    cost: number;
    input_tokens: number;
    output_tokens: number;
    requests: number;
  }>;
  daily: Array<{
    date: string;
    cost: number;
    input_tokens: number;
    output_tokens: number;
    requests: number;
  }>;
}

export interface Package {
  id: string;
  merchant: string;
  tracking_number: string;
  carrier: string;
  status: string;
  expected_delivery: string | null;
  actual_delivery: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  name: string;
  amount: number;
  frequency: string;
  category: string;
  active: boolean;
  last_charged: string | null;
  created_at: string;
}

export interface SubscriptionSummary {
  monthly_total: number;
  count: number;
}

export interface WeeklyReport {
  week: string;
  generated_at: string;
  health: {
    avg_steps: number | null;
    avg_hr: number | null;
    avg_sleep: number | null;
    weight_change: number | null;
  };
  meals: {
    cooked: number;
    skipped: number;
    ate_out: number;
    avg_calories: number | null;
  };
  supplements: {
    adherence_pct: number | null;
    missed_days: string[];
  };
  exercise: {
    sessions: number;
    total_duration_min: number;
  };
  highlights: string[];
}

/** Exported for direct use in dashboard */
export { fetchSafe };

function dateParam(date?: string): string {
  return date ? `?date=${encodeURIComponent(date)}` : '';
}

// ====================================================================
// BODY_METRICS constant for body endpoints
// ====================================================================
const BODY_METRICS = ['weight', 'bmi', 'body_fat', 'muscle_mass', 'body_water', 'bmr'] as const;
const BODY_METRICS_SQL = BODY_METRICS.map((m) => `'${m}'`).join(', ');

// ====================================================================
// FIELD_MAP for body log
// ====================================================================
const BODY_FIELD_MAP: { field: string; metric: string; unit: string }[] = [
  { field: 'weight', metric: 'weight', unit: 'kg' },
  { field: 'body_fat', metric: 'body_fat', unit: '%' },
  { field: 'muscle_mass', metric: 'muscle_mass', unit: '%' },
];

// ====================================================================
// Usage period helper
// ====================================================================
function periodToInterval(period: string): string {
  const today = "(NOW() AT TIME ZONE 'America/Edmonton')::DATE";
  switch (period) {
    case 'today':
      return today;
    case 'week':
      return `${today} - INTERVAL '7' DAY`;
    case 'month':
      return `${today} - INTERVAL '30' DAY`;
    default:
      return today;
  }
}

// ====================================================================
// TABLE_NAMES for export
// ====================================================================
const TABLE_NAMES = [
  'health_metrics',
  'supplements',
  'supplement_log',
  'recipes',
  'meal_plans',
  'calorie_log',
  'pantry',
  'preferences',
  'emails',
  'bills',
  'reminders',
] as const;

export const api = {
  health: {
    today: async (date?: string): Promise<HealthMetric[]> => {
      try {
        const d = date || localDateStr();
        return await query<HealthMetric>(
          `WITH normalized AS (
             SELECT
               CASE WHEN metric_type = 'oxygen_saturation' THEN 'spo2' ELSE metric_type END AS metric_type,
               value, unit, recorded_at
             FROM lifeos.health_metrics
             WHERE recorded_at >= CAST('${d}' AS DATE)
           ),
           summed AS (
             SELECT metric_type, MAX(value) AS value, MAX(unit) AS unit, MAX(recorded_at) AS recorded_at
             FROM normalized
             WHERE metric_type = 'steps'
             GROUP BY metric_type
           ),
           maxed AS (
             SELECT metric_type, MAX(value) AS value, MAX(unit) AS unit, MAX(recorded_at) AS recorded_at
             FROM normalized
             WHERE metric_type = 'sleep_duration' AND value > 0
             GROUP BY metric_type
           ),
           ranked AS (
             SELECT metric_type, value, unit, recorded_at,
                    ROW_NUMBER() OVER (PARTITION BY metric_type ORDER BY recorded_at DESC) AS rn
             FROM normalized
             WHERE metric_type NOT IN ('steps', 'sleep_duration')
           ),
           latest AS (
             SELECT metric_type, value, unit, recorded_at
             FROM ranked WHERE rn = 1
           )
           SELECT * FROM summed
           UNION ALL SELECT * FROM maxed
           UNION ALL SELECT * FROM latest`,
        );
      } catch {
        return [];
      }
    },

    history: async (days = 30, metric = 'all'): Promise<HealthHistoryPoint[]> => {
      try {
        const sql =
          metric === 'all'
            ? `SELECT CAST(recorded_at AS DATE) AS date, metric_type,
                      AVG(value) AS avg_value, MIN(value) AS min_value,
                      MAX(value) AS max_value, COUNT(*) AS readings
               FROM lifeos.health_metrics
               WHERE recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(days)}' DAY
               GROUP BY CAST(recorded_at AS DATE), metric_type
               ORDER BY date ASC, metric_type`
            : `SELECT CAST(recorded_at AS DATE) AS date, metric_type,
                      AVG(value) AS avg_value, MIN(value) AS min_value,
                      MAX(value) AS max_value, COUNT(*) AS readings
               FROM lifeos.health_metrics
               WHERE recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(days)}' DAY
                 AND metric_type = $1
               GROUP BY CAST(recorded_at AS DATE), metric_type
               ORDER BY date ASC, metric_type`;

        return metric === 'all'
          ? await query<HealthHistoryPoint>(sql)
          : await query<HealthHistoryPoint>(sql, metric);
      } catch {
        return [];
      }
    },

    context: async (
      metric: string,
      date?: string,
    ): Promise<{
      metric: string;
      date: string;
      value: number | null;
      insights: { text: string; type: string; source: string }[];
    }> => {
      try {
        return await getHealthContext(metric, date);
      } catch {
        return { metric, date: date || '', value: null, insights: [] };
      }
    },
  },

  meals: {
    plan: async (week = 'current'): Promise<MealPlanRecord[]> => {
      try {
        const weekFilter =
          week === 'current'
            ? `mp.week_start BETWEEN (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '6' DAY AND (NOW() AT TIME ZONE 'America/Edmonton')::DATE + INTERVAL '6' DAY`
            : `mp.week_start BETWEEN (NOW() AT TIME ZONE 'America/Edmonton')::DATE + INTERVAL '1' DAY AND (NOW() AT TIME ZONE 'America/Edmonton')::DATE + INTERVAL '13' DAY`;

        return await query<MealPlanRecord>(
          `SELECT mp.id, mp.week_start, mp.day_of_week, mp.meal_type, mp.status,
                  mp.notes, mp.servings, mp.recipe_id,
                  r.name AS recipe_name, r.calories_per_serving,
                  r.prep_time_min, r.cook_time_min
           FROM lifeos.meal_plans mp
           LEFT JOIN lifeos.recipes r ON mp.recipe_id = r.id
           WHERE ${weekFilter}
           ORDER BY mp.day_of_week, mp.meal_type`,
        );
      } catch {
        return [];
      }
    },

    updateStatus: async (id: string, status: string): Promise<void> => {
      await query(
        `UPDATE lifeos.meal_plans SET status = $1 WHERE id = $2`,
        status,
        id,
      );

      // Auto-deduct pantry when status changes to 'cooked'
      if (status === 'cooked') {
        try {
          await deductPantryForMeal(id);
        } catch {
          // Best-effort: pantry deduction failures should not fail the status update
        }
      }
    },

    recipes: async (search = ''): Promise<RecipeSummary[]> => {
      try {
        const sql = search
          ? `SELECT id, name, calories_per_serving, rating, times_cooked, prep_time_min, cook_time_min, servings, tags
             FROM lifeos.recipes
             WHERE name ILIKE '%' || $1 || '%'
             ORDER BY rating DESC NULLS LAST, times_cooked DESC
             LIMIT 20`
          : `SELECT id, name, calories_per_serving, rating, times_cooked, prep_time_min, cook_time_min, servings, tags
             FROM lifeos.recipes
             ORDER BY rating DESC NULLS LAST, times_cooked DESC
             LIMIT 20`;

        return search
          ? await query<RecipeSummary>(sql, search)
          : await query<RecipeSummary>(sql);
      } catch {
        return [];
      }
    },

    recipeDetail: async (id: string): Promise<RecipeDetail | null> => {
      try {
        const rows = await query<RecipeDetail>(
          `SELECT *
           FROM lifeos.recipes
           WHERE id = $1`,
          id,
        );
        return rows.length > 0 ? rows[0] : null;
      } catch {
        return null;
      }
    },

    toggleFavorite: async (id: string): Promise<{ success: boolean; favorited: boolean }> => {
      const existing = await query(
        `SELECT recipe_id FROM lifeos.recipe_favorites WHERE recipe_id = $1`,
        id,
      );

      if (existing.length > 0) {
        await query(
          `DELETE FROM lifeos.recipe_favorites WHERE recipe_id = $1`,
          id,
        );
        return { success: true, favorited: false };
      } else {
        await query(
          `INSERT INTO lifeos.recipe_favorites (recipe_id) VALUES ($1)`,
          id,
        );
        return { success: true, favorited: true };
      }
    },
  },

  pantry: {
    list: async (): Promise<PantryItem[]> => {
      try {
        return await query<PantryItem>(
          `SELECT id, item, quantity, unit, category, expiry_date, updated_at
           FROM lifeos.pantry
           ORDER BY category, item ASC`,
        );
      } catch {
        return [];
      }
    },

    uploadPhoto: async (base64: string): Promise<void> => {
      // Photo upload still goes through Express (needs server-side processing)
      await fetchApi<void>('/pantry/photo', {
        method: 'POST',
        body: JSON.stringify({ image: base64 }),
      });
    },

    add: async (item: Omit<PantryItem, 'id' | 'updated_at'>): Promise<PantryItem> => {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.pantry (id, item, quantity, unit, category, expiry_date)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        id,
        String(item.item),
        Number(item.quantity) || 0,
        String(item.unit || ''),
        String(item.category || ''),
        item.expiry_date ? String(item.expiry_date) : null,
      );
      return {
        id,
        ...item,
        updated_at: new Date().toISOString(),
      } as PantryItem;
    },

    remove: async (id: string): Promise<void> => {
      await query(`DELETE FROM lifeos.pantry WHERE id = $1`, id);
    },

    update: async (id: string, data: Partial<PantryItem>): Promise<PantryItem> => {
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (data.item !== undefined) {
        sets.push(`item = $${idx++}`);
        params.push(String(data.item));
      }
      if (data.quantity !== undefined) {
        sets.push(`quantity = $${idx++}`);
        params.push(Number(data.quantity));
      }
      if (data.unit !== undefined) {
        sets.push(`unit = $${idx++}`);
        params.push(String(data.unit));
      }
      if (data.category !== undefined) {
        sets.push(`category = $${idx++}`);
        params.push(String(data.category));
      }
      if (data.expiry_date !== undefined) {
        sets.push(`expiry_date = $${idx++}`);
        params.push(data.expiry_date === null ? null : String(data.expiry_date));
      }

      if (sets.length > 0) {
        params.push(id);
        await query(
          `UPDATE lifeos.pantry SET ${sets.join(', ')} WHERE id = $${idx}`,
          ...params,
        );
      }

      return { id, ...data, updated_at: new Date().toISOString() } as PantryItem;
    },

    alerts: async (): Promise<PantryAlerts> => {
      try {
        return await getPantryAlerts();
      } catch {
        return { expiring: [], depleted: [], stale: [] };
      }
    },

    suggestions: async (): Promise<RecipeSuggestion[]> => {
      try {
        return await getRecipeSuggestions();
      } catch {
        return [];
      }
    },
  },

  supplements: {
    today: async (date?: string): Promise<SupplementWithStatus[]> => {
      try {
        const d = date || localDateStr();
        return await query<SupplementWithStatus>(
          `SELECT s.id AS supplement_id, s.name, s.default_dosage, s.unit, s.time_of_day,
                  sl.id AS log_id, sl.recommended_dosage, sl.reason, sl.taken, sl.log_date
           FROM lifeos.supplements s
           LEFT JOIN lifeos.supplement_log sl ON s.id = sl.supplement_id AND sl.log_date = CAST('${d}' AS DATE)
           WHERE s.active = true
           ORDER BY s.time_of_day ASC`,
        );
      } catch {
        return [];
      }
    },

    markTaken: async (id: string): Promise<void> => {
      const logId = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.supplement_log (id, supplement_id, taken, log_date, time_of_day)
         VALUES ($1, $2, true, (NOW() AT TIME ZONE 'America/Edmonton')::DATE, 'morning')
         ON CONFLICT (id) DO UPDATE SET taken = true`,
        logId,
        id,
      );
    },

    add: async (supp: {
      name: string;
      dosage: number;
      unit: string;
      time_of_day: string;
    }): Promise<SupplementWithStatus> => {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.supplements (id, name, default_dosage, unit, time_of_day, active)
         VALUES ($1, $2, $3, $4, $5, true)`,
        id,
        supp.name,
        Number(supp.dosage) || 0,
        String(supp.unit || ''),
        String(supp.time_of_day || 'morning'),
      );
      return {
        supplement_id: id,
        name: supp.name,
        default_dosage: Number(supp.dosage) || 0,
        unit: supp.unit || '',
        time_of_day: supp.time_of_day || 'morning',
        log_id: null,
        recommended_dosage: null,
        reason: null,
        taken: false,
        log_date: null,
      };
    },

    remove: async (id: string): Promise<void> => {
      await query(`DELETE FROM lifeos.supplements WHERE id = $1`, id);
    },

    update: async (id: string, data: Partial<SupplementWithStatus>): Promise<SupplementWithStatus> => {
      const sets: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (data.default_dosage !== undefined) {
        sets.push(`default_dosage = $${idx++}`);
        params.push(Number(data.default_dosage));
      }
      if (data.unit !== undefined) {
        sets.push(`unit = $${idx++}`);
        params.push(String(data.unit));
      }
      if (data.time_of_day !== undefined) {
        sets.push(`time_of_day = $${idx++}`);
        params.push(String(data.time_of_day));
      }

      if (sets.length > 0) {
        params.push(id);
        await query(
          `UPDATE lifeos.supplements SET ${sets.join(', ')} WHERE id = $${idx}`,
          ...params,
        );
      }

      return { supplement_id: id, ...data } as SupplementWithStatus;
    },
  },

  calories: {
    today: async (date?: string): Promise<CalorieEntry[]> => {
      try {
        const d = date || localDateStr();
        return await query<CalorieEntry>(
          `SELECT id, meal_type, description, source, calories, protein_g, carbs_g, fat_g, fiber_g, created_at
           FROM lifeos.calorie_log
           WHERE log_date = CAST('${d}' AS DATE)
           ORDER BY created_at ASC`,
        );
      } catch {
        return [];
      }
    },

    history: async (days = 30): Promise<DailyCalorieSummary[]> => {
      try {
        return await query<DailyCalorieSummary>(
          `SELECT log_date,
                  SUM(calories) AS calories,
                  SUM(protein_g) AS protein_g,
                  SUM(carbs_g) AS carbs_g,
                  SUM(fat_g) AS fat_g,
                  COUNT(*) AS entries
           FROM lifeos.calorie_log
           WHERE log_date >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(days)}' DAY
           GROUP BY log_date
           ORDER BY log_date ASC`,
        );
      } catch {
        return [];
      }
    },

    log: async (entry: {
      meal_type: string;
      description: string;
      calories: number;
      protein_g?: number;
      carbs_g?: number;
      fat_g?: number;
    }): Promise<CalorieEntry> => {
      const id = crypto.randomUUID();
      const d = localDateStr();
      await query(
        `INSERT INTO lifeos.calorie_log (id, meal_type, description, calories, protein_g, carbs_g, fat_g, log_date, source)
         VALUES ($1, $2, $3, $4, $5, $6, $7, CAST('${d}' AS DATE), 'manual')`,
        id,
        entry.meal_type,
        entry.description,
        entry.calories !== undefined ? Number(entry.calories) : null,
        entry.protein_g !== undefined ? Number(entry.protein_g) : null,
        entry.carbs_g !== undefined ? Number(entry.carbs_g) : null,
        entry.fat_g !== undefined ? Number(entry.fat_g) : null,
      );
      return {
        id,
        meal_type: entry.meal_type,
        description: entry.description,
        source: 'manual',
        calories: entry.calories ?? null,
        protein_g: entry.protein_g ?? null,
        carbs_g: entry.carbs_g ?? null,
        fat_g: entry.fat_g ?? null,
        fiber_g: null,
        created_at: new Date().toISOString(),
      };
    },
  },

  preferences: {
    get: async (): Promise<PreferenceRow[]> => {
      try {
        return await query<PreferenceRow>(
          `SELECT key, value, skill, updated_at
           FROM lifeos.preferences
           ORDER BY skill, key`,
        );
      } catch {
        return [];
      }
    },

    update: async (
      prefs: Record<string, string> | Array<{ key: string; value: string; skill?: string }>,
    ): Promise<void> => {
      if (Array.isArray(prefs)) {
        for (const pref of prefs) {
          const skill = pref.skill ?? 'general';
          await query(
            `INSERT INTO lifeos.preferences (key, value, skill)
             VALUES ($1, $2, $3)
             ON CONFLICT (key, skill) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
            pref.key,
            String(pref.value),
            skill,
          );
        }
      } else {
        for (const [key, value] of Object.entries(prefs)) {
          await query(
            `INSERT INTO lifeos.preferences (key, value, skill)
             VALUES ($1, $2, 'general')
             ON CONFLICT (key, skill) DO UPDATE SET value = $2, updated_at = CURRENT_TIMESTAMP`,
            key,
            String(value),
          );
        }
      }
    },
  },

  spending: {
    summary: async (period = 'month'): Promise<CategorySummary[]> => {
      try {
        return await query<CategorySummary>(
          `SELECT category, SUM(amount) as total, COUNT(*) as count
           FROM lifeos.transactions
           WHERE transaction_date >= date_trunc('month', (NOW() AT TIME ZONE 'America/Edmonton')::DATE)
           GROUP BY category
           ORDER BY total DESC`,
        );
      } catch {
        return [];
      }
    },

    history: async (months = 6): Promise<MonthlyTotal[]> => {
      try {
        return await query<MonthlyTotal>(
          `SELECT date_trunc('month', transaction_date) as month, SUM(amount) as total
           FROM lifeos.transactions
           WHERE transaction_date >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(months)}' MONTH
           GROUP BY date_trunc('month', transaction_date)
           ORDER BY month ASC`,
        );
      } catch {
        return [];
      }
    },

    recent: async (): Promise<Transaction[]> => {
      try {
        return await query<Transaction>(
          `SELECT id, amount, merchant, category, description, transaction_date, source, created_at
           FROM lifeos.transactions
           ORDER BY transaction_date DESC, created_at DESC
           LIMIT 20`,
        );
      } catch {
        return [];
      }
    },

    log: async (entry: {
      amount: number;
      merchant: string;
      category: string;
      description?: string;
      date?: string;
    }): Promise<Transaction> => {
      const id = crypto.randomUUID();
      const txDate = entry.date || localDateStr();
      await query(
        `INSERT INTO lifeos.transactions (id, amount, merchant, category, description, transaction_date, source)
         VALUES ($1, $2, $3, $4, $5, $6, 'manual')`,
        id,
        entry.amount,
        entry.merchant,
        entry.category,
        entry.description || null,
        txDate,
      );
      return {
        id,
        amount: entry.amount,
        merchant: entry.merchant,
        category: entry.category,
        description: entry.description || null,
        transaction_date: txDate,
        source: 'manual',
        created_at: new Date().toISOString(),
      };
    },

    remove: async (id: string): Promise<void> => {
      await query(`DELETE FROM lifeos.transactions WHERE id = $1`, id);
    },

    budget: async (): Promise<BudgetInfo | null> => {
      try {
        const rows = await query(
          `SELECT value FROM lifeos.preferences WHERE key = 'monthly_budget' AND skill = 'spending'`,
        );

        if (rows.length === 0) return null;

        const budget = Number((rows[0] as Record<string, unknown>).value);
        if (isNaN(budget)) return null;

        const totalRows = await query(
          `SELECT COALESCE(SUM(amount), 0) as total
           FROM lifeos.transactions
           WHERE transaction_date >= date_trunc('month', (NOW() AT TIME ZONE 'America/Edmonton')::DATE)`,
        );

        const spent = Number((totalRows[0] as Record<string, unknown>).total ?? 0);

        return {
          budget,
          spent,
          remaining: budget - spent,
          percent_used: budget > 0 ? Math.round((spent / budget) * 100) : 0,
        };
      } catch {
        return null;
      }
    },

    forecast: async (): Promise<SpendingForecast | null> => {
      try {
        return await getSpendingForecast();
      } catch {
        return null;
      }
    },
  },

  packages: {
    active: async (): Promise<Package[]> => {
      try {
        return await query<Package>(
          `SELECT id, merchant, tracking_number, carrier, status, expected_delivery, actual_delivery, created_at
           FROM lifeos.packages
           WHERE status != 'delivered'
           ORDER BY expected_delivery ASC NULLS LAST`,
        );
      } catch {
        return [];
      }
    },

    all: async (): Promise<Package[]> => {
      try {
        return await query<Package>(
          `SELECT id, merchant, tracking_number, carrier, status, expected_delivery, actual_delivery, created_at
           FROM lifeos.packages
           ORDER BY created_at DESC`,
        );
      } catch {
        return [];
      }
    },

    add: async (pkg: {
      merchant: string;
      tracking_number?: string;
      carrier?: string;
      expected_delivery?: string;
    }): Promise<Package> => {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.packages (id, merchant, tracking_number, carrier, expected_delivery)
         VALUES ($1, $2, $3, $4, $5)`,
        id,
        pkg.merchant,
        pkg.tracking_number || null,
        pkg.carrier || null,
        pkg.expected_delivery || null,
      );
      return {
        id,
        merchant: pkg.merchant,
        tracking_number: pkg.tracking_number || '',
        carrier: pkg.carrier || '',
        status: 'ordered',
        expected_delivery: pkg.expected_delivery || null,
        actual_delivery: null,
        created_at: new Date().toISOString(),
      };
    },

    updateStatus: async (id: string, status: string): Promise<void> => {
      const actualDelivery =
        status === 'delivered' ? 'CURRENT_TIMESTAMP' : 'actual_delivery';
      await query(
        `UPDATE lifeos.packages SET status = $1, actual_delivery = ${actualDelivery} WHERE id = $2`,
        status,
        id,
      );
    },

    remove: async (id: string): Promise<void> => {
      await query(`DELETE FROM lifeos.packages WHERE id = $1`, id);
    },
  },

  subscriptions: {
    active: async (): Promise<Subscription[]> => {
      try {
        return await query<Subscription>(
          `SELECT id, name, merchant_pattern, amount, frequency, category, active, last_charged, created_at
           FROM lifeos.subscriptions
           WHERE active = true
           ORDER BY name ASC`,
        );
      } catch {
        return [];
      }
    },

    summary: async (): Promise<SubscriptionSummary> => {
      try {
        const row = await queryOrDefault<SubscriptionSummary>(
          `SELECT
             SUM(CASE
               WHEN frequency = 'weekly' THEN amount * 4.33
               WHEN frequency = 'monthly' THEN amount
               WHEN frequency = 'quarterly' THEN amount / 3.0
               WHEN frequency = 'annual' THEN amount / 12.0
               ELSE amount
             END) AS monthly_total,
             COUNT(*) AS count
           FROM lifeos.subscriptions
           WHERE active = true`,
          { monthly_total: 0, count: 0 },
        );
        return {
          monthly_total: row.monthly_total ?? 0,
          count: row.count ?? 0,
        };
      } catch {
        return { monthly_total: 0, count: 0 };
      }
    },

    add: async (sub: {
      name: string;
      amount: number;
      frequency?: string;
      category?: string;
    }): Promise<Subscription> => {
      const id = crypto.randomUUID();
      const freq = sub.frequency || 'monthly';
      await query(
        `INSERT INTO lifeos.subscriptions (id, name, merchant_pattern, amount, frequency, category)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        id,
        sub.name,
        null,
        sub.amount,
        freq,
        sub.category || null,
      );
      return {
        id,
        name: sub.name,
        amount: sub.amount,
        frequency: freq,
        category: sub.category || '',
        active: true,
        last_charged: null,
        created_at: new Date().toISOString(),
      };
    },

    update: async (id: string, data: Partial<Subscription>): Promise<void> => {
      const sets: string[] = [];
      const values: unknown[] = [];
      let paramIdx = 1;

      if (data.name !== undefined) {
        sets.push(`name = $${paramIdx++}`);
        values.push(data.name);
      }
      if (data.amount !== undefined) {
        sets.push(`amount = $${paramIdx++}`);
        values.push(data.amount);
      }
      if (data.frequency !== undefined) {
        sets.push(`frequency = $${paramIdx++}`);
        values.push(data.frequency);
      }
      if (data.category !== undefined) {
        sets.push(`category = $${paramIdx++}`);
        values.push(data.category);
      }
      if (data.active !== undefined) {
        sets.push(`active = $${paramIdx++}`);
        values.push(data.active);
      }

      if (sets.length > 0) {
        values.push(id);
        await query(
          `UPDATE lifeos.subscriptions SET ${sets.join(', ')} WHERE id = $${paramIdx}`,
          ...values,
        );
      }
    },

    remove: async (id: string): Promise<void> => {
      await query(`DELETE FROM lifeos.subscriptions WHERE id = $1`, id);
    },
  },

  notifications: {
    pending: async (): Promise<Notification[]> => {
      try {
        return await query<Notification>(
          `SELECT id, title, body, type, url, created_at
           FROM lifeos.notifications
           WHERE seen = FALSE
           ORDER BY created_at DESC
           LIMIT 50`,
        );
      } catch {
        return [];
      }
    },

    markSeen: async (ids: string[]): Promise<{ success: boolean; count: number }> => {
      if (!ids || ids.length === 0) return { success: false, count: 0 };
      const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
      await query(
        `UPDATE lifeos.notifications SET seen = TRUE WHERE id IN (${placeholders})`,
        ...ids,
      );
      return { success: true, count: ids.length };
    },

    send: async (notification: {
      title: string;
      body: string;
      type?: string;
      url?: string;
    }): Promise<{ success: boolean; id: string }> => {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.notifications (id, title, body, type, url)
         VALUES ($1, $2, $3, $4, $5)`,
        id,
        notification.title,
        notification.body,
        notification.type || 'info',
        notification.url ?? null,
      );
      return { success: true, id };
    },
  },

  export: {
    healthJson: async (): Promise<Record<string, unknown>[]> => {
      return await query<Record<string, unknown>>(
        `SELECT * FROM lifeos.health_metrics ORDER BY recorded_at DESC`,
      );
    },
    healthCsvUrl: () => `${BASE}/export/health?format=csv`,
    allJson: async (): Promise<Record<string, unknown>> => {
      const results: Record<string, unknown[]> = {};

      const queries = TABLE_NAMES.map(async (table) => {
        try {
          const rows = await query(`SELECT * FROM lifeos.${table}`);
          return { table, rows };
        } catch {
          return { table, rows: [] };
        }
      });

      const settled = await Promise.all(queries);
      for (const { table, rows } of settled) {
        results[table] = rows;
      }

      return {
        exported_at: new Date().toISOString(),
        ...results,
      };
    },
  },

  weeklyReport: {
    current: async (): Promise<WeeklyReport | null> => {
      try {
        return await getCurrentWeeklyReport();
      } catch {
        return null;
      }
    },

    history: async (): Promise<WeeklyReport[]> => {
      try {
        return await getWeeklyReportHistory();
      } catch {
        return [];
      }
    },
  },

  usage: {
    summary: async (
      period: 'today' | 'week' | 'month' = 'today',
    ): Promise<UsageSummary | null> => {
      try {
        const since = periodToInterval(period);

        const [totalsRows, byTaskRows, byModelRows, dailyRows] =
          await Promise.all([
            query(
              `SELECT
                 COALESCE(SUM(cost_usd), 0) as total_cost,
                 COALESCE(SUM(input_tokens), 0) as total_input_tokens,
                 COALESCE(SUM(output_tokens), 0) as total_output_tokens,
                 COUNT(*) as total_requests
               FROM lifeos.api_usage
               WHERE created_at >= ${since}`,
            ),
            query(
              `SELECT
                 task_id,
                 COALESCE(SUM(cost_usd), 0) as cost,
                 COALESCE(SUM(input_tokens), 0) as input_tokens,
                 COALESCE(SUM(output_tokens), 0) as output_tokens,
                 COUNT(*) as requests
               FROM lifeos.api_usage
               WHERE created_at >= ${since}
               GROUP BY task_id
               ORDER BY cost DESC`,
            ),
            query(
              `SELECT
                 model,
                 COALESCE(SUM(cost_usd), 0) as cost,
                 COALESCE(SUM(input_tokens), 0) as input_tokens,
                 COALESCE(SUM(output_tokens), 0) as output_tokens,
                 COUNT(*) as requests
               FROM lifeos.api_usage
               WHERE created_at >= ${since}
               GROUP BY model
               ORDER BY cost DESC`,
            ),
            query(
              `SELECT
                 CAST(created_at AS DATE) as date,
                 COALESCE(SUM(cost_usd), 0) as cost,
                 COALESCE(SUM(input_tokens), 0) as input_tokens,
                 COALESCE(SUM(output_tokens), 0) as output_tokens,
                 COUNT(*) as requests
               FROM lifeos.api_usage
               WHERE created_at >= ${since}
               GROUP BY CAST(created_at AS DATE)
               ORDER BY date ASC`,
            ),
          ]);

        const totals = (totalsRows[0] as Record<string, unknown>) || {
          total_cost: 0,
          total_input_tokens: 0,
          total_output_tokens: 0,
          total_requests: 0,
        };

        return {
          period,
          totals: totals as UsageSummary['totals'],
          byTask: byTaskRows as UsageSummary['byTask'],
          byModel: byModelRows as UsageSummary['byModel'],
          daily: dailyRows as UsageSummary['daily'],
        };
      } catch {
        return null;
      }
    },
  },

  habits: {
    list: async (): Promise<Habit[]> => {
      try {
        return await query<Habit>(
          `SELECT h.id, h.name, h.description, h.frequency, h.target_per_day, h.color, h.icon,
                  COALESCE(hl.completed, 0) as completed, hl.notes
           FROM lifeos.habits h
           LEFT JOIN lifeos.habit_log hl ON h.id = hl.habit_id AND hl.log_date = (NOW() AT TIME ZONE 'America/Edmonton')::DATE
           WHERE h.active = true
           ORDER BY h.name`,
        );
      } catch {
        return [];
      }
    },

    history: async (days = 30): Promise<HabitHistoryEntry[]> => {
      try {
        return await query<HabitHistoryEntry>(
          `SELECT h.id, h.name, h.color, h.icon, h.target_per_day,
                  hl.log_date, COALESCE(hl.completed, 0) as completed
           FROM lifeos.habits h
           LEFT JOIN lifeos.habit_log hl ON h.id = hl.habit_id
              AND hl.log_date >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(days)}' DAY
           WHERE h.active = true
           ORDER BY h.name, hl.log_date`,
        );
      } catch {
        return [];
      }
    },

    create: async (habit: {
      name: string;
      description?: string;
      frequency?: string;
      target_per_day?: number;
      color?: string;
      icon?: string;
    }): Promise<Habit> => {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.habits (id, name, description, frequency, target_per_day, color, icon)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        id,
        habit.name.trim(),
        habit.description || null,
        habit.frequency || 'daily',
        habit.target_per_day ?? 1,
        habit.color || '#6366f1',
        habit.icon || '\u2713',
      );
      return {
        id,
        name: habit.name.trim(),
        description: habit.description || null,
        frequency: habit.frequency || 'daily',
        target_per_day: habit.target_per_day ?? 1,
        color: habit.color || '#6366f1',
        icon: habit.icon || '\u2713',
        active: true,
        completed: 0,
        created_at: new Date().toISOString(),
      };
    },

    complete: async (id: string): Promise<{ success: boolean; completed: number }> => {
      return await completeHabit(id);
    },

    remove: async (id: string): Promise<void> => {
      // Soft delete -- deactivate the habit
      await query(`UPDATE lifeos.habits SET active = false WHERE id = $1`, id);
    },
  },

  exercise: {
    today: async (): Promise<ExerciseLogEntry[]> => {
      try {
        return await query<ExerciseLogEntry>(
          `SELECT id, log_date, exercise_type, duration_min, sets, reps,
                  weight_kg, distance_km, calories_burned, notes, created_at
           FROM lifeos.exercise_log
           WHERE log_date = (NOW() AT TIME ZONE 'America/Edmonton')::DATE
           ORDER BY created_at`,
        );
      } catch {
        return [];
      }
    },

    history: async (days = 30): Promise<ExerciseHistoryDay[]> => {
      try {
        return await query<ExerciseHistoryDay>(
          `SELECT log_date,
                  COUNT(*) AS exercise_count,
                  SUM(duration_min) AS total_duration,
                  SUM(calories_burned) AS total_calories
           FROM lifeos.exercise_log
           WHERE log_date >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(days)}' DAY
           GROUP BY log_date
           ORDER BY log_date ASC`,
        );
      } catch {
        return [];
      }
    },

    templates: async (): Promise<ExerciseTemplate[]> => {
      try {
        return await query<ExerciseTemplate>(
          `SELECT id, name, category, default_sets, default_reps, muscles_targeted, created_at
           FROM lifeos.exercise_templates
           ORDER BY category, name`,
        );
      } catch {
        return [];
      }
    },

    log: async (entry: {
      exercise_type: string;
      duration_min?: number;
      sets?: number;
      reps?: number;
      weight_kg?: number;
      distance_km?: number;
      calories_burned?: number;
      notes?: string;
    }): Promise<ExerciseLogEntry> => {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.exercise_log (id, log_date, exercise_type, duration_min, sets, reps, weight_kg, distance_km, calories_burned, notes)
         VALUES ($1, (NOW() AT TIME ZONE 'America/Edmonton')::DATE, $2, $3, $4, $5, $6, $7, $8, $9)`,
        id,
        entry.exercise_type,
        entry.duration_min != null ? Number(entry.duration_min) : null,
        entry.sets != null ? Number(entry.sets) : null,
        entry.reps != null ? Number(entry.reps) : null,
        entry.weight_kg != null ? Number(entry.weight_kg) : null,
        entry.distance_km != null ? Number(entry.distance_km) : null,
        entry.calories_burned != null ? Number(entry.calories_burned) : null,
        entry.notes || null,
      );
      return {
        id,
        log_date: localDateStr(),
        exercise_type: entry.exercise_type,
        duration_min: entry.duration_min ?? null,
        sets: entry.sets ?? null,
        reps: entry.reps ?? null,
        weight_kg: entry.weight_kg ?? null,
        distance_km: entry.distance_km ?? null,
        calories_burned: entry.calories_burned ?? null,
        notes: entry.notes ?? null,
        created_at: new Date().toISOString(),
      };
    },

    remove: async (id: string): Promise<void> => {
      await query(`DELETE FROM lifeos.exercise_log WHERE id = $1`, id);
    },

    addTemplate: async (template: {
      name: string;
      category: string;
      default_sets?: number;
      default_reps?: number;
    }): Promise<ExerciseTemplate> => {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.exercise_templates (id, name, category, default_sets, default_reps)
         VALUES ($1, $2, $3, $4, $5)`,
        id,
        template.name,
        template.category,
        template.default_sets != null ? Number(template.default_sets) : null,
        template.default_reps != null ? Number(template.default_reps) : null,
      );
      return {
        id,
        name: template.name,
        category: template.category,
        default_sets: template.default_sets ?? null,
        default_reps: template.default_reps ?? null,
        muscles_targeted: null,
        created_at: new Date().toISOString(),
      };
    },
  },

  body: {
    latest: async (): Promise<BodyMetricLatest[]> => {
      try {
        return await query<BodyMetricLatest>(
          `SELECT metric_type, value, unit, recorded_at
           FROM (
             SELECT metric_type, value, unit, recorded_at,
                    ROW_NUMBER() OVER (PARTITION BY metric_type ORDER BY recorded_at DESC) AS rn
             FROM lifeos.health_metrics
             WHERE metric_type IN (${BODY_METRICS_SQL})
           ) ranked
           WHERE rn = 1
           ORDER BY metric_type`,
        );
      } catch {
        return [];
      }
    },

    history: async (days = 30): Promise<BodyHistoryPoint[]> => {
      try {
        return await query<BodyHistoryPoint>(
          `SELECT CAST(recorded_at AS DATE) AS date, metric_type, AVG(value) AS avg_value
           FROM lifeos.health_metrics
           WHERE metric_type IN (${BODY_METRICS_SQL})
             AND recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(days)}' DAY
           GROUP BY CAST(recorded_at AS DATE), metric_type
           ORDER BY date ASC`,
        );
      } catch {
        return [];
      }
    },

    log: async (entry: {
      weight?: number;
      body_fat?: number;
      muscle_mass?: number;
    }): Promise<void> => {
      const now = new Date().toISOString();
      const entries: { metric: string; value: number; unit: string }[] = [];

      for (const { field, metric, unit } of BODY_FIELD_MAP) {
        const raw = entry[field as keyof typeof entry];
        if (raw === undefined || raw === null) continue;
        const value = Number(raw);
        if (isNaN(value)) continue;
        entries.push({ metric, value, unit });
      }

      for (const e of entries) {
        const id = crypto.randomUUID();
        await query(
          `INSERT INTO lifeos.health_metrics (id, metric_type, value, unit, recorded_at, source, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
          id,
          e.metric,
          e.value,
          e.unit,
          now,
          'manual',
        );
      }
    },
  },

  sleep: {
    latest: async (): Promise<SleepMetric[]> => {
      try {
        return await query<SleepMetric>(
          `SELECT metric_type, value, unit, recorded_at
           FROM lifeos.health_metrics
           WHERE metric_type IN ('sleep_duration', 'sleep_quality')
           ORDER BY recorded_at DESC
           LIMIT 10`,
        );
      } catch {
        return [];
      }
    },

    history: async (days = 30): Promise<SleepHistoryPoint[]> => {
      try {
        const rows = await query<SleepHistoryPoint>(
          `SELECT CAST(recorded_at AS DATE) AS date, metric_type, AVG(value) AS avg_value,
                  MIN(value) AS min_value, MAX(value) AS max_value
           FROM lifeos.health_metrics
           WHERE metric_type IN ('sleep_duration', 'sleep_quality')
             AND recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(days)}' DAY
           GROUP BY CAST(recorded_at AS DATE), metric_type
           ORDER BY date ASC`,
        );
        // Add .value alias for Svelte page compat
        return rows.map((r) => ({ ...r, value: r.avg_value }));
      } catch {
        return [];
      }
    },

    insights: async (): Promise<SleepInsight[]> => {
      try {
        return await getSleepInsights();
      } catch {
        return [];
      }
    },
  },

  calendar: {
    today: () => fetchSafe<CalendarEvent[]>('/calendar/today', []),
    week: () => fetchSafe<CalendarEvent[]>('/calendar/week', []),
  },

  reminders: {
    list: async (): Promise<Reminder[]> => {
      try {
        return await query<Reminder>(
          `SELECT id, message, due_at, recurring_cron, status, created_at
           FROM lifeos.reminders
           WHERE status = 'active'
           ORDER BY due_at ASC`,
        );
      } catch {
        return [];
      }
    },

    add: async (reminder: {
      message: string;
      due_at: string;
      recurring_cron?: string;
    }): Promise<Reminder> => {
      const id = crypto.randomUUID();
      await query(
        `INSERT INTO lifeos.reminders (id, message, due_at, recurring_cron, status)
         VALUES ($1, $2, $3, $4, 'active')`,
        id,
        reminder.message,
        reminder.due_at,
        reminder.recurring_cron ?? null,
      );
      return {
        id,
        message: reminder.message,
        due_at: reminder.due_at,
        recurring_cron: reminder.recurring_cron ?? null,
        status: 'active',
        created_at: new Date().toISOString(),
      };
    },

    update: async (id: string, data: Partial<Reminder>): Promise<void> => {
      const setClauses: string[] = [];
      const params: unknown[] = [];
      let paramIdx = 1;

      if (data.message) {
        setClauses.push(`message = $${paramIdx}`);
        params.push(data.message);
        paramIdx++;
      }
      if (data.due_at) {
        setClauses.push(`due_at = $${paramIdx}`);
        params.push(data.due_at);
        paramIdx++;
      }

      if (setClauses.length > 0) {
        params.push(id);
        await query(
          `UPDATE lifeos.reminders SET ${setClauses.join(', ')} WHERE id = $${paramIdx}`,
          ...params,
        );
      }
    },

    remove: async (id: string): Promise<void> => {
      await query(`DELETE FROM lifeos.reminders WHERE id = $1`, id);
    },
  },

  streaks: {
    list: async (): Promise<Streak[]> => {
      try {
        const raw = await getAllStreaks();
        // Add alias fields for Svelte StreakCard compatibility
        return raw.map((s) => ({
          ...s,
          currentStreak: s.current,
          longestStreak: s.longest,
        }));
      } catch {
        return [];
      }
    },

    history: async (type?: string, days = 30): Promise<StreakHistoryDay[]> => {
      try {
        if (!type) return [];
        return await getStreakHistory(type, days);
      } catch {
        return [];
      }
    },
  },

  bills: {
    list: async (): Promise<Bill[]> => {
      try {
        return await query<Bill>(
          `SELECT id, name, amount, merchant, due_date, recurring, status, created_at
           FROM lifeos.bills
           ORDER BY due_date ASC`,
        );
      } catch {
        return [];
      }
    },
  },
};
