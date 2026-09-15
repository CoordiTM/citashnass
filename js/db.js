// Inicialización de Firebase y utilidades compartidas
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, get, update, remove,
  query, orderByChild, equalTo
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig, cloudinaryConfig, TIPOS_EXAMEN, ESTADOS, NOMBRE_HOSPITAL, NOMBRE_SERVICIO, ROLES, CLAVE_SAL } from "./config.js";

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

export { ref, push, set, get, update, remove, query, orderByChild, equalTo };
export { TIPOS_EXAMEN, ESTADOS, NOMBRE_HOSPITAL, NOMBRE_SERVICIO, ROLES };
export { cloudinaryConfig };

// Cifrado de claves: se guarda el hash, nunca la clave en texto plano
export async function hashClave(clave) {
  const datos = new TextEncoder().encode(CLAVE_SAL + clave);
  const buffer = await crypto.subtle.digest("SHA-256", datos);
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- Cloudinary ----------
export async function subirArchivo(archivo) {
  const esPdf = archivo.type === "application/pdf";
  const url = `https://api.cloudinary.com/v1_1/${cloudinaryConfig.cloudName}/${esPdf ? "raw" : "image"}/upload`;
  const datos = new FormData();
  datos.append("file", archivo);
  datos.append("upload_preset", cloudinaryConfig.uploadPreset);
  datos.append("folder", cloudinaryConfig.folder);
  const resp = await fetch(url, { method: "POST", body: datos });
  if (!resp.ok) throw new Error("Error al subir el archivo a Cloudinary");
  return await resp.json(); // { secure_url, public_id, ... }
}

// ---------- Sello de fecha y hora (aparece SOLO en la descarga) ----------
export function textoSello(sol) {
  return `CITA: ${sol.fecha} ${sol.hora} - ${NOMBRE_SERVICIO}`;
}

// Imagen: Cloudinary genera el sello como transformación sobre la copia
export function urlImagenSellada(publicId, sello) {
  const texto = encodeURIComponent(sello).replace(/'/g, "%27");
  const transformacion = `l_text:Arial_28_bold:${texto},co_rgb:ffffff,b_rgb:1e429f,g_south,y_24,x_24`;
  return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/image/upload/${transformacion}/${publicId}.jpg`;
}

// PDF: se estampa en el navegador con pdf-lib antes de descargar
export async function descargarPdfSellado(urlOriginal, sello, nombreArchivo) {
  const resp = await fetch(urlOriginal);
  const bytes = await resp.arrayBuffer();
  const pdfDoc = await PDFLib.PDFDocument.load(bytes);
  const paginas = pdfDoc.getPages();
  paginas.forEach(pagina => {
    const { width, height } = pagina.getSize();
    pagina.drawRectangle({
      x: 24, y: height - 46, width: Math.min(width - 48, sello.length * 8.2 + 24), height: 30,
      color: PDFLib.rgb(0.118, 0.259, 0.624), opacity: 0.92
    });
    pagina.drawText(sello, { x: 36, y: height - 36, size: 13, color: PDFLib.rgb(1, 1, 1) });
  });
  const nuevo = await pdfDoc.save();
  const blob = new Blob([nuevo], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function descargarUrl(url, nombreArchivo) {
  const resp = await fetch(url);
  const blob = await resp.blob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---------- Fechas ----------
export function ahoraISO() { return new Date().toISOString(); }

export function formatearFechaHora(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString("es-PE", { dateStyle: "short", timeStyle: "short" });
}

export function fechaHoy() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export function tipoExamenTexto(clave) { return TIPOS_EXAMEN[clave] || clave || "-"; }

export function esPdf(url) { return /\.pdf(\?|$)/i.test(url || ""); }
