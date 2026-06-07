// =====================================================================
// NITIDOC — Estudios oftalmológicos, prequirúrgicos y evaluación
// preoperatoria (ophthalmic_studies, pre_surgical_studies,
// preoperative_evaluations)
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

const OPHTH_FIELDS = ['study_name', 'eye', 'presumptive_diagnosis', 'notes', 'study_date'];
const PRESURGICAL_FIELDS = ['requested_studies', 'notes', 'request_date'];
const PREOP_FIELDS = ['ophthalmic_diagnosis', 'proposed_surgery', 'suggested_anesthesia', 'requested_studies', 'notes', 'evaluation_date'];

async function audit(action, entityType, entityId) {
  const user = await getCurrentUser();
  if (!user) return;
  await supabase.from('audit_logs').insert({ doctor_id: user.id, action, entity_type: entityType, entity_id: entityId });
}

function pick(source, fields) {
  const out = {};
  fields.forEach((f) => { if (source[f] !== undefined && source[f] !== '') out[f] = source[f]; });
  return out;
}

// ---------------------------------------------------------------------
// Estudios oftalmológicos
// ---------------------------------------------------------------------
export async function createOphthalmicStudy(patientId, data) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  const payload = pick(data, OPHTH_FIELDS);
  payload.doctor_id = user.id;
  payload.patient_id = patientId;
  const { data: row, error } = await supabase.from('ophthalmic_studies').insert(payload).select().single();
  if (error) { console.error('[Nitidoc][studies]', error.message); return { error: 'No se pudo guardar el estudio.' }; }
  await audit('crear_estudio_oftalmologico', 'ophthalmic_study', row.id);
  return { success: true, record: row };
}

export async function listOphthalmicStudies(patientId) {
  const { data, error } = await supabase.from('ophthalmic_studies').select('*')
    .eq('patient_id', patientId).order('study_date', { ascending: false });
  if (error) { console.error('[Nitidoc][studies]', error.message); return []; }
  return data || [];
}

// ---------------------------------------------------------------------
// Estudios prequirúrgicos
// ---------------------------------------------------------------------
export async function createPreSurgicalStudy(patientId, data) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  const payload = pick(data, PRESURGICAL_FIELDS);
  if (typeof payload.requested_studies === 'string') {
    payload.requested_studies = payload.requested_studies.split(',').map((s) => s.trim()).filter(Boolean);
  }
  payload.doctor_id = user.id;
  payload.patient_id = patientId;
  const { data: row, error } = await supabase.from('pre_surgical_studies').insert(payload).select().single();
  if (error) { console.error('[Nitidoc][studies]', error.message); return { error: 'No se pudo guardar la solicitud prequirúrgica.' }; }
  await audit('crear_prequirurgico', 'pre_surgical_study', row.id);
  return { success: true, record: row };
}

export async function listPreSurgicalStudies(patientId) {
  const { data, error } = await supabase.from('pre_surgical_studies').select('*')
    .eq('patient_id', patientId).order('request_date', { ascending: false });
  if (error) { console.error('[Nitidoc][studies]', error.message); return []; }
  return data || [];
}

// ---------------------------------------------------------------------
// Evaluación preoperatoria
// ---------------------------------------------------------------------
export async function createPreopEvaluation(patientId, data) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  const payload = pick(data, PREOP_FIELDS);
  payload.doctor_id = user.id;
  payload.patient_id = patientId;
  const { data: row, error } = await supabase.from('preoperative_evaluations').insert(payload).select().single();
  if (error) { console.error('[Nitidoc][studies]', error.message); return { error: 'No se pudo guardar la evaluación preoperatoria.' }; }
  await audit('crear_evaluacion_preoperatoria', 'preoperative_evaluation', row.id);
  return { success: true, record: row };
}

export async function listPreopEvaluations(patientId) {
  const { data, error } = await supabase.from('preoperative_evaluations').select('*')
    .eq('patient_id', patientId).order('evaluation_date', { ascending: false });
  if (error) { console.error('[Nitidoc][studies]', error.message); return []; }
  return data || [];
}

// ---------------------------------------------------------------------
// Inicialización del panel combinado de estudios en patient.html
// ---------------------------------------------------------------------
export async function initStudiesPanel(patientId) {
  await wireForm('ophthalmic-study-form', 'ophthalmic-study-list', patientId,
    createOphthalmicStudy, listOphthalmicStudies, renderOphthalmicStudy, 'ophthalmic_study');

  await wireForm('presurgical-study-form', 'presurgical-study-list', patientId,
    createPreSurgicalStudy, listPreSurgicalStudies, renderPreSurgicalStudy, 'pre_surgical_study');

  await wireForm('preop-eval-form', 'preop-eval-list', patientId,
    createPreopEvaluation, listPreopEvaluations, renderPreopEvaluation, 'preoperative_evaluation');
}

async function wireForm(formId, listId, patientId, createFn, listFn, renderFn, printType) {
  const form = document.getElementById(formId);
  const list = document.getElementById(listId);
  if (!form || !list) return;

  async function refresh() {
    const records = await listFn(patientId);
    list.innerHTML = records.length ? records.map((r) => renderFn(r, printType)).join('')
      : '<p class="text-muted">No hay registros.</p>';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    const data = Object.fromEntries(new FormData(form).entries());
    const result = await createFn(patientId, data);
    btn.disabled = false; btn.textContent = btn.dataset.label || 'Guardar';
    if (result.error) showAlert('alert-box', result.error, 'error');
    else { showAlert('alert-box', 'Registro guardado correctamente.', 'success'); form.reset(); refresh(); }
  });

  await refresh();
}

function renderOphthalmicStudy(r) {
  return `<div class="card">
    <div class="flex-between">
      <strong>${escapeHtml(r.study_name)} (${escapeHtml(r.eye||'—')}) — ${escapeHtml(formatDate(r.study_date))}</strong>
      <button class="btn btn-secondary btn-print-record" data-id="${escapeHtml(r.id)}" data-type="ophthalmic_study">Imprimir solicitud</button>
    </div>
    ${r.presumptive_diagnosis ? `<div class="text-muted mt-1">Dx presuntivo: ${escapeHtml(r.presumptive_diagnosis)}</div>` : ''}
  </div>`;
}

function renderPreSurgicalStudy(r) {
  const studies = Array.isArray(r.requested_studies) ? r.requested_studies.join(', ') : (r.requested_studies || '—');
  return `<div class="card">
    <div class="flex-between">
      <strong>Solicitud prequirúrgica — ${escapeHtml(formatDate(r.request_date))}</strong>
      <button class="btn btn-secondary btn-print-record" data-id="${escapeHtml(r.id)}" data-type="pre_surgical_study">Imprimir solicitud</button>
    </div>
    <div class="text-muted mt-1">${escapeHtml(studies)}</div>
  </div>`;
}

function renderPreopEvaluation(r) {
  return `<div class="card">
    <div class="flex-between">
      <strong>Evaluación preoperatoria — ${escapeHtml(formatDate(r.evaluation_date))}</strong>
      <button class="btn btn-secondary btn-print-record" data-id="${escapeHtml(r.id)}" data-type="preoperative_evaluation">Imprimir</button>
    </div>
    ${r.proposed_surgery ? `<div class="field mt-1"><strong>Cirugía propuesta:</strong> ${escapeHtml(r.proposed_surgery)}</div>` : ''}
  </div>`;
}
