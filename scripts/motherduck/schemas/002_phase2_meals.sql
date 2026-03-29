CREATE TABLE IF NOT EXISTS lifeos.recipes (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    source_url VARCHAR,
    ingredients JSON NOT NULL,
    instructions TEXT,
    prep_time_min INTEGER,
    cook_time_min INTEGER,
    servings INTEGER DEFAULT 2,
    calories_per_serving DOUBLE,
    macros JSON,
    rating DOUBLE,
    times_cooked INTEGER DEFAULT 0,
    tags VARCHAR[],
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.meal_plans (
    id VARCHAR PRIMARY KEY,
    week_start DATE NOT NULL,
    day_of_week INTEGER NOT NULL,
    meal_type VARCHAR NOT NULL,
    recipe_id VARCHAR,
    servings INTEGER DEFAULT 2,
    notes TEXT,
    status VARCHAR DEFAULT 'planned',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.pantry (
    id VARCHAR PRIMARY KEY,
    item VARCHAR NOT NULL,
    quantity DOUBLE,
    unit VARCHAR,
    category VARCHAR,
    expiry_date DATE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.dietary_preferences (
    id VARCHAR PRIMARY KEY,
    pref_type VARCHAR NOT NULL,
    value VARCHAR NOT NULL,
    active BOOLEAN DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS lifeos.calorie_log (
    id VARCHAR PRIMARY KEY,
    log_date DATE NOT NULL,
    meal_type VARCHAR NOT NULL,
    description TEXT,
    source VARCHAR NOT NULL,
    calories DOUBLE,
    protein_g DOUBLE,
    carbs_g DOUBLE,
    fat_g DOUBLE,
    fiber_g DOUBLE,
    recipe_id VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.grocery_lists (
    id VARCHAR PRIMARY KEY,
    week_start DATE NOT NULL,
    items JSON NOT NULL,
    status VARCHAR DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
