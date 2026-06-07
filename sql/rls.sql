-- =====================================================================
-- NITIDOC — Row Level Security (RLS) y políticas
-- =====================================================================
-- Principio general:
--   - El médico dueño (doctor_id = auth.uid()) tiene acceso total a sus datos.
--   - Un médico invitado puede acceder a un paciente puntual si existe un
--     registro vigente en patient_shares (no revocado, no expirado), con
--     permiso 'lectura' (solo SELECT) o 'lectura_edicion' (SELECT + UPDATE/INSERT
--     sobre datos clínicos del paciente compartido).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Función auxiliar: ¿el usuario actual tiene acceso compartido vigente
-- a un paciente, y con qué nivel de permiso?
-- ---------------------------------------------------------------------
create or replace function has_patient_share(p_patient_id uuid, p_min_permission text default 'lectura')
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1
    from patient_shares ps
    where ps.patient_id = p_patient_id
      and ps.shared_with_doctor_id = auth.uid()
      and ps.revoked = false
      and (ps.expires_at is null or ps.expires_at > now())
      and (
        p_min_permission = 'lectura'
        or ps.permission = 'lectura_edicion'
      )
  );
$$;

-- =====================================================================
-- PROFILES
-- =====================================================================
alter table profiles enable row level security;

create policy profiles_select_own on profiles
  for select using (id = auth.uid());

create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

create policy profiles_update_own on profiles
  for update using (id = auth.uid());

-- =====================================================================
-- PATIENTS
-- =====================================================================
alter table patients enable row level security;

create policy patients_select on patients
  for select using (
    doctor_id = auth.uid() or has_patient_share(id, 'lectura')
  );

create policy patients_insert_own on patients
  for insert with check (doctor_id = auth.uid());

create policy patients_update on patients
  for update using (
    doctor_id = auth.uid() or has_patient_share(id, 'lectura_edicion')
  );

create policy patients_delete_own on patients
  for delete using (doctor_id = auth.uid());

-- =====================================================================
-- VISITS
-- =====================================================================
alter table visits enable row level security;

create policy visits_select on visits
  for select using (
    doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura')
  );

create policy visits_insert on visits
  for insert with check (
    doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion')
  );

create policy visits_update on visits
  for update using (
    doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion')
  );

create policy visits_delete_own on visits
  for delete using (doctor_id = auth.uid());

-- =====================================================================
-- Plantilla de políticas para tablas clínicas (mismo patrón en todas)
-- clinical_records, refractions, prescriptions, ophthalmic_studies,
-- pre_surgical_studies, preoperative_evaluations, biometry, specular_microscopy
-- =====================================================================

-- clinical_records
alter table clinical_records enable row level security;
create policy clinical_records_select on clinical_records for select using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura'));
create policy clinical_records_insert on clinical_records for insert with check (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy clinical_records_update on clinical_records for update using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy clinical_records_delete on clinical_records for delete using (doctor_id = auth.uid());

-- refractions
alter table refractions enable row level security;
create policy refractions_select on refractions for select using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura'));
create policy refractions_insert on refractions for insert with check (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy refractions_update on refractions for update using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy refractions_delete on refractions for delete using (doctor_id = auth.uid());

-- prescriptions
alter table prescriptions enable row level security;
create policy prescriptions_select on prescriptions for select using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura'));
create policy prescriptions_insert on prescriptions for insert with check (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy prescriptions_update on prescriptions for update using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy prescriptions_delete on prescriptions for delete using (doctor_id = auth.uid());

-- ophthalmic_studies
alter table ophthalmic_studies enable row level security;
create policy ophthalmic_studies_select on ophthalmic_studies for select using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura'));
create policy ophthalmic_studies_insert on ophthalmic_studies for insert with check (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy ophthalmic_studies_update on ophthalmic_studies for update using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy ophthalmic_studies_delete on ophthalmic_studies for delete using (doctor_id = auth.uid());

-- pre_surgical_studies
alter table pre_surgical_studies enable row level security;
create policy pre_surgical_studies_select on pre_surgical_studies for select using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura'));
create policy pre_surgical_studies_insert on pre_surgical_studies for insert with check (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy pre_surgical_studies_update on pre_surgical_studies for update using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy pre_surgical_studies_delete on pre_surgical_studies for delete using (doctor_id = auth.uid());

-- preoperative_evaluations
alter table preoperative_evaluations enable row level security;
create policy preop_eval_select on preoperative_evaluations for select using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura'));
create policy preop_eval_insert on preoperative_evaluations for insert with check (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy preop_eval_update on preoperative_evaluations for update using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy preop_eval_delete on preoperative_evaluations for delete using (doctor_id = auth.uid());

-- biometry
alter table biometry enable row level security;
create policy biometry_select on biometry for select using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura'));
create policy biometry_insert on biometry for insert with check (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy biometry_update on biometry for update using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy biometry_delete on biometry for delete using (doctor_id = auth.uid());

-- specular_microscopy
alter table specular_microscopy enable row level security;
create policy specular_select on specular_microscopy for select using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura'));
create policy specular_insert on specular_microscopy for insert with check (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy specular_update on specular_microscopy for update using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy specular_delete on specular_microscopy for delete using (doctor_id = auth.uid());

-- =====================================================================
-- PATIENT_FILES
-- =====================================================================
alter table patient_files enable row level security;

create policy patient_files_select on patient_files for select using (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura'));
create policy patient_files_insert on patient_files for insert with check (
  doctor_id = auth.uid() or has_patient_share(patient_id, 'lectura_edicion'));
create policy patient_files_delete on patient_files for delete using (doctor_id = auth.uid());

-- =====================================================================
-- PATIENT_SHARES
-- =====================================================================
alter table patient_shares enable row level security;

-- El dueño ve y administra los shares de sus pacientes;
-- el médico invitado puede ver el share que le concierne.
create policy patient_shares_select on patient_shares for select using (
  owner_doctor_id = auth.uid() or shared_with_doctor_id = auth.uid());

create policy patient_shares_insert on patient_shares for insert with check (
  owner_doctor_id = auth.uid());

create policy patient_shares_update on patient_shares for update using (
  owner_doctor_id = auth.uid());

create policy patient_shares_delete on patient_shares for delete using (
  owner_doctor_id = auth.uid());

-- =====================================================================
-- INVITATIONS
-- =====================================================================
alter table invitations enable row level security;

create policy invitations_select on invitations for select using (
  inviter_doctor_id = auth.uid()
  or invitee_email = (select email from auth.users where id = auth.uid())
);

create policy invitations_insert on invitations for insert with check (
  inviter_doctor_id = auth.uid());

create policy invitations_update on invitations for update using (
  inviter_doctor_id = auth.uid()
  or invitee_email = (select email from auth.users where id = auth.uid())
);

create policy invitations_delete on invitations for delete using (
  inviter_doctor_id = auth.uid());

-- =====================================================================
-- DOCTOR_TEMPLATES
-- =====================================================================
alter table doctor_templates enable row level security;

create policy doctor_templates_all on doctor_templates for all using (
  doctor_id = auth.uid()
) with check (
  doctor_id = auth.uid()
);

-- =====================================================================
-- DOCTOR_ASSETS
-- =====================================================================
alter table doctor_assets enable row level security;

create policy doctor_assets_all on doctor_assets for all using (
  doctor_id = auth.uid()
) with check (
  doctor_id = auth.uid()
);

-- =====================================================================
-- PATIENT_EXPORTS
-- =====================================================================
alter table patient_exports enable row level security;

create policy patient_exports_select on patient_exports for select using (
  doctor_id = auth.uid());

create policy patient_exports_insert on patient_exports for insert with check (
  doctor_id = auth.uid());

-- =====================================================================
-- AUDIT_LOGS
-- =====================================================================
alter table audit_logs enable row level security;

-- Cada médico solo ve sus propias entradas de auditoría.
create policy audit_logs_select on audit_logs for select using (
  doctor_id = auth.uid());

-- Las inserciones se permiten para el propio médico (la app inserta
-- en nombre del usuario autenticado; para mayor control podría moverse
-- a una función security definer / Edge Function).
create policy audit_logs_insert on audit_logs for insert with check (
  doctor_id = auth.uid());

-- =====================================================================
-- Fin de rls.sql
-- =====================================================================
