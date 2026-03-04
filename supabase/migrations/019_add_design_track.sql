-- Allow 'Design' as a track value for service connections (estimates/design stage)
ALTER TABLE service_connections DROP CONSTRAINT service_connections_track_check;
ALTER TABLE service_connections ADD CONSTRAINT service_connections_track_check
  CHECK (track IN ('A', 'B', 'Design', 'unknown'));
