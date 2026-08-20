-- Run this in Supabase SQL Editor.
-- Replace YOUR_ADMIN_EMAIL with the email address you will use for the private dashboard.

create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  post_slug text not null,
  name text,
  message text not null check (char_length(message) between 1 and 4000),
  status text not null default 'unread'
    check (status in ('unread', 'read', 'archived')),
  created_at timestamptz not null default now()
);

alter table public.responses enable row level security;

-- Public visitors can submit a response.
create policy "Anyone can submit a response"
on public.responses
for insert
to anon
with check (
  char_length(message) between 1 and 4000
  and char_length(coalesce(name, '')) <= 80
);

-- Only your authenticated admin email can read responses.
create policy "Admin can read responses"
on public.responses
for select
to authenticated
using (
  (select auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL'
);

-- Only your authenticated admin email can update response status.
create policy "Admin can update responses"
on public.responses
for update
to authenticated
using (
  (select auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL'
)
with check (
  (select auth.jwt() ->> 'email') = 'YOUR_ADMIN_EMAIL'
);

grant insert on public.responses to anon;
grant select, update on public.responses to authenticated;

-- Optional anti-spam protection can be added later with an Edge Function
-- or a CAPTCHA/Turnstile layer if the site becomes public and receives abuse.
