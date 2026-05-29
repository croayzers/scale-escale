-- ============================================================
--  saved_groups — Grupos de elementos guardados por empresa
--  Idempotente: seguro aunque la tabla ya exista
-- ============================================================

create table if not exists public.saved_groups (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id     uuid references auth.users(id) on delete set null,
  created_by_display_name text,

  name                   text not null,
  item_count             integer not null default 0,
  thumbnail_svg          text,
  item_templates         jsonb not null default '[]'::jsonb,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

-- Añadir columnas que puedan faltar si la tabla ya existía con un esquema antiguo
do $$ begin
  alter table public.saved_groups add column if not exists created_by_display_name text;
  alter table public.saved_groups add column if not exists item_count integer not null default 0;
  alter table public.saved_groups add column if not exists thumbnail_svg text;
  alter table public.saved_groups add column if not exists item_templates jsonb not null default '[]'::jsonb;
  alter table public.saved_groups add column if not exists updated_at timestamptz not null default now();
exception when others then null;
end $$;

-- Índice
create index if not exists saved_groups_org_id_idx
  on public.saved_groups(organization_id);

-- Función set_updated_at (idempotente)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Trigger (drop+create para evitar conflicto)
drop trigger if exists saved_groups_updated_at on public.saved_groups;
create trigger saved_groups_updated_at
  before update on public.saved_groups
  for each row execute function public.set_updated_at();

-- RLS
alter table public.saved_groups enable row level security;

-- Policies (drop previo para que sea idempotente)
drop policy if exists "org members can read saved groups" on public.saved_groups;
create policy "org members can read saved groups"
  on public.saved_groups for select
  using (public.is_org_member(organization_id));

drop policy if exists "org members can insert saved groups" on public.saved_groups;
create policy "org members can insert saved groups"
  on public.saved_groups for insert
  with check (public.is_org_member(organization_id));

drop policy if exists "org members can update saved groups" on public.saved_groups;
create policy "org members can update saved groups"
  on public.saved_groups for update
  using (public.is_org_member(organization_id));

drop policy if exists "creator can delete saved groups" on public.saved_groups;
create policy "creator can delete saved groups"
  on public.saved_groups for delete
  using (
    public.is_org_member(organization_id)
    and (created_by_user_id = auth.uid() or created_by_user_id is null)
  );
