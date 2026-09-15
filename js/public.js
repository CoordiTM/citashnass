// Portal público: solicitar cita y consultar por DNI
import {
  db, ref, push, set, get, query, orderByChild, equalTo,
  subirArchivo,
  urlImagenSellada, descargarPdfSellado, descargarUrl, textoSello,
  formatearFechaHora, tipoExamenTexto, esPdf,
  NOMBRE_HOSPITAL, NOMBRE_SERVICIO
} from "./db.js";

const $ = (id) => document.getElementById(id);

// ---------- Pestañas ----------
$("pestanaSolicitar").addEventListener("click", () => mostrarPestana("solicitar"));
$("pestanaConsultar").addEventListener("click", () => mostrarPestana("consultar"));

function mostrarPestana(cual) {
  $("pestanaSolicitar").classList.toggle("activa", cual === "solicitar");
  $("pestanaConsultar").classList.toggle("activa", cual === "consultar");
  $("seccionSolicitar").classList.toggle("oculto", cual !== "solicitar");
  $("seccionConsultar").classList.toggle("oculto", cual !== "consultar");
}

function mostrarAlerta(id, tipo, mensaje) {
  const el = $(id);
  el.className = `alerta alerta-${tipo} visible`;
  el.textContent = mensaje;
}
function ocultarAlerta(id) { $(id).className = "alerta"; }

// ---------- Selección de archivo ----------
let archivoSeleccionado = null;
$("archivo").addEventListener("change", (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  if (archivo.size > 8 * 1024 * 1024) {
    mostrarAlerta("alertaSolicitud", "error", "El archivo supera 8 MB. Usa una foto más ligera o comprime el PDF.");
    e.target.value = "";
    return;
  }
  archivoSeleccionado = archivo;
  const caja = $("vistaPrevia");
  caja.style.display = "block";
  if (archivo.type === "application/pdf") {
    $("previewImg").classList.add("oculto");
    $("previewPdf").classList.remove("oculto");
    $("nombrePdf").textContent = archivo.name;
  } else {
    $("previewPdf").classList.add("oculto");
    $("previewImg").classList.remove("oculto");
    $("previewImg").src = URL.createObjectURL(archivo);
  }
});

// ---------- Enviar solicitud ----------
$("btnEnviar").addEventListener("click", async () => {
  ocultarAlerta("alertaSolicitud");
  const dni = $("dni").value.trim();
  const telefono = $("telefono").value.trim();

  if (!/^\d{8}$/.test(dni)) return mostrarAlerta("alertaSolicitud", "error", "Ingresa un DNI válido de 8 dígitos.");
  if (!/^\d{6,9}$/.test(telefono)) return mostrarAlerta("alertaSolicitud", "error", "Ingresa un número de contacto válido.");
  if (!archivoSeleccionado) return mostrarAlerta("alertaSolicitud", "error", "Debes subir la foto o PDF de tu solicitud médica.");

  const btn = $("btnEnviar");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Subiendo…';
  try {
    const subida = await subirArchivo(archivoSeleccionado);
    const nueva = push(ref(db, "solicitudes"));
    await set(nueva, {
      dni,
      telefono,
      archivoUrl: subida.secure_url,
      archivoPublicId: subida.public_id,
      estado: "pendiente",
      tipo: "",
      fecha: "",
      hora: "",
      indicaciones: "",
      observaciones: "",
      paciente: "",
      creadoEl: new Date().toISOString()
    });
    mostrarAlerta("alertaSolicitud", "ok", "✅ Solicitud enviada. El residente de radiología la revisará y confirmará tu cita. Puedes consultar el estado con tu DNI en la pestaña «Consultar mi cita».");
    $("dni").value = "";
    $("telefono").value = "";
    $("archivo").value = "";
    archivoSeleccionado = null;
    $("vistaPrevia").style.display = "none";
  } catch (err) {
    console.error(err);
    mostrarAlerta("alertaSolicitud", "error", "Ocurrió un error al enviar. Intenta de nuevo; si persiste, acude a la ventanilla de Rayos X.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Enviar solicitud de cita";
  }
});

// ---------- Consultar por DNI ----------
$("btnBuscar").addEventListener("click", buscarCita);
$("dniBuscar").addEventListener("keydown", (e) => { if (e.key === "Enter") buscarCita(); });

async function buscarCita() {
  ocultarAlerta("alertaConsulta");
  $("resultadoConsulta").innerHTML = "";
  const dni = $("dniBuscar").value.trim();
  if (!/^\d{8}$/.test(dni)) return mostrarAlerta("alertaConsulta", "error", "Ingresa un DNI válido de 8 dígitos.");

  const btn = $("btnBuscar");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Buscando…';
  try {
    const consulta = query(ref(db, "solicitudes"), orderByChild("dni"), equalTo(dni));
    const snap = await get(consulta);
    if (!snap.exists()) {
      return mostrarAlerta("alertaConsulta", "error", "No se encontró ninguna solicitud con ese DNI. Verifica el número o presenta tu solicitud en la ventanilla de Rayos X.");
    }
    // La solicitud más reciente
    let masReciente = null;
    snap.forEach((child) => {
      const s = { id: child.key, ...child.val() };
      if (!masReciente || s.creadoEl > masReciente.creadoEl) masReciente = s;
    });
    renderResultado(masReciente);
  } catch (err) {
    console.error(err);
    mostrarAlerta("alertaConsulta", "error", "Error al consultar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Buscar mi cita";
  }
}

function renderResultado(sol) {
  const contenedor = $("resultadoConsulta");
  if (sol.estado === "pendiente") {
    contenedor.innerHTML = `
      <div class="tarjeta resultado-cita">
        <div class="icono-grande">⏳</div>
        <h2>Solicitud en revisión</h2>
        <p style="color: var(--gris); margin-top: 8px;">
          Recibida el ${formatearFechaHora(sol.creadoEl)}.<br>
          El residente de radiología está verificando tu historia clínica.
          Vuelve a consultar más tarde con tu DNI.
        </p>
      </div>`;
    return;
  }

  if (sol.estado === "rechazada") {
    contenedor.innerHTML = `
      <div class="tarjeta resultado-cita">
        <div class="icono-grande">❌</div>
        <h2>Solicitud rechazada</h2>
        <div class="observaciones-caja">
          <strong>Observación del residente:</strong><br>${escapar(sol.observaciones || "Sin observaciones.")}
        </div>
        <p style="color: var(--gris); font-size: .9rem;">
          Corrige lo indicado y vuelve a enviar tu solicitud, o acude a la ventanilla de Rayos X.
        </p>
      </div>`;
    return;
  }

  // Aprobada
  contenedor.innerHTML = `
    <div class="tarjeta resultado-cita">
      <div class="icono-grande">✅</div>
      <h2>Tu cita está confirmada</h2>
      <span class="etiqueta etiqueta-tipo">${tipoExamenTexto(sol.tipo)}</span>
      <div class="fecha-grande">📅 ${sol.fecha} &nbsp;·&nbsp; 🕐 ${sol.hora}</div>
      <div class="indicaciones-caja"><strong>Indicaciones:</strong><br>${escapar(sol.indicaciones || "Sin indicaciones.")}</div>
      <p style="color: var(--gris); font-size: .85rem;">DNI: ${sol.dni} · Confirmada el ${formatearFechaHora(sol.aprobadaEl)}</p>
      <div class="flex mt" style="justify-content: center;">
        <button class="btn btn-primario" id="btnPdfCita">⬇️ Descargar cita (PDF)</button>
        <button class="btn btn-gris" id="btnSello">⬇️ Solicitud con sello de cita</button>
      </div>
    </div>`;

  $("btnPdfCita").addEventListener("click", () => descargarPdfCita(sol));
  $("btnSello").addEventListener("click", () => descargarSellado(sol));
}

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

// ---------- PDF de la cita ----------
function descargarPdfCita(sol) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const ancho = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 66, 159);
  doc.rect(0, 0, ancho, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text(NOMBRE_HOSPITAL, ancho / 2, 11, { align: "center" });
  doc.setFontSize(11);
  doc.text(NOMBRE_SERVICIO, ancho / 2, 19, { align: "center" });

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(16);
  doc.text("CITA CONFIRMADA", ancho / 2, 42, { align: "center" });

  doc.setFontSize(11);
  let y = 56;
  const linea = (etiqueta, valor) => {
    doc.setFont(undefined, "bold"); doc.text(etiqueta, 20, y);
    doc.setFont(undefined, "normal"); doc.text(String(valor || "-"), 70, y);
    y += 8;
  };
  linea("DNI:", sol.dni);
  linea("Examen:", tipoExamenTexto(sol.tipo));
  linea("Fecha:", sol.fecha);
  linea("Hora:", sol.hora);
  linea("Contacto:", sol.telefono);

  y += 4;
  doc.setFont(undefined, "bold"); doc.text("Indicaciones:", 20, y); y += 7;
  doc.setFont(undefined, "normal");
  const lineas = doc.splitTextToSize(sol.indicaciones || "Sin indicaciones.", ancho - 40);
  doc.text(lineas, 20, y);

  y += lineas.length * 5 + 12;
  doc.setFontSize(9);
  doc.setTextColor(107, 114, 128);
  doc.text("Presenta este documento junto con tu solicitud original en Rayos X.", ancho / 2, y, { align: "center" });
  doc.text(`Generado el ${new Date().toLocaleString("es-PE")}`, ancho / 2, y + 5, { align: "center" });

  doc.save(`cita_${sol.dni}_${sol.fecha}.pdf`);
}

// ---------- Solicitud sellada (solo en la descarga) ----------
async function descargarSellado(sol) {
  const sello = textoSello(sol);
  const nombre = `solicitud_sellada_${sol.dni}_${sol.fecha}.`;
  try {
    if (esPdf(sol.archivoUrl)) {
      await descargarPdfSellado(sol.archivoUrl, sello, nombre + "pdf");
    } else {
      await descargarUrl(urlImagenSellada(sol.archivoPublicId, sello), nombre + "jpg");
    }
  } catch (err) {
    console.error(err);
    alert("No se pudo generar el archivo sellado. Intenta de nuevo.");
  }
}
