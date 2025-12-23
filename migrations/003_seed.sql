-- Seed de ejemplo para crear un usuario de prueba y membership
-- Pasos:
-- 1) Crea un usuario en Supabase Auth (o usa un usuario existente) y copia su uuid.
--    En Supabase: Authentication -> Users -> copia el "id" del usuario.
-- 2) Ejecuta este script reemplazando USER_UUID y TENANT_UUID por los valores reales.

-- Ejemplo:
-- INSERT INTO cn_memberships (user_id, tenant_id, role) VALUES ('USER_UUID', 'TENANT_UUID', 'admin');

-- Script template (reemplazar los placeholders):
insert into cn_memberships (user_id, tenant_id, role)
values
  ('USER_UUID', 'TENANT_UUID', 'admin');

-- También puedes listar memberships para verificar:
-- select * from cn_memberships;
