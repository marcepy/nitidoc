// =====================================================================
// NITIDOC — Medicación e indicaciones (prescriptions)
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

const FIELDS = ['medication', 'presentation', 'dose', 'frequency', 'duration', 'additional_instructions', 'prescription_date'];

// Vademécum oftalmológico paraguayo — fuente: vademecum_oftalmologico_paraguayo.xlsx
const COMMON_EYE_DROPS = [
  'Systane Ultra — Lubricante ocular (Gotas oftálmicas)',
  'Oftafilm — Lubricante ocular (Gotas oftálmicas)',
  'Oftafilm SP — Lubricante ocular sin preservante (Gotas oftálmicas)',
  'Acuafil — Lubricante ocular (Gotas oftálmicas)',
  'Acuafil XL — Lubricante ocular (Gotas oftálmicas)',
  'Acuatears — Lubricante ocular (Solución oftálmica)',
  'Toptear — Lubricante ocular (Gotas oftálmicas)',
  'Ladiut — Lubricante ocular (Gotas oftálmicas)',
  'Novotears — Lubricante ocular (Gotas oftálmicas)',
  'Avizor Lacrifresh — Lubricante ocular (Gotas oftálmicas)',
  'Humectante Ocular Lágrimas Artificiales — Lágrimas artificiales Lasca (Gotas oftálmicas)',
  'Oftalmol T — Tobramicina (Gotas oftálmicas)',
  'Gotabiotic — Tobramicina (Gotas oftálmicas)',
  'Citol Tobramicina — Tobramicina (Gotas oftálmicas)',
  'Citol Cipro / Citol Ciprofloxacina — Ciprofloxacina (Gotas oftálmicas)',
  'Ciproval — Ciprofloxacina (Ungüento oftálmico)',
  'Xolof — Tobramicina (Ungüento oftálmico)',
  'Oftabiótico — Neomicina + polimixina B + gramicidina (Ungüento oftálmico)',
  'Citol TDT — Tobramicina + dexametasona (Gotas oftálmicas)',
  'Citol Dexa + Tobra — Dexametasona + tobramicina (Gotas oftálmicas)',
  'Moxof-D — Moxifloxacina + dexametasona (Gotas oftálmicas)',
  'Ciprodex — Ciprofloxacina + dexametasona (Gotas / ungüento oftálmico)',
  'Gatidex — Gatifloxacina + dexametasona (Gotas oftálmicas)',
  'Oftalmol TDN — Tobramicina + dexametasona + nafazolina (Gotas oftálmicas)',
  'Tesalar — Dexametasona + neomicina + polimixina B (Pomada oftálmica)',
  'Oftasona-N — Betametasona + neomicina (Ungüento oftálmico / gotas)',
  'Oftol — Loteprednol (Gotas oftálmicas)',
  'Lotemicin — Loteprednol (Gotas oftálmicas)',
  'Lotesoft — Loteprednol (Ungüento oftálmico)',
  'Deltar T — Fluorometolona (Gotas oftálmicas)',
  'Dexamed — Dexametasona (Gotas oftálmicas)',
  'Citol Dexa — Dexametasona (Gotas oftálmicas)',
  'Alergiol — Olopatadina (Gotas oftálmicas)',
  'Alergiol Forte — Olopatadina (Gotas oftálmicas)',
  'Olof — Olopatadina (Gotas oftálmicas)',
  'Kuara — Ketotifeno/olopatadina (Gotas oftálmicas)',
  'Traler — Antihistamínico oftálmico (Gotas oftálmicas)',
  'Oftalmol Aler — Antihistamínico oftálmico (Gotas oftálmicas)',
  'Citol A+T — Antihistamínico oftálmico (Gotas oftálmicas)',
  'Oculison ANT — Antihistamínico oftálmico (Gotas oftálmicas)',
  'Lanoprost — Latanoprost (Gotas oftálmicas)',
  'Lanoprost Plus — Latanoprost + timolol (Gotas oftálmicas)',
  'Latof — Latanoprost (Gotas oftálmicas)',
  'Latof-T — Latanoprost + timolol (Gotas oftálmicas)',
  'Travof — Travoprost (Gotas oftálmicas)',
  'Tiof — Timolol (Gotas oftálmicas)',
  'Tiof Max — Timolol (Gotas oftálmicas)',
  'Citol Timolol — Timolol (Gotas oftálmicas)',
  'Poentimol — Timolol (Gotas oftálmicas)',
  'Citol Dorzotim / Dorzotin — Dorzolamida + timolol (Gotas oftálmicas)',
  'Brimof — Brimonidina (Gotas oftálmicas)',
  'Brinzof-T — Brinzolamida + timolol (Gotas oftálmicas)',
  'Stazol — Acetazolamida (Comprimidos)',
  'Anestalcon — Proparacaína (Gotas oftálmicas)',
  'Clorusol — Cloruro de sodio hipertónico (Gotas oftálmicas)',
  'Cyclomid — Tropicamida/ciclopentolato (Gotas oftálmicas)',
  'Gancivir — Ganciclovir (Gel oftálmico)',
  'Oftavit — Polivitamínico oftálmico (Gotas oftálmicas)',
  'Hidran — Tetrahidrozolina (Gotas oftálmicas)',
  'Colesol — Prednisona (Comprimidos)',
  'Trimsul Forte — Trimetoprim + sulfametoxazol (Comprimidos)',
  'Sulamin Forte — Trimetoprim + sulfametoxazol (Comprimidos)',
  'Septoprim Forte — Trimetoprim + sulfametoxazol (Comprimidos)',
  'Bactrim — Trimetoprim + sulfametoxazol (Comprimidos/suspensión)',
  'Supramycina / Supramicina — Doxiciclina (Tabletas/cápsulas)',
  'Supramycina Forte — Doxiciclina (Tabletas/cápsulas)',
  'Oracea — Doxiciclina liberación modificada (Cápsulas)',
  'Amoxidal Plus — Amoxicilina + ácido clavulánico (Comprimidos/suspensión)',
  'Ambilan BID — Amoxicilina + ácido clavulánico (Comprimidos/suspensión)',
  'Clavinex Duo — Amoxicilina + ácido clavulánico (Comprimidos/suspensión)',
  'Amoxetic Duo — Amoxicilina + ácido clavulánico (Comprimidos/suspensión)',
  'Trixan Plus — Amoxicilina + ácido clavulánico (Comprimidos/suspensión)',
  'Anamox Clav Duo — Amoxicilina + ácido clavulánico (Comprimidos/suspensión)',
  'Azimut — Azitromicina (Comprimidos/suspensión)',
  'Azimut Forte — Azitromicina (Comprimidos/suspensión)',
  'Actizim — Azitromicina (Comprimidos/suspensión)',
  'Azitronest — Azitromicina (Comprimidos/suspensión)',
  'Atrimon — Azitromicina (Comprimidos/suspensión)',
  'Ivermectina 6 mg — Ivermectina (Comprimidos)',
  'Soolantra / Ivercrem — Ivermectina tópica (Crema dermatológica)',
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
