-- =====================================================================
-- NITIDOC — Esquema de base de datos (Supabase / PostgreSQL)
-- "Gestión oftalmológica clara, segura y rápida"
-- =====================================================================
-- Convenciones:
--   - doctor_id  -> referencia al médico dueño del registro (auth.users.id)
--   - patient_id -> referencia al paciente
--   - visit_id   -> referencia opcional a la consulta donde se originó el dato
--   - created_at / updated_at gestionados por trigger set_updated_at()
-- =====================================================================

-- Extensión para generar UUIDs e identificadores aleatorios seguros
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Función y trigger genérico para mantener updated_at
-- ---------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =====================================================================
-- 1. PROFILES — Perfil del médico (1 a 1 con auth.users)
-- =====================================================================
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  license_number text,           -- matrícula / registro profesional
  specialty text,
  phone text,
  email text,
  office_address text,
  clinic_name text,
  logo_path text,                -- ruta dentro de Supabase Storage
  signature_path text,           -- ruta dentro de Supabase Storage
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
before update on profiles
for each row execute function set_updated_at();

-- =====================================================================
-- 2. PATIENTS — Pacientes (datos administrativos)
-- =====================================================================
create table if not exists patients (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  document_id text,              -- cédula / documento
  birth_date date,
  sex text check (sex in ('M', 'F', 'OTRO')),
  phone text,
  email text,
  address text,
  emergency_contact text,
  health_insurance text,
  insurance_member_number text,
  admin_notes text,              -- observaciones administrativas
  archived boolean not null default false,
  last_visit_at timestamptz,     -- actualizado por trigger desde visits
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patients_doctor_id on patients(doctor_id);
create index if not exists idx_patients_last_name on patients(last_name);
create index if not exists idx_patients_document_id on patients(document_id);
create index if not exists idx_patients_last_visit_at on patients(last_visit_at);

create trigger trg_patients_updated_at
before update on patients
for each row execute function set_updated_at();

-- =====================================================================
-- 3. VISITS — Consultas
-- =====================================================================
create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_date timestamptz not null default now(),
  reason text,                          -- motivo de consulta
  current_illness text,                 -- enfermedad actual
  va_od_uncorrected text,
  va_oi_uncorrected text,
  va_od_corrected text,
  va_oi_corrected text,
  iop_od text,                          -- presión intraocular OD
  iop_oi text,                          -- presión intraocular OI
  biomicroscopy text,
  fundus text,                          -- fondo de ojo
  diagnosis text,
  medical_plan text,                    -- conducta médica
  instructions text,
  next_control_at date,
  responsible_doctor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_visits_doctor_id on visits(doctor_id);
create index if not exists idx_visits_patient_id on visits(patient_id);
create index if not exists idx_visits_visit_date on visits(visit_date);

create trigger trg_visits_updated_at
before update on visits
for each row execute function set_updated_at();

-- ---------------------------------------------------------------------
-- Trigger: actualizar patients.last_visit_at al crear/editar una consulta
-- ---------------------------------------------------------------------
create or replace function update_patient_last_visit()
returns trigger
language plpgsql
as $$
begin
  update patients
     set last_visit_at = (
        select max(visit_date) from visits where patient_id = new.patient_id
     )
   where id = new.patient_id;
  return new;
end;
$$;

create trigger trg_visits_update_last_visit
after insert or update of visit_date on visits
for each row execute function update_patient_last_visit();

-- =====================================================================
-- 4. CLINICAL_RECORDS — Ficha clínica oftalmológica
-- =====================================================================
create table if not exists clinical_records (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id) on delete set null,
  reason text,
  current_illness text,
  personal_history text,
  ophthalmic_history text,
  family_history text,
  allergies text,
  previous_surgeries text,
  systemic_diseases text,
  current_medication text,
  va_uncorrected text,
  va_corrected text,
  iop_od text,
  iop_oi text,
  biomicroscopy text,
  fundus text,
  diagnosis text,
  medical_plan text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_clinical_records_patient_id on clinical_records(patient_id);
create index if not exists idx_clinical_records_doctor_id on clinical_records(doctor_id);
create index if not exists idx_clinical_records_visit_id on clinical_records(visit_id);

create trigger trg_clinical_records_updated_at
before update on clinical_records
for each row execute function set_updated_at();

-- =====================================================================
-- 5. REFRACTIONS — Receta de lentes
-- =====================================================================
create table if not exists refractions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id) on delete set null,
  od_sphere text,
  od_cylinder text,
  od_axis text,
  od_addition text,
  od_final_va text,
  oi_sphere text,
  oi_cylinder text,
  oi_axis text,
  oi_addition text,
  oi_final_va text,
  pupillary_distance text,
  lens_type text,
  intended_use text,
  notes text,
  issue_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_refractions_patient_id on refractions(patient_id);
create index if not exists idx_refractions_doctor_id on refractions(doctor_id);

create trigger trg_refractions_updated_at
before update on refractions
for each row execute function set_updated_at();

-- =====================================================================
-- 6. PRESCRIPTIONS — Medicación e indicaciones
-- =====================================================================
create table if not exists prescriptions (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id) on delete set null,
  medication text not null,
  presentation text,
  dose text,
  frequency text,
  duration text,
  additional_instructions text,
  prescription_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prescriptions_patient_id on prescriptions(patient_id);
create index if not exists idx_prescriptions_doctor_id on prescriptions(doctor_id);

create trigger trg_prescriptions_updated_at
before update on prescriptions
for each row execute function set_updated_at();

-- =====================================================================
-- 7. OPHTHALMIC_STUDIES — Estudios oftalmológicos
-- =====================================================================
create table if not exists ophthalmic_studies (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id) on delete set null,
  study_name text not null,         -- OCT, campo visual, retinografía, etc.
  eye text check (eye in ('OD', 'OI', 'AMBOS')),
  presumptive_diagnosis text,
  notes text,
  study_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ophthalmic_studies_patient_id on ophthalmic_studies(patient_id);
create index if not exists idx_ophthalmic_studies_doctor_id on ophthalmic_studies(doctor_id);

create trigger trg_ophthalmic_studies_updated_at
before update on ophthalmic_studies
for each row execute function set_updated_at();

-- =====================================================================
-- 8. PRE_SURGICAL_STUDIES — Estudios prequirúrgicos
-- =====================================================================
create table if not exists pre_surgical_studies (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id) on delete set null,
  requested_studies text[],          -- hemograma, glicemia, ECG, etc.
  notes text,
  request_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pre_surgical_studies_patient_id on pre_surgical_studies(patient_id);
create index if not exists idx_pre_surgical_studies_doctor_id on pre_surgical_studies(doctor_id);

create trigger trg_pre_surgical_studies_updated_at
before update on pre_surgical_studies
for each row execute function set_updated_at();

-- =====================================================================
-- 9. PREOPERATIVE_EVALUATIONS — Evaluación clínica preoperatoria
-- =====================================================================
create table if not exists preoperative_evaluations (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id) on delete set null,
  ophthalmic_diagnosis text,
  proposed_surgery text,
  suggested_anesthesia text,
  requested_studies text,
  notes text,
  evaluation_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_preop_eval_patient_id on preoperative_evaluations(patient_id);
create index if not exists idx_preop_eval_doctor_id on preoperative_evaluations(doctor_id);

create trigger trg_preop_eval_updated_at
before update on preoperative_evaluations
for each row execute function set_updated_at();

-- =====================================================================
-- 10. BIOMETRY — Biometría
-- =====================================================================
create table if not exists biometry (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id) on delete set null,
  eye text check (eye in ('OD', 'OI')),
  k1 text,
  k2 text,
  axial_length text,
  anterior_chamber text,
  white_to_white text,
  acd text,
  formula_used text,
  suggested_iol text,
  iol_power text,
  refractive_target text,
  device_used text,            -- IOL Master, Argos, otro
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_biometry_patient_id on biometry(patient_id);
create index if not exists idx_biometry_doctor_id on biometry(doctor_id);

create trigger trg_biometry_updated_at
before update on biometry
for each row execute function set_updated_at();

-- =====================================================================
-- 11. SPECULAR_MICROSCOPY — Microscopía especular
-- =====================================================================
create table if not exists specular_microscopy (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id) on delete set null,
  eye text check (eye in ('OD', 'OI')),
  endothelial_cell_density text,
  variation_coefficient text,
  hexagonality text,
  pachymetry text,
  interpretation text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_specular_patient_id on specular_microscopy(patient_id);
create index if not exists idx_specular_doctor_id on specular_microscopy(doctor_id);

create trigger trg_specular_updated_at
before update on specular_microscopy
for each row execute function set_updated_at();

-- =====================================================================
-- 12. PATIENT_FILES — Archivos adjuntos
-- =====================================================================
create table if not exists patient_files (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  visit_id uuid references visits(id) on delete set null,
  module_name text,                -- 'biometry', 'specular_microscopy', 'studies', 'surgery', etc.
  file_path text not null,         -- ruta en Supabase Storage
  file_type text,                  -- clasificación: OCT, IOL Master, foto, PDF, etc.
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_patient_files_patient_id on patient_files(patient_id);
create index if not exists idx_patient_files_doctor_id on patient_files(doctor_id);
create index if not exists idx_patient_files_visit_id on patient_files(visit_id);

-- =====================================================================
-- 13. PATIENT_SHARES — Acceso compartido a pacientes
-- =====================================================================
create table if not exists patient_shares (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  owner_doctor_id uuid not null references auth.users(id) on delete cascade,
  shared_with_doctor_id uuid references auth.users(id) on delete cascade,
  permission text not null check (permission in ('lectura', 'lectura_edicion')),
  token text unique,                  -- token seguro para enlaces de invitación
  expires_at timestamptz,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patient_shares_patient_id on patient_shares(patient_id);
create index if not exists idx_patient_shares_owner on patient_shares(owner_doctor_id);
create index if not exists idx_patient_shares_shared_with on patient_shares(shared_with_doctor_id);
create index if not exists idx_patient_shares_token on patient_shares(token);

create trigger trg_patient_shares_updated_at
before update on patient_shares
for each row execute function set_updated_at();

-- =====================================================================
-- 14. INVITATIONS — Invitaciones entre médicos
-- =====================================================================
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  inviter_doctor_id uuid not null references auth.users(id) on delete cascade,
  invitee_email text not null,
  token text unique not null default encode(gen_random_bytes(24), 'hex'),
  status text not null default 'pendiente' check (status in ('pendiente', 'aceptada', 'revocada', 'expirada')),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_invitations_inviter on invitations(inviter_doctor_id);
create index if not exists idx_invitations_email on invitations(invitee_email);
create index if not exists idx_invitations_token on invitations(token);

create trigger trg_invitations_updated_at
before update on invitations
for each row execute function set_updated_at();

-- =====================================================================
-- 15. DOCTOR_TEMPLATES — Plantillas configurables
-- =====================================================================
create table if not exists doctor_templates (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  template_type text not null check (template_type in (
    'receta_medica', 'receta_lentes', 'estudios_oftalmologicos',
    'estudios_prequirurgicos', 'evaluacion_preoperatoria', 'informe_completo'
  )),
  name text not null,
  header_text text,
  footer_text text,
  legal_text text,
  logo_path text,
  signature_path text,
  primary_color text default '#2563eb',
  secondary_color text default '#e5f4ea',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doctor_templates_doctor_id on doctor_templates(doctor_id);
create index if not exists idx_doctor_templates_type on doctor_templates(template_type);

create trigger trg_doctor_templates_updated_at
before update on doctor_templates
for each row execute function set_updated_at();

-- =====================================================================
-- 16. DOCTOR_ASSETS — Activos del médico (logo, firma, otros)
-- =====================================================================
create table if not exists doctor_assets (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  asset_type text not null check (asset_type in ('logo', 'firma', 'sello', 'otro')),
  file_path text not null,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists idx_doctor_assets_doctor_id on doctor_assets(doctor_id);

-- =====================================================================
-- 17. PATIENT_EXPORTS — Registro de exportaciones PDF
-- =====================================================================
create table if not exists patient_exports (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references auth.users(id) on delete cascade,
  patient_id uuid not null references patients(id) on delete cascade,
  export_type text not null check (export_type in (
    'todo', 'datos_administrativos', 'historia_clinica', 'ultima_consulta', 'rango_fechas'
  )),
  date_from date,
  date_to date,
  created_at timestamptz not null default now()
);

create index if not exists idx_patient_exports_patient_id on patient_exports(patient_id);
create index if not exists idx_patient_exports_doctor_id on patient_exports(doctor_id);

-- =====================================================================
-- 18. AUDIT_LOGS — Auditoría de acciones sensibles
-- =====================================================================
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid references auth.users(id) on delete set null,
  action text not null,             -- ej: 'crear_paciente', 'compartir_paciente', 'exportar_pdf'
  entity_type text,                 -- ej: 'patient', 'visit', 'patient_share'
  entity_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_doctor_id on audit_logs(doctor_id);
create index if not exists idx_audit_logs_entity on audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at);

-- =====================================================================
-- Fin de schema.sql
-- =====================================================================
