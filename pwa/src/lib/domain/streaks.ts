/**
 * Streak calculation logic -- counts consecutive completed days and
 * fetches completion data for each streak type.
 *
 * Ported from src/api/routes/streaks.ts
 */
import { query } from '$lib/db';

const STREAK_TYPES = [
  'supplements',
  'cooking',
  'steps_goal',
  'water_goal',
  'sleep_target',
  'exercise',
] as const;

type StreakType = (typeof STREAK_TYPES)[number];

interface DayCompletion {
  log_date: string;
  [key: string]: unknown;
}

interface StoredStreak {
  streak_type: string;
  longest_streak: number;
  target_value: number | null;
}

interface StreakResult {
  type: string;
  current: number;
  longest: number;
  last_completed: string | null;
}

const LOOKBACK_DAYS = 90;

function countConsecutive(
  rows: DayCompletion[],
  completionField: string,
): { streak: number; lastCompleted: string | null } {
  if (rows.length === 0) return { streak: 0, lastCompleted: null };

  let streak = 0;
  let lastCompleted: string | null = null;

  const completedDates = new Set<string>();
  for (const row of rows) {
    if (row[completionField]) {
      completedDates.add(row.log_date);
      if (!lastCompleted) lastCompleted = row.log_date;
    }
  }

  if (completedDates.size === 0) return { streak: 0, lastCompleted: null };

  const today = new Date();
  for (let i = 0; i < LOOKBACK_DAYS; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    if (completedDates.has(dateStr)) {
      streak++;
    } else {
      break;
    }
  }

  return { streak, lastCompleted };
}

function getSupplementsDaily(totalActive: number): Promise<DayCompletion[]> {
  if (totalActive === 0) return Promise.resolve([]);

  return query<{ log_date: string; taken_count: number }>(
    `SELECT sl.log_date, COUNT(DISTINCT sl.supplement_id) AS taken_count
     FROM lifeos.supplement_log sl
     JOIN lifeos.supplements s ON s.id = sl.supplement_id
     WHERE sl.taken = true
       AND s.active = true
       AND sl.log_date >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(LOOKBACK_DAYS)}' DAY
     GROUP BY sl.log_date
     ORDER BY sl.log_date DESC`,
  ).then((rows) =>
    rows.map((r) => ({
      log_date: r.log_date,
      all_taken: r.taken_count >= totalActive,
    })),
  );
}

function getCookingCompletion(): Promise<DayCompletion[]> {
  return query<{ log_date: string; cooked_count: number }>(
    `SELECT CAST(mp.week_start + INTERVAL (mp.day_of_week) DAY AS DATE) AS log_date,
            COUNT(*) AS cooked_count
     FROM lifeos.meal_plans mp
     WHERE mp.status = 'cooked'
       AND CAST(mp.week_start + INTERVAL (mp.day_of_week) DAY AS DATE)
           >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(LOOKBACK_DAYS)}' DAY
     GROUP BY log_date
     ORDER BY log_date DESC`,
  ).then((rows) =>
    rows.map((r) => ({
      log_date: r.log_date,
      cooked: r.cooked_count > 0,
    })),
  );
}

function getStepsCompletion(target: number): Promise<DayCompletion[]> {
  return query<{ log_date: string; max_steps: number }>(
    `SELECT CAST(recorded_at AS DATE) AS log_date, MAX(value) AS max_steps
     FROM lifeos.health_metrics
     WHERE metric_type = 'steps'
       AND recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(LOOKBACK_DAYS)}' DAY
     GROUP BY CAST(recorded_at AS DATE)
     ORDER BY log_date DESC`,
  ).then((rows) =>
    rows.map((r) => ({
      log_date: r.log_date,
      met_goal: r.max_steps >= target,
    })),
  );
}

function getWaterCompletion(target: number): Promise<DayCompletion[]> {
  return query<{ log_date: string; total_glasses: number }>(
    `SELECT CAST(recorded_at AS DATE) AS log_date, SUM(value) AS total_glasses
     FROM lifeos.health_metrics
     WHERE metric_type = 'water_glasses'
       AND recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(LOOKBACK_DAYS)}' DAY
     GROUP BY CAST(recorded_at AS DATE)
     ORDER BY log_date DESC`,
  ).then((rows) =>
    rows.map((r) => ({
      log_date: r.log_date,
      met_goal: r.total_glasses >= target,
    })),
  );
}

function getSleepCompletion(target: number): Promise<DayCompletion[]> {
  return query<{ log_date: string; sleep_hours: number }>(
    `SELECT CAST(recorded_at AS DATE) AS log_date, MAX(value) AS sleep_hours
     FROM lifeos.health_metrics
     WHERE metric_type = 'sleep_duration'
       AND recorded_at >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(LOOKBACK_DAYS)}' DAY
     GROUP BY CAST(recorded_at AS DATE)
     ORDER BY log_date DESC`,
  ).then((rows) =>
    rows.map((r) => ({
      log_date: r.log_date,
      met_goal: r.sleep_hours >= target,
    })),
  );
}

function getExerciseCompletion(): Promise<DayCompletion[]> {
  return query<{ log_date: string; entry_count: number }>(
    `SELECT log_date, COUNT(*) AS entry_count
     FROM lifeos.fitness_log
     WHERE log_date >= (NOW() AT TIME ZONE 'America/Edmonton')::DATE - INTERVAL '${String(LOOKBACK_DAYS)}' DAY
     GROUP BY log_date
     ORDER BY log_date DESC`,
  ).then((rows) =>
    rows.map((r) => ({
      log_date: r.log_date,
      has_entry: r.entry_count > 0,
    })),
  );
}

const DEFAULT_TARGETS: Record<StreakType, number> = {
  supplements: 0,
  cooking: 0,
  steps_goal: 5000,
  water_goal: 8,
  sleep_target: 7,
  exercise: 0,
};

const COMPLETION_FIELDS: Record<StreakType, string> = {
  supplements: 'all_taken',
  cooking: 'cooked',
  steps_goal: 'met_goal',
  water_goal: 'met_goal',
  sleep_target: 'met_goal',
  exercise: 'has_entry',
};

export async function getAllStreaks(): Promise<StreakResult[]> {
  const countRows = await query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM lifeos.supplements WHERE active = true`,
  );
  const totalActive = countRows.length > 0 ? countRows[0].total : 0;

  const supps = await getSupplementsDaily(totalActive);
  const cooking = await getCookingCompletion();
  const steps = await getStepsCompletion(DEFAULT_TARGETS.steps_goal);
  const water = await getWaterCompletion(DEFAULT_TARGETS.water_goal);
  const sleep = await getSleepCompletion(DEFAULT_TARGETS.sleep_target);
  const exercise = await getExerciseCompletion();

  const stored = await query<StoredStreak>(
    `SELECT streak_type, longest_streak, target_value
     FROM lifeos.streaks`,
  ).catch(() => [] as StoredStreak[]);

  const completionMap: Record<StreakType, DayCompletion[]> = {
    supplements: supps,
    cooking,
    steps_goal: steps,
    water_goal: water,
    sleep_target: sleep,
    exercise,
  };

  const storedMap = new Map<string, StoredStreak>();
  for (const s of stored) {
    storedMap.set(s.streak_type, s);
  }

  return STREAK_TYPES.map((type) => {
    const completions = completionMap[type];
    const field = COMPLETION_FIELDS[type];
    const { streak, lastCompleted } = countConsecutive(completions, field);

    const storedRecord = storedMap.get(type);
    const storedLongest = storedRecord?.longest_streak ?? 0;
    const longestStreak = Math.max(streak, storedLongest);

    return {
      type,
      current: streak,
      longest: longestStreak,
      last_completed: lastCompleted,
    };
  });
}

export async function getStreakHistory(
  type: string,
  days = 30,
): Promise<{ date: string; completed: boolean }[]> {
  const streakType = type as StreakType;
  let completions: DayCompletion[];

  if (streakType === 'supplements') {
    const countRows = await query<{ total: number }>(
      `SELECT COUNT(*) AS total FROM lifeos.supplements WHERE active = true`,
    );
    const totalActive = countRows.length > 0 ? countRows[0].total : 0;
    completions = await getSupplementsDaily(totalActive);
  } else {
    switch (streakType) {
      case 'cooking':
        completions = await getCookingCompletion();
        break;
      case 'steps_goal':
        completions = await getStepsCompletion(DEFAULT_TARGETS.steps_goal);
        break;
      case 'water_goal':
        completions = await getWaterCompletion(DEFAULT_TARGETS.water_goal);
        break;
      case 'sleep_target':
        completions = await getSleepCompletion(DEFAULT_TARGETS.sleep_target);
        break;
      case 'exercise':
        completions = await getExerciseCompletion();
        break;
      default:
        completions = [];
    }
  }

  const field = COMPLETION_FIELDS[streakType];
  const completedDates = new Set<string>();
  for (const row of completions) {
    if (row[field]) {
      completedDates.add(row.log_date);
    }
  }

  const today = new Date();
  const result: { date: string; completed: boolean }[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    result.push({
      date: dateStr,
      completed: completedDates.has(dateStr),
    });
  }

  result.sort((a, b) => a.date.localeCompare(b.date));
  return result;
}
