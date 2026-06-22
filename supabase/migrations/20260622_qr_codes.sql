-- ============================================================================
-- E-SCALE · Generador de QR (estaticos + dinamicos) · schema escale.*
-- ----------------------------------------------------------------------------
-- Crea:
--   escale.qr_codes        -> definicion del QR (enlace corto /q/:code editable)
--   escale.qr_scan_events  -> una fila por escaneo (estadisticas detalladas)
--
-- Patron de aislamiento por organizacion: company_id -> public.companies(id),
-- RLS con public.user_company_ids() (identico a supabase/01_escale.sql).
--
-- La ruta serverless de redireccion /q/:code usa service-role (bypassa RLS):
--   lee el QR por code, valida is_active + expires_at, inserta el scan_event e
--   incrementa scan_count/last_scan_at. El que escanea es anonimo (sin sesion).
--
-- DESPUES de ejecutar en SQL Editor: el schema 'escale' ya esta expuesto en
-- Settings > API. Idempotente: seguro de re-ejecutar.
-- ============================================================================

create schema if not exists escale;
grant usage on schema escale to anon, authenticated;

-- Funcion trigger updated_at (idempotente — ya existe en 01_escale.sql)
create or replace function escale.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ── 1. QR codes ───────────────────────────────────────────────────────────────
create table if not exists escale.qr_codes (
  id            uuid primary key default gen_random_uuid(),
  -- codigo corto del enlace /q/:code (base62 7-8 chars). Lo genera la app/ruta.
  code          text not null unique,
  -- aislamiento por organizacion + autoria
  company_id    uuid not null references public.companies(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  -- estatico (contenido fijo embebido) o dinamico (redirige por enlace corto editable)
  kind          text not null check (kind in ('static', 'dynamic')),
  -- tipo de contenido del QR
  type          text not null check (type in (
                  'url', 'text', 'vcard', 'wifi', 'email',
                  'phone', 'whatsapp', 'sms', 'pdf'
                )),
  title         text,                 -- nombre legible para "Mis QR"
  target_url    text,                 -- destino del dinamico; null en estaticos sin URL
  payload       jsonb not null default '{}'::jsonb,  -- datos no-URL (vcard, wifi, ...)
  is_active     boolean not null default true,       -- desactivar sin borrar
  -- caducidad opcional; null = no caduca. Maximo 15 dias desde la creacion.
  expires_at    timestamptz,
  scan_count    integer not null default 0,          -- contador denormalizado
  last_scan_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint escale_qr_codes_expiry_max_15d
    check (expires_at is null or expires_at <= created_at + interval '15 days')
);

create index if not exists idx_escale_qr_codes_company on escale.qr_codes(company_id);
create unique index if not exists idx_escale_qr_codes_code on escale.qr_codes(code);

-- ── 2. Eventos de escaneo (stats detalladas, una fila por escaneo) ────────────
create table if not exists escale.qr_scan_events (
  id           uuid primary key default gen_random_uuid(),
  qr_id        uuid not null references escale.qr_codes(id) on delete cascade,
  scanned_at   timestamptz not null default now(),
  ip_hash      text,        -- NO se guarda IP en claro; la ruta calcula el hash
  country      text,        -- geo aproximada por IP (puede ir null)
  city         text,
  user_agent   text,
  device_type  text,        -- mobile / tablet / desktop
  os           text,
  browser      text,
  referrer     text,
  lang         text         -- idioma del navegador (accept-language)
);

create index if not exists idx_escale_qr_scan_events_qr      on escale.qr_scan_events(qr_id);
create index if not exists idx_escale_qr_scan_events_scanned on escale.qr_scan_events(scanned_at);

-- ── 3. RLS ─────────────────────────────────────────────────────────────────────

-- qr_codes: politica tenant estandar (identica al resto de escale.*).
-- El dueno/organizacion ve y edita SOLO sus QR. La ruta de redireccion usa
-- service-role, que bypassa RLS, para leer por code e incrementar contadores.
alter table escale.qr_codes enable row level security;
drop policy if exists tenant_qr_codes on escale.qr_codes;
create policy tenant_qr_codes on escale.qr_codes
  using  ( company_id in (select public.user_company_ids()) )
  with check ( company_id in (select public.user_company_ids()) );

-- qr_scan_events: el dueno SELECT los eventos de SUS qr (join por qr_id).
-- Insert solo via service-role (la ruta anonima); nadie ajeno lee eventos de otro.
alter table escale.qr_scan_events enable row level security;
drop policy if exists tenant_qr_scan_events on escale.qr_scan_events;
create policy tenant_qr_scan_events on escale.qr_scan_events
  for select using (
    exists (
      select 1 from escale.qr_codes q
      where q.id = qr_id
        and q.company_id in (select public.user_company_ids())
    )
  );

-- ── 4. Trigger updated_at ────────────────────────────────────────────────────
drop trigger if exists set_updated_at_qr_codes on escale.qr_codes;
create trigger set_updated_at_qr_codes
  before update on escale.qr_codes
  for each row execute function escale.set_updated_at();

-- ── 5. Grants ────────────────────────────────────────────────────────────────
grant select, insert, update, delete on all tables    in schema escale to authenticated;
grant usage, select                  on all sequences in schema escale to authenticated;
alter default privileges in schema escale grant select, insert, update, delete on tables    to authenticated;
alter default privileges in schema escale grant usage, select                  on sequences to authenticated;
