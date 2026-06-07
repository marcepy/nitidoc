// =====================================================================
// NITIDOC — Archivos adjuntos (patient_files + Supabase Storage)
// Bucket: "patient-files", ruta: {doctor_id}/{patient_id}/{archivo}
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate } from './utils.js';
import { getCurrentUser } from './auth.js';

const BUCKET = 'patient-files';

/** Sube un archivo y crea su registro en patient_files. */
export async function uploadPatientFile(patientId, file, meta = {}) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  if (!file) return { error: 'Selecciona un archivo para subir.' };

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${user.id}/${patientId}/${Date.now()}_${safeName}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
  if (uploadError) {
    console.error('[Nitidoc][files] Error subiendo archivo:', uploadError.message);
    return { error: 'No se pudo subir el archivo. Intenta nuevamente.' };
  }

  const { data: row, error } = await supabase.from('patient_files').insert({
    doctor_id: user.id,
    patient_id: patientId,
    visit_id: meta.visit_id || null,
    module_name: meta.module_name || null,
    file_path: path,
    file_type: meta.file_type || null,
    description: meta.description || null,
  }).select().single();

  if (error) {
    console.error('[Nitidoc][files] Error registrando archivo:', error.message);
    return { error: 'Archivo subido, pero no se pudo registrar en el sistema.' };
  }

  await supabase.from('audit_logs').insert({
    doctor_id: user.id, action: 'subir_archivo', entity_type: 'patient_file', entity_id: row.id,
    details: { file_type: row.file_type, module_name: row.module_name },
  });

  return { success: true, file: row };
}

/** Lista los archivos de un paciente, opcionalmente filtrados por tipo. */
export async function listPatientFiles(patientId, fileType = null) {
  let query = supabase.from('patient_files').select('*').eq('patient_id', patientId).order('created_at', { ascending: false });
  if (fileType) query = query.eq('file_type', fileType);

  const { data, error } = await query;
  if (error) {
    console.error('[Nitidoc][files] Error listando archivos:', error.message);
    return [];
  }
  return data || [];
}

/** Genera una URL firmada temporal para ver/descargar un archivo. */
export async function getFileSignedUrl(path, expiresInSeconds = 600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) {
    console.error('[Nitidoc][files] Error generando URL firmada:', error.message);
    return null;
  }
  return data.signedUrl;
}

/** Elimina un archivo (registro y objeto en Storage). */
export async function deletePatientFile(fileId, filePath) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };

  const { error: storageError } = await supabase.storage.from(BUCKET).remove([filePath]);
  if (storageError) {
    console.error('[Nitidoc][files] Error eliminando del storage:', storageError.message);
  }

  const { error } = await supabase.from('patient_files').delete().eq('id', fileId);
  if (error) {
    console.error('[Nitidoc][files] Error eliminando registro:', error.message);
    return { error: 'No se pudo eliminar el archivo.' };
  }

  await supabase.from('audit_logs').insert({
    doctor_id: user.id, action: 'eliminar_archivo', entity_type: 'patient_file', entity_id: fileId,
  });

  return { success: true };
}

// =====================================================================
// Inicialización del panel de archivos en patient.html
// =====================================================================
export async function initFilesPanel(patientId) {
  const form = document.getElementById('file-upload-form');
  const gallery = document.getElementById('files-gallery');
  const filtersBox = document.getElementById('file-type-filters');
  if (!form || !gallery) return;

  const FILE_TYPES = ['OCT', 'IOL Master', 'Argos', 'Informe médico', 'Resultado de laboratorio',
    'Foto del paciente', 'Imagen clínica', 'PDF', 'Otro'];

  let activeType = null;

  if (filtersBox) {
    filtersBox.innerHTML = FILE_TYPES.map((t) =>
      `<button type="button" class="chip" data-file-type="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('') +
      `<button type="button" class="chip" data-file-type="">Todos</button>`;

    filtersBox.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        activeType = chip.dataset.fileType || null;
        filtersBox.querySelectorAll('.chip').forEach((c) => c.classList.toggle('active', c === chip));
        refresh();
      });
    });
  }

  async function refresh() {
    const files = await listPatientFiles(patientId, activeType);
    if (!files.length) {
      gallery.innerHTML = '<p class="text-muted">No hay archivos cargados para este paciente.</p>';
      return;
    }

    gallery.innerHTML = '<div class="form-grid">' + files.map((f) => `
      <div class="card" data-file-id="${escapeHtml(f.id)}">
        <strong>${escapeHtml(f.file_type || 'Archivo')}</strong>
        <div class="text-muted" style="font-size:0.85rem;">${escapeHtml(formatDate(f.created_at, true))}</div>
        ${f.description ? `<div class="mt-1">${escapeHtml(f.description)}</div>` : ''}
        ${f.module_name ? `<div class="text-muted" style="font-size:0.8rem;">Módulo: ${escapeHtml(f.module_name)}</div>` : ''}
        <div class="flex gap-1 mt-1">
          <button class="btn btn-outline btn-view-file" data-path="${escapeHtml(f.file_path)}">Ver</button>
          <button class="btn btn-secondary btn-download-file" data-path="${escapeHtml(f.file_path)}">Descargar</button>
          <button class="btn btn-danger btn-delete-file" data-id="${escapeHtml(f.id)}" data-path="${escapeHtml(f.file_path)}">Eliminar</button>
        </div>
      </div>
    `).join('') + '</div>';

    gallery.querySelectorAll('.btn-view-file, .btn-download-file').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const url = await getFileSignedUrl(btn.dataset.path);
        if (url) window.open(url, '_blank', 'noopener');
        else showAlert('alert-box', 'No se pudo generar el enlace del archivo.', 'error');
      });
    });

    gallery.querySelectorAll('.btn-delete-file').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Eliminar este archivo de forma permanente?')) return;
        const result = await deletePatientFile(btn.dataset.id, btn.dataset.path);
        if (result.error) showAlert('alert-box', result.error, 'error');
        else { showAlert('alert-box', 'Archivo eliminado correctamente.', 'success'); refresh(); }
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('file-input');
    const formData = new FormData(form);
    const meta = Object.fromEntries(formData.entries());
    delete meta.file;

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Subiendo...';

    const result = await uploadPatientFile(patientId, fileInput.files[0], meta);

    btn.disabled = false; btn.textContent = 'Subir archivo';

    if (result.error) showAlert('alert-box', result.error, 'error');
    else { showAlert('alert-box', 'Archivo subido correctamente.', 'success'); form.reset(); refresh(); }
  });

  await refresh();
}
