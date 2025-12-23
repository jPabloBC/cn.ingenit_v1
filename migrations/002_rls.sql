-- RLS and membership setup for multi-tenant access control


-- Table to map users to tenants with roles (prefixed with cn_)
create table if not exists cn_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  tenant_id uuid not null references cn_tenants(id) on delete cascade,
  role text not null default 'viewer',
  created_at timestamptz default now(),
  constraint cn_membership_unique unique (user_id, tenant_id)
);

-- Enable RLS on cn_tenants, cn_folios and cn_tenant_folio_seq
alter table cn_tenants enable row level security;
alter table cn_folios enable row level security;
alter table cn_tenant_folio_seq enable row level security;

-- Policy: members can access tenants
create policy "Members can access tenants" on cn_tenants
  for all
  using (
    exists (select 1 from cn_memberships m where m.user_id = auth.uid() and m.tenant_id = cn_tenants.id)
  );

-- Policy: members can operate on folios belonging to their tenant
create policy "Tenant members operate on folios" on cn_folios
  for all
  using (
    exists (select 1 from cn_memberships m where m.user_id = auth.uid() and m.tenant_id = cn_folios.tenant_id)
  ) with check (
    exists (select 1 from cn_memberships m where m.user_id = auth.uid() and m.tenant_id = cn_folios.tenant_id)
  );

-- Policy: allow workers/services to update cn_tenant_folio_seq only if they are service_role
create policy "Service role can update tenant_folio_seq" on cn_tenant_folio_seq
  for update
  using (auth.role() = 'service_role');

-- Note: auth.uid() and auth.role() are Supabase helper functions available when using Supabase Auth.
-- Adjust policies if using a different auth mechanism (e.g., check jwt claims with current_setting('jwt.claims.user_id')).
