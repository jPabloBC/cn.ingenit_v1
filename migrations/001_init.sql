-- Inicialización mínima para scaffold SII
-- Tablas: tenants, tenant_folio_seq, folios
-- Función: next_folio(tenant uuid)

create extension if not exists "pgcrypto";


create table if not exists cn_tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz default now()
);

create table if not exists cn_tenant_folio_seq (
  tenant_id uuid primary key references cn_tenants(id) on delete cascade,
  last_folio bigint not null default 0
);

create table if not exists cn_folios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references cn_tenants(id) on delete cascade,
  folio bigint not null,
  created_at timestamptz default now(),
  constraint cn_tenant_folio_unique unique (tenant_id, folio)
);

-- Función segura para generar el siguiente folio por tenant (usa row-level locking)
create or replace function next_folio(tenant uuid)
returns bigint language plpgsql as $$
declare
  v bigint;
begin
  -- ensure row exists
  insert into cn_tenant_folio_seq (tenant_id, last_folio)
    values (tenant, 0)
    on conflict (tenant_id) do nothing;

  update cn_tenant_folio_seq set last_folio = last_folio + 1
    where tenant_id = tenant
    returning last_folio into v;

  return v;
end;
$$;

-- Nota: configurar RLS y políticas según modelo de auth; esta migración deja la lógica en la BD.
