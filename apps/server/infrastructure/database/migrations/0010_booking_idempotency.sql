CREATE TABLE IF NOT EXISTS booking_idempotency (
  origin text NOT NULL,
  idempotency_key text NOT NULL,
  request_fingerprint text NOT NULL,
  outcome_status text NOT NULL CHECK (outcome_status IN ('started', 'confirmed')),
  booking_id text REFERENCES bookings(id),
  job_id text REFERENCES jobs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  PRIMARY KEY (origin, idempotency_key),
  CHECK ((outcome_status = 'started' AND booking_id IS NULL AND job_id IS NULL)
    OR (outcome_status = 'confirmed' AND booking_id IS NOT NULL AND job_id IS NOT NULL))
);
