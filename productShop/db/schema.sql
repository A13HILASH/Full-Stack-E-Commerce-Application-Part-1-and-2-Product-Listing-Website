-- Relational schema for the product catalogue (SQLite).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT NOT NULL UNIQUE,
    slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    description  TEXT    NOT NULL,
    price_cents  INTEGER NOT NULL CHECK (price_cents >= 0),  -- money stored as integer minor units
    image_url    TEXT    NOT NULL,
    category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    stock        INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_name     ON products(name);
CREATE INDEX IF NOT EXISTS idx_products_price    ON products(price_cents);

-- ===== Part 2: analytics + theming =====
-- IP-to-country lookup (IPv4 ranges stored as integers so a lookup is one indexed query).
CREATE TABLE IF NOT EXISTS geo_ranges (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    cidr          TEXT    NOT NULL,
    start_ip      INTEGER NOT NULL,
    end_ip        INTEGER NOT NULL,
    country_code  TEXT    NOT NULL,
    country_name  TEXT    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_geo_range ON geo_ranges(start_ip, end_ip);

-- One row per page view. Country is resolved at write time and stored with the visit.
CREATE TABLE IF NOT EXISTS visits (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ip            TEXT NOT NULL,
    country_code  TEXT NOT NULL,
    country_name  TEXT NOT NULL,
    path          TEXT NOT NULL,
    source        TEXT NOT NULL CHECK (source IN ('real', 'simulated')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_visits_country ON visits(country_code);
CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);

-- Single-row table holding the saved storefront theme as JSON.
CREATE TABLE IF NOT EXISTS theme_settings (
    id          INTEGER PRIMARY KEY CHECK (id = 1),
    data        TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
