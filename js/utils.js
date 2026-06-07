// =====================================================================
// NITIDOC — Utilidades compartidas
// =====================================================================

/** Calcula la edad a partir de una fecha de nacimiento (YYYY-MM-DD). */
export function calculateAge(birthDate) {
  if (!birthDate) return null;
  const today = new Date();
  const dob = new Date(birthDate);
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

/** Formatea una fecha ISO a formato local legible (es-AR/es-ES). */
export function formatDate(isoString, withTime = false) {
  if (!isoString) return '—';
  const date = new Date(isoString);
  const opts = withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' };
  return date.toLocaleString('es-ES', opts);
}

/**
 * Muestra un mensaje visual (éxito, error, info) dentro de un contenedor.
 * El contenedor debe existir en el HTML, ej: <div id="alert-box"></div>
 */
export function showAlert(containerId, message, type = 'info', timeout = 4000) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const alertEl = document.createElement('div');
  alertEl.className = `alert alert-${type}`;
  alertEl.textContent = message;
  container.innerHTML = '';
  container.appendChild(alertEl);

  if (timeout > 0) {
    setTimeout(() => {
      if (alertEl.parentNode === container) container.removeChild(alertEl);
    }, timeout);
  }
}

/** Valida formato básico de email. */
export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Sanitiza texto para evitar inyección de HTML al insertar en el DOM. */
export function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}
