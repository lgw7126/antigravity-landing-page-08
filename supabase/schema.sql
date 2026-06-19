-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Settings Table
create table if not exists settings (
  id uuid primary key default uuid_generate_v4(),
  patient_name text not null,
  guardian_phone text not null,
  medications jsonb default '[]'::jsonb, -- Store list of meds: [{"id": "1", "name": "혈압약"}, {"id": "2", "name": "영양제"}]
  alarm_time text default '08:00', -- Daily alarm time (Format 'HH:MM')
  pin_code text not null check (length(pin_code) = 4),
  created_at timestamptz default now()
);

-- 2. Health Records Table
create table if not exists health_records (
  id uuid primary key default uuid_generate_v4(),
  patient_id uuid references settings(id) on delete cascade,
  created_at timestamptz default now(),
  medication_taken boolean not null, -- Overall medication confirmation summary
  medications_status jsonb default '{}'::jsonb, -- Store detailed medication intake: {"혈압약": true, "영양제": false}
  systolic integer,
  diastolic integer,
  status text not null check (status in ('정상', '경계', '위험')),
  sms_sent boolean default false
);

-- Enable RLS (Row Level Security) - For MVP simplicity, we can allow public read/write but in production it should be secured.
alter table settings enable row level security;
alter table health_records enable row level security;

-- Create simple policies allowing all access (since this is an MVP single-user app)
create policy "Allow public access to settings" on settings for all using (true) with check (true);
create policy "Allow public access to health_records" on health_records for all using (true) with check (true);
