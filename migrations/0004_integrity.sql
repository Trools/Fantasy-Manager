-- Integrity backstops surfaced by the game-functionality review.
--
-- 1. A player may only ever be drafted once. The in-memory guard in the DO
--    (state.picks.some(...)) is the primary check, but a transient two-DO-instance
--    overlap (deploy/migration) rebuilding state from D1 could INSERT the same
--    player twice with no DB rejection. This unique index turns that silent
--    corruption into a catchable atomic failure (and also speeds the players
--    DELETE precheck's player_id scan).
CREATE UNIQUE INDEX idx_picks_player ON picks(player_id);

-- 2. An admin kick must actually keep the user out. Deleting the participants row
--    is not enough: auto-join, POST /participants/join, and the refresh
--    re-registration all re-add the user instantly. This ban list is consulted by
--    every re-entry path; it is cleared by reset-draft.
CREATE TABLE kicked_users (
  user_id INTEGER PRIMARY KEY REFERENCES users(id)
);
