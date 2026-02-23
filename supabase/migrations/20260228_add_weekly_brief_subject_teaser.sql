-- Add subject_teaser column to weekly_briefs for Morning Brew-style Sunday Edition subjects
ALTER TABLE weekly_briefs ADD COLUMN IF NOT EXISTS subject_teaser TEXT;
