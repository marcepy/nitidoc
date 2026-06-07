// =====================================================================
// NITIDOC — Perfil del médico, logo y firma digital
// =====================================================================

import { supabase } from './supabase.js';
import { showAlert, escapeHtml } from './utils.js';
import { getCurrentUser } from './auth.js';

const ASSETS_BUCKET = 'doctor-assets';

/** Carga el perfil del médico actual (o crea uno vacío si no existe). */
export async function loadProfile() {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[Nitidoc][settings] Error cargando perfil:', error.message);
    return null;
  }

  return data || { id: user.id, email: user.email };
}

/** Guarda (upsert) los datos del perfil del médico. */
export async function saveProfile(profileData) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };

  const payload = { id: user.id, ...profileData };

  const { error } = await supabase.from('profiles').upsert(payload);

  if (error) {
    console.error('[Nitidoc][settings] Error guardando perfil:', error.message);
    return { error: 'No se pudo guardar el perfil. Intenta nuevamente.' };
  }

  await logAudit('actualizar_perfil', 'profile', user.id);
  return { success: true };
}

/**
 * Sube un archivo (logo o firma) a Supabase Storage y actualiza
 * la columna correspondiente del perfil con la ruta resultante.
 *
 * @param {File} file - archivo PNG/JPG seleccionado por el usuario
 * @param {'logo'|'firma'} assetType
 */
export async function uploadDoctorAsset(file, assetType) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };

  if (!['image/png', 'image/jpeg'].includes(file.type)) {
    return { error: 'Solo se permiten imágenes PNG o JPG.' };
  }

  const extension = file.type === 'image/png' ? 'png' : 'jpg';
  const fileName = assetType === 'logo' ? 'logo' : 'firma';
  const path = `${user.id}/${fileName}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from(ASSETS_BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) {
    console.error('[Nitidoc][settings] Error subiendo archivo:', uploadError.message);
    return { error: 'No se pudo subir el archivo. Intenta nuevamente.' };
  }

  const profileColumn = assetType === 'logo' ? 'logo_path' : 'signature_path';
  const { error: updateError } = await supabase
    .from('profiles')
    .upsert({ id: user.id, [profileColumn]: path });

  if (updateError) {
    console.error('[Nitidoc][settings] Error actualizando perfil:', updateError.message);
    return { error: 'Archivo subido, pero no se pudo vincular al perfil.' };
  }

  await supabase.from('doctor_assets').insert({
    doctor_id: user.id,
    asset_type: assetType === 'logo' ? 'logo' : 'firma',
    file_path: path,
  });

  await logAudit(`subir_${assetType}`, 'doctor_asset', null, { path });

  return { success: true, path };
}

/**
 * Guarda una firma dibujada en un <canvas> como imagen PNG en Storage.
 * @param {HTMLCanvasElement} canvasEl
 */
export async function saveDrawnSignature(canvasEl) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };

  return new Promise((resolve) => {
    canvasEl.toBlob(async (blob) => {
      if (!blob) {
        resolve({ error: 'No se pudo generar la imagen de la firma.' });
        return;
      }
      const file = new File([blob], 'firma.png', { type: 'image/png' });
      const result = await uploadDoctorAsset(file, 'firma');
      resolve(result);
    }, 'image/png');
  });
}

/** Obtiene una URL firmada (temporal) para mostrar logo o firma. */
export async function getAssetSignedUrl(path, expiresInSeconds = 3600) {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);

  if (error) {
    console.error('[Nitidoc][settings] Error generando URL firmada:', error.message);
    return null;
  }
  return data.signedUrl;
}

/** Registra una acción sensible en audit_logs. */
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

// ---------------------------------------------------------------------
// Inicialización de la página settings.html
// ---------------------------------------------------------------------
export async function initSettingsPage() {
  const form = document.getElementById('profile-form');
  if (!form) return;

  const profile = await loadProfile();
  if (profile) fillProfileForm(form, profile);
  await renderAssetPreviews(profile);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const formData = new FormData(form);
    const profileData = Object.fromEntries(formData.entries());

    const result = await saveProfile(profileData);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar perfil';

    if (result.error) {
      showAlert('alert-box', result.error, 'error');
    } else {
      showAlert('alert-box', 'Perfil guardado correctamente.', 'success');
    }
  });

  // Subida de logo
  const logoInput = document.getElementById('logo-input');
  logoInput?.addEventListener('change', async () => {
    if (!logoInput.files[0]) return;
    const result = await uploadDoctorAsset(logoInput.files[0], 'logo');
    if (result.error) showAlert('alert-box', result.error, 'error');
    else {
      showAlert('alert-box', 'Logo actualizado correctamente.', 'success');
      await renderAssetPreviews(await loadProfile());
    }
  });

  // Subida de firma como imagen
  const signatureInput = document.getElementById('signature-input');
  signatureInput?.addEventListener('change', async () => {
    if (!signatureInput.files[0]) return;
    const result = await uploadDoctorAsset(signatureInput.files[0], 'firma');
    if (result.error) showAlert('alert-box', result.error, 'error');
    else {
      showAlert('alert-box', 'Firma actualizada correctamente.', 'success');
      await renderAssetPreviews(await loadProfile());
    }
  });

  initSignatureCanvas();
}

function fillProfileForm(form, profile) {
  const fields = [
    'full_name', 'license_number', 'specialty', 'phone',
    'email', 'office_address', 'clinic_name',
  ];
  fields.forEach((field) => {
    const input = form.elements.namedItem(field);
    if (input && profile[field] != null) input.value = profile[field];
  });
}

async function renderAssetPreviews(profile) {
  const logoPreview = document.getElementById('logo-preview');
  const signaturePreview = document.getElementById('signature-preview');

  if (logoPreview) {
    const url = await getAssetSignedUrl(profile?.logo_path);
    logoPreview.innerHTML = url
      ? `<img src="${escapeHtml(url)}" alt="Logo de la clínica" style="max-height:80px;" />`
      : '<span class="text-muted">Sin logo cargado</span>';
  }

  if (signaturePreview) {
    const url = await getAssetSignedUrl(profile?.signature_path);
    signaturePreview.innerHTML = url
      ? `<img src="${escapeHtml(url)}" alt="Firma digital" style="max-height:80px;" />`
      : '<span class="text-muted">Sin firma cargada</span>';
  }
}

/**
 * Inicializa un <canvas id="signature-canvas"> para dibujar la firma
 * con el mouse o el dedo (touch), y vincula los botones de guardar/limpiar.
 */
function initSignatureCanvas() {
  const canvas = document.getElementById('signature-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1e293b';

  let drawing = false;

  const getPos = (event) => {
    const rect = canvas.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (event) => {
    drawing = true;
    const { x, y } = getPos(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
    event.preventDefault();
  };

  const move = (event) => {
    if (!drawing) return;
    const { x, y } = getPos(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    event.preventDefault();
  };

  const end = () => { drawing = false; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start);
  canvas.addEventListener('touchmove', move);
  canvas.addEventListener('touchend', end);

  document.getElementById('signature-clear')?.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  });

  document.getElementById('signature-save')?.addEventListener('click', async () => {
    const result = await saveDrawnSignature(canvas);
    if (result.error) showAlert('alert-box', result.error, 'error');
    else {
      showAlert('alert-box', 'Firma guardada correctamente.', 'success');
      await renderAssetPreviews(await loadProfile());
    }
  });
}
