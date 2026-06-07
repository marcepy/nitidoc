// =====================================================================
// NITIDOC — Generación de vistas imprimibles y exportación
//
// Estrategia: se arma un documento HTML estructurado dentro de un
// contenedor oculto (#print-root > .print-sheet.active) que solo se
// muestra mediante @media print (ver /css/print.css), y se invoca
// window.print(). Esta capa está desacoplada de la UI normal para
// poder integrar más adelante jsPDF / html2pdf.js sin reescribirla.
// =====================================================================
import { supabase } from './supabase.js';
import { escapeHtml, formatDate, calculateAge } from './utils.js';
import { getCurrentUser } from './auth.js';
import { getAssetSignedUrl, loadProfile } from './settings.js';
import { getDefaultTemplate } from './templates.js';

const TABLES = {
  refraction: { table: 'refractions', title: 'Receta de lentes', templateType: 'receta_lentes' },
  prescription: { table: 'prescriptions', title: 'Receta médica / indicación', templateType: 'receta_medica' },
  ophthalmic_study: { table: 'ophthalmic_studies', title: 'Solicitud de estudio oftalmológico', templateType: 'estudios_oftalmologicos' },
  pre_surgical_study: { table: 'pre_surgical_studies', title: 'Solicitud de estudios prequirúrgicos', templateType: 'estudios_prequirurgicos' },
  preoperative_evaluation: { table: 'preoperative_evaluations', title: 'Evaluación clínica preoperatoria', templateType: 'evaluacion_preoperatoria' },
  biometry: { table: 'biometry', title: 'Biometría', templateType: 'informe_completo' },
  specular_microscopy: { table: 'specular_microscopy', title: 'Microscopía especular', templateType: 'informe_completo' },
  visit: { table: 'visits', title: 'Resumen de consulta', templateType: 'informe_completo' },
};

/** Asegura que exista el contenedor de impresión en el DOM. */
function ensurePrintRoot() {
  let root = document.getElementById('print-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'print-root';
    document.body.appendChild(root);
  }
  return root;
}

/** Construye el encabezado del documento (logo + datos del médico). */
async function buildHeader(profile, logoUrl) {
  return `
    <div class="print-header">
      ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Logo de la clínica" />` : '<div></div>'}
      <div class="doctor-info">
        <div class="doctor-name">${escapeHtml(profile?.full_name || 'Médico')}</div>
        <div>${escapeHtml(profile?.specialty || 'Oftalmología')}${profile?.license_number ? ' · Mat. ' + escapeHtml(profile.license_number) : ''}</div>
        <div>${escapeHtml(profile?.clinic_name || '')}</div>
        <div>${escapeHtml(profile?.office_address || '')}</div>
        <div>${escapeHtml(profile?.phone || '')}${profile?.email ? ' · ' + escapeHtml(profile.email) : ''}</div>
      </div>
    </div>
  `;
}

/** Construye la caja con datos básicos del paciente. */
function buildPatientBox(patient) {
  const age = calculateAge(patient.birth_date);
  return `
    <div class="print-patient-box">
      <div class="row">
        <span><strong>Paciente:</strong> ${escapeHtml(patient.last_name)}, ${escapeHtml(patient.first_name)}</span>
        <span><strong>Documento:</strong> ${escapeHtml(patient.document_id || '—')}</span>
        <span><strong>Edad:</strong> ${age != null ? age + ' años' : '—'}</span>
      </div>
      <div class="row">
        <span><strong>Fecha de nacimiento:</strong> ${escapeHtml(formatDate(patient.birth_date))}</span>
        <span><strong>Sexo:</strong> ${escapeHtml(patient.sex || '—')}</span>
        <span><strong>Fecha de impresión:</strong> ${escapeHtml(formatDate(new Date().toISOString()))}</span>
      </div>
    </div>
  `;
}

/** Construye el bloque de firma digital y espacio para sello. */
async function buildSignatureBlock(profile, signatureUrl) {
  return `
    <div class="print-signature-block">
      <div class="signature">
        ${signatureUrl ? `<img class="signature-img" src="${escapeHtml(signatureUrl)}" alt="Firma digital" />` : ''}
        <div class="signature-line">${escapeHtml(profile?.full_name || '')}${profile?.license_number ? ' — Mat. ' + escapeHtml(profile.license_number) : ''}</div>
      </div>
      <div class="stamp-box">Sello médico</div>
    </div>
  `;
}

/**
 * Renderiza el documento completo dentro de #print-root y dispara la impresión.
 * Si se provee una plantilla del médico (doctor_templates), su encabezado,
 * texto legal, pie de página y colores se aplican automáticamente.
 */
async function renderAndPrint(title, sectionsHtml, patient, profile, template = null) {
  const root = ensurePrintRoot();
  const [logoUrl, signatureUrl] = await Promise.all([
    getAssetSignedUrl(template?.logo_path || profile?.logo_path),
    getAssetSignedUrl(template?.signature_path || profile?.signature_path),
  ]);

  const header = await buildHeader(profile, logoUrl);
  const patientBox = patient ? buildPatientBox(patient) : '';
  const signature = await buildSignatureBlock(profile, signatureUrl);

  const legalText = template?.legal_text || profile?.legal_text || '';
  const footerText = template?.footer_text || 'Documento generado por Nitidoc — Gestión oftalmológica clara, segura y rápida.';
  const headerNote = template?.header_text ? `<p class="text-center">${escapeHtml(template.header_text)}</p>` : '';
  const primaryColor = template?.primary_color || '#2563eb';
  const secondaryColor = template?.secondary_color || '#e5f4ea';

  root.innerHTML = `
    <div class="print-sheet active">
      <div class="print-page" style="--print-primary:${escapeHtml(primaryColor)}; --print-secondary:${escapeHtml(secondaryColor)};">
        ${header}
        ${headerNote}
        <div class="print-title" style="color:${escapeHtml(primaryColor)};">${escapeHtml(title)}</div>
        ${patientBox}
        ${sectionsHtml}
        ${legalText ? `<div class="print-legal">${escapeHtml(legalText)}</div>` : ''}
        ${signature}
        <div class="print-footer">${escapeHtml(footerText)}</div>
      </div>
    </div>
  `;

  window.print();

  // Limpiar después de imprimir para no interferir con la UI normal
  setTimeout(() => { root.innerHTML = ''; }, 1000);
}

function field(label, value) {
  if (value == null || value === '') return '';
  return `<div class="field"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</div>`;
}

// ---------------------------------------------------------------------
// Constructores de secciones por tipo de documento
// ---------------------------------------------------------------------
function sectionRefraction(r) {
  return `<div class="print-section"><h3>Receta de lentes</h3>
    <table>
      <thead><tr><th>Ojo</th><th>Esfera</th><th>Cilindro</th><th>Eje</th><th>Adición</th><th>AV final</th></tr></thead>
      <tbody>
        <tr><td>OD</td><td>${escapeHtml(r.od_sphere||'—')}</td><td>${escapeHtml(r.od_cylinder||'—')}</td><td>${escapeHtml(r.od_axis||'—')}</td><td>${escapeHtml(r.od_addition||'—')}</td><td>${escapeHtml(r.od_final_va||'—')}</td></tr>
        <tr><td>OI</td><td>${escapeHtml(r.oi_sphere||'—')}</td><td>${escapeHtml(r.oi_cylinder||'—')}</td><td>${escapeHtml(r.oi_axis||'—')}</td><td>${escapeHtml(r.oi_addition||'—')}</td><td>${escapeHtml(r.oi_final_va||'—')}</td></tr>
      </tbody>
    </table>
    ${field('Distancia pupilar', r.pupillary_distance)}
    ${field('Tipo de lente', r.lens_type)}
    ${field('Uso indicado', r.intended_use)}
    ${field('Observaciones', r.notes)}
    ${field('Fecha de emisión', formatDate(r.issue_date))}
  </div>`;
}

function sectionPrescription(r) {
  return `<div class="print-section"><h3>Indicación médica</h3>
    ${field('Medicamento', r.medication)}
    ${field('Presentación', r.presentation)}
    ${field('Dosis', r.dose)}
    ${field('Frecuencia', r.frequency)}
    ${field('Duración', r.duration)}
    ${field('Indicaciones adicionales', r.additional_instructions)}
    ${field('Fecha', formatDate(r.prescription_date))}
  </div>`;
}

function sectionOphthalmicStudy(r) {
  return `<div class="print-section"><h3>Solicitud de estudio</h3>
    ${field('Estudio solicitado', r.study_name)}
    ${field('Ojo', r.eye)}
    ${field('Diagnóstico presuntivo', r.presumptive_diagnosis)}
    ${field('Observaciones', r.notes)}
    ${field('Fecha', formatDate(r.study_date))}
  </div>`;
}

function sectionPreSurgicalStudy(r) {
  const studies = Array.isArray(r.requested_studies) ? r.requested_studies.join(', ') : r.requested_studies;
  return `<div class="print-section"><h3>Estudios prequirúrgicos solicitados</h3>
    ${field('Estudios', studies)}
    ${field('Observaciones', r.notes)}
    ${field('Fecha', formatDate(r.request_date))}
  </div>`;
}

function sectionPreopEvaluation(r) {
  return `<div class="print-section"><h3>Evaluación clínica preoperatoria</h3>
    ${field('Diagnóstico oftalmológico', r.ophthalmic_diagnosis)}
    ${field('Cirugía propuesta', r.proposed_surgery)}
    ${field('Anestesia sugerida', r.suggested_anesthesia)}
    ${field('Estudios solicitados', r.requested_studies)}
    ${field('Observaciones', r.notes)}
    ${field('Fecha', formatDate(r.evaluation_date))}
  </div>`;
}

function sectionBiometry(r) {
  return `<div class="print-section"><h3>Biometría — Ojo ${escapeHtml(r.eye||'')}</h3>
    ${field('K1', r.k1)} ${field('K2', r.k2)}
    ${field('Longitud axial', r.axial_length)}
    ${field('Cámara anterior', r.anterior_chamber)}
    ${field('Blanco a blanco', r.white_to_white)}
    ${field('ACD', r.acd)}
    ${field('Fórmula usada', r.formula_used)}
    ${field('LIO sugerida', r.suggested_iol)}
    ${field('Poder del LIO', r.iol_power)}
    ${field('Target refractivo', r.refractive_target)}
    ${field('Equipo usado', r.device_used)}
    ${field('Observaciones', r.notes)}
  </div>`;
}

function sectionSpecular(r) {
  return `<div class="print-section"><h3>Microscopía especular — Ojo ${escapeHtml(r.eye||'')}</h3>
    ${field('Densidad celular endotelial', r.endothelial_cell_density)}
    ${field('Coeficiente de variación', r.variation_coefficient)}
    ${field('Hexagonalidad', r.hexagonality)}
    ${field('Paquimetría', r.pachymetry)}
    ${field('Interpretación', r.interpretation)}
    ${field('Observaciones', r.notes)}
  </div>`;
}

function sectionVisit(r) {
  return `<div class="print-section"><h3>Resumen de consulta — ${escapeHtml(formatDate(r.visit_date, true))}</h3>
    ${field('Motivo de consulta', r.reason)}
    ${field('Enfermedad actual', r.current_illness)}
    ${field('AV OD sin corrección', r.va_od_uncorrected)} ${field('AV OI sin corrección', r.va_oi_uncorrected)}
    ${field('AV OD con corrección', r.va_od_corrected)} ${field('AV OI con corrección', r.va_oi_corrected)}
    ${field('PIO OD', r.iop_od)} ${field('PIO OI', r.iop_oi)}
    ${field('Biomicroscopía', r.biomicroscopy)}
    ${field('Fondo de ojo', r.fundus)}
    ${field('Diagnóstico', r.diagnosis)}
    ${field('Conducta médica', r.medical_plan)}
    ${field('Indicaciones', r.instructions)}
    ${field('Próximo control', formatDate(r.next_control_at))}
    ${field('Médico responsable', r.responsible_doctor)}
  </div>`;
}

const SECTION_BUILDERS = {
  refraction: sectionRefraction,
  prescription: sectionPrescription,
  ophthalmic_study: sectionOphthalmicStudy,
  pre_surgical_study: sectionPreSurgicalStudy,
  preoperative_evaluation: sectionPreopEvaluation,
  biometry: sectionBiometry,
  specular_microscopy: sectionSpecular,
  visit: sectionVisit,
};

/**
 * Imprime un registro clínico puntual a partir de su tipo e ID.
 * Usado por los botones ".btn-print-record" en cada módulo.
 */
export async function printRecord(type, recordId, patient) {
  const meta = TABLES[type];
  if (!meta) return;

  const { data: record, error } = await supabase.from(meta.table).select('*').eq('id', recordId).single();
  if (error || !record) {
    console.error('[Nitidoc][printing] No se pudo cargar el registro a imprimir:', error?.message);
    return;
  }

  const [profile, template] = await Promise.all([loadProfile(), getDefaultTemplate(meta.templateType)]);
  const sectionHtml = SECTION_BUILDERS[type](record);
  await renderAndPrint(meta.title, sectionHtml, patient, profile, template);
}

/**
 * Imprime la ficha completa del paciente: datos administrativos,
 * historia clínica, e historial de consultas.
 */
export async function printFullPatientFile(patient) {
  const [profile, template] = await Promise.all([loadProfile(), getDefaultTemplate('informe_completo')]);

  const { data: visits } = await supabase
    .from('visits')
    .select('*')
    .eq('patient_id', patient.id)
    .order('visit_date', { ascending: false });

  let sections = `<div class="print-section"><h3>Datos administrativos</h3>
    ${field('Teléfono', patient.phone)}
    ${field('Email', patient.email)}
    ${field('Dirección', patient.address)}
    ${field('Contacto de emergencia', patient.emergency_contact)}
    ${field('Seguro médico', patient.health_insurance)}
    ${field('Número de afiliado', patient.insurance_member_number)}
    ${field('Observaciones', patient.admin_notes)}
  </div>`;

  if (visits && visits.length) {
    sections += '<div class="print-section"><h3>Historial de consultas</h3>';
    visits.forEach((v) => { sections += sectionVisit(v); });
    sections += '</div>';
  }

  await renderAndPrint('Informe completo del paciente', sections, patient, profile, template);
}

/**
 * Registra una exportación en patient_exports y dispara la impresión
 * (el MVP usa window.print(); la arquitectura permite sustituirlo
 * por jsPDF / html2pdf.js sin tocar esta capa de orquestación).
 */
export async function exportPatient(patient, exportType = 'todo', dateFrom = null, dateTo = null) {
  const user = await getCurrentUser();
  if (!user) return { error: 'Sesión no encontrada.' };

  await supabase.from('patient_exports').insert({
    doctor_id: user.id,
    patient_id: patient.id,
    export_type: exportType,
    date_from: dateFrom,
    date_to: dateTo,
  });

  await supabase.from('audit_logs').insert({
    doctor_id: user.id, action: 'exportar_paciente', entity_type: 'patient', entity_id: patient.id,
    details: { export_type: exportType, date_from: dateFrom, date_to: dateTo },
  });

  await printFullPatientFile(patient);
  return { success: true };
}

/**
 * Conecta los botones ".btn-print-record" presentes en los listados
 * de los módulos clínicos con la función printRecord().
 * Debe llamarse después de renderizar cada listado (delegación de eventos).
 */
export function wirePrintButtons(containerSelector, patient) {
  document.querySelectorAll(containerSelector).forEach((container) => {
    container.addEventListener('click', (event) => {
      const btn = event.target.closest('.btn-print-record');
      if (!btn) return;
      printRecord(btn.dataset.type, btn.dataset.id, patient);
    });
  });
}
