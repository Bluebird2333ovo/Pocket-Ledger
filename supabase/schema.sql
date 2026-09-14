-- Pocket Ledger V1 migration. Run this once in the Supabase SQL Editor.
-- It upgrades the original category-based schema without deleting transactions.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'CNY' check (currency in ('CNY', 'USD')),
  updated_at timestamptz not null default now()
);

create table if not exists public.ledgers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('income', 'expense')),
  name text not null check (char_length(trim(name)) between 1 and 60),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, type, name)
);

-- This also lets a new project use this file directly; existing projects keep their rows.
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  type text not null check (type in ('income', 'expense')),
  amount numeric(12, 2) not null check (amount > 0),
  date date not null default current_date,
  note text check (char_length(note) <= 140),
  created_at timestamptz not null default now()
);

alter table public.transactions add column if not exists currency text;
alter table public.transactions add column if not exists ledger_id uuid references public.ledgers(id) on delete set null;
alter table public.transactions add column if not exists ledger_name text;

-- Preserve legacy categories as ledger names before removing the old column.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'transactions' and column_name = 'category'
  ) then
    execute 'update public.transactions set ledger_name = category where ledger_name is null';
  end if;
end $$;

update public.transactions set currency = 'CNY' where currency is null;
update public.transactions set ledger_name = 'Other' where ledger_name is null or char_length(trim(ledger_name)) = 0;

alter table public.transactions alter column currency set default 'CNY';
alter table public.transactions alter column currency set not null;
alter table public.transactions alter column ledger_name set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_currency_check') then
    alter table public.transactions add constraint transactions_currency_check check (currency in ('CNY', 'USD'));
  end if;
end $$;

-- Create settings and the built-in ledgers for existing users.
insert into public.user_settings (user_id, currency)
select id, 'CNY' from auth.users
on conflict (user_id) do nothing;

insert into public.ledgers (user_id, type, name, is_default)
select u.id, v.type, v.name, true
from auth.users u
cross join (values
  ('expense', 'Food'), ('expense', 'Transportation'), ('expense', 'Shopping'),
  ('expense', 'Entertainment'), ('expense', 'Bills'), ('expense', 'Health'),
  ('expense', 'Education'), ('expense', 'Other'),
  ('income', 'Salary'), ('income', 'Gift'), ('income', 'Refund'), ('income', 'Other')
) as v(type, name)
on conflict (user_id, type, name) do nothing;

-- Keep any legacy category names as usable user ledgers, then link old transactions.
insert into public.ledgers (user_id, type, name, is_default)
select distinct user_id, type, ledger_name, false
from public.transactions
on conflict (user_id, type, name) do nothing;

update public.transactions t
set ledger_id = l.id
from public.ledgers l
where t.ledger_id is null
  and l.user_id = t.user_id
  and l.type = t.type
  and l.name = t.ledger_name;

alter table public.transactions drop column if exists category;

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_user_ledger_date_idx on public.transactions (user_id, ledger_id, date desc);
create index if not exists ledgers_user_type_idx on public.ledgers (user_id, type, name);

alter table public.transactions enable row level security;
alter table public.ledgers enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "Users can view their own transactions" on public.transactions;
drop policy if exists "Users can add their own transactions" on public.transactions;
drop policy if exists "Users can delete their own transactions" on public.transactions;
drop policy if exists "Users can update their own transactions" on public.transactions;
create policy "Users can view their own transactions" on public.transactions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add their own transactions" on public.transactions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own transactions" on public.transactions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete their own transactions" on public.transactions for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own ledgers" on public.ledgers;
drop policy if exists "Users can add their own ledgers" on public.ledgers;
drop policy if exists "Users can update their own ledgers" on public.ledgers;
drop policy if exists "Users can delete their own ledgers" on public.ledgers;
create policy "Users can view their own ledgers" on public.ledgers for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add their own ledgers" on public.ledgers for insert to authenticated with check ((select auth.uid()) = user_id and is_default = false);
create policy "Users can update their own ledgers" on public.ledgers for update to authenticated using ((select auth.uid()) = user_id and is_default = false) with check ((select auth.uid()) = user_id and is_default = false);
create policy "Users can delete their own ledgers" on public.ledgers for delete to authenticated using ((select auth.uid()) = user_id and is_default = false);

drop policy if exists "Users can view their own settings" on public.user_settings;
drop policy if exists "Users can add their own settings" on public.user_settings;
drop policy if exists "Users can update their own settings" on public.user_settings;
create policy "Users can view their own settings" on public.user_settings for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can add their own settings" on public.user_settings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update their own settings" on public.user_settings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Every future authenticated user receives synchronized settings and built-in ledgers.
create or replace function public.initialize_pocket_ledger_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.user_settings (user_id, currency) values (new.id, 'CNY') on conflict (user_id) do nothing;
  insert into public.ledgers (user_id, type, name, is_default)
  select new.id, v.type, v.name, true
  from (values
    ('expense', 'Food'), ('expense', 'Transportation'), ('expense', 'Shopping'),
    ('expense', 'Entertainment'), ('expense', 'Bills'), ('expense', 'Health'),
    ('expense', 'Education'), ('expense', 'Other'),
    ('income', 'Salary'), ('income', 'Gift'), ('income', 'Refund'), ('income', 'Other')
  ) as v(type, name)
  on conflict (user_id, type, name) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_pocket_ledger on auth.users;
create trigger on_auth_user_created_pocket_ledger
  after insert on auth.users
  for each row execute procedure public.initialize_pocket_ledger_user();
