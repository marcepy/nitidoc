// =====================================================================
// NITIDOC — Módulo de pacientes
// CRUD, búsqueda, filtros por última consulta, separación admin/clínico
// =====================================================================

import { supabase } from './supabase.js';
import { showAlert, escapeHtml, calculateAge, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

const ADMIN_FIELDS = [
  'first_name', 'last_name', 'document_id', 'birth_date', 'sex',
  'phone', 'email', 'address', 'emergency_contact',
  'health_insurance', 'insurance_member_number', 'admin_notes',
];

/** Crea un paciente nuevo perteneciente al médico autenticado. */
export async function createPatient(patientData) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };

  if (!patientData.first_name || !patientData.last_name) {
    return { error: 'Nombre y apellido son obligatorios.' };
  }

  const payload = pickFields(patientData, ADMIN_FIELDS);
  payload.doctor_id = user.id;

  const { data, error } = await supabase
    .from('patients')
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error('[Nitidoc][patients] Error creando paciente:', error.message);
    return { error: 'No se pudo crear el paciente. Intenta nuevamente.' };
  }

  await logAudit('crear_paciente', 'patient', data.id, { name: `${data.first_name} ${data.last_name}` });
  return { success: true, patient: data };
}

/** Actualiza los datos administrativos de un paciente existente. */
export async function updatePatient(patientId, patientData) {
  const payload = pickFields(patientData, ADMIN_FIELDS);

  const { error } = await supabase
    .from('patients')
    .update(payload)
    .eq('id', patientId);

  if (error) {
    console.error('[Nitidoc][patients] Error actualizando paciente:', error.message);
    return { error: 'No se pudo guardar los cambios. Intenta nuevamente.' };
  }

  await logAudit('editar_paciente', 'patient', patientId);
  return { success: true };
}

/** Archiva (soft-delete) un paciente. Mantiene su historial intacto. */
export async function archivePatient(patientId) {
  const { error } = await supabase
    .from('patients')
    .update({ archived: true })
    .eq('id', patientId);

  if (error) {
    console.error('[Nitidoc][patients] Error archivando paciente:', error.message);
    return { error: 'No se pudo archivar el paciente.' };
  }

  await logAudit('archivar_paciente', 'patient', patientId);
  return { success: true };
}

/** Elimina definitivamente un paciente (y su historial, vía cascade). */
export async function deletePatient(patientId) {
  const { error } = await supabase.from('patients').delete().eq('id', patientId);

  if (error) {
    console.error('[Nitidoc][patients] Error eliminando paciente:', error.message);
    return { error: 'No se pudo eliminar el paciente.' };
  }

  await logAudit('eliminar_paciente', 'patient', patientId);
  return { success: true };
}

/** Obtiene el detalle completo (datos administrativos) de un paciente. */
export async function getPatientById(patientId) {
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('id', patientId)
    .single();

  if (error) {
    console.error('[Nitidoc][patients] Error obteniendo paciente:', error.message);
    return null;
  }
  return data;
}

/**
 * Busca y filtra pacientes del médico autenticado (o compartidos con él).
 *
 * @param {Object} options
 * @param {string} [options.search] - texto de búsqueda (nombre, apellido, doc, tel, email)
 * @param {string} [options.orderBy] - 'last_visit_at' | 'created_at' | 'last_name' | 'first_name'
 * @param {boolean} [options.ascending]
 * @param {string} [options.visitFilter] - 'hoy' | '7dias' | '30dias' | 'sin_reciente' | null
 * @param {string} [options.dateFrom] - rango personalizado (YYYY-MM-DD)
 * @param {string} [options.dateTo]
 * @param {boolean} [options.includeArchived]
 */
export async function searchPatients(options = {}) {
  const {
    search = '',
    orderBy = 'last_visit_at',
    ascending = false,
    visitFilter = null,
    dateFrom = null,
    dateTo = null,
    includeArchived = false,
  } = options;

  let query = supabase.from('patients').select('*');

  if (!includeArchived) query = query.eq('archived', false);

  if (search.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(
      `first_name.ilike.${term},last_name.ilike.${term},document_id.ilike.${term},phone.ilike.${term},email.ilike.${term}`
    );
  }

  query = applyVisitFilter(query, visitFilter, dateFrom, dateTo);
  query = query.order(orderBy, { ascending, nullsFirst: false });

  const { data, error } = await query;

  if (error) {
    console.error('[Nitidoc][patients] Error buscando pacientes:', error.message);
    return [];
  }
  return data || [];
}

function applyVisitFilter(query, filter, dateFrom, dateTo) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  switch (filter) {
    case 'hoy':
      return query.gte('last_visit_at', startOfToday);
    case '7dias':
      return query.gte('last_visit_at', daysAgoIso(7));
    case '30dias':
      return query.gte('last_visit_at', daysAgoIso(30));
    case 'sin_reciente':
      return query.or(`last_visit_at.is.null,last_visit_at.lt.${daysAgoIso(30)}`);
    case 'rango':
      if (dateFrom) query = query.gte('last_visit_at', new Date(dateFrom).toISOString());
      if (dateTo) query = query.lte('last_visit_at', new Date(dateTo).toISOString());
      return query;
    default:
      return query;
  }
}

function daysAgoIso(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

/** Obtiene los últimos N pacientes consultados (para accesos rápidos del dashboard). */
export async function getRecentlyVisitedPatients(limit = 5) {
  const { data, error } = await supabase
    .from('patients')
    .select('id, first_name, last_name, last_visit_at')
    .eq('archived', false)
    .not('last_visit_at', 'is', null)
    .order('last_visit_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[Nitidoc][patients] Error obteniendo recientes:', error.message);
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
      result[field] = null; // limpiar campos vacíos en ediciones
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
// Renderizado en UI — listado de pacientes (dashboard)
// =====================================================================

/**
 * Renderiza la lista de pacientes como tabla (escritorio) / tarjetas (móvil)
 * dentro de un contenedor <div id="patients-list">.
 */
export function renderPatientsList(containerId, patients) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (!patients.length) {
    container.innerHTML = '<p class="text-muted text-center mt-1">No se encontraron pacientes.</p>';
    return;
  }

  const rows = patients.map((p) => {
    const age = calculateAge(p.birth_date);
    const lastVisit = p.last_visit_at ? formatDate(p.last_visit_at) : 'Sin consultas';
    return `
      <tr>
        <td data-label="Paciente">
          <strong>${escapeHtml(p.last_name)}, ${escapeHtml(p.first_name)}</strong>
          ${age != null ? `<div class="text-muted" style="font-size:0.8rem;">${age} años</div>` : ''}
        </td>
        <td data-label="Documento">${escapeHtml(p.document_id || '—')}</td>
        <td data-label="Teléfono">${escapeHtml(p.phone || '—')}</td>
        <td data-label="Última consulta">${escapeHtml(lastVisit)}</td>
        <td data-label="Acciones">
          <a class="btn btn-outline" href="patient.html?id=${encodeURIComponent(p.id)}">Ver ficha</a>
          <a class="btn btn-secondary" href="visit.html?patient=${encodeURIComponent(p.id)}">Nueva consulta</a>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Paciente</th>
          <th>Documento</th>
          <th>Teléfono</th>
          <th>Última consulta</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// =====================================================================
// Inicialización del dashboard (búsqueda, filtros, listado)
// =====================================================================

export async function initPatientsDashboard() {
  const listContainer = 'patients-list';
  const searchInput = document.getElementById('patient-search');
  const orderSelect = document.getElementById('patient-order');
  const chips = document.querySelectorAll('[data-visit-filter]');

  let currentFilter = null;

  async function refresh() {
    const patients = await searchPatients({
      search: searchInput?.value || '',
      orderBy: orderSelect?.value || 'last_visit_at',
      ascending: false,
      visitFilter: currentFilter,
    });
    renderPatientsList(listContainer, patients);
  }

  searchInput?.addEventListener('input', debounce(refresh, 350));
  orderSelect?.addEventListener('change', refresh);

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const value = chip.dataset.visitFilter || null;
      currentFilter = currentFilter === value ? null : value;
      chips.forEach((c) => c.classList.toggle('active', c === chip && currentFilter !== null));
      refresh();
    });
  });

  await refresh();

  // Accesos rápidos a últimos pacientes consultados
  const recentContainer = document.getElementById('recent-patients');
  if (recentContainer) {
    const recent = await getRecentlyVisitedPatients(5);
    recentContainer.innerHTML = recent.length
      ? recent.map((p) => `
          <a class="patient-card" href="patient.html?id=${encodeURIComponent(p.id)}">
            <div class="name">${escapeHtml(p.last_name)}, ${escapeHtml(p.first_name)}</div>
            <div class="meta">Última consulta: ${escapeHtml(formatDate(p.last_visit_at))}</div>
          </a>
        `).join('')
      : '<p class="text-muted">Aún no hay consultas registradas.</p>';
  }
}

/**
 * Inicializa el formulario "Nuevo paciente" (modal o sección dedicada).
 * Espera <form id="new-patient-form"> dentro del dashboard.
 */
export function initNewPatientForm(onCreated) {
  const form = document.getElementById('new-patient-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const formData = new FormData(form);
    const patientData = Object.fromEntries(formData.entries());
    const result = await createPatient(patientData);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Crear paciente';

    if (result.error) {
      showAlert('alert-box', result.error, 'error');
    } else {
      showAlert('alert-box', 'Paciente creado correctamente.', 'success');
      form.reset();
      if (typeof onCreated === 'function') onCreated(result.patient);
    }
  });
}

function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
