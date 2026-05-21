create extension if not exists pgcrypto;

create table if not exists public.subscription_tiers (
  code text primary key,
  name text not null,
  monthly_price_eur numeric(10,2) not null default 0,
  annual_price_eur numeric(10,2),
  stripe_price_id text unique,
  own_logo_enabled boolean not null default false,
  pdf_export_enabled boolean not null default false,
  email_pdf_to_owner_enabled boolean not null default false,
  email_pdf_to_client_enabled boolean not null default false,
  supplier_excel_enabled boolean not null default false,
  crm_enabled boolean not null default false,
  erp_enabled boolean not null default false,
  sharepoint_enabled boolean not null default false,
  reporting_enabled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.subscription_tiers (
  code,
  name,
  monthly_price_eur,
  own_logo_enabled,
  pdf_export_enabled,
  email_pdf_to_owner_enabled,
  email_pdf_to_client_enabled,
  supplier_excel_enabled,
  crm_enabled,
  erp_enabled,
  sharepoint_enabled,
  reporting_enabled
) values
  ('free_lite', 'Free Lite', 0, false, false, false, false, false, false, false, false, false),
  ('pro', 'PRO', 34, true, true, true, false, true, false, false, false, true),
  ('premium', 'Premium', 120, true, true, true, true, true, true, true, true, true)
on conflict (code) do update set
  name = excluded.name,
  monthly_price_eur = excluded.monthly_price_eur,
  own_logo_enabled = excluded.own_logo_enabled,
  pdf_export_enabled = excluded.pdf_export_enabled,
  email_pdf_to_owner_enabled = excluded.email_pdf_to_owner_enabled,
  email_pdf_to_client_enabled = excluded.email_pdf_to_client_enabled,
  supplier_excel_enabled = excluded.supplier_excel_enabled,
  crm_enabled = excluded.crm_enabled,
  erp_enabled = excluded.erp_enabled,
  sharepoint_enabled = excluded.sharepoint_enabled,
  reporting_enabled = excluded.reporting_enabled,
  updated_at = now();

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  persona text not null default 'company' check (persona in ('particular', 'freelance', 'company')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  legal_name text,
  logo_path text,
  billing_email text,
  owner_user_id uuid references auth.users (id) on delete set null,
  current_tier_code text not null references public.subscription_tiers (code) default 'free_lite',
  venue_default text,
  phone text,
  cif text,
  country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id bigserial primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  status text not null default 'active' check (status in ('active', 'invited', 'disabled')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.billing_customers (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  stripe_price_id text,
  subscription_status text not null default 'free_lite',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  vat_number text,
  tax_country text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_entitlements (
  id bigserial primary key,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default false,
  limit_value integer,
  source text not null default 'tier' check (source in ('tier', 'manual', 'promo')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, feature_key)
);

create table if not exists public.export_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  created_by_user_id uuid references auth.users (id) on delete set null,
  export_type text not null check (export_type in ('pdf_3d', 'pdf_plan')),
  status text not null default 'queued' check (status in ('queued', 'completed', 'failed')),
  event_name text,
  venue_name text,
  pdf_storage_path text,
  email_delivery_status text not null default 'not_sent' check (email_delivery_status in ('not_sent', 'queued', 'sent', 'failed')),
  total_pax integer not null default 0,
  total_inventory_items integer not null default 0,
  total_inventory_categories integer not null default 0,
  scene_snapshot jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.export_inventory_lines (
  id bigserial primary key,
  export_job_id uuid not null references public.export_jobs (id) on delete cascade,
  category text not null,
  item_type text not null,
  item_label text not null,
  quantity integer not null default 0,
  pax integer not null default 0,
  unit_price_eur numeric(10,2),
  total_price_eur numeric(10,2) generated always as (coalesce(quantity, 0) * coalesce(unit_price_eur, 0)) stored
);

create table if not exists public.provider_price_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  uploaded_by_user_id uuid references auth.users (id) on delete set null,
  source_kind text not null default 'excel' check (source_kind in ('excel', 'crm', 'erp')),
  file_storage_path text,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'completed', 'failed')),
  imported_rows integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider text not null check (provider in ('sharepoint', 'crm', 'erp', 'resend', 'stripe', 'posthog', 'crisp')),
  connection_status text not null default 'draft' check (connection_status in ('draft', 'active', 'error', 'disabled')),
  external_tenant_id text,
  config jsonb not null default '{}'::jsonb,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider)
);

create table if not exists public.audit_events (
  id bigserial primary key,
  organization_id uuid references public.organizations (id) on delete cascade,
  actor_user_id uuid references auth.users (id) on delete set null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.billing_customers enable row level security;
alter table public.feature_entitlements enable row level security;
alter table public.export_jobs enable row level security;
alter table public.export_inventory_lines enable row level security;
alter table public.provider_price_imports enable row level security;
alter table public.integration_connections enable row level security;
alter table public.audit_events enable row level security;

create policy "org members can read organizations"
on public.organizations
for select
using (public.is_org_member(id));

create policy "org members can read organization members"
on public.organization_members
for select
using (public.is_org_member(organization_id));

create policy "org members can read billing customers"
on public.billing_customers
for select
using (public.is_org_member(organization_id));

create policy "org members can read entitlements"
on public.feature_entitlements
for select
using (public.is_org_member(organization_id));

create policy "org members can read export jobs"
on public.export_jobs
for select
using (public.is_org_member(organization_id));

create policy "org members can read export inventory lines"
on public.export_inventory_lines
for select
using (
  exists (
    select 1
    from public.export_jobs j
    where j.id = export_job_id
      and public.is_org_member(j.organization_id)
  )
);

create policy "org members can read price imports"
on public.provider_price_imports
for select
using (public.is_org_member(organization_id));

create policy "org members can read integration connections"
on public.integration_connections
for select
using (public.is_org_member(organization_id));

create policy "org members can read audit events"
on public.audit_events
for select
using (public.is_org_member(organization_id));
