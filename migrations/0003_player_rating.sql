-- Add a per-player rating (EA FC26 "overall", higher = better) used as the
-- "likely to perform well" ranking in the draft player list. Nullable because
-- the external source doesn't cover every World Cup squad member; unrated
-- players sort last under the Ranking option. Populated by the seed script.
ALTER TABLE players ADD COLUMN rating INTEGER;
CREATE INDEX idx_players_rating ON players(rating);
