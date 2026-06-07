// =====================================================================
// NITIDOC — Compartir pacientes entre médicos (patient_shares, invitations)
// =====================================================================
import { supabase } from './supabase.js';
import { showAlert, escapeHtml, formatDate, isValidEmail } from './utils.js';
import { getCurrentUser } from './auth.js';

/**
 * Genera un enlace/código de invitación para compartir un paciente.
 * @param {string} patientId
 * @param {Object} options
 * @param {string} [options.inviteeEmail] - email del médico invitado (opcional para enlaces genéricos)
 * @param {'lectura'|'lectura_edicion'} options.permission
 * @param {string} [options.expiresAt] - fecha ISO de expiración
 */
export async function createPatientShare(patientId, { inviteeEmail = null, permission, expiresAt = null }) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  if (!['lectura', 'lectura_edicion'].includes(permission)) {
    return { error: 'Selecciona un nivel de permiso válido.' };
  }
  if (inviteeEmail && !isValidEmail(inviteeEmail)) {
    return { error: 'El email del médico invitado no es válido.' };
  }

  const token = generateToken();
  let sharedWithDoctorId = null;

  if (inviteeEmail) {
    const { data: invitedProfile } = await supabase
      .from('profiles').select('id').eq('email', inviteeEmail).maybeSingle();
    sharedWithDoctorId = invitedProfile?.id || null;
  }

  const { data: row, error } = await supabase.from('patient_shares').insert({
    patient_id: patientId,
    owner_doctor_id: user.id,
    shared_with_doctor_id: sharedWithDoctorId,
    permission,
    token,
    expires_at: expiresAt,
  }).select().single();

  if (error) {
    console.error('[Nitidoc][sharing] Error creando enlace compartido:', error.message);
    return { error: 'No se pudo generar el enlace de invitación.' };
  }

  await audit('crear_acceso_compartido', 'patient_share', row.id, { patient_id: patientId, permission, invitee_email: inviteeEmail });

  const shareUrl = `${window.location.origin}/dashboard.html?share_token=${encodeURIComponent(token)}`;
  return { success: true, share: row, shareUrl };
}

/** Lista los accesos compartidos vigentes (y revocados) de un paciente. */
export async function listPatientShares(patientId) {
  const { data, error } = await supabase
    .from('patient_shares')
    .select('*')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Nitidoc][sharing] Error listando accesos compartidos:', error.message);
    return [];
  }
  return data || [];
}

/** Revoca un acceso compartido. */
export async function revokePatientShare(shareId) {
  const { error } = await supabase.from('patient_shares').update({ revoked: true }).eq('id', shareId);
  if (error) {
    console.error('[Nitidoc][sharing] Error revocando acceso:', error.message);
    return { error: 'No se pudo revocar el acceso.' };
  }
  await audit('revocar_acceso_compartido', 'patient_share', shareId);
  return { success: true };
}

/** Genera un token aleatorio seguro (suficiente entropía para enlaces). */
function generateToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function audit(action, entityType, entityId, details = null) {
  const user = await getCurrentUser();
  if (!user) return;
  await supabase.from('audit_logs').insert({ doctor_id: user.id, action, entity_type: entityType, entity_id: entityId, details });
}

// =====================================================================
// Invitaciones entre médicos (cuenta nueva / colega registrado)
// =====================================================================

export async function createInvitation(inviteeEmail, expiresAt = null) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };
  if (!isValidEmail(inviteeEmail)) return { error: 'Ingresa un email válido.' };

  const { data: row, error } = await supabase.from('invitations').insert({
    inviter_doctor_id: user.id,
    invitee_email: inviteeEmail,
    expires_at: expiresAt,
  }).select().single();

  if (error) {
    console.error('[Nitidoc][sharing] Error creando invitación:', error.message);
    return { error: 'No se pudo crear la invitación.' };
  }

  await audit('crear_invitacion', 'invitation', row.id, { invitee_email: inviteeEmail });
  return { success: true, invitation: row };
}

// =====================================================================
// Inicialización del modal/sección "Compartir paciente" en patient.html
// =====================================================================

export async function initSharingPanel(patientId) {
  const form = document.getElementById('share-form');
  const list = document.getElementById('shares-list');
  if (!form || !list) return;

  async function refresh() {
    const shares = await listPatientShares(patientId);
    list.innerHTML = shares.length
      ? shares.map((s) => `
          <div class="card">
            <div class="flex-between" style="flex-wrap:wrap; gap:0.5rem;">
              <div>
                <strong>${s.shared_with_doctor_id ? 'Médico vinculado' : 'Enlace de invitación'}</strong>
                <div class="text-muted" style="font-size:0.85rem;">
                  Permiso: ${s.permission === 'lectura_edicion' ? 'Lectura y edición' : 'Solo lectura'} ·
                  Expira: ${s.expires_at ? escapeHtml(formatDate(s.expires_at)) : 'Sin expiración'} ·
                  Estado: ${s.revoked ? 'Revocado' : (s.expires_at && new Date(s.expires_at) < new Date() ? 'Expirado' : 'Activo')}
                </div>
              </div>
              ${!s.revoked ? `<button class="btn btn-danger btn-revoke-share" data-id="${escapeHtml(s.id)}">Revocar acceso</button>` : ''}
            </div>
          </div>`).join('')
      : '<p class="text-muted">Este paciente aún no ha sido compartido con otros médicos.</p>';

    list.querySelectorAll('.btn-revoke-share').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('¿Revocar este acceso compartido? El médico invitado perderá acceso de inmediato.')) return;
        const result = await revokePatientShare(btn.dataset.id);
        if (result.error) showAlert('alert-box', result.error, 'error');
        else { showAlert('alert-box', 'Acceso revocado correctamente.', 'success'); refresh(); }
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true; btn.textContent = 'Generando...';

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    const result = await createPatientShare(patientId, {
      inviteeEmail: data.invitee_email || null,
      permission: data.permission,
      expiresAt: data.expires_at ? new Date(data.expires_at).toISOString() : null,
    });

    btn.disabled = false; btn.textContent = 'Generar enlace de invitación';

    if (result.error) {
      showAlert('alert-box', result.error, 'error');
    } else {
      showAlert('alert-box', `Enlace generado: ${result.shareUrl}`, 'success', 10000);
      form.reset();
      refresh();
    }
  });

  await refresh();
}
