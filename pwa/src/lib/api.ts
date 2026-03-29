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
	// API routes wrap results in { data: [...] } — unwrap if present
	if (json && typeof json === 'object' && 'data' in json) {
		const data = json.data;
		// If the API returned an empty array and caller expects an object, return null
		if (Array.isArray(data) && data.length === 0) return null as T;
		return data as T;
	}
	return json as T;
}

export interface HealthToday {
	steps: number;
	heart_rate: number;
	hrv: number;
	spo2: number;
	weight: number;
	sleep_hours: number;
}

export interface HealthTrend {
	date: string;
	steps: number;
	heart_rate: number;
	hrv: number;
	weight: number;
	sleep_hours: number;
}

export interface MealPlanDay {
	date: string;
	meals: { id: string; name: string; type: string; status: string; calories: number }[];
}

export interface Recipe {
	id: string;
	name: string;
	description: string;
	rating: number;
	calories: number;
}

export interface CalorieEntry {
	total: number;
	target: number;
	meals: { name: string; calories: number; time: string }[];
}

export interface PantryItem {
	id: string;
	name: string;
	category: string;
	quantity: string;
	expiry: string;
}

export interface Supplement {
	id: string;
	name: string;
	dosage: string;
	taken: boolean;
	time: string;
}

export interface Preferences {
	dietary: string;
	notifications: boolean;
	supplements: string[];
}

export const api = {
	health: {
		today: () => fetchApi<HealthToday>('/health/today'),
		trends: (days = 30) => fetchApi<HealthTrend[]>(`/health/trends?days=${days}`),
	},
	meals: {
		plan: (week = 'current') => fetchApi<MealPlanDay[]>(`/meals/plan?week=${week}`),
		updateStatus: (id: string, status: string) =>
			fetchApi(`/meals/plan/${id}/status`, {
				method: 'POST',
				body: JSON.stringify({ status }),
			}),
		recipes: () => fetchApi<Recipe[]>('/meals/recipes'),
		rateRecipe: (id: string, rating: number) =>
			fetchApi(`/meals/recipes/${id}/rate`, {
				method: 'POST',
				body: JSON.stringify({ rating }),
			}),
	},
	pantry: {
		list: () => fetchApi<PantryItem[]>('/pantry'),
		uploadPhoto: (base64: string) =>
			fetchApi('/pantry/photo', {
				method: 'POST',
				body: JSON.stringify({ image: base64 }),
			}),
	},
	supplements: {
		today: () => fetchApi<Supplement[]>('/supplements/today'),
		markTaken: (id: string) =>
			fetchApi(`/supplements/${id}/taken`, { method: 'POST' }),
	},
	calories: {
		today: () => fetchApi<CalorieEntry>('/calories/today'),
		week: () => fetchApi<CalorieEntry[]>('/calories/week'),
	},
	preferences: {
		get: () => fetchApi<Preferences>('/preferences'),
		update: (prefs: Record<string, string>) =>
			fetchApi('/preferences', {
				method: 'PUT',
				body: JSON.stringify(prefs),
			}),
	},
};
