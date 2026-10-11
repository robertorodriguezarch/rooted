-- Only metadata is retained: no prompts, answers, email addresses or tokens.
CREATE TABLE ai_request_activity (
  id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 100),
  latency_ms integer NOT NULL CHECK (latency_ms >= 0),
  success boolean NOT NULL,
  recommendation_count integer NOT NULL CHECK (recommendation_count BETWEEN 0 AND 3),
  error_code text,
  PRIMARY KEY (id, recorded_at)
);
CREATE INDEX ai_request_activity_user_time_idx ON ai_request_activity(user_id, recorded_at DESC);

CREATE TABLE ai_request_limits (
  user_id uuid NOT NULL REFERENCES profiles(user_id),
  window_at timestamptz NOT NULL,
  window_seconds integer NOT NULL CHECK (window_seconds IN (60, 3600)),
  requests integer NOT NULL CHECK (requests BETWEEN 1 AND 30),
  PRIMARY KEY (user_id, window_at, window_seconds)
);

-- Tiger Data already supplies the extension. Ordinary PostgreSQL development
-- remains supported and is explicitly labeled as such by the analytics API.
DO $migration$
DECLARE extension_schema text;
BEGIN
  SELECT n.nspname INTO extension_schema FROM pg_extension e
    JOIN pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='timescaledb';
  IF extension_schema IS NOT NULL THEN
    EXECUTE format('SELECT %I.create_hypertable(%L::regclass, %L, chunk_time_interval => INTERVAL ''1 day'', if_not_exists => true)',
      extension_schema, format('%I.ai_request_activity', current_schema()), 'recorded_at');
  END IF;
END
$migration$;

CREATE FUNCTION prevent_ai_activity_rewrite() RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  RAISE EXCEPTION 'Assistant activity is append-only' USING ERRCODE='55000';
END
$function$;
CREATE TRIGGER ai_request_activity_append_only BEFORE UPDATE OR DELETE ON ai_request_activity
  FOR EACH ROW EXECUTE FUNCTION prevent_ai_activity_rewrite();
