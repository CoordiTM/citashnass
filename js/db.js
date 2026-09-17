// Inicialización de Firebase y utilidades compartidas
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getDatabase, ref, push, set, get, update, remove,
  query, orderByChild, equalTo
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { firebaseConfig, cloudinaryConfig, TIPOS_EXAMEN, TIPO_CITA_RESIDENTE, ESTADOS, NOMBRE_HOSPITAL, NOMBRE_SERVICIO, ROLES, CLAVE_SAL } from "./config.js";

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

export { ref, push, set, get, update, remove, query, orderByChild, equalTo };
export { TIPOS_EXAMEN, TIPO_CITA_RESIDENTE, ESTADOS, NOMBRE_HOSPITAL, NOMBRE_SERVICIO, ROLES };
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

// ---------- Sello de la cita (aparece SOLO en la descarga) ----------
// Líneas del sello: fecha/hora grande + DNI/servicio + indicaciones envueltas.
function envolverTexto(texto, ancho) {
  const palabras = texto.split(/\s+/);
  const lineas = [];
  let linea = "";
  palabras.forEach((p) => {
    if ((linea + " " + p).trim().length > ancho) {
      lineas.push(linea.trim());
      linea = p;
    } else {
      linea = (linea + " " + p).trim();
    }
  });
  if (linea) lineas.push(linea);
  return lineas;
}

// Nombre del examen que se muestra en pantallas, PDF y sello:
// el estudio específico (ej. HSG) si existe; si no, la categoría.
export function nombreExamen(sol) {
  return (sol.estudio || "").trim() || tipoExamenTexto(sol.tipo);
}

// Una solicitud tiene cita confirmada cuando está «citada»
// (o «aprobada», que era el nombre anterior de ese estado).
export function esCitada(sol) {
  return sol.estado === "citada" || sol.estado === "aprobada";
}

export function lineasSello(sol) {
  const lineas = [`CITA: ${sol.fecha} ${sol.hora}`];
  lineas.push(`DNI ${sol.dni} · ${nombreExamen(sol)}`);
  const indicaciones = (sol.indicaciones || "").trim();
  if (indicaciones) {
    lineas.push("INDICACIONES:");
    const envueltas = envolverTexto(indicaciones, 42);
    const MAX = 6;
    envueltas.slice(0, MAX).forEach((l, i) => {
      lineas.push(i === MAX - 1 && envueltas.length > MAX ? l + " …" : l);
    });
  }
  return lineas;
}

// ---------- Sello dibujado con pdf-lib (una sola vía para PDF y fotos) ----------
function pintarSello(pagina, lineas, fuente, fuenteNegrita) {
  const { width } = pagina.getSize();
  const altoLinea = 28, margenX = 24, padding = 20;
  const altoCaja = padding * 2 + 40 + (lineas.length - 1) * altoLinea;
  pagina.drawRectangle({
    x: 0, y: 0, width, height: altoCaja,
    color: PDFLib.rgb(0.118, 0.259, 0.624), opacity: 0.95
  });
  let y = altoCaja - padding - 28;
  lineas.forEach((linea, i) => {
    const titular = i === 0;
    pagina.drawText(linea, {
      x: margenX, y,
      size: titular ? 36 : 21,
      font: titular ? fuenteNegrita : fuente,
      color: PDFLib.rgb(1, 1, 1)
    });
    y -= titular ? 44 : altoLinea;
  });
  return altoCaja;
}

// PDF original: se le agrega la banda del sello a cada página
export async function bytesPdfSellado(urlOriginal, lineas) {
  const resp = await fetch(urlOriginal);
  const bytes = await resp.arrayBuffer();
  const pdfDoc = await PDFLib.PDFDocument.load(bytes);
  const fuente = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const fuenteNegrita = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  pdfDoc.getPages().forEach((pagina) => pintarSello(pagina, lineas, fuente, fuenteNegrita));
  return pdfDoc.save();
}

// Foto original: se coloca dentro de un PDF A4 con el sello abajo
export async function bytesPdfDesdeImagen(urlImagen, lineas) {
  const resp = await fetch(urlImagen);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const bytes = await resp.arrayBuffer();
  const contentType = (resp.headers.get("content-type") || "").toLowerCase();
  const pdfDoc = await PDFLib.PDFDocument.create();
  const pagina = pdfDoc.addPage([595.28, 841.89]); // A4
  let imagen;
  if (contentType.includes("png")) {
    imagen = await pdfDoc.embedPng(bytes);
  } else if (contentType.includes("jpe") || contentType.includes("jpg")) {
    imagen = await pdfDoc.embedJpg(bytes);
  } else {
    // Último recurso: intentar como JPG por la extensión de la URL
    try { imagen = await pdfDoc.embedJpg(bytes); }
    catch { imagen = await pdfDoc.embedPng(bytes); }
  }
  const { width, height } = pagina.getSize();
  const margen = 24;
  const anchoCajaSello = 20 * 2 + 40 + (lineas.length - 1) * 28;
  const areaAncho = width - margen * 2;
  const areaAlto = height - margen - anchoCajaSello - 12;
  const escala = Math.min(areaAncho / imagen.width, areaAlto / imagen.height);
  const anchoImg = imagen.width * escala;
  const altoImg = imagen.height * escala;
  pagina.drawImage(imagen, {
    x: (width - anchoImg) / 2,
    y: anchoCajaSello + 12,
    width: anchoImg,
    height: altoImg
  });
  const fuente = await pdfDoc.embedFont(PDFLib.StandardFonts.Helvetica);
  const fuenteNegrita = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);
  pintarSello(pagina, lineas, fuente, fuenteNegrita);
  return pdfDoc.save();
}

// Genera el PDF sellado de una solicitud (PDF o foto → siempre PDF)
export async function generarPdfSellado(sol) {
  const lineas = lineasSello(sol);
  const nombre = `solicitud_sellada_${sol.dni}_${sol.fecha}.pdf`;
  const bytes = esPdf(sol.archivoUrl)
    ? await bytesPdfSellado(sol.archivoUrl, lineas)
    : await bytesPdfDesdeImagen(sol.archivoUrl, lineas);
  return { bytes, nombre };
}

export function descargarBytes(bytes, nombreArchivo) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nombreArchivo;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Ventana de vista previa: se revisa el PDF y se descarga solo si se decide
export function mostrarVistaPrevia(bytes, nombreArchivo) {
  document.getElementById("vistaPreviaModal")?.remove();
  const fondo = document.createElement("div");
  fondo.className = "vista-previa-fondo";
  fondo.id = "vistaPreviaModal";
  const urlBlob = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  fondo.innerHTML = `
    <div class="vista-previa">
      <iframe src="${urlBlob}" title="Vista previa"></iframe>
      <div class="vista-previa-barra">
        <button class="btn btn-primario" type="button">⬇️ Descargar PDF</button>
        <button class="btn btn-gris" type="button">Cerrar</button>
      </div>
    </div>`;
  const [btnDescargar, btnCerrar] = fondo.querySelectorAll("button");
  btnDescargar.addEventListener("click", () => descargarBytes(bytes, nombreArchivo));
  btnCerrar.addEventListener("click", () => { URL.revokeObjectURL(urlBlob); fondo.remove(); });
  fondo.addEventListener("click", (e) => { if (e.target === fondo) { URL.revokeObjectURL(urlBlob); fondo.remove(); } });
  document.body.appendChild(fondo);
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
