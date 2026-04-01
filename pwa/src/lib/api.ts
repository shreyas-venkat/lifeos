const BASE = '/api';

/** Get local date string (YYYY-MM-DD) — avoids UTC midnight crossover issues */
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
}

export interface HabitHistoryEntry {
  habit_id: string;
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
}

export interface SleepInsight {
  text: string;
  type: string;
}

// --- Calendar ---
export interface CalendarEvent {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
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
  spending: {
    summary: (period = 'month') =>
      fetchSafe<CategorySummary[]>(
        `/spending/summary?period=${encodeURIComponent(period)}`,
        [],
      ),
    history: (months = 6) =>
      fetchSafe<MonthlyTotal[]>(
        `/spending/history?months=${encodeURIComponent(months)}`,
        [],
      ),
    recent: () => fetchSafe<Transaction[]>('/spending/recent', []),
    log: (entry: {
      amount: number;
      merchant: string;
      category: string;
      description?: string;
      date?: string;
    }) =>
      fetchApi<Transaction>('/spending/log', {
        method: 'POST',
        body: JSON.stringify(entry),
      }),
    remove: (id: string) =>
      fetchApi<void>(`/spending/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
    budget: () =>
      fetchSafe<BudgetInfo | null>('/spending/budget', null),
    forecast: () =>
      fetchSafe<SpendingForecast | null>('/spending/forecast', null),
  },
  packages: {
    active: () => fetchSafe<Package[]>('/packages', []),
    all: () => fetchSafe<Package[]>('/packages/all', []),
    add: (pkg: {
      merchant: string;
      tracking_number?: string;
      carrier?: string;
      expected_delivery?: string;
    }) =>
      fetchApi<Package>('/packages', {
        method: 'POST',
        body: JSON.stringify(pkg),
      }),
    updateStatus: (id: string, status: string) =>
      fetchApi<void>(`/packages/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify({ status }),
      }),
    remove: (id: string) =>
      fetchApi<void>(`/packages/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
  subscriptions: {
    active: () => fetchSafe<Subscription[]>('/subscriptions', []),
    summary: () =>
      fetchSafe<SubscriptionSummary>('/subscriptions/summary', {
        monthly_total: 0,
        count: 0,
      }),
    add: (sub: {
      name: string;
      amount: number;
      frequency?: string;
      category?: string;
    }) =>
      fetchApi<Subscription>('/subscriptions', {
        method: 'POST',
        body: JSON.stringify(sub),
      }),
    update: (id: string, data: Partial<Subscription>) =>
      fetchApi<void>(`/subscriptions/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      fetchApi<void>(`/subscriptions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      }),
  },
  notifications: {
    pending: () => fetchSafe<Notification[]>('/notifications/pending', []),
    markSeen: (ids: string[]) =>
      fetchApi<{ success: boolean; count: number }>('/notifications/mark-seen', {
        method: 'POST',
        body: JSON.stringify({ ids }),
      }),
    send: (notification: { title: string; body: string; type?: string; url?: string }) =>
      fetchApi<{ success: boolean; id: string }>('/notifications/send', {
        method: 'POST',
        body: JSON.stringify(notification),
      }),
  },
  export: {
    healthJson: () =>
      fetchApi<Record<string, unknown>[]>('/export/health?format=json'),
    healthCsvUrl: () => `${BASE}/export/health?format=csv`,
    allJson: () =>
      fetchApi<Record<string, unknown>>('/export/all?format=json'),
  },
  weeklyReport: {
    current: () =>
      fetchSafe<WeeklyReport | null>('/weekly-report/', null),
    history: () =>
      fetchSafe<WeeklyReport[]>('/weekly-report/history', []),
  },
  usage: {
    summary: (period: 'today' | 'week' | 'month' = 'today') =>
      fetchSafe<UsageSummary | null>(
        `/usage/summary?period=${encodeURIComponent(period)}`,
        null,
      ),
  },
  habits: {
    list: () => fetchSafe<Habit[]>('/habits', []),
    history: (days = 30) =>
      fetchSafe<HabitHistoryEntry[]>(
        `/habits/history?days=${encodeURIComponent(days)}`,
        [],
      ),
    create: (habit: { name: string; description?: string; frequency?: string; target_per_day?: number; color?: string; icon?: string }) =>
      fetchApi<Habit>('/habits', {
        method: 'POST',
        body: JSON.stringify(habit),
      }),
    complete: (id: string) =>
      fetchApi<void>(`/habits/${encodeURIComponent(id)}/complete`, {
        method: 'POST',
      }),
    remove: (id: string) =>
      fetchApi<void>(`/habits/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  exercise: {
    today: () => fetchSafe<ExerciseLogEntry[]>('/exercise/today', []),
    history: (days = 30) =>
      fetchSafe<ExerciseHistoryDay[]>(
        `/exercise/history?days=${encodeURIComponent(days)}`,
        [],
      ),
    templates: () => fetchSafe<ExerciseTemplate[]>('/exercise/templates', []),
    log: (entry: {
      exercise_type: string;
      duration_min?: number;
      sets?: number;
      reps?: number;
      weight_kg?: number;
      distance_km?: number;
      calories_burned?: number;
      notes?: string;
    }) =>
      fetchApi<ExerciseLogEntry>('/exercise/log', {
        method: 'POST',
        body: JSON.stringify(entry),
      }),
    remove: (id: string) =>
      fetchApi<void>(`/exercise/${encodeURIComponent(id)}`, { method: 'DELETE' }),
    add: (template: { name: string; category: string; default_sets?: number; default_reps?: number }) =>
      fetchApi<ExerciseTemplate>('/exercise/templates', {
        method: 'POST',
        body: JSON.stringify(template),
      }),
  },
  body: {
    latest: () => fetchSafe<BodyMetricLatest[]>('/body/latest', []),
    history: (days = 30) =>
      fetchSafe<BodyHistoryPoint[]>(
        `/body/history?days=${encodeURIComponent(days)}`,
        [],
      ),
    log: (entry: { weight?: number; body_fat?: number; muscle_mass?: number }) =>
      fetchApi<void>('/body/log', {
        method: 'POST',
        body: JSON.stringify(entry),
      }),
  },
  sleep: {
    latest: () => fetchSafe<SleepMetric[]>('/sleep/latest', []),
    history: (days = 30) =>
      fetchSafe<SleepHistoryPoint[]>(
        `/sleep/history?days=${encodeURIComponent(days)}`,
        [],
      ),
    insights: () => fetchSafe<SleepInsight[]>('/sleep/insights', []),
  },
  calendar: {
    today: () => fetchSafe<CalendarEvent[]>('/calendar/today', []),
    week: () => fetchSafe<CalendarEvent[]>('/calendar/week', []),
  },
  reminders: {
    list: () => fetchSafe<Reminder[]>('/reminders', []),
    add: (reminder: { message: string; due_at: string; recurring_cron?: string }) =>
      fetchApi<Reminder>('/reminders', {
        method: 'POST',
        body: JSON.stringify(reminder),
      }),
    update: (id: string, data: Partial<Reminder>) =>
      fetchApi<void>(`/reminders/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: (id: string) =>
      fetchApi<void>(`/reminders/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  },
  streaks: {
    list: () => fetchSafe<Streak[]>('/streaks', []),
    history: (days = 30) =>
      fetchSafe<Record<string, unknown>[]>(
        `/streaks/history?days=${encodeURIComponent(days)}`,
        [],
      ),
  },
};
