// =====================================================================
// NITIDOC — Medicación e indicaciones (prescriptions)
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

const FIELDS = ['medication', 'presentation', 'dose', 'frequency', 'duration', 'additional_instructions', 'prescription_date'];

// Gotas / colirios oftalmológicos comunes en el mercado paraguayo (nombre comercial — laboratorio / principio activo)
const COMMON_EYE_DROPS = [
  'Lagrimax (Roux-Ocefa) — lágrima artificial',
  'Optive (Allergan) — lágrima artificial',
  'Systane (Alcon) — lágrima artificial',
  'Refresh Tears (Allergan) — lágrima artificial',
  'Hialuron Lágrimas (Officine) — ácido hialurónico',
  'Vislube — ácido hialurónico',
  'Tobrex (Alcon) — tobramicina',
  'Tobradex (Alcon) — tobramicina + dexametasona',
  'Ciloxan (Alcon) — ciprofloxacina',
  'Vigamox (Alcon) — moxifloxacina',
  'Exocin (Allergan) — ofloxacina',
  'Maxitrol (Alcon) — neomicina + polimixina B + dexametasona',
  'Predfort (Allergan) — acetato de prednisolona',
  'Flarex (Alcon) — fluorometolona',
  'FML (Allergan) — fluorometolona',
  'Nevanac (Alcon) — nepafenaco',
  'Acuvail / Acular (Allergan) — ketorolaco',
  'Voltaren Oftálmico (Novartis) — diclofenaco',
  'Cosopt (Santen) — dorzolamida + timolol',
  'Combigan (Allergan) — brimonidina + timolol',
  'Azopt (Alcon) — brinzolamida',
  'Alphagan (Allergan) — brimonidina',
  'Timoptol (MSD) — timolol',
  'Xalatan (Pfizer) — latanoprost',
  'Lumigan (Allergan) — bimatoprost',
  'Travatan (Alcon) — travoprost',
  'Ganfort (Allergan) — bimatoprost + timolol',
  'Patanol / Pataday (Novartis) — olopatadina',
  'Zaditen (Novartis) — ketotifeno',
  'Naaxia / Lastacaft (Allergan) — alcaftadina',
  'Cromolerg (Officine) — cromoglicato sódico',
  'Atropina 1% (Oftalmi) — atropina',
  'Ciclopentolato (Cicloplégico) — ciclopentolato',
  'Fenilefrina 10% (Oftalmi) — fenilefrina',
  'Tropicamida (Oftalmi) — tropicamida',
];

/** Carga las opciones del datalist de medicamentos comunes en el formulario de indicaciones. */
function populateMedicationDatalist() {
  const datalist = document.getElementById('med-options');
  if (!datalist || datalist.options.length) return;
  datalist.innerHTML = COMMON_EYE_DROPS.map((m) => `<option value="${m}"></option>`).join('');
}

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
  populateMedicationDatalist();
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
