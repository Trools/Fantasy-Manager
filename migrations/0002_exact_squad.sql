-- Collapse pos_min/pos_max into a single exact players-per-position count.
-- Squad size (total_picks) becomes the sum of the four counts; the server keeps
-- total_picks in sync on every settings save, and parseSettings derives it too.
ALTER TABLE draft_settings ADD COLUMN pos_count TEXT;
UPDATE draft_settings
   SET pos_count = '{"GK":1,"DEF":4,"MID":4,"FWD":2}',
       total_picks = 11
 WHERE id = 1;
ALTER TABLE draft_settings DROP COLUMN pos_min;
ALTER TABLE draft_settings DROP COLUMN pos_max;
