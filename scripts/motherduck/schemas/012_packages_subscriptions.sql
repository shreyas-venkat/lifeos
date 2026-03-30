CREATE SCHEMA IF NOT EXISTS lifeos;
CREATE TABLE IF NOT EXISTS lifeos.packages (
  id VARCHAR PRIMARY KEY,
  merchant VARCHAR,
  tracking_number VARCHAR,
  carrier VARCHAR,
  status VARCHAR DEFAULT 'shipped',
  expected_delivery DATE,
  actual_delivery DATE,
  source_email_id VARCHAR,
  last_checked TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS lifeos.subscriptions (
  id VARCHAR PRIMARY KEY,
  name VARCHAR NOT NULL,
  merchant_pattern VARCHAR,
  amount DOUBLE,
  frequency VARCHAR DEFAULT 'monthly',
  category VARCHAR,
  active BOOLEAN DEFAULT true,
  last_charged DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
