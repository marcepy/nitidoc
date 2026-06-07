// =====================================================================
// NITIDOC — Autenticación (email + contraseña, PIN de bloqueo rápido,
// acceso de demostración)
// =====================================================================

import { supabase } from './supabase.js';
import { showAlert, isValidEmail } from './utils.js';

// Cuenta de demostración precargada en Supabase (datos ficticios).
// Cámbiala por las credenciales reales de tu cuenta demo.
const DEMO_EMAIL = 'demo@nitidoc.app';
const DEMO_PASSWORD = 'NitidocDemo2026!';

const PIN_STORAGE_PREFIX = 'nitidoc_pin_hash_';
const PIN_LOCK_FLAG = 'nitidoc_locked';

// ---------------------------------------------------------------------
// Email + contraseña
// ---------------------------------------------------------------------

/** Inicia sesión con email y contraseña. */
export async function signInWithPassword(email, password) {
  if (!isValidEmail(email)) {
    return { error: 'Por favor ingresa un email válido.' };
  }
  if (!password) {
    return { error: 'Por favor ingresa tu contraseña.' };
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('[Nitidoc][auth] Error al iniciar sesión:', error.message);
    return { error: 'Email o contraseña incorrectos.' };
  }

  return { success: true };
}

/** Crea una cuenta nueva (médico) con email y contraseña. */
export async function signUpWithPassword(email, password) {
  if (!isValidEmail(email)) {
    return { error: 'Por favor ingresa un email válido.' };
  }
  if (!password || password.length < 8) {
    return { error: 'La contraseña debe tener al menos 8 caracteres.' };
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${window.location.origin}/dashboard.html`,
    },
  });

  if (error) {
    console.error('[Nitidoc][auth] Error al registrarse:', error.message);
    return { error: 'No se pudo crear la cuenta. Intenta nuevamente.' };
  }

  // Si la confirmación por email está habilitada, no habrá sesión todavía.
  if (data.user && !data.session) {
    return {
      success: true,
      needsConfirmation: true,
      message: `Te enviamos un correo de confirmación a ${email}. Confirma tu cuenta para poder ingresar.`,
    };
  }

  return { success: true };
}

/** Inicia sesión con la cuenta de demostración precargada. */
export async function signInDemo() {
  const result = await signInWithPassword(DEMO_EMAIL, DEMO_PASSWORD);
  if (result.error) {
    return { error: 'El acceso de demostración no está disponible en este momento.' };
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
  const user = await getCurrentUser();
  if (user) localStorage.removeItem(PIN_STORAGE_PREFIX + user.id);
  sessionStorage.removeItem(PIN_LOCK_FLAG);
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

// ---------------------------------------------------------------------
// PIN de 6 dígitos (bloqueo rápido / re-autenticación local)
// ---------------------------------------------------------------------
// El PIN NO reemplaza el inicio de sesión: solo permite "desbloquear" la
// app rápidamente tras inactividad sin reescribir la contraseña. Se
// guarda como hash SHA-256 en localStorage, asociado al id del usuario,
// y nunca se envía a Supabase ni se usa como credencial real.

async function hashPin(pin, userId) {
  const data = new TextEncoder().encode(`${userId}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function isValidPinFormat(pin) {
  return /^\d{6}$/.test(pin);
}

/** Indica si el usuario actual ya configuró un PIN de bloqueo. */
export function hasPin(userId) {
  return Boolean(localStorage.getItem(PIN_STORAGE_PREFIX + userId));
}

/** Configura (o reemplaza) el PIN de bloqueo del usuario actual. */
export async function setPin(userId, pin) {
  if (!isValidPinFormat(pin)) {
    return { error: 'El PIN debe tener exactamente 6 dígitos.' };
  }
  const hash = await hashPin(pin, userId);
  localStorage.setItem(PIN_STORAGE_PREFIX + userId, hash);
  return { success: true };
}

/** Elimina el PIN configurado del usuario actual. */
export function clearPin(userId) {
  localStorage.removeItem(PIN_STORAGE_PREFIX + userId);
}

/** Verifica el PIN ingresado contra el hash guardado localmente. */
export async function verifyPin(userId, pin) {
  if (!isValidPinFormat(pin)) {
    return { error: 'El PIN debe tener exactamente 6 dígitos.' };
  }
  const stored = localStorage.getItem(PIN_STORAGE_PREFIX + userId);
  if (!stored) {
    return { error: 'No hay un PIN configurado para esta cuenta.' };
  }
  const hash = await hashPin(pin, userId);
  if (hash !== stored) {
    return { error: 'PIN incorrecto.' };
  }
  return { success: true };
}

/** Marca la sesión como bloqueada (se usa al volver de inactividad). */
export function lockSession() {
  sessionStorage.setItem(PIN_LOCK_FLAG, '1');
}

/** Desbloquea la sesión tras verificar el PIN correctamente. */
export function unlockSession() {
  sessionStorage.removeItem(PIN_LOCK_FLAG);
}

/** Indica si la sesión está actualmente bloqueada por PIN. */
export function isSessionLocked() {
  return sessionStorage.getItem(PIN_LOCK_FLAG) === '1';
}

/**
 * Instala una pantalla de bloqueo por PIN que se activa tras un período
 * de inactividad. Si el usuario no configuró PIN, no hace nada.
 * Debe llamarse en páginas privadas, después de requireAuth().
 */
export function initPinLock(userId, { inactivityMs = 10 * 60 * 1000 } = {}) {
  if (!hasPin(userId)) return;

  let overlay = null;
  let timer = null;

  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'pin-lock-overlay';
    el.innerHTML = `
      <div class="pin-lock-card">
        <div class="brand">Nitidoc</div>
        <p>Sesión bloqueada por inactividad. Ingresa tu PIN de 6 dígitos para continuar.</p>
        <div id="pin-lock-alert"></div>
        <input type="password" inputmode="numeric" pattern="\\d{6}" maxlength="6" id="pin-lock-input" placeholder="••••••" autocomplete="off" />
        <button type="button" id="pin-lock-submit" class="btn btn-primary btn-block">Desbloquear</button>
        <button type="button" id="pin-lock-signout" class="btn btn-outline btn-block mt-1">Cerrar sesión</button>
      </div>`;
    Object.assign(el.style, {
      position: 'fixed', inset: '0', zIndex: '9999',
      background: 'rgba(15, 23, 42, 0.85)', display: 'flex',
      alignItems: 'center', justifyContent: 'center',
    });
    document.body.appendChild(el);

    const card = el.querySelector('.pin-lock-card');
    Object.assign(card.style, {
      background: '#fff', borderRadius: '12px', padding: '2rem',
      maxWidth: '320px', width: '90%', textAlign: 'center',
    });

    const input = el.querySelector('#pin-lock-input');
    const submit = el.querySelector('#pin-lock-submit');
    const signoutBtn = el.querySelector('#pin-lock-signout');

    async function tryUnlock() {
      const pin = input.value.trim();
      const result = await verifyPin(userId, pin);
      if (result.error) {
        showAlert('pin-lock-alert', result.error, 'error');
        input.value = '';
        input.focus();
        return;
      }
      unlockSession();
      el.remove();
      overlay = null;
      resetTimer();
    }

    submit.addEventListener('click', tryUnlock);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryUnlock();
    });
    signoutBtn.addEventListener('click', signOut);

    setTimeout(() => input.focus(), 50);
    return el;
  }

  function showLock() {
    if (overlay) return;
    lockSession();
    overlay = buildOverlay();
  }

  function resetTimer() {
    if (isSessionLocked()) return;
    clearTimeout(timer);
    timer = setTimeout(showLock, inactivityMs);
  }

  ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach((evt) =>
    document.addEventListener(evt, resetTimer, { passive: true })
  );

  if (isSessionLocked()) {
    showLock();
  } else {
    resetTimer();
  }
}

// ---------------------------------------------------------------------
// Formularios de login.html
// ---------------------------------------------------------------------

/**
 * Inicializa los formularios de acceso en login.html: ingreso (email +
 * contraseña), registro, y botón de acceso de demostración.
 */
export function initLoginForm() {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const demoBtn = document.getElementById('demo-access-btn');
  const showSignup = document.getElementById('show-signup');
  const showLogin = document.getElementById('show-login');

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('login-email').value.trim();
      const password = document.getElementById('login-password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Ingresando...';

      const result = await signInWithPassword(email, password);

      submitBtn.disabled = false;
      submitBtn.textContent = 'Ingresar';

      if (result.error) {
        showAlert('alert-box', result.error, 'error');
      }
      // Si tiene éxito, onAuthStateChange redirige al dashboard.
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const email = document.getElementById('signup-email').value.trim();
      const password = document.getElementById('signup-password').value;
      const submitBtn = signupForm.querySelector('button[type="submit"]');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creando cuenta...';

      const result = await signUpWithPassword(email, password);

      submitBtn.disabled = false;
      submitBtn.textContent = 'Crear cuenta';

      if (result.error) {
        showAlert('alert-box', result.error, 'error');
      } else if (result.needsConfirmation) {
        showAlert('alert-box', result.message, 'success', 10000);
        signupForm.reset();
      } else {
        showAlert('alert-box', 'Cuenta creada. Ingresando...', 'success');
        signupForm.reset();
      }
    });
  }

  if (demoBtn) {
    demoBtn.addEventListener('click', async () => {
      demoBtn.disabled = true;
      demoBtn.textContent = 'Ingresando a la demo...';

      try {
        const result = await signInDemo();
        if (result.error) {
          showAlert('alert-box', result.error, 'error');
        }
        // Si tiene éxito, onAuthStateChange redirige al dashboard.
      } catch (err) {
        console.error('[Nitidoc][auth] Error inesperado en acceso demo:', err);
        showAlert('alert-box', 'No se pudo acceder a la demo. Intenta nuevamente.', 'error');
      } finally {
        demoBtn.disabled = false;
        demoBtn.textContent = 'Entrar como demo';
      }
    });
  }

  if (showSignup && showLogin && loginForm && signupForm) {
    showSignup.addEventListener('click', (e) => {
      e.preventDefault();
      loginForm.classList.add('hidden');
      signupForm.classList.remove('hidden');
      showSignup.parentElement.classList.add('hidden');
      showLogin.parentElement.classList.remove('hidden');
    });
    showLogin.addEventListener('click', (e) => {
      e.preventDefault();
      signupForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
      showLogin.parentElement.classList.add('hidden');
      showSignup.parentElement.classList.remove('hidden');
    });
  }
}

// Si la sesión cambia (login/logout), Supabase notifica aquí.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && window.location.pathname.endsWith('login.html')) {
    window.location.href = '/dashboard.html';
  }
  if (event === 'SIGNED_OUT') {
    window.location.href = '/login.html';
  }
});
