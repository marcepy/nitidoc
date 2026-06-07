// =====================================================================
// NITIDOC — Cliente Supabase centralizado
// Todas las páginas/módulos importan desde aquí.
//
// IMPORTANTE: solo se usa la clave pública "anon". La seguridad real
// vive en las políticas RLS de Supabase (ver /sql/rls.sql).
// En Vercel, estas variables deben inyectarse como variables de entorno
// públicas (ver Etapa 12 / README) y nunca como claves "service_role".
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Reemplazar por los valores del proyecto Supabase (o inyectar vía build).
const SUPABASE_URL = window.NITIDOC_CONFIG?.SUPABASE_URL || 'https://TU-PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = window.NITIDOC_CONFIG?.SUPABASE_ANON_KEY || 'TU-ANON-KEY-PUBLICA';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
