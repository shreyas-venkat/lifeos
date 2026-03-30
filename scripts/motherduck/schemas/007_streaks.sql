CREATE TABLE IF NOT EXISTS lifeos.streaks (
    id VARCHAR PRIMARY KEY,
    streak_type VARCHAR NOT NULL,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_completed_date DATE,
    target_value INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
