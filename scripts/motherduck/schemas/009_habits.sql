CREATE TABLE IF NOT EXISTS lifeos.habits (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    description TEXT,
    frequency VARCHAR DEFAULT 'daily',
    target_per_day INTEGER DEFAULT 1,
    color VARCHAR DEFAULT '#6366f1',
    icon VARCHAR DEFAULT '✓',
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.habit_log (
    id VARCHAR PRIMARY KEY,
    habit_id VARCHAR NOT NULL,
    log_date DATE NOT NULL,
    completed INTEGER DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
