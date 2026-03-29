CREATE TABLE IF NOT EXISTS lifeos.health_metrics (
    id VARCHAR PRIMARY KEY,
    metric_type VARCHAR NOT NULL,
    value DOUBLE NOT NULL,
    unit VARCHAR,
    recorded_at TIMESTAMP NOT NULL,
    source VARCHAR DEFAULT 'health_connect',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.supplements (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    default_dosage DOUBLE NOT NULL,
    unit VARCHAR NOT NULL,
    time_of_day VARCHAR NOT NULL,
    max_safe_dosage DOUBLE,
    active BOOLEAN DEFAULT TRUE,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS lifeos.supplement_log (
    id VARCHAR PRIMARY KEY,
    supplement_id VARCHAR NOT NULL,
    recommended_dosage DOUBLE,
    reason TEXT,
    taken BOOLEAN DEFAULT FALSE,
    log_date DATE NOT NULL,
    time_of_day VARCHAR NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.fitness_log (
    id VARCHAR PRIMARY KEY,
    log_date DATE NOT NULL,
    activity VARCHAR,
    duration_min INTEGER,
    steps INTEGER,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS lifeos.fitness_nudges (
    id VARCHAR PRIMARY KEY,
    nudge_date DATE NOT NULL,
    message TEXT NOT NULL,
    trigger_reason VARCHAR,
    acknowledged BOOLEAN DEFAULT FALSE
);
