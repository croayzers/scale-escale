-- ============================================================
--  Contenido compartido por empresa: planos y plantillas
--  Idempotente: seguro de re-ejecutar
-- ============================================================

-- Función set_updated_at (idempotente — puede ya existir)
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Planos subidos por la organización ───────────────────────
create table if not exists public.org_floor_plans (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id      uuid references auth.users(id) on delete set null,
  created_by_display_name text,

  name                    text not null,
  venue                   text,
  width_m                 numeric not null default 30,
  length_m                numeric not null default 30,
  opacity                 numeric not null default 0.7,
  image_data_url          text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (organization_id, name)
);

create index if not exists org_floor_plans_org_idx
  on public.org_floor_plans(organization_id);

drop trigger if exists org_floor_plans_updated_at on public.org_floor_plans;
create trigger org_floor_plans_updated_at
  before update on public.org_floor_plans
  for each row execute function public.set_updated_at();

alter table public.org_floor_plans enable row level security;

drop policy if exists "org members can read org floor plans" on public.org_floor_plans;
create policy "org members can read org floor plans"
  on public.org_floor_plans for select
  using (public.is_org_member(organization_id));

drop policy if exists "org members can insert org floor plans" on public.org_floor_plans;
create policy "org members can insert org floor plans"
  on public.org_floor_plans for insert
  with check (public.is_org_member(organization_id));

drop policy if exists "org members can update org floor plans" on public.org_floor_plans;
create policy "org members can update org floor plans"
  on public.org_floor_plans for update
  using (public.is_org_member(organization_id));

drop policy if exists "creator can delete org floor plans" on public.org_floor_plans;
create policy "creator can delete org floor plans"
  on public.org_floor_plans for delete
  using (
    public.is_org_member(organization_id)
    and (created_by_user_id = auth.uid() or created_by_user_id is null)
  );

-- ── Plantillas compartidas por la organización ───────────────
create table if not exists public.org_templates (
  id                      uuid primary key default gen_random_uuid(),
  organization_id         uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id      uuid references auth.users(id) on delete set null,
  created_by_display_name text,

  name                    text not null,
  kind                    text not null check (kind in ('base', 'planning')),
  data                    jsonb not null default '{}'::jsonb,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (organization_id, kind, name)
);

create index if not exists org_templates_org_kind_idx
  on public.org_templates(organization_id, kind);

drop trigger if exists org_templates_updated_at on public.org_templates;
create trigger org_templates_updated_at
  before update on public.org_templates
  for each row execute function public.set_updated_at();

alter table public.org_templates enable row level security;

drop policy if exists "org members can read org templates" on public.org_templates;
create policy "org members can read org templates"
  on public.org_templates for select
  using (public.is_org_member(organization_id));

drop policy if exists "org members can insert org templates" on public.org_templates;
create policy "org members can insert org templates"
  on public.org_templates for insert
  with check (public.is_org_member(organization_id));

drop policy if exists "org members can update org templates" on public.org_templates;
create policy "org members can update org templates"
  on public.org_templates for update
  using (public.is_org_member(organization_id));

drop policy if exists "creator can delete org templates" on public.org_templates;
create policy "creator can delete org templates"
  on public.org_templates for delete
  using (
    public.is_org_member(organization_id)
    and (created_by_user_id = auth.uid() or created_by_user_id is null)
  );
