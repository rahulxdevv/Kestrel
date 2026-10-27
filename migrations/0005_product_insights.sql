-- Per-page engagement is cumulative per session, so retrying a beacon cannot double count it.
CREATE TABLE page_engagement (
  site_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  path TEXT NOT NULL,
  reading_ms INTEGER NOT NULL DEFAULT 0,
  scroll_depth INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (site_id, session_id, path)
);
CREATE INDEX page_engagement_site_path ON page_engagement (site_id, path);

-- User-authored annotations pinned to overview chart timestamps.
CREATE TABLE chart_notes (
  id TEXT PRIMARY KEY,
  site_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  label TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX chart_notes_site_ts ON chart_notes (site_id, ts);

-- Plausible exports are aggregate-only history; they are kept separate from visitor-level data.
CREATE TABLE plausible_daily (
  site_id TEXT NOT NULL,
  day TEXT NOT NULL,
  visitors INTEGER NOT NULL DEFAULT 0,
  visits INTEGER NOT NULL DEFAULT 0,
  pageviews INTEGER NOT NULL DEFAULT 0,
  bounces INTEGER NOT NULL DEFAULT 0,
  visit_duration INTEGER NOT NULL DEFAULT 0,
  imported_at INTEGER NOT NULL,
  PRIMARY KEY (site_id, day)
);
