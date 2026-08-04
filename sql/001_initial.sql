    create extension if not exists pgcrypto;

    create table if not exists reservations (
        id uuid primary key default gen_random_uuid(),
        title text not null check (length(title) between 1 and 256),
        summary text not null default '' check (length(summary) <= 4000),
        member_name text not null,
space_name text not null,
starts_at timestamptz not null,
ends_at timestamptz not null,
        status text not null default 'requested',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
    );

    create index if not exists reservations_status_created_idx
      on reservations(status, created_at desc, id);

    alter table reservations enable row level security;

    -- Production must replace this deny-by-default baseline with explicit
    -- tenant-scoped policies tied to authenticated subjects.
    drop policy if exists deny_anon_reservations on reservations;
    create policy deny_anon_reservations on reservations
      for all to anon using (false) with check (false);
