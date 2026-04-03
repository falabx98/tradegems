-- Create ops_alerts table for operational alerting
CREATE TABLE IF NOT EXISTS ops_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  severity TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  user_id UUID,
  game TEXT,
  request_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ops_alerts_severity ON ops_alerts (severity);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_category ON ops_alerts (category);
CREATE INDEX IF NOT EXISTS idx_ops_alerts_created_at ON ops_alerts (created_at DESC);
