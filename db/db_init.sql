-- Inicialización sencilla de BD para karting timing

CREATE TABLE IF NOT EXISTS drivers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  nickname VARCHAR(255),
  email VARCHAR(255),
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255),
  color VARCHAR(32),
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS karts (
  id SERIAL PRIMARY KEY,
  number INTEGER NOT NULL,
  transponder VARCHAR(64),
  status VARCHAR(64) DEFAULT 'active',
  hours_used NUMERIC DEFAULT 0,
  service_interval NUMERIC DEFAULT 20,
  next_service_at NUMERIC DEFAULT 20,
  alert_margin NUMERIC DEFAULT 2,
  brand VARCHAR(255),
  model VARCHAR(255),
  kart_type VARCHAR(64),
  notes TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transponders (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,
  driver_id INTEGER REFERENCES drivers(id) ON DELETE SET NULL,
  kart_id INTEGER REFERENCES karts(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(64),
  lap_limit INTEGER,
  time_limit INTEGER,
  status VARCHAR(32) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timing_points (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(64) NOT NULL,
  sector_number INTEGER,
  loop_code VARCHAR(64),
  decoder_ip VARCHAR(64),
  decoder_port INTEGER,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE IF NOT EXISTS timing_log_raw (
  id SERIAL PRIMARY KEY,
  transponder VARCHAR(64),
  decoder VARCHAR(64),
  ts TIMESTAMP DEFAULT now(),
  raw_json JSONB
);

-- Tabla opcional para rankings diarios
CREATE TABLE IF NOT EXISTS rankings_daily (
  id SERIAL PRIMARY KEY,
  driver_name VARCHAR(255),
  best_lap NUMERIC,
  session_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT now()
);
