CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'employee')),
  phone TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- status/priority have no inline CHECK here -- they're enforced by the named
-- constraints below instead, so both a fresh install and a schema upgrade on
-- an existing database go through the exact same statements.
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  unique_key TEXT NOT NULL UNIQUE,
  name TEXT,
  mob TEXT,
  email TEXT,
  city TEXT,
  date TEXT,
  lead_source TEXT,
  assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Set together whenever a lead is rejected (see POST /leads/:id/reject):
  -- previous_assigned_user_id captures who had it, rejected_at when. Both
  -- stay populated after a later reassignment (harmless history), but the
  -- "pending reassignment" pool is just assigned_user_id IS NULL AND
  -- rejected_at IS NOT NULL, so a reassignment naturally drops a lead out
  -- of that view without needing to clear anything.
  previous_assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  rejected_at TIMESTAMPTZ,
  status TEXT,
  priority TEXT,
  notes TEXT,
  last_contacted TEXT,
  next_follow_up TEXT,
  next_follow_up_status TEXT
    CHECK (next_follow_up_status IS NULL OR next_follow_up_status IN ('Scheduled', 'Done', 'Missed', 'No Response')),
  interested_in TEXT,
  -- Bumped when a re-import for this same unique_key (same person, by
  -- FirstName-City-last2digits) arrives with a genuinely different Date --
  -- i.e. they filled out a lead form again, not just the same file getting
  -- re-uploaded. Starts at 1 for a brand-new lead. See upsertLeadFromRow.
  recur_count INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL DEFAULT 'sheet' CHECK (source IN ('sheet', 'manual')),
  sheet_row INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Additive migrations for columns introduced after the initial release --
-- CREATE TABLE IF NOT EXISTS above is a no-op on a database that already has
-- the `leads` table, so new columns need their own idempotent statement.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS adset_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS platform TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS previous_assigned_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS recur_count INTEGER NOT NULL DEFAULT 1;

-- Status/priority scheme change: New/Contacted/Follow-Up/Qualified/Site
-- Visit/Won/Lost -> Won/Lost/Not answered/Contacted/Broker, and
-- High/Medium/Low -> P1/P2/P3. Drop whatever the old constraint enforced
-- (named constraints on an inline CHECK are auto-named `<table>_<col>_check`
-- by Postgres, so this reliably targets the original one even though the
-- CREATE TABLE above no longer declares it), remap existing rows onto the
-- new scheme, then (re)apply the constraint under the same name so it stays
-- droppable the same way if the scheme ever changes again.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_check;
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_priority_check;

UPDATE leads SET status = CASE
    WHEN status = 'New' THEN 'Not answered'
    WHEN status IN ('Follow-Up', 'Qualified', 'Site Visit') THEN 'Contacted'
    ELSE status
  END
  WHERE status NOT IN ('Won', 'Lost', 'Not answered', 'Contacted', 'Broker');

UPDATE leads SET priority = CASE
    WHEN priority = 'High' THEN 'P1'
    WHEN priority = 'Medium' THEN 'P2'
    WHEN priority = 'Low' THEN 'P3'
    ELSE priority
  END
  WHERE priority NOT IN ('P1', 'P2', 'P3', 'P5');

-- No default value -- a new lead lands with status/priority blank so an
-- employee has to actually look at it and set both deliberately, rather
-- than every unreviewed lead silently reading "Not answered" / "P2" as if
-- someone had already triaged it. DROP DEFAULT/DROP NOT NULL undo what the
-- column had from its very first creation on an existing database (a fresh
-- install never has either, since the CREATE TABLE above no longer
-- declares them).
ALTER TABLE leads ALTER COLUMN status DROP DEFAULT;
ALTER TABLE leads ALTER COLUMN status DROP NOT NULL;
ALTER TABLE leads ALTER COLUMN priority DROP DEFAULT;
ALTER TABLE leads ALTER COLUMN priority DROP NOT NULL;

ALTER TABLE leads ADD CONSTRAINT leads_status_check CHECK (status IS NULL OR status IN ('Won', 'Lost', 'Not answered', 'Contacted', 'Broker'));
ALTER TABLE leads ADD CONSTRAINT leads_priority_check CHECK (priority IS NULL OR priority IN ('P1', 'P2', 'P3', 'P5'));

-- interested_in switched from a fixed enum to free text (real spreadsheets
-- use plot/scheme names that don't fit a short closed list, which just
-- silently defaulted to blank on import) -- drop the constraint the inline
-- CHECK above created on an existing database. Fresh installs never create
-- it in the first place since the CREATE TABLE above no longer declares it.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_interested_in_check;

CREATE INDEX IF NOT EXISTS idx_leads_assigned_user ON leads(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_priority ON leads(priority);
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
CREATE INDEX IF NOT EXISTS idx_leads_next_follow_up ON leads(next_follow_up);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_name ON leads(campaign_name);
CREATE INDEX IF NOT EXISTS idx_leads_adset_name ON leads(adset_name);
CREATE INDEX IF NOT EXISTS idx_leads_ad_name ON leads(ad_name);
CREATE INDEX IF NOT EXISTS idx_leads_rejected_at ON leads(rejected_at);
CREATE INDEX IF NOT EXISTS idx_leads_recur_count ON leads(recur_count);

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  field TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_lead ON audit_log(lead_id);
CREATE INDEX IF NOT EXISTS idx_audit_field_created ON audit_log(field, created_at);


CREATE TABLE IF NOT EXISTS lead_activities (
  id SERIAL PRIMARY KEY,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL CHECK (
    activity_type IN ('call', 'email', 'meeting', 'note', 'other')
  ),
  description TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created
ON lead_activities(lead_id, created_at DESC);
