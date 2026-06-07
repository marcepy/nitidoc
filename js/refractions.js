// =====================================================================
// NITIDOC — Refracción / receta de lentes (refractions)
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

const FIELDS = [
  'od_sphere', 'od_cylinder', 'od_axis', 'od_addition', 'od_final_va',
  'oi_sphere', 'oi_cylinder', 'oi_axis', 'oi_addition', 'oi_final_va',
  'pupillary_distance', 'lens_type', 'intended_use', 'notes', 'issue_date',
];

export async function createRefraction(patientId, data) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  const payload = pick(data, FIELDS);
  payload.doctor_id = user.id;
  payload.patient_id = patientId;
  const { data: row, error } = await supabase.from('refractions').insert(payload).select().single();
  if (error) { console.error('[Nitidoc][refractions]', error.message); return { error: 'No se pudo guardar la refracción.' }; }
  await audit('crear_refraccion', 'refraction', row.id);
  return { success: true, record: row };
}

export async function listRefractions(patientId) {
  const { data, error } = await supabase.from('refractions').select('*')
    .eq('patient_id', patientId).order('issue_date', { ascending: false });
  if (error) { console.error('[Nitidoc][refractions]', error.message); return []; }
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

export async function initRefractionPanel(patientId) {
  const form = document.getElementById('refraction-form');
  const list = document.getElementById('refraction-list');
  if (!form || !list) return;

  async function refresh() {
    const records = await listRefractions(patientId);
    list.innerHTML = records.length
      ? records.map((r) => `
          <div class="card">
            <div class="flex-between">
              <strong>Receta de lentes — ${escapeHtml(formatDate(r.issue_date))}</strong>
              <button class="btn btn-secondary btn-print-record" data-id="${escapeHtml(r.id)}" data-type="refraction">Imprimir receta</button>
            </div>
            <table class="mt-1">
              <thead><tr><th>Ojo</th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th><th>AV final</th></tr></thead>
              <tbody>
                <tr><td>OD</td><td>${escapeHtml(r.od_sphere||'—')}</td><td>${escapeHtml(r.od_cylinder||'—')}</td><td>${escapeHtml(r.od_axis||'—')}</td><td>${escapeHtml(r.od_addition||'—')}</td><td>${escapeHtml(r.od_final_va||'—')}</td></tr>
                <tr><td>OI</td><td>${escapeHtml(r.oi_sphere||'—')}</td><td>${escapeHtml(r.oi_cylinder||'—')}</td><td>${escapeHtml(r.oi_axis||'—')}</td><td>${escapeHtml(r.oi_addition||'—')}</td><td>${escapeHtml(r.oi_final_va||'—')}</td></tr>
              </tbody>
            </table>
          </div>`).join('')
      : '<p class="text-muted">No hay refracciones registradas.</p>';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';
    const data = Object.fromEntries(new FormData(form).entries());
    const result = await createRefraction(patientId, data);
    btn.disabled = false; btn.textContent = 'Guardar refracción';
    if (result.error) showAlert('alert-box', result.error, 'error');
    else { showAlert('alert-box', 'Refracción guardada correctamente.', 'success'); form.reset(); refresh(); }
  });

  await refresh();
}
