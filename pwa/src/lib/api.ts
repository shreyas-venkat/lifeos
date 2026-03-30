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

export interface Notification {
  id: string;
  title: string;
  body: string;
  type: string;
  url: string | null;
  created_at: string;
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
};
