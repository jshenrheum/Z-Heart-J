-- Z ♥ J — 0005: nudges (a short note from one of you to the other) and the phones
-- that receive them as notifications.
--
-- New tables only; `records` is untouched. A push subscription is what a phone hands
-- over when notifications are turned on: an address at its notification service
-- (Apple, Google, Mozilla) and two public keys the note is encrypted to. Nudges are
-- kept for 30 days, then removed by the daily schedule.

CREATE TABLE push_subscriptions (
  household_id TEXT NOT NULL REFERENCES households(id),
  member       TEXT NOT NULL CHECK (member IN ('jeffrey','zul')),
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  created_at   TEXT NOT NULL,
  last_ok_at   TEXT,
  PRIMARY KEY (household_id, endpoint)
);

CREATE INDEX push_by_member ON push_subscriptions (household_id, member);

CREATE TABLE nudges (
  household_id TEXT NOT NULL REFERENCES households(id),
  id           TEXT NOT NULL,
  from_member  TEXT NOT NULL CHECK (from_member IN ('jeffrey','zul')),
  to_member    TEXT NOT NULL CHECK (to_member IN ('jeffrey','zul') AND to_member <> from_member),
  text         TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 200),
  created_at   TEXT NOT NULL,
  -- How many of the recipient's phones the notification service accepted it for.
  delivered    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (household_id, id)
);

CREATE INDEX nudges_recent ON nudges (household_id, created_at);
