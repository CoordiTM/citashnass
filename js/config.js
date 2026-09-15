// =============================================================
//  CONFIGURACIÓN DEL SISTEMA — Citas Radiodiagnóstico y Ecografía
// =============================================================

// 1) FIREBASE — proyecto citashnass
export const firebaseConfig = {
  apiKey: "AIzaSyCe3ObnriEh8pBvITswUaIBqHzW81qLijs",
  authDomain: "citashnass.firebaseapp.com",
  databaseURL: "https://citashnass-default-rtdb.firebaseio.com",
  projectId: "citashnass",
  storageBucket: "citashnass.firebasestorage.app",
  messagingSenderId: "695692341631",
  appId: "1:695692341631:web:247364c84bbb29486dea4a"
};

// 2) CLOUDINARY — para las fotos/PDF de solicitudes
//    ⚠️ COMPLETA ESTOS DOS VALORES (Dashboard de Cloudinary + Upload preset "Unsigned")
export const cloudinaryConfig = {
  cloudName: "PEGA_AQUI_TU_CLOUD_NAME",
  uploadPreset: "PEGA_AQUI_TU_UPLOAD_PRESET",
  folder: "citas_rx"
};

// 3) URL pública del sistema (QR de ventanilla)
export const SITE_URL = "https://coorditm.github.io/citashnass/";

// 4) Frase secreta para cifrar las claves de acceso (NO la compartas)
export const CLAVE_SAL = "hn4ss-c1t4s-rx-2026-s0l0-4dm1n";

// Datos institucionales (aparecen en pantallas y PDF)
export const NOMBRE_HOSPITAL = "Hospital Nacional Alberto Sabogal Sologuren";
export const NOMBRE_SERVICIO = "Servicio de Radiodiagnóstico y Ecografía";

// Tipos de examen (el residente lo asigna al aprobar)
export const TIPOS_EXAMEN = {
  contraste: "Examen contrastado (HSG, esofagograma, cistografía, tránsito intestinal, colon contrastado, etc.)",
  biopsia: "Biopsia de mama por ecografía",
  eco: "Ecografía de hospitalización"
};

export const ROLES = {
  admin: "Administrador",
  residente: "Residente de radiología",
  digitador: "Digitador ESSI"
};

export const ESTADOS = {
  pendiente: "Pendiente de revisión",
  aprobada: "Cita aprobada",
  rechazada: "Rechazada"
};
