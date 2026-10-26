-- Read-only public dashboard links. NULL means "not shared".
ALTER TABLE sites ADD COLUMN share_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS sites_share_token ON sites (share_token);

-- Query paths used by the dashboard and the live view.
CREATE INDEX IF NOT EXISTS events_site_visitor ON events (site_id, visitor_id, ts);
CREATE INDEX IF NOT EXISTS events_site_type_ts ON events (site_id, type, ts);
CREATE INDEX IF NOT EXISTS sessions_site_last_seen ON sessions (site_id, last_seen_at);
CREATE INDEX IF NOT EXISTS payments_site_visitor ON payments (site_id, visitor_id);
CREATE INDEX IF NOT EXISTS visitors_site_email ON visitors (site_id, email);
