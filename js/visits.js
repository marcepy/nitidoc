// =====================================================================
// NITIDOC — Módulo de consultas (visits)
// Crear, editar, listar historial y mantener last_visit_at actualizado
// (la actualización de last_visit_at la realiza un trigger en la BD,
// ver /sql/schema.sql — update_patient_last_visit())
// =====================================================================

import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';
import { searchPatients } from './patients.js';

const VISIT_FIELDS = [
  'visit_date', 'reason', 'current_illness',
  'va_od_uncorrected', 'va_oi_uncorrected', 'va_od_corrected', 'va_oi_corrected',
  'iop_od', 'iop_oi', 'biomicroscopy', 'fundus',
  'diagnosis', 'medical_plan', 'instructions', 'next_control_at', 'responsible_doctor',
];

/** Crea una nueva consulta asociada a un paciente. */
export async function createVisit(patientId, visitData) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  if (!patientId) return { error: 'Debes seleccionar un paciente.' };

  const payload = pickFields(visitData, VISIT_FIELDS);
  payload.doctor_id = user.id;
  payload.patient_id = patientId;
  if (!payload.visit_date) payload.visit_date = new Date().toISOString();

  const { data, error } = await supabase
    .from('visits')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Nitidoc][visits] Error creando consulta:', error.message);
    return { error: 'No se pudo guardar la consulta. Intenta nuevamente.' };
  }

  await logAudit('crear_consulta', 'visit', data.id, { patient_id: patientId });
  return { success: true, visit: data };
}

/** Actualiza una consulta existente. */
export async function updateVisit(visitId, visitData) {
  const payload = pickFields(visitData, VISIT_FIELDS);

  const { error } = await supabase.from('visits').update(payload).eq('id', visitId);

  if (error) {
    console.error('[Nitidoc][visits] Error actualizando consulta:', error.message);
    return { error: 'No se pudo guardar los cambios de la consulta.' };
  }

  await logAudit('editar_consulta', 'visit', visitId);
  return { success: true };
}

/** Obtiene una consulta por ID. */
export async function getVisitById(visitId) {
  const { data, error } = await supabase.from('visits').select('*').eq('id', visitId).single();
  if (error) {
    console.error('[Nitidoc][visits] Error obteniendo consulta:', error.message);
    return null;
  }
  return data;
}

/** Lista el historial de consultas de un paciente, de la más reciente a la más antigua. */
export async function listVisitsByPatient(patientId) {
  const { data, error } = await supabase
    .from('visits')
    .select('*')
    .eq('patient_id', patientId)
    .order('visit_date', { ascending: false });

  if (error) {
    console.error('[Nitidoc][visits] Error listando consultas:', error.message);
    return [];
  }
  return data || [];
}

function pickFields(source, fields) {
  const result = {};
  fields.forEach((field) => {
    if (source[field] !== undefined && source[field] !== '') {
      result[field] = source[field];
    } else if (source[field] === '') {
      result[field] = null;
    }
  });
  return result;
}

async function logAudit(action, entityType, entityId, details = null) {
  const user = await getCurrentUser();
  if (!user) return;
  await supabase.from('audit_logs').insert({
    doctor_id: user.id,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
  });
}

// =====================================================================
// Renderizado — historial de consultas (usado en patient.html)
// =====================================================================

export function renderVisitsHistory(containerId, visits, patientId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!visits.length) {
    container.innerHTML = '<p class="text-muted">Este paciente todavía no tiene consultas registradas.</p>';
    return;
  }

  container.innerHTML = visits.map((v) => `
    <div class="card" style="margin-bottom:0.75rem;">
      <div class="flex-between" style="flex-wrap:wrap; gap:0.5rem;">
        <div>
          <strong>${escapeHtml(formatDate(v.visit_date, true))}</strong>
          ${v.reason ? `<div class="text-muted">${escapeHtml(v.reason)}</div>` : ''}
        </div>
        <div class="flex gap-1">
          <a class="btn btn-outline" href="visit.html?id=${encodeURIComponent(v.id)}&patient=${encodeURIComponent(patientId)}">Ver / editar</a>
          <button class="btn btn-secondary btn-print-visit" data-visit-id="${escapeHtml(v.id)}">Imprimir</button>
        </div>
      </div>
      <div class="mt-1" style="font-size:0.9rem;">
        ${v.diagnosis ? `<div class="field"><strong>Diagnóstico:</strong> ${escapeHtml(v.diagnosis)}</div>` : ''}
        ${v.medical_plan ? `<div class="field"><strong>Conducta:</strong> ${escapeHtml(v.medical_plan)}</div>` : ''}
        ${v.next_control_at ? `<div class="field"><strong>Próximo control:</strong> ${escapeHtml(formatDate(v.next_control_at))}</div>` : ''}
      </div>
    </div>
  `).join('');
}

/** Carga y muestra el historial de un paciente dentro del panel de su ficha. */
export async function loadPatientVisitsPanel(containerId, patientId) {
  const visits = await listVisitsByPatient(patientId);
  renderVisitsHistory(containerId, visits, patientId);
  return visits;
}

// =====================================================================
// Inicialización de visit.html (formulario de nueva consulta / edición)
// =====================================================================

export async function initVisitPage() {
  const params = new URLSearchParams(window.location.search);
  const visitId = params.get('id');
  const preselectedPatientId = params.get('patient');

  const patientSelect = document.getElementById('visit-patient-select');
  const form = document.getElementById('visit-form');
  if (!form) return;

  let selectedPatientId = preselectedPatientId || null;

  // Si no viene un paciente preseleccionado, mostrar buscador para elegirlo
  if (!preselectedPatientId && patientSelect) {
    document.getElementById('patient-picker')?.classList.remove('hidden-section');
    await populatePatientPicker(patientSelect);
    patientSelect.addEventListener('change', () => {
      selectedPatientId = patientSelect.value || null;
    });
  } else {
    document.getElementById('patient-picker')?.classList.add('hidden-section');
  }

  // Modo edición: precargar datos de la consulta
  if (visitId) {
    const visit = await getVisitById(visitId);
    if (visit) {
      selectedPatientId = visit.patient_id;
      fillVisitForm(form, visit);
      document.getElementById('visit-form-title').textContent = 'Editar consulta';
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (!selectedPatientId) {
      showAlert('alert-box', 'Selecciona un paciente antes de guardar la consulta.', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const formData = new FormData(form);
    const visitData = Object.fromEntries(formData.entries());

    const result = visitId
      ? await updateVisit(visitId, visitData)
      : await createVisit(selectedPatientId, visitData);

    submitBtn.disabled = false;
    submitBtn.textContent = visitId ? 'Guardar cambios' : 'Guardar consulta';

    if (result.error) {
      showAlert('alert-box', result.error, 'error');
    } else {
      showAlert('alert-box', 'Consulta guardada correctamente. El historial del paciente fue actualizado.', 'success');
      setTimeout(() => {
        window.location.href = `patient.html?id=${encodeURIComponent(selectedPatientId)}`;
      }, 1200);
    }
  });

  document.getElementById('print-visit-btn')?.addEventListener('click', () => window.print());
}

async function populatePatientPicker(selectEl) {
  const patients = await searchPatients({ orderBy: 'last_name', ascending: true });
  selectEl.innerHTML =
    '<option value="">Selecciona un paciente…</option>' +
    patients.map((p) => `<option value="${escapeHtml(p.id)}">${escapeHtml(p.last_name)}, ${escapeHtml(p.first_name)} — ${escapeHtml(p.document_id || 'sin documento')}</option>`).join('');
}

function fillVisitForm(form, visit) {
  Object.keys(visit).forEach((key) => {
    const input = form.elements.namedItem(key);
    if (!input || visit[key] == null) return;
    if (key === 'visit_date') {
      input.value = new Date(visit[key]).toISOString().slice(0, 16);
    } else {
      input.value = visit[key];
    }
  });
}
