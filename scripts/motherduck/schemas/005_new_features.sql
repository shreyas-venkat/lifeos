CREATE TABLE IF NOT EXISTS lifeos.water_log (
    id VARCHAR PRIMARY KEY,
    glasses INTEGER NOT NULL,
    log_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.mood_log (
    id VARCHAR PRIMARY KEY,
    mood INTEGER NOT NULL,
    energy INTEGER NOT NULL,
    notes TEXT,
    log_date DATE NOT NULL,
    log_time VARCHAR DEFAULT 'morning',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Recipe favorites: separate table to avoid ALTER TABLE issues in DuckDB
CREATE TABLE IF NOT EXISTS lifeos.recipe_favorites (
    recipe_id VARCHAR PRIMARY KEY,
    favorited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
