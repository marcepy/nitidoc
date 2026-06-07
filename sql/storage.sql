-- =====================================================================
-- NITIDOC — Configuración de Supabase Storage
-- =====================================================================
-- Buckets recomendados (crear desde el Dashboard de Supabase o vía API):
--
--   1. "doctor-assets"   -> logos, firmas digitales, sellos del médico
--   2. "patient-files"   -> estudios, imágenes clínicas, PDFs de pacientes
--
-- Ambos buckets deben crearse como PRIVADOS (public = false).
-- El acceso se realiza mediante URLs firmadas (createSignedUrl) generadas
-- desde el frontend autenticado, nunca exponiendo el bucket públicamente.
--
-- Convención de rutas (paths) dentro de cada bucket:
--   doctor-assets/{doctor_id}/logo.png
--   doctor-assets/{doctor_id}/firma.png
--   patient-files/{doctor_id}/{patient_id}/{file_name}
--
-- Esta convención permite que las políticas de Storage usen el primer
-- segmento del path (storage.foldername) para validar pertenencia.
-- =====================================================================

-- Crear los buckets (puede ejecutarse vía SQL si la extensión storage
-- está disponible, o manualmente desde el Dashboard):
insert into storage.buckets (id, name, public)
values ('doctor-assets', 'doctor-assets', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('patient-files', 'patient-files', false)
on conflict (id) do nothing;

-- =====================================================================
-- Políticas de storage.objects para "doctor-assets"
-- Estructura de path: {doctor_id}/{archivo}
-- Solo el dueño puede leer/escribir/eliminar sus propios activos.
-- =====================================================================

create policy doctor_assets_select on storage.objects
  for select using (
    bucket_id = 'doctor-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy doctor_assets_insert on storage.objects
  for insert with check (
    bucket_id = 'doctor-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy doctor_assets_update on storage.objects
  for update using (
    bucket_id = 'doctor-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy doctor_assets_delete on storage.objects
  for delete using (
    bucket_id = 'doctor-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- =====================================================================
-- Políticas de storage.objects para "patient-files"
-- Estructura de path: {doctor_id}/{patient_id}/{archivo}
--
-- Reglas:
--   - El médico dueño (primer segmento = su uid) tiene acceso total.
--   - Un médico con acceso compartido vigente al paciente (segundo
--     segmento = patient_id) puede LEER siempre, y subir/eliminar
--     solo si su permiso es 'lectura_edicion'.
-- =====================================================================

create policy patient_files_owner_select on storage.objects
  for select using (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy patient_files_owner_insert on storage.objects
  for insert with check (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy patient_files_owner_delete on storage.objects
  for delete using (
    bucket_id = 'patient-files'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Acceso compartido de lectura (médico invitado)
create policy patient_files_shared_select on storage.objects
  for select using (
    bucket_id = 'patient-files'
    and has_patient_share(((storage.foldername(name))[2])::uuid, 'lectura')
  );

-- Acceso compartido de escritura (solo si el permiso es lectura_edicion)
create policy patient_files_shared_insert on storage.objects
  for insert with check (
    bucket_id = 'patient-files'
    and has_patient_share(((storage.foldername(name))[2])::uuid, 'lectura_edicion')
  );

create policy patient_files_shared_delete on storage.objects
  for delete using (
    bucket_id = 'patient-files'
    and has_patient_share(((storage.foldername(name))[2])::uuid, 'lectura_edicion')
  );

-- =====================================================================
-- Notas de implementación:
--   - has_patient_share() está definida en rls.sql; debe ejecutarse
--     ese script antes que este, o crear la función primero.
--   - El frontend debe subir archivos respetando estrictamente la
--     convención de carpetas {doctor_id}/... y {doctor_id}/{patient_id}/...
--     para que estas políticas funcionen correctamente.
--   - Para servir archivos, usar supabase.storage.from(bucket)
--     .createSignedUrl(path, expiresInSeconds) en vez de URLs públicas.
-- =====================================================================
