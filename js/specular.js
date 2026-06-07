// =====================================================================
// NITIDOC — Microscopía especular (specular_microscopy)
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

const FIELDS = [
  'eye', 'endothelial_cell_density', 'variation_coefficient',
  'hexagonality', 'pachymetry', 'interpretation', 'notes',
];

export async function createSpecularMicroscopy(patientId, data) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  const payload = pick(data, FIELDS);
  payload.doctor_id = user.id;
  payload.patient_id = patientId;
  const { data: row, error } = await supabase.from('specular_microscopy').insert(payload).select().single();
  if (error) { console.error('[Nitidoc][specular]', error.message); return { error: 'No se pudo guardar la microscopía especular.' }; }
  await audit('crear_microscopia_especular', 'specular_microscopy', row.id);
  return { success: true, record: row };
}

export async function listSpecularMicroscopy(patientId) {
  const { data, error } = await supabase.from('specular_microscopy').select('*')
    .eq('patient_id', patientId).order('created_at', { ascending: false });
  if (error) { console.error('[Nitidoc][specular]', error.message); return []; }
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

export async function initSpecularPanel(patientId) {
  const form = document.getElementById('specular-form');
  const list = document.getElementById('specular-list');
  if (!form || !list) return;

  async function refresh() {
    const records = await listSpecularMicroscopy(patientId);
    list.innerHTML = records.length
      ? records.map((r) => `
          <div class="card">
            <div class="flex-between">
              <strong>Microscopía especular ${escapeHtml(r.eye||'')} — ${escapeHtml(formatDate(r.created_at))}</strong>
              <button class="btn btn-secondary btn-print-record" data-id="${escapeHtml(r.id)}" data-type="specular_microscopy">Imprimir</button>
            </div>
            <div class="text-muted mt-1">
              Densidad: ${escapeHtml(r.endothelial_cell_density||'—')} · CV: ${escapeHtml(r.variation_coefficient||'—')} ·
              Hexagonalidad: ${escapeHtml(r.hexagonality||'—')} · Paquimetría: ${escapeHtml(r.pachymetry||'—')}
            </div>
          </div>`).join('')
      : '<p class="text-muted">No hay registros de microscopía especular.</p>';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    const data = Object.fromEntries(new FormData(form).entries());
    const result = await createSpecularMicroscopy(patientId, data);
    btn.disabled = false; btn.textContent = 'Guardar registro';
    if (result.error) showAlert('alert-box', result.error, 'error');
    else { showAlert('alert-box', 'Microscopía especular guardada correctamente.', 'success'); form.reset(); refresh(); }
  });

  await refresh();
}
