-- ============================================================================
-- E-SCALE (Event Scale) · SCHEMA escale.*
-- ----------------------------------------------------------------------------
-- Ejecutar DESPUES de P_Scale/supabase/00_scale_core.sql en el proyecto
-- Supabase "Scale" (https://tppcfpxmfkaswaswgnqp.supabase.co).
--
-- El nucleo compartido vive en public.*:
--   public.companies, public.company_members, public.subscriptions, auth.users.
--
-- Lo propio de E-Scale vive aqui:
--   configuracion de empresa, planos, plantillas, exports, colaboracion.
--
-- DESPUES de ejecutar: Settings > API > Exposed schemas -> anadir 'escale'.
-- ============================================================================

create schema if not exists escale;
grant usage on schema escale to anon, authenticated;

-- ── 1. Configuracion de empresa para E-Scale ─────────────────────────────────
create table if not exists escale.empresa_config (
  company_id       uuid primary key references public.companies(id) on delete cascade,
  logo_url         text,
  venue_default    text,
  cif              text,
  phone            text,
  country          text,
  billing_email    text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── 2. Catalogo publico de planos de sala (solo lectura para usuarios) ────────
create table if not exists escale.floor_plans (
  id             uuid primary key default gen_random_uuid(),
  venue_name     text not null,
  city           text,
  type           text,
  zone           text,
  thumbnail_url  text,
  image_url      text,
  created_at     timestamptz not null default now()
);

-- ── 3. Planos guardados por empresa (comunidad / privados) ────────────────────
create table if not exists escale.org_floor_plans (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies(id) on delete cascade,
  created_by_user_id       uuid references auth.users(id) on delete set null,
  created_by_display_name  text,
  name                     text not null,
  venue                    text,
  ciudad                   text,
  tipo                     text,
  width_m                  numeric(10,2),
  length_m                 numeric(10,2),
  opacity                  numeric(5,2),
  image_data_url           text,
  created_at               timestamptz not null default now(),
  constraint escale_org_floor_plans_unique unique (company_id, name)
);
create index if not exists idx_escale_floor_plans_company on escale.org_floor_plans(company_id);

-- ── 4. Plantillas de evento por empresa ───────────────────────────────────────
create table if not exists escale.org_templates (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references public.companies(id) on delete cascade,
  created_by_user_id       uuid references auth.users(id) on delete set null,
  created_by_display_name  text,
  name                     text not null,
  kind                     text not null,
  data                     jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  constraint escale_org_templates_unique unique (company_id, kind, name)
);
create index if not exists idx_escale_org_templates_company on escale.org_templates(company_id);

-- ── 5. Jobs de exportacion (PDF, plano cenital) ───────────────────────────────
create table if not exists escale.export_jobs (
  id                         uuid primary key default gen_random_uuid(),
  company_id                 uuid not null references public.companies(id) on delete cascade,
  created_by_user_id         uuid references auth.users(id) on delete set null,
  export_type                text not null check (export_type in ('pdf_3d', 'pdf_plan')),
  status                     text not null default 'queued' check (status in ('queued', 'completed', 'failed')),
  event_name                 text,
  venue_name                 text,
  pdf_storage_path           text,
  email_delivery_status      text not null default 'not_sent' check (email_delivery_status in ('not_sent', 'queued', 'sent', 'failed')),
  total_pax                  integer not null default 0,
  total_inventory_items      integer not null default 0,
  total_inventory_categories integer not null default 0,
  scene_snapshot             jsonb not null default '{}'::jsonb,
  metadata                   jsonb not null default '{}'::jsonb,
  created_at                 timestamptz not null default now(),
  completed_at               timestamptz
);
create index if not exists idx_escale_export_jobs_company on escale.export_jobs(company_id);

-- ── 6. Lineas de inventario de un export job ──────────────────────────────────
create table if not exists escale.export_inventory_lines (
  id              bigserial primary key,
  export_job_id   uuid not null references escale.export_jobs(id) on delete cascade,
  category        text not null,
  item_type       text not null,
  item_label      text not null,
  quantity        integer not null default 0,
  pax             integer not null default 0,
  unit_price_eur  numeric(10,2),
  total_price_eur numeric(10,2) generated always as (coalesce(quantity, 0) * coalesce(unit_price_eur, 0)) stored
);
create index if not exists idx_escale_export_lines_job on escale.export_inventory_lines(export_job_id);

-- ── 7. Importaciones de precios de proveedores ────────────────────────────────
create table if not exists escale.provider_price_imports (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  uploaded_by_user_id  uuid references auth.users(id) on delete set null,
  source_kind          text not null default 'excel' check (source_kind in ('excel', 'crm', 'erp')),
  file_storage_path    text,
  status               text not null default 'uploaded' check (status in ('uploaded', 'processing', 'completed', 'failed')),
  imported_rows        integer not null default 0,
  created_at           timestamptz not null default now(),
  completed_at         timestamptz
);
create index if not exists idx_escale_price_imports_company on escale.provider_price_imports(company_id);

-- ── 8. Conexiones de integracion (SharePoint, CRM, ERP) ──────────────────────
create table if not exists escale.integration_connections (
  id                  uuid primary key default gen_random_uuid(),
  company_id          uuid not null references public.companies(id) on delete cascade,
  provider            text not null check (provider in ('sharepoint', 'crm', 'erp', 'resend', 'stripe', 'posthog', 'crisp')),
  connection_status   text not null default 'draft' check (connection_status in ('draft', 'active', 'error', 'disabled')),
  external_tenant_id  text,
  config              jsonb not null default '{}'::jsonb,
  last_sync_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint escale_integration_connections_unique unique (company_id, provider)
);
create index if not exists idx_escale_integration_company on escale.integration_connections(company_id);

-- ── 9. Sesiones de colaboracion (basadas en invite_token, sin company FK) ─────
create table if not exists escale.collab_sessions (
  id                  uuid primary key default gen_random_uuid(),
  host_user_id        uuid references auth.users(id) on delete set null,
  host_display_name   text not null,
  session_name        text not null,
  guest_role          text not null default 'editor' check (guest_role in ('editor', 'viewer')),
  invite_token        uuid not null default gen_random_uuid() unique,
  scene_snapshot      jsonb not null default '[]'::jsonb,
  plan_snapshot       jsonb not null default '{}'::jsonb,
  status              text not null default 'active' check (status in ('active', 'ended')),
  expires_at          timestamptz not null,
  created_at          timestamptz not null default now()
);
create index if not exists idx_escale_collab_sessions_token on escale.collab_sessions(invite_token);
create index if not exists idx_escale_collab_sessions_host  on escale.collab_sessions(host_user_id);

-- ── 10. Participantes de sesion de colaboracion ───────────────────────────────
create table if not exists escale.collab_participants (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references escale.collab_sessions(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  display_name  text not null,
  email         text,
  role          text not null default 'editor' check (role in ('editor', 'viewer')),
  joined_at     timestamptz not null default now()
);
create index if not exists idx_escale_collab_participants_session on escale.collab_participants(session_id);

-- ── 11. Invitaciones al equipo ────────────────────────────────────────────────
create table if not exists escale.org_invitations (
  id                   uuid primary key default gen_random_uuid(),
  company_id           uuid not null references public.companies(id) on delete cascade,
  invited_email        text not null,
  invited_role         text not null default 'editor' check (invited_role in ('admin', 'editor', 'viewer')),
  invited_by_user_id   uuid references auth.users(id) on delete set null,
  invited_by_name      text,
  status               text not null default 'pending' check (status in ('pending', 'accepted', 'expired')),
  expires_at           timestamptz not null default (now() + interval '7 days'),
  created_at           timestamptz not null default now(),
  constraint escale_org_invitations_unique unique (company_id, invited_email)
);
create index if not exists idx_escale_invitations_email   on escale.org_invitations(invited_email);
create index if not exists idx_escale_invitations_company on escale.org_invitations(company_id);

-- ── 12. Registro de auditoria ─────────────────────────────────────────────────
create table if not exists escale.audit_events (
  id             bigserial primary key,
  company_id     uuid references public.companies(id) on delete cascade,
  actor_user_id  uuid references auth.users(id) on delete set null,
  event_type     text not null,
  event_payload  jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index if not exists idx_escale_audit_company on escale.audit_events(company_id);

-- ── Funcion trigger updated_at ────────────────────────────────────────────────
create or replace function escale.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── RLS: tablas con company_id (politica tenant estandar) ─────────────────────
do $$ declare t text;
begin
  foreach t in array array[
    'empresa_config',
    'org_floor_plans',
    'org_templates',
    'export_jobs',
    'provider_price_imports',
    'integration_connections',
    'org_invitations',
    'audit_events'
  ]
  loop
    execute format('alter table escale.%I enable row level security;', t);
    execute format('drop policy if exists tenant_%1$s on escale.%1$I;', t);
    execute format($f$
      create policy tenant_%1$s on escale.%1$I
      using  ( company_id in (select public.user_company_ids()) )
      with check ( company_id in (select public.user_company_ids()) );
    $f$, t);
  end loop;
end $$;

-- RLS especial: export_inventory_lines (FK a export_jobs, sin company_id directo)
alter table escale.export_inventory_lines enable row level security;
drop policy if exists tenant_export_inventory_lines on escale.export_inventory_lines;
create policy tenant_export_inventory_lines on escale.export_inventory_lines
  using (
    exists (
      select 1 from escale.export_jobs j
      where j.id = export_job_id
        and j.company_id in (select public.user_company_ids())
    )
  )
  with check (
    exists (
      select 1 from escale.export_jobs j
      where j.id = export_job_id
        and j.company_id in (select public.user_company_ids())
    )
  );

-- RLS: floor_plans (catalogo publico — solo lectura para todos)
alter table escale.floor_plans enable row level security;
drop policy if exists read_floor_plans on escale.floor_plans;
create policy read_floor_plans on escale.floor_plans for select using (true);

-- RLS: collab_sessions (sesiones activas visibles para join; solo el host gestiona)
alter table escale.collab_sessions enable row level security;
drop policy if exists read_collab_sessions on escale.collab_sessions;
create policy read_collab_sessions on escale.collab_sessions
  for select using (host_user_id = auth.uid() or status = 'active');
drop policy if exists insert_collab_sessions on escale.collab_sessions;
create policy insert_collab_sessions on escale.collab_sessions
  for insert to authenticated with check (host_user_id = auth.uid());
drop policy if exists update_collab_sessions on escale.collab_sessions;
create policy update_collab_sessions on escale.collab_sessions
  for update using (host_user_id = auth.uid());
drop policy if exists delete_collab_sessions on escale.collab_sessions;
create policy delete_collab_sessions on escale.collab_sessions
  for delete using (host_user_id = auth.uid());

-- RLS: collab_participants (host ve todos; participante ve los suyos)
alter table escale.collab_participants enable row level security;
drop policy if exists read_collab_participants on escale.collab_participants;
create policy read_collab_participants on escale.collab_participants
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from escale.collab_sessions s
      where s.id = session_id and s.host_user_id = auth.uid()
    )
  );
drop policy if exists insert_collab_participants on escale.collab_participants;
create policy insert_collab_participants on escale.collab_participants
  for insert to authenticated with check (true);

-- ── Triggers updated_at ───────────────────────────────────────────────────────
do $$ declare t text;
begin
  foreach t in array array[
    'empresa_config',
    'integration_connections'
  ]
  loop
    execute format('drop trigger if exists set_updated_at_%1$s on escale.%1$I;', t);
    execute format(
      'create trigger set_updated_at_%1$s before update on escale.%1$I for each row execute function escale.set_updated_at();',
      t
    );
  end loop;
end $$;

-- ── Grants ────────────────────────────────────────────────────────────────────
grant select, insert, update, delete on all tables    in schema escale to authenticated;
grant usage, select                  on all sequences in schema escale to authenticated;
alter default privileges in schema escale grant select, insert, update, delete on tables    to authenticated;
alter default privileges in schema escale grant usage, select                  on sequences to authenticated;

-- ── Storage buckets ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values
  ('company-logos',     'company-logos',     false),
  ('export-pdfs',       'export-pdfs',       false),
  ('provider-imports',  'provider-imports',  false)
on conflict (id) do nothing;
