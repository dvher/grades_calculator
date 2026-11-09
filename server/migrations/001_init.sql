CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  scale_min     double precision NOT NULL DEFAULT 1,
  scale_max     double precision NOT NULL DEFAULT 7,
  pass_grade    double precision NOT NULL DEFAULT 4,
  locale        text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE classes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           text NOT NULL,
  exam_weight    double precision NOT NULL,
  min_exam_grade double precision,
  exam_grade     double precision,
  items          jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX classes_user_id_idx ON classes(user_id);
