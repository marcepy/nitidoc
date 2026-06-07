// =====================================================================
// NITIDOC — Medicación e indicaciones (prescriptions)
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

const FIELDS = ['medication', 'presentation', 'dose', 'frequency', 'duration', 'additional_instructions', 'prescription_date'];

export async function createPrescription(patientId, data) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  if (!data.medication) return { error: 'El nombre del medicamento es obligatorio.' };
  const payload = pick(data, FIELDS);
  payload.doctor_id = user.id;
  payload.patient_id = patientId;
  const { data: row, error } = await supabase.from('prescriptions').insert(payload).select().single();
  if (error) { console.error('[Nitidoc][prescriptions]', error.message); return { error: 'No se pudo guardar la indicación.' }; }
  await audit('crear_prescripcion', 'prescription', row.id);
  return { success: true, record: row };
}

export async function listPrescriptions(patientId) {
  const { data, error } = await supabase.from('prescriptions').select('*')
    .eq('patient_id', patientId).order('prescription_date', { ascending: false });
  if (error) { console.error('[Nitidoc][prescriptions]', error.message); return []; }
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

export async function initPrescriptionsPanel(patientId) {
  const form = document.getElementById('prescription-form');
  const list = document.getElementById('prescription-list');
  if (!form || !list) return;

  async function refresh() {
    const records = await listPrescriptions(patientId);
    list.innerHTML = records.length
      ? records.map((r) => `
          <div class="card">
            <div class="flex-between">
              <strong>${escapeHtml(r.medication)} — ${escapeHtml(formatDate(r.prescription_date))}</strong>
              <button class="btn btn-secondary btn-print-record" data-id="${escapeHtml(r.id)}" data-type="prescription">Imprimir receta</button>
            </div>
            <div class="text-muted mt-1">
              ${escapeHtml(r.presentation||'')} · ${escapeHtml(r.dose||'')} · ${escapeHtml(r.frequency||'')} · ${escapeHtml(r.duration||'')}
            </div>
          </div>`).join('')
      : '<p class="text-muted">No hay medicaciones registradas.</p>';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    const data = Object.fromEntries(new FormData(form).entries());
    const result = await createPrescription(patientId, data);
    btn.disabled = false; btn.textContent = 'Guardar indicación';
    if (result.error) showAlert('alert-box', result.error, 'error');
    else { showAlert('alert-box', 'Medicación guardada correctamente.', 'success'); form.reset(); refresh(); }
  });

  await refresh();
}
