// =====================================================================
// NITIDOC — Plantillas configurables (doctor_templates)
// Permiten personalizar encabezado, logo, pie, texto legal, firma
// y colores básicos para cada tipo de documento imprimible.
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

export const TEMPLATE_TYPES = [
  { value: 'receta_medica', label: 'Receta médica' },
  { value: 'receta_lentes', label: 'Receta de lentes' },
  { value: 'estudios_oftalmologicos', label: 'Solicitud de estudios oftalmológicos' },
  { value: 'estudios_prequirurgicos', label: 'Solicitud de estudios prequirúrgicos' },
  { value: 'evaluacion_preoperatoria', label: 'Evaluación preoperatoria' },
  { value: 'informe_completo', label: 'Informe completo de paciente' },
];

const FIELDS = ['template_type', 'name', 'header_text', 'footer_text', 'legal_text', 'primary_color', 'secondary_color', 'is_default'];

export async function createTemplate(data) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  if (!data.name || !data.template_type) return { error: 'Nombre y tipo de plantilla son obligatorios.' };

  const payload = pick(data, FIELDS);
  payload.doctor_id = user.id;
  payload.is_default = data.is_default === 'on' || data.is_default === true;

  const { data: row, error } = await supabase.from('doctor_templates').insert(payload).select().single();
  if (error) { console.error('[Nitidoc][templates]', error.message); return { error: 'No se pudo crear la plantilla.' }; }

  await audit('crear_plantilla', 'doctor_template', row.id, { template_type: row.template_type });
  return { success: true, template: row };
}

export async function updateTemplate(templateId, data) {
  const payload = pick(data, FIELDS);
  payload.is_default = data.is_default === 'on' || data.is_default === true;

  const { error } = await supabase.from('doctor_templates').update(payload).eq('id', templateId);
  if (error) { console.error('[Nitidoc][templates]', error.message); return { error: 'No se pudo guardar la plantilla.' }; }

  await audit('editar_plantilla', 'doctor_template', templateId);
  return { success: true };
}

export async function deleteTemplate(templateId) {
  const { error } = await supabase.from('doctor_templates').delete().eq('id', templateId);
  if (error) { console.error('[Nitidoc][templates]', error.message); return { error: 'No se pudo eliminar la plantilla.' }; }
  await audit('eliminar_plantilla', 'doctor_template', templateId);
  return { success: true };
}

export async function listTemplates() {
  const { data, error } = await supabase.from('doctor_templates').select('*').order('template_type').order('created_at', { ascending: false });
  if (error) { console.error('[Nitidoc][templates]', error.message); return []; }
  return data || [];
}

/** Obtiene la plantilla por defecto de un médico para un tipo de documento. */
export async function getDefaultTemplate(templateType) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('doctor_templates')
    .select('*')
    .eq('doctor_id', user.id)
    .eq('template_type', templateType)
    .eq('is_default', true)
    .maybeSingle();

  if (error) { console.error('[Nitidoc][templates]', error.message); return null; }
  return data;
}

function pick(source, fields) {
  const out = {};
  fields.forEach((f) => { if (source[f] !== undefined && source[f] !== '') out[f] = source[f]; });
  return out;
}

async function audit(action, entityType, entityId, details = null) {
  const user = await getCurrentUser();
  if (!user) return;
  await supabase.from('audit_logs').insert({ doctor_id: user.id, action, entity_type: entityType, entity_id: entityId, details });
}

// =====================================================================
// Inicialización de templates.html
// =====================================================================
export async function initTemplatesPage() {
  const form = document.getElementById('template-form');
  const list = document.getElementById('templates-list');
  const typeSelect = document.getElementById('template_type');
  if (!form || !list) return;

  if (typeSelect) {
    typeSelect.innerHTML = TEMPLATE_TYPES.map((t) => `<option value="${t.value}">${escapeHtml(t.label)}</option>`).join('');
  }

  let editingId = null;

  async function refresh() {
    const templates = await listTemplates();
    list.innerHTML = templates.length
      ? templates.map((t) => {
          const typeLabel = TEMPLATE_TYPES.find((x) => x.value === t.template_type)?.label || t.template_type;
          return `
            <div class="card">
              <div class="flex-between" style="flex-wrap:wrap; gap:0.5rem;">
                <div>
                  <strong>${escapeHtml(t.name)}</strong> ${t.is_default ? '<span class="chip active">Predeterminada</span>' : ''}
                  <div class="text-muted" style="font-size:0.85rem;">${escapeHtml(typeLabel)} · Creada el ${escapeHtml(formatDate(t.created_at))}</div>
                </div>
                <div class="flex gap-1">
                  <button class="btn btn-outline btn-edit-template" data-id="${escapeHtml(t.id)}">Editar</button>
                  <button class="btn btn-danger btn-delete-template" data-id="${escapeHtml(t.id)}">Eliminar</button>
                </div>
              </div>
            </div>`;
        }).join('')
      : '<p class="text-muted">Aún no has creado plantillas. Las plantillas predeterminadas de Nitidoc se usarán al imprimir.</p>';

    list.querySelectorAll('.btn-edit-template').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const templates = await listTemplates();
        const t = templates.find((x) => x.id === btn.dataset.id);
        if (!t) return;
        editingId = t.id;
        fillForm(form, t);
        document.getElementById('template-form-title').textContent = 'Editar plantilla';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    list.querySelectorAll('.btn-delete-template').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar esta plantilla?')) return;
        const result = await deleteTemplate(btn.dataset.id);
        if (result.error) showAlert('alert-box', result.error, 'error');
        else { showAlert('alert-box', 'Plantilla eliminada correctamente.', 'success'); refresh(); }
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Guardando...';

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data.is_default = form.elements.namedItem('is_default').checked;

    const result = editingId ? await updateTemplate(editingId, data) : await createTemplate(data);

    btn.disabled = false; btn.textContent = 'Guardar plantilla';

    if (result.error) {
      showAlert('alert-box', result.error, 'error');
    } else {
      showAlert('alert-box', 'Plantilla guardada correctamente.', 'success');
      form.reset();
      editingId = null;
      document.getElementById('template-form-title').textContent = 'Nueva plantilla';
      refresh();
    }
  });

  document.getElementById('template-form-cancel')?.addEventListener('click', () => {
    form.reset();
    editingId = null;
    document.getElementById('template-form-title').textContent = 'Nueva plantilla';
  });

  await refresh();
}

function fillForm(form, template) {
  Object.keys(template).forEach((key) => {
    const input = form.elements.namedItem(key);
    if (!input) return;
    if (input.type === 'checkbox') input.checked = !!template[key];
    else if (template[key] != null) input.value = template[key];
  });
}
