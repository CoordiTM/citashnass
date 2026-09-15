// =============================================================
//  CONFIGURACIÓN DEL SISTEMA — Citas Radiodiagnóstico y Ecografía
//  Completa estos datos con la información de TU proyecto.
// =============================================================

// 1) FIREBASE (consola.firebase.google.com)
//    - Activa: Authentication (Correo/contraseña y Anónimo)
//    - Activa: Realtime Database
export const firebaseConfig = {
  apiKey: "PEGA_AQUI_TU_API_KEY",
  authDomain: "PEGA_AQUI_TU_PROYECTO.firebaseapp.com",
  databaseURL: "https://PEGA_AQUI_TU_PROYECTO-default-rtdb.firebaseio.com",
  projectId: "PEGA_AQUI_TU_PROYECTO",
  storageBucket: "PEGA_AQUI_TU_PROYECTO.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:xxxxxxxxxxxxxxxx"
};

// 2) CLOUDINARY (cloudinary.com) — para las fotos/PDF de solicitudes
//    Crea un "Upload preset" de tipo UNSIGNED y pon su nombre aquí.
export const cloudinaryConfig = {
  cloudName: "PEGA_AQUI_TU_CLOUD_NAME",
  uploadPreset: "PEGA_AQUI_TU_UPLOAD_PRESET",
  folder: "citas_rx"
};

// 3) URL pública del sistema (para el QR de ventanilla)
//    Cámbiala cuando sepas la URL final de GitHub Pages.
export const SITE_URL = "https://TU_USUARIO.github.io/citas-rx/";

// 4) Frase secreta para cifrar las claves de acceso (cámbiala y no la compartas)
export const CLAVE_SAL = "cambia-esta-frase-secreta-hnass";

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
