const BASE = '/api';

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

export interface Streak {
  type: string;
  currentStreak: number;
  longestStreak: number;
  lastCompleted: string | null;
  target: number | null;
}

export interface StreakHistoryDay {
  date: string;
  completed: boolean;
}

/** Exported for direct use in dashboard */
export { fetchSafe };

function dateParam(date?: string): string {
  return date ? `?date=${encodeURIComponent(date)}` : '';
}

export const api = {
  health: {
    today: (date?: string) =>
      fetchSafe<HealthMetric[]>(`/health/today${dateParam(date)}`, []),
    history: (days = 30, metric = 'all') =>
      fetchSafe<HealthHistoryPoint[]>(
        `/health/history?days=${encodeURIComponent(days)}&metric=${encodeURIComponent(metric)}`,
        [],
      ),
    context: (metric: string, date?: string) =>
      fetchSafe<{ metric: string; date: string; value: number | null; insights: { text: string; type: string; source: string }[] }>(
        `/health/context?metric=${encodeURIComponent(metric)}${date ? '&date=' + encodeURIComponent(date) : ''}`,
        { metric, date: date || '', value: null, insights: [] },
      ),
  },
  meals: {
    plan: (week = 'current') =>
      fetchSafe<MealPlanRecord[]>(
        `/meals/plan?week=${encodeURIComponent(week)}`,
        [],
      ),
    updateStatus: (id: string, status: string) =>
      fetchApi<void>(`/meals/plan/${encodeURIComponent(id)}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      }),
    recipes: (search = '') =>
      fetchSafe<RecipeSummary[]>(
        search
          ? `/meals/recipes?search=${encodeURIComponent(search)}`
          : '/meals/recipes',
        [],
      ),
    recipeDetail: (id: string) =>
      fetchSafe<RecipeDetail | null>(
        `/meals/recipes/${encodeURIComponent(id)}`,
        null,
      ),
  },
  pantry: {
    list: () => fetchSafe<PantryItem[]>('/pantry', []),
    uploadPhoto: (base64: string) =>
      fetchApi<void>('/pantry/photo', {
        method: 'POST',
        body: JSON.stringify({ image: base64 }),
      }),
    add: (item: Omit<PantryItem, 'id' | 'updated_at'>) =>
      fetchApi<PantryItem>('/pantry', {
        method: 'POST',
        body: JSON.stringify(item),
      }),
    remove: (id: string) =>
      fetchApi<void>(`/pantry/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    update: (id: string, data: Partial<PantryItem>) =>
      fetchApi<PantryItem>(`/pantry/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  supplements: {
    today: (date?: string) =>
      fetchSafe<SupplementWithStatus[]>(
        `/supplements/today${dateParam(date)}`,
        [],
      ),
    markTaken: (id: string) =>
      fetchApi<void>(`/supplements/${encodeURIComponent(id)}/taken`, {
        method: 'POST',
      }),
    add: (supp: {
      name: string;
      dosage: number;
      unit: string;
      time_of_day: string;
    }) =>
      fetchApi<SupplementWithStatus>('/supplements/add', {
        method: 'POST',
        body: JSON.stringify(supp),
      }),
    remove: (id: string) =>
      fetchApi<void>(`/supplements/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    update: (id: string, data: Partial<SupplementWithStatus>) =>
      fetchApi<SupplementWithStatus>(`/supplements/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  calories: {
    today: (date?: string) =>
      fetchSafe<CalorieEntry[]>(`/calories/today${dateParam(date)}`, []),
    history: (days = 30) =>
      fetchSafe<DailyCalorieSummary[]>(
        `/calories/history?days=${encodeURIComponent(days)}`,
        [],
      ),
    log: (entry: {
      meal_type: string;
      description: string;
      calories: number;
      protein_g?: number;
      carbs_g?: number;
      fat_g?: number;
    }) =>
      fetchApi<CalorieEntry>('/calories/log', {
        method: 'POST',
        body: JSON.stringify(entry),
      }),
  },
  preferences: {
    get: () => fetchSafe<PreferenceRow[]>('/preferences', []),
    update: (prefs: Record<string, string>) =>
      fetchApi<void>('/preferences', {
        method: 'PUT',
        body: JSON.stringify(prefs),
      }),
  },
  streaks: {
    list: () => fetchSafe<Streak[]>('/streaks', []),
    history: (type: string, days = 30) =>
      fetchSafe<StreakHistoryDay[]>(
        `/streaks/history?type=${encodeURIComponent(type)}&days=${encodeURIComponent(days)}`,
        [],
      ),
  },
};
