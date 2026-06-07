// =====================================================================
// NITIDOC — Configuración pública (Supabase)
//
// Copia este archivo como "config.js" (en la raíz del sitio, junto a
// index.html) y completa con los valores de tu proyecto Supabase.
//
// IMPORTANTE:
//   - SUPABASE_ANON_KEY es la clave PÚBLICA "anon". Nunca coloques aquí
//     la clave "service_role".
//   - "config.js" debe agregarse a .gitignore para no versionar URLs
//     de proyectos de staging/producción por error (la anon key no es
//     secreta, pero mantener el archivo fuera del repo facilita tener
//     configuraciones distintas por entorno).
//   - En Vercel, genera este archivo en el paso de build a partir de
//     las variables de entorno del proyecto (ver README, sección
//     "Despliegue en Vercel").
// =====================================================================

window.NITIDOC_CONFIG = {
  SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',
  SUPABASE_ANON_KEY: 'TU-ANON-KEY-PUBLICA',
};
