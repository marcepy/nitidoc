// =====================================================================
// NITIDOC — Ficha clínica oftalmológica (clinical_records)
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

const FIELDS = [
  'reason', 'current_illness', 'personal_history', 'ophthalmic_history',
  'family_history', 'allergies', 'previous_surgeries', 'systemic_diseases',
  'current_medication', 'va_uncorrected', 'va_corrected', 'iop_od', 'iop_oi',
  'biomicroscopy', 'fundus', 'diagnosis', 'medical_plan',
];

export async function createClinicalRecord(patientId, data) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  const payload = pick(data, FIELDS);
  payload.doctor_id = user.id;
  payload.patient_id = patientId;
  const { data: row, error } = await supabase.from('clinical_records').insert(payload).select().single();
  if (error) { console.error('[Nitidoc][clinical]', error.message); return { error: 'No se pudo guardar la ficha clínica.' }; }
  await audit('crear_ficha_clinica', 'clinical_record', row.id);
  return { success: true, record: row };
}

export async function listClinicalRecords(patientId) {
  const { data, error } = await supabase.from('clinical_records').select('*')
    .eq('patient_id', patientId).order('created_at', { ascending: false });
  if (error) { console.error('[Nitidoc][clinical]', error.message); return []; }
  return data || [];
}

function pick(source, fields) {
  const out = {};
  fields.forEach((f) => { if (source[f] !== undefined && source[f] !== '') out[f] = source[f]; });
  return out;
}

async function audit(action, entityType, entityId) {
  const user = await getCurrentUser();
  if (!user) return;
  await supabase.from('audit_logs').insert({ doctor_id: user.id, action, entity_type: entityType, entity_id: entityId });
}

/** Inicializa el panel de ficha clínica dentro de patient.html */
export async function initClinicalPanel(patientId) {
  const form = document.getElementById('clinical-form');
  const list = document.getElementById('clinical-list');
  if (!form || !list) return;

  async function refresh() {
    const records = await listClinicalRecords(patientId);
    list.innerHTML = records.length
      ? records.map((r) => `
          <div class="card">
            <div class="flex-between">
              <strong>${escapeHtml(formatDate(r.created_at, true))}</strong>
              <button class="btn btn-secondary btn-print-record" data-id="${escapeHtml(r.id)}" data-type="clinical">Imprimir</button>
            </div>
            ${r.diagnosis ? `<div class="field mt-1"><strong>Diagnóstico:</strong> ${escapeHtml(r.diagnosis)}</div>` : ''}
            ${r.medical_plan ? `<div class="field"><strong>Conducta:</strong> ${escapeHtml(r.medical_plan)}</div>` : ''}
          </div>`).join('')
      : '<p class="text-muted">No hay fichas clínicas registradas.</p>';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    const data = Object.fromEntries(new FormData(form).entries());
    const result = await createClinicalRecord(patientId, data);
    btn.disabled = false; btn.textContent = 'Guardar ficha clínica';
    if (result.error) showAlert('alert-box', result.error, 'error');
    else { showAlert('alert-box', 'Ficha clínica guardada correctamente.', 'success'); form.reset(); refresh(); }
  });

  await refresh();
}
