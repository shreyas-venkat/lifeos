CREATE TABLE IF NOT EXISTS lifeos.transactions (
    id VARCHAR PRIMARY KEY,
    amount DOUBLE NOT NULL,
    merchant VARCHAR,
    category VARCHAR,
    description TEXT,
    transaction_date DATE NOT NULL,
    source VARCHAR DEFAULT 'email',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
