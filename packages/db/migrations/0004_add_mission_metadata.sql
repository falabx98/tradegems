-- Add metadata column to user_mission_progress for tracking game types played
ALTER TABLE user_mission_progress ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
