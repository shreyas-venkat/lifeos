CREATE SCHEMA IF NOT EXISTS lifeos;

CREATE TABLE IF NOT EXISTS lifeos.emails (
    id VARCHAR PRIMARY KEY,
    provider VARCHAR NOT NULL,
    message_id VARCHAR,
    sender VARCHAR NOT NULL,
    sender_name VARCHAR,
    subject VARCHAR,
    category VARCHAR NOT NULL,
    action_taken VARCHAR NOT NULL,
    importance VARCHAR DEFAULT 'normal',
    snippet TEXT,
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.preferences (
    key VARCHAR NOT NULL,
    value VARCHAR NOT NULL,
    skill VARCHAR NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (key, skill)
);

CREATE TABLE IF NOT EXISTS lifeos.calendar_events (
    id VARCHAR PRIMARY KEY,
    google_event_id VARCHAR,
    title VARCHAR NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    location VARCHAR,
    event_type VARCHAR,
    source VARCHAR DEFAULT 'google',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.reminders (
    id VARCHAR PRIMARY KEY,
    message TEXT NOT NULL,
    due_at TIMESTAMP NOT NULL,
    recurring_cron VARCHAR,
    status VARCHAR DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lifeos.email_deletion_log (
    id VARCHAR PRIMARY KEY,
    email_id VARCHAR NOT NULL,
    sender VARCHAR,
    subject VARCHAR,
    reason VARCHAR NOT NULL,
    deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    recoverable_until TIMESTAMP
);
