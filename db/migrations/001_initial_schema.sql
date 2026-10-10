-- Supabase owns account credentials; this database only stores public profiles
-- and application records keyed by the UUID of a verified Supabase identity.
CREATE TABLE profiles (
  user_id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 80),
  city text NOT NULL DEFAULT '' CHECK (char_length(city) <= 100),
  interests text[] NOT NULL DEFAULT '{}',
  bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 1000),
  avatar_url text CHECK (avatar_url IS NULL OR char_length(avatar_url) <= 2048),
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE communities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  is_sample boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE community_members (
  community_id uuid NOT NULL REFERENCES communities(id),
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX community_members_user_idx ON community_members(user_id);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 160),
  description text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'cleanup', 'planting', 'conservation', 'gardening',
    'recycling', 'transport', 'education', 'energy'
  )),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  city text NOT NULL,
  location text NOT NULL,
  address text NOT NULL DEFAULT '',
  organizer_id uuid NOT NULL REFERENCES profiles(user_id),
  organizer_description text NOT NULL DEFAULT '',
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  image text NOT NULL DEFAULT '/images/forest.jpg',
  image_alt text NOT NULL DEFAULT '',
  instructions text[] NOT NULL DEFAULT '{}',
  highlights text[] NOT NULL DEFAULT '{}',
  community_id uuid REFERENCES communities(id),
  featured boolean NOT NULL DEFAULT false,
  difficulty text NOT NULL DEFAULT 'Easy',
  is_sample boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'canceled', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_organizer_idx ON events(organizer_id);
CREATE INDEX events_community_idx ON events(community_id);
CREATE INDEX events_discovery_idx ON events(status, starts_at);
CREATE INDEX events_category_city_idx ON events(category, city);

CREATE TABLE event_registrations (
  event_id uuid NOT NULL REFERENCES events(id),
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'canceled', 'no-show')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
CREATE INDEX event_registrations_user_idx ON event_registrations(user_id, status);
CREATE INDEX event_registrations_active_idx ON event_registrations(event_id) WHERE status = 'registered';

CREATE TABLE event_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id),
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  attendance_status text NOT NULL DEFAULT 'absent' CHECK (attendance_status IN ('present', 'absent')),
  completed boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES profiles(user_id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, user_id),
  FOREIGN KEY (event_id, user_id) REFERENCES event_registrations(event_id, user_id),
  CHECK ((verified_by IS NULL) = (verified_at IS NULL)),
  CHECK (NOT completed OR (attendance_status = 'present' AND verified_by IS NOT NULL))
);
CREATE INDEX event_attendance_user_idx ON event_attendance(user_id);
CREATE INDEX event_attendance_verifier_idx ON event_attendance(verified_by);

CREATE TABLE environmental_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attendance_id uuid NOT NULL REFERENCES event_attendance(id),
  metric text NOT NULL CHECK (metric IN ('volunteer_hours', 'waste_kg', 'trees_planted')),
  amount numeric(12, 3) NOT NULL CHECK (amount >= 0 AND amount <> 'NaN'::numeric),
  unit text NOT NULL,
  verified_by uuid NOT NULL REFERENCES profiles(user_id),
  verified_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (attendance_id, metric),
  CHECK (
    (metric = 'volunteer_hours' AND unit = 'hours') OR
    (metric = 'waste_kg' AND unit = 'kg') OR
    (metric = 'trees_planted' AND unit = 'trees' AND amount = trunc(amount))
  )
);
CREATE INDEX environmental_contributions_verifier_idx ON environmental_contributions(verified_by);

CREATE TABLE verification_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  request_hash text NOT NULL,
  actor_id uuid NOT NULL REFERENCES profiles(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (actor_id, idempotency_key)
);

-- Relational for Phase 2. The later analytics migration can make this a
-- hypertable without requiring TimescaleDB for authentication and profiles.
CREATE TABLE contribution_journal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contribution_id uuid REFERENCES environmental_contributions(id),
  event_id uuid NOT NULL REFERENCES events(id),
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  metric text NOT NULL CHECK (metric IN ('volunteer_hours', 'waste_kg', 'trees_planted')),
  unit text NOT NULL,
  delta numeric(12, 3) NOT NULL CHECK (delta <> 0 AND delta <> 'NaN'::numeric),
  contributed_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  verified_by uuid NOT NULL REFERENCES profiles(user_id),
  operation_id uuid NOT NULL REFERENCES verification_operations(id),
  CHECK (
    (metric = 'volunteer_hours' AND unit = 'hours') OR
    (metric = 'waste_kg' AND unit = 'kg') OR
    (metric = 'trees_planted' AND unit = 'trees' AND delta = trunc(delta))
  )
);
CREATE INDEX contribution_journal_contribution_idx ON contribution_journal(contribution_id);
CREATE INDEX contribution_journal_event_idx ON contribution_journal(event_id, contributed_at);
CREATE INDEX contribution_journal_user_idx ON contribution_journal(user_id, contributed_at);
CREATE INDEX contribution_journal_verifier_idx ON contribution_journal(verified_by);
CREATE INDEX contribution_journal_operation_idx ON contribution_journal(operation_id);
CREATE INDEX contribution_journal_contributed_at_idx ON contribution_journal(contributed_at);

CREATE FUNCTION reject_contribution_journal_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Contribution journal is append-only; append a correction instead'
    USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER contribution_journal_append_only
  BEFORE UPDATE OR DELETE ON contribution_journal
  FOR EACH ROW EXECUTE FUNCTION reject_contribution_journal_mutation();
