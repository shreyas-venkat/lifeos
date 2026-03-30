CREATE TABLE IF NOT EXISTS lifeos.exercise_log (
    id VARCHAR PRIMARY KEY,
    log_date DATE NOT NULL,
    exercise_type VARCHAR NOT NULL,
    duration_min INTEGER,
    sets INTEGER,
    reps INTEGER,
    weight_kg DOUBLE,
    distance_km DOUBLE,
    calories_burned INTEGER,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.exercise_templates (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    category VARCHAR NOT NULL,
    default_sets INTEGER,
    default_reps INTEGER,
    muscles_targeted VARCHAR[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
