-- Clients now own their data and sync it: class ids are generated on the device,
-- timestamps come from the device (ms since epoch, last write wins) and deletes are tombstones.
ALTER TABLE classes ADD COLUMN deleted boolean NOT NULL DEFAULT false;
ALTER TABLE classes ALTER COLUMN updated_at DROP DEFAULT;
ALTER TABLE classes ALTER COLUMN updated_at TYPE bigint USING (extract(epoch FROM updated_at) * 1000)::bigint;
ALTER TABLE classes DROP COLUMN created_at;
ALTER TABLE classes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE classes DROP CONSTRAINT classes_pkey;
ALTER TABLE classes ADD PRIMARY KEY (user_id, id);
DROP INDEX classes_user_id_idx;

-- The grading scale is synced; the language is a per-device setting.
ALTER TABLE users ADD COLUMN scale_updated_at bigint NOT NULL DEFAULT 0;
ALTER TABLE users DROP COLUMN locale;
