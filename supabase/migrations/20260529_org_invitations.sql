-- ============================================================
--  organization_invitations — Invitaciones a equipos de empresa
--  Idempotente: seguro de re-ejecutar
-- ============================================================

create table if not exists public.organization_invitations (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  invited_email     text not null,
  invited_role      text not null default 'editor'
                      check (invited_role in ('admin', 'editor', 'viewer')),
  invited_by_user_id uuid references auth.users(id) on delete set null,
  invited_by_name   text,
  status            text not null default 'pending'
                      check (status in ('pending', 'accepted', 'expired')),
  token             text unique default encode(gen_random_bytes(20), 'hex'),
  expires_at        timestamptz not null default now() + interval '14 days',
  created_at        timestamptz not null default now(),

  unique (organization_id, invited_email)
);

create index if not exists org_invitations_email_idx
  on public.organization_invitations(invited_email, status);

create index if not exists org_invitations_org_idx
  on public.organization_invitations(organization_id, status);

alter table public.organization_invitations enable row level security;

drop policy if exists "invited user can read own invitations" on public.organization_invitations;
create policy "invited user can read own invitations"
  on public.organization_invitations for select
  using (
    invited_email = lower(coalesce(auth.jwt() ->> 'email', ''))
    or public.is_org_member(organization_id)
  );

drop policy if exists "org members can create invitations" on public.organization_invitations;
create policy "org members can create invitations"
  on public.organization_invitations for insert
  with check (public.is_org_member(organization_id));

drop policy if exists "org members can update invitations" on public.organization_invitations;
create policy "org members can update invitations"
  on public.organization_invitations for update
  using (
    public.is_org_member(organization_id)
    or invited_email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "org members can delete invitations" on public.organization_invitations;
create policy "org members can delete invitations"
  on public.organization_invitations for delete
  using (public.is_org_member(organization_id));

-- Helper is_org_admin (idempotente)
create or replace function public.is_org_admin(p_organization_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.organization_members
    where organization_id = p_organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
      and status = 'active'
  );
$$;
