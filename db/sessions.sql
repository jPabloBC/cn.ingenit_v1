CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS cn_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  last_activity timestamptz NOT NULL DEFAULT now(),
  revoked boolean NOT NULL DEFAULT false,
  meta jsonb DEFAULT '{}'::jsonb,
  token text
);

CREATE UNIQUE INDEX IF NOT EXISTS cn_one_active_session_per_user
  ON cn_sessions (user_id) WHERE (revoked = false);

CREATE OR REPLACE FUNCTION cn_sessions_acquire(p_user_id uuid, p_token text, p_meta jsonb)
RETURNS TABLE(id uuid, issued_at timestamptz, last_activity timestamptz, revoked boolean) AS $$
DECLARE
  v_id uuid;
BEGIN
  UPDATE cn_sessions s
  SET revoked = true
  WHERE s.revoked = false
    AND s.last_activity < now() - interval '30 minutes';

  PERFORM pg_advisory_xact_lock(hashtext('cn_sessions:' || p_user_id::text));

  IF EXISTS (SELECT 1 FROM cn_sessions s WHERE s.user_id = p_user_id AND s.revoked = false) THEN
    RETURN;
  END IF;

  INSERT INTO cn_sessions (user_id, token, meta)
  VALUES (p_user_id, p_token, p_meta)
  RETURNING cn_sessions.id INTO v_id;

  RETURN QUERY SELECT s.id, s.issued_at, s.last_activity, s.revoked FROM cn_sessions s WHERE s.id = v_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cn_sessions_heartbeat(p_session_id uuid)
RETURNS boolean AS $$
BEGIN
  UPDATE cn_sessions s
  SET last_activity = now()
  WHERE s.id = p_session_id AND s.revoked = false;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cn_sessions_release(p_session_id uuid)
RETURNS void AS $$
BEGIN
  UPDATE cn_sessions s
  SET revoked = true
  WHERE s.id = p_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cn_sessions_validate(p_session_id uuid)
RETURNS TABLE(revoked boolean, last_activity timestamptz) AS $$
BEGIN
  RETURN QUERY SELECT s.revoked, s.last_activity FROM cn_sessions s WHERE s.id = p_session_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cn_sessions_cleanup()
RETURNS void AS $$
BEGIN
  DELETE FROM cn_sessions WHERE revoked = true AND issued_at < now() - interval '30 days';
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cn_sessions_force_acquire(p_user_id uuid, p_token text, p_meta jsonb)
RETURNS TABLE(id uuid, issued_at timestamptz, last_activity timestamptz, revoked boolean, previous_revoked boolean) AS $$
DECLARE
  v_id uuid;
  v_prev boolean := false;
BEGIN
  UPDATE cn_sessions s
  SET revoked = true
  WHERE s.user_id = p_user_id AND s.revoked = false;
  
  IF FOUND THEN
    v_prev := true;
  END IF;

  INSERT INTO cn_sessions (user_id, token, meta)
  VALUES (p_user_id, p_token, p_meta)
  RETURNING cn_sessions.id INTO v_id;

  RETURN QUERY SELECT s.id, s.issued_at, s.last_activity, s.revoked, v_prev FROM cn_sessions s WHERE s.id = v_id;
END;
$$ LANGUAGE plpgsql;
