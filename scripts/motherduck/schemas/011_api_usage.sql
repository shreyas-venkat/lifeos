CREATE SCHEMA IF NOT EXISTS lifeos;
CREATE TABLE IF NOT EXISTS lifeos.api_usage (
  id VARCHAR PRIMARY KEY,
  task_id VARCHAR,
  chat_jid VARCHAR,
  model VARCHAR,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd DOUBLE,
  duration_ms INTEGER,
  num_turns INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
