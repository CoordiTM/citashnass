// =============================================================
//  CONFIGURACIÓN DEL SISTEMA — Citas Radiodiagnóstico y Ecografía
//  Completa estos datos con la información de TU proyecto.
// =============================================================

// 1) FIREBASE (consola.firebase.google.com)
//    - Activa: Authentication (Correo/contraseña y Anónimo)
//    - Activa: Realtime Database
export const firebaseConfig = {
  apiKey: "AIzaSyCe3ObnriEh8pBvITswUaIBqHzW81qLijs",
  authDomain: "citashnass.firebaseapp.com",
  databaseURL: "https://citashnass-default-rtdb.firebaseio.com",
  projectId: "citashnass",
  storageBucket: "citashnass.firebasestorage.app",
  messagingSenderId: "695692341631",
  appId: "1:695692341631:web:247364c84bbb29486dea4a"
};

// 2) CLOUDINARY (cloudinary.com) — para las fotos/PDF de solicitudes
//    Crea un "Upload preset" de tipo UNSIGNED y pon su nombre aquí.
export const cloudinaryConfig = {
  cloudName: "dugihbmyc",
  uploadPreset: "Unsigned",
  folder: "citas_rx"
};

// 3) URL pública del sistema (para el QR de ventanilla)
//    Cámbiala cuando sepas la URL final de GitHub Pages.
export const SITE_URL = "https://coorditm.github.io/citashnass/";

// 4) Frase secreta para cifrar las claves de acceso (cámbiala y no la compartas)
export const CLAVE_SAL = "hn4ss-c1t4s-rx-2026-s0l0-4dm1n";

// Datos institucionales (aparecen en pantallas y PDF)
export const NOMBRE_HOSPITAL = "Hospital Nacional Alberto Sabogal Sologuren";
export const NOMBRE_SERVICIO = "Servicio de Radiodiagnóstico y Ecografía";

// Tipos de examen (el residente lo asigna al aprobar).
// «contraste» lleva un segundo paso: elegir el estudio específico (HSG, etc.),
// cuya lista administra el admin en la sección «Estudios».
export const TIPOS_EXAMEN = {
  contraste: "Examen contrastado",
  biopsia: "Biopsia de mama por ecografía",
  eco: "Ecografía de hospitalización"
};

// Los examenes contrastados los cita el RESIDENTE; ecografías y biopsias
// las cita el DIGITADOR desde la sección «Por citar».
export const TIPO_CITA_RESIDENTE = "contraste";

export const ROLES = {
  admin: "Administrador",
  residente: "Residente de radiología",
  digitador: "Digitador ESSI"
};

export const ESTADOS = {
  pendiente: "Pendiente de revisión",
  validada: "Aprobada — por asignar fecha",
  citada: "Cita confirmada",
  rechazada: "Rechazada"
};
