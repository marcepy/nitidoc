// =====================================================================
// NITIDOC — Autenticación (Supabase Auth, acceso por email / Magic Link)
// =====================================================================

import { supabase } from './supabase.js';
import { showAlert, isValidEmail } from './utils.js';

/**
 * Envía un enlace de acceso (Magic Link) al email indicado.
 * No se usan contraseñas: reduce riesgo de filtración de credenciales
 * y simplifica el flujo para personal médico.
 */
export async function sendMagicLink(email, redirectTo) {
  if (!isValidEmail(email)) {
    return { error: 'Por favor ingresa un email válido.' };
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo || `${window.location.origin}/dashboard.html`,
    },
  });

  if (error) {
    console.error('[Nitidoc][auth] Error enviando magic link:', error.message);
    return { error: 'No se pudo enviar el enlace de acceso. Intenta nuevamente.' };
  }

  return { success: true };
}

/** Devuelve la sesión actual (o null si no hay usuario autenticado). */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[Nitidoc][auth] Error obteniendo sesión:', error.message);
    return null;
  }
  return data.session;
}

/** Devuelve el usuario autenticado actual (o null). */
export async function getCurrentUser() {
  const session = await getSession();
  return session?.user || null;
}

/** Cierra la sesión del médico y redirige al login. */
export async function signOut() {
  await supabase.auth.signOut();
  window.location.href = '/login.html';
}

/**
 * Protege una página: si no hay sesión activa, redirige a login.
 * Debe llamarse al cargar páginas privadas (dashboard, patient, etc.).
 */
export async function requireAuth() {
  const session = await getSession();
  if (!session) {
    window.location.href = '/login.html';
    return null;
  }
  return session;
}

/**
 * Inicializa el formulario de login en login.html.
 * Espera un <form id="login-form"> con <input id="login-email">
 * y un contenedor de alertas <div id="alert-box">.
 */
export function initLoginForm() {
  const form = document.getElementById('login-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const emailInput = document.getElementById('login-email');
    const submitBtn = form.querySelector('button[type="submit"]');
    const email = emailInput.value.trim();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';

    const result = await sendMagicLink(email);

    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar enlace de acceso';

    if (result.error) {
      showAlert('alert-box', result.error, 'error');
    } else {
      showAlert(
        'alert-box',
        `Te enviamos un enlace de acceso a ${email}. Revisa tu correo para ingresar a Nitidoc.`,
        'success',
        8000
      );
      form.reset();
    }
  });
}

// Si la sesión cambia (login/logout), Supabase notifica aquí.
// Útil para refrescar la UI o redirigir automáticamente tras click en el magic link.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && window.location.pathname.endsWith('login.html')) {
    window.location.href = '/dashboard.html';
  }
  if (event === 'SIGNED_OUT') {
    window.location.href = '/login.html';
  }
});
