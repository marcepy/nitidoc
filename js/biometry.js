// =====================================================================
// NITIDOC — Biometría (biometry)
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

const FIELDS = [
  'eye', 'k1', 'k2', 'axial_length', 'anterior_chamber', 'white_to_white',
  'acd', 'formula_used', 'suggested_iol', 'iol_power', 'refractive_target',
  'device_used', 'notes',
];

export async function createBiometry(patientId, data) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  const payload = pick(data, FIELDS);
  payload.doctor_id = user.id;
  payload.patient_id = patientId;
  const { data: row, error } = await supabase.from('biometry').insert(payload).select().single();
  if (error) { console.error('[Nitidoc][biometry]', error.message); return { error: 'No se pudo guardar la biometría.' }; }
  await audit('crear_biometria', 'biometry', row.id);
  return { success: true, record: row };
}

export async function listBiometry(patientId) {
  const { data, error } = await supabase.from('biometry').select('*')
    .eq('patient_id', patientId).order('created_at', { ascending: false });
  if (error) { console.error('[Nitidoc][biometry]', error.message); return []; }
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

export async function initBiometryPanel(patientId) {
  const form = document.getElementById('biometry-form');
  const list = document.getElementById('biometry-list');
  if (!form || !list) return;

  async function refresh() {
    const records = await listBiometry(patientId);
    list.innerHTML = records.length
      ? records.map((r) => `
          <div class="card">
            <div class="flex-between">
              <strong>Biometría ${escapeHtml(r.eye||'')} — ${escapeHtml(formatDate(r.created_at))}</strong>
              <button class="btn btn-secondary btn-print-record" data-id="${escapeHtml(r.id)}" data-type="biometry">Imprimir</button>
            </div>
            <div class="text-muted mt-1">
              K1: ${escapeHtml(r.k1||'—')} · K2: ${escapeHtml(r.k2||'—')} · LAxial: ${escapeHtml(r.axial_length||'—')} ·
              LIO sugerida: ${escapeHtml(r.suggested_iol||'—')} (${escapeHtml(r.iol_power||'—')}) · Equipo: ${escapeHtml(r.device_used||'—')}
            </div>
          </div>`).join('')
      : '<p class="text-muted">No hay biometrías registradas.</p>';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    const data = Object.fromEntries(new FormData(form).entries());
    const result = await createBiometry(patientId, data);
    btn.disabled = false; btn.textContent = 'Guardar biometría';
    if (result.error) showAlert('alert-box', result.error, 'error');
    else { showAlert('alert-box', 'Biometría guardada correctamente.', 'success'); form.reset(); refresh(); }
  });

  await refresh();
}
