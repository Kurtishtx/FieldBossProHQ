alter table "Properties" add column if not exists property_notes jsonb default '[]'::jsonb;
