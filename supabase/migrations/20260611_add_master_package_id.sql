alter table "Packages" add column if not exists master_package_id uuid references "Packages"(id) on delete set null;
