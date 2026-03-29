CREATE TABLE IF NOT EXISTS lifeos.bills (
    id VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    amount DOUBLE,
    merchant VARCHAR,
    due_date DATE,
    recurring VARCHAR,
    status VARCHAR DEFAULT 'upcoming',
    source_email_id VARCHAR,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
