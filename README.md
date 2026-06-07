# Nitidoc

**Gestión oftalmológica clara, segura y rápida.**

Historia clínica oftalmológica, consultas, recetas, estudios e impresión médica en un solo lugar.

Nitidoc es una aplicación web para que oftalmólogos registren pacientes, gestionen
consultas e información clínica especializada (refracción, biometría, microscopía
especular, estudios), generen documentos médicos imprimibles, adjunten archivos y
compartan pacientes con otros médicos de forma segura y controlada.

Construida con **HTML, CSS y JavaScript vanilla**, usando **Supabase** (Auth,
Postgres con Row Level Security y Storage) como backend, y pensada para
desplegarse en **Vercel** como sitio estático.

---

## Tecnologías

- HTML5 + CSS3 + JavaScript (ES Modules, sin frameworks)
- [Supabase](https://supabase.com) — base de datos Postgres, autenticación y almacenamiento
- [Vercel](https://vercel.com) — hosting y despliegue continuo

## Estructura del proyecto

```
/index.html, /login.html, /dashboard.html, /patient.html,
/visit.html, /settings.html, /templates.html

/css/styles.css      — estilos generales y responsive
/css/print.css       — estilos de impresión (@media print)

/js/supabase.js      — cliente Supabase centralizado
/js/auth.js          — autenticación (Magic Link), sesión
/js/patients.js      — pacientes (CRUD, búsqueda, filtros)
/js/visits.js        — consultas e historial
/js/clinical.js      — ficha clínica oftalmológica
/js/refractions.js   — receta de lentes
/js/prescriptions.js — medicación e indicaciones
/js/studies.js       — estudios oftalmológicos, prequirúrgicos y preoperatorios
/js/biometry.js      — biometría
/js/specular.js      — microscopía especular
/js/files.js         — archivos adjuntos (Supabase Storage)
/js/printing.js      — generación de vistas imprimibles y exportación
/js/sharing.js       — compartir pacientes / invitaciones entre médicos
/js/templates.js     — plantillas configurables de impresión
/js/settings.js      — perfil del médico, logo, firma digital
/js/utils.js         — utilidades compartidas
/js/config.example.js — plantilla de configuración (copiar como config.js)

/sql/schema.sql      — esquema de tablas, índices y triggers
/sql/rls.sql         — Row Level Security y políticas
/sql/storage.sql     — configuración de buckets y políticas de Storage
```

---

## 1. Configuración de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En el **SQL Editor**, ejecuta en orden:
   1. `sql/schema.sql` — crea las tablas, índices y triggers.
   2. `sql/rls.sql` — habilita Row Level Security y crea las políticas
      (incluye la función `has_patient_share`, usada también por `storage.sql`).
   3. `sql/storage.sql` — crea los buckets `doctor-assets` y `patient-files`
      (privados) y sus políticas de acceso.
3. Verifica en **Authentication → Providers** que el inicio de sesión por
   **Email (Magic Link / OTP)** esté habilitado.
4. Copia la **URL del proyecto** y la **clave `anon` pública** desde
   **Project Settings → API** — las necesitarás en el siguiente paso.

> ⚠️ **Nunca** uses la clave `service_role` en el frontend. Solo la clave `anon`
> debe estar presente en el código del navegador; toda la protección de datos
> recae en las políticas RLS configuradas en el paso 2.

## 2. Configuración local

1. Copia `js/config.example.js` como `js/config.js`.
2. Completa `SUPABASE_URL` y `SUPABASE_ANON_KEY` con los valores de tu proyecto.
3. `js/config.js` está incluido en `.gitignore` y no debe subirse al repositorio.
4. Sirve la carpeta con cualquier servidor estático, por ejemplo:

   ```bash
   npx serve .
   # o
   python3 -m http.server 8080
   ```

5. Abre `http://localhost:PORT/login.html` e inicia sesión con tu email
   (Nitidoc usa Magic Link: recibirás un enlace de acceso sin contraseña).

## 3. Despliegue en Vercel

### Variables de entorno

En el panel del proyecto en Vercel, define (Project Settings → Environment Variables):

| Variable                | Valor                                  |
|-------------------------|----------------------------------------|
| `SUPABASE_URL`           | URL de tu proyecto Supabase             |
| `SUPABASE_ANON_KEY`      | Clave pública `anon` de Supabase        |

### Generar `config.js` en el build

Como Nitidoc es un sitio estático sin bundler, `js/config.js` debe generarse
a partir de las variables de entorno durante el build. La forma más simple es
agregar un script de build en Vercel (Project Settings → Build & Development
Settings → Build Command) que escriba el archivo, por ejemplo:

```bash
echo "window.NITIDOC_CONFIG = { SUPABASE_URL: '$SUPABASE_URL', SUPABASE_ANON_KEY: '$SUPABASE_ANON_KEY' };" > js/config.js
```

Esto mantiene la clave pública fuera del repositorio y la inyecta de forma
segura en cada despliegue (Output Directory: `.`).

### Despliegue

1. Conecta el repositorio del proyecto a Vercel.
2. Configura las variables de entorno y el comando de build indicados arriba.
3. Despliega — Vercel servirá los archivos estáticos directamente.
4. En Supabase, agrega la URL de producción de Vercel a
   **Authentication → URL Configuration → Redirect URLs** para que los
   Magic Links funcionen correctamente.

---

## Checklist de seguridad

- [ ] RLS habilitado en **todas** las tablas (`sql/rls.sql` ejecutado).
- [ ] Buckets `doctor-assets` y `patient-files` configurados como **privados**.
- [ ] Solo se usa la clave `anon` pública en el frontend — nunca `service_role`.
- [ ] `js/config.js` está en `.gitignore` y no se versiona.
- [ ] Variables de entorno configuradas en Vercel (no hardcodeadas en el código).
- [ ] Redirect URLs de Supabase Auth actualizadas con el dominio de producción.
- [ ] Acciones sensibles (crear/editar/eliminar pacientes, compartir, exportar,
      subir archivos) quedan registradas en `audit_logs`.
- [ ] Enlaces de acceso compartido prueban expiración y revocación antes de
      usarse en un entorno real.
- [ ] No se han cargado datos reales de pacientes durante pruebas o demos.

## Notas sobre privacidad médica

Nitidoc maneja información sensible de pacientes. El diseño prioriza:

- Autenticación sin contraseña (Magic Link) para reducir riesgo de filtración de credenciales.
- Aislamiento estricto de datos por médico mediante RLS — ningún doctor ve
  pacientes de otro salvo acceso compartido explícito, con permisos y expiración.
- Archivos servidos mediante URLs firmadas temporales, nunca enlaces públicos.
- Registro de auditoría (`audit_logs`) para acciones sensibles.
- Sin almacenamiento de información clínica en `localStorage`.

## Hoja de ruta / mejoras futuras

- Integrar `jsPDF` o `html2pdf.js` para exportación a PDF con maquetación avanzada
  (la capa `js/printing.js` ya está desacoplada para permitir este reemplazo).
- Notificaciones por email para invitaciones y recordatorios de control.
- Búsqueda full-text avanzada y estadísticas del consultorio.
- Modo offline / PWA.
