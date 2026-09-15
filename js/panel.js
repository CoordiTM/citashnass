// Panel interno: residentes, digitadores y administradores
// Sin Firebase Auth: acceso con usuario + clave cifrada en la base de datos.
import {
  ref, get, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  db, set, hashClave,
  urlImagenSellada, descargarPdfSellado, descargarUrl, textoSello,
  formatearFechaHora, tipoExamenTexto, esPdf, fechaHoy,
  NOMBRE_HOSPITAL, NOMBRE_SERVICIO, TIPOS_EXAMEN, ROLES
} from "./db.js";
import { SITE_URL } from "./config.js";

const $ = (id) => document.getElementById(id);
const SESION_KEY = "citas_rx_sesion";

let rolActual = null;
let datosUsuario = null;
let estadoFiltro = "pendiente";
let solicitudesCache = [];
let idAprobando = null;
let idRechazando = null;

// ============================================================
//  SESIÓN (usuario + clave, sin Firebase Auth)
// ============================================================
function guardarSesion(u) { localStorage.setItem(SESION_KEY, JSON.stringify(u)); }
function obtenerSesion() {
  try { return JSON.parse(localStorage.getItem(SESION_KEY)); } catch { return null; }
}
function cerrarSesion() {
  localStorage.removeItem(SESION_KEY);
  location.reload();
}

async function entrar(u) {
  datosUsuario = u;
  rolActual = u.rol;
  guardarSesion(u);
  $("vistaLogin").classList.add("oculto");
  $("vistaApp").classList.remove("oculto");
  $("infoUsuario").textContent = ` — ${u.nombre} (${ROLES[u.rol]})`;
  construirNavegacion();
  cargarSeccion(seccionPorDefecto());
  escucharSolicitudes();
}

// Al cargar: si no hay usuarios, mostrar configuración inicial; si hay sesión guardada, entrar
(async function iniciarPanel() {
  try {
    const snap = await get(ref(db, "usuarios"));
    if (!snap.exists()) {
      $("setupInicial").classList.remove("oculto");
      return;
    }
    const sesion = obtenerSesion();
    if (sesion && sesion.usuario) {
      const snapU = await get(ref(db, `usuarios/${sesion.usuario}`));
      const u = snapU.val();
      if (u && u.activo !== false && u.clave === sesion.clave) return entrar({ usuario: sesion.usuario, ...u });
      localStorage.removeItem(SESION_KEY);
    }
  } catch (err) {
    console.error(err);
    alerta("alertaLogin", "error", "No se pudo conectar con la base de datos. Revisa la configuración.");
  }
})();

$("btnLogin").addEventListener("click", login);
$("loginPassword").addEventListener("keydown", (e) => { if (e.key === "Enter") login(); });

async function login() {
  const usuario = $("loginEmail").value.trim().toLowerCase();
  const clave = $("loginPassword").value;
  if (!usuario || !clave) return alerta("alertaLogin", "error", "Ingresa usuario y clave.");
  const btn = $("btnLogin");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Ingresando…';
  try {
    const snap = await get(ref(db, `usuarios/${usuario}`));
    const u = snap.val();
    const hash = await hashClave(clave);
    if (!u || u.clave !== hash) {
      return alerta("alertaLogin", "error", "Usuario o clave incorrectos.");
    }
    if (u.activo === false) {
      return alerta("alertaLogin", "error", "Este usuario está desactivado. Contacta al administrador.");
    }
    $("loginPassword").value = "";
    entrar({ usuario, ...u });
  } catch (err) {
    console.error(err);
    alerta("alertaLogin", "error", "No se pudo conectar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Ingresar";
  }
}

$("btnSalir").addEventListener("click", cerrarSesion);

// ---------- Configuración inicial: crear el primer administrador ----------
$("btnSetup").addEventListener("click", async () => {
  const usuario = $("setupUsuario").value.trim().toLowerCase();
  const nombre = $("setupNombre").value.trim();
  const clave = $("setupClave").value;
  if (!/^[a-z0-9_.-]{3,20}$/.test(usuario)) return alerta("alertaSetup", "error", "Usuario inválido: 3-20 caracteres (letras, números, punto, guion, sin espacios).");
  if (!nombre) return alerta("alertaSetup", "error", "Ingresa el nombre completo.");
  if (clave.length < 4) return alerta("alertaSetup", "error", "La clave debe tener al menos 4 caracteres.");
  const btn = $("btnSetup");
  btn.disabled = true;
  try {
    const hash = await hashClave(clave);
    await set(ref(db, `usuarios/${usuario}`), {
      nombre, clave: hash, rol: "admin", activo: true, creadoEl: new Date().toISOString()
    });
    alerta("alertaSetup", "ok", "✅ Administrador creado. Ingresa con tu usuario y clave.");
    setTimeout(() => location.reload(), 1200);
  } catch (err) {
    console.error(err);
    alerta("alertaSetup", "error", "Error al crear el administrador. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
  }
});

function seccionPorDefecto() {
  if (rolActual === "admin") return "usuarios";
  return "solicitudes";
}

// ============================================================
//  NAVEGACIÓN POR ROL
// ============================================================
const SECCIONES = {
  solicitudes: { titulo: "📋 Solicitudes", roles: ["residente", "admin"] },
  listado: { titulo: "🖨️ Listado ESSI", roles: ["residente", "digitador", "admin"] },
  usuarios: { titulo: "👥 Usuarios", roles: ["admin"] },
  indicaciones: { titulo: "📌 Indicaciones", roles: ["admin"] },
  qr: { titulo: "🔳 QR ventanilla", roles: ["admin"] }
};

function construirNavegacion() {
  const nav = $("navegacionRoles");
  nav.innerHTML = "";
  Object.entries(SECCIONES).forEach(([clave, cfg]) => {
    if (!cfg.roles.includes(rolActual)) return;
    const btn = document.createElement("button");
    btn.className = "pestana";
    btn.textContent = cfg.titulo;
    btn.dataset.seccion = clave;
    btn.addEventListener("click", () => cargarSeccion(clave));
    nav.appendChild(btn);
  });
}

function cargarSeccion(clave) {
  document.querySelectorAll("#navegacionRoles .pestana").forEach((b) =>
    b.classList.toggle("activa", b.dataset.seccion === clave));
  Object.keys(SECCIONES).forEach((s) =>
    $(`seccion${s[0].toUpperCase()}${s.slice(1)}`).classList.toggle("oculto", s !== clave));

  if (clave === "solicitudes") renderSolicitudes();
  if (clave === "listado") cargarListado();
  if (clave === "usuarios") cargarUsuarios();
  if (clave === "indicaciones") cargarIndicaciones();
  if (clave === "qr") generarQr();
}

// ============================================================
//  SOLICITUDES (residente)
// ============================================================
function escucharSolicitudes() {
  if (!["residente", "admin"].includes(rolActual)) return;
  onValue(ref(db, "solicitudes"), (snap) => {
    solicitudesCache = [];
    snap.forEach((child) => solicitudesCache.push({ id: child.key, ...child.val() }));
    solicitudesCache.sort((a, b) => (b.creadoEl || "").localeCompare(a.creadoEl || ""));
    if (!$("seccionSolicitudes").classList.contains("oculto")) renderSolicitudes();
    if (!$("seccionListado").classList.contains("oculto")) cargarListado();
  });
}

document.querySelectorAll("#pestanasEstado .pestana").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#pestanasEstado .pestana").forEach((b) => b.classList.remove("activa"));
    btn.classList.add("activa");
    estadoFiltro = btn.dataset.estado;
    renderSolicitudes();
  });
});

$("filtroFecha").addEventListener("change", renderSolicitudes);
$("filtroDni").addEventListener("input", renderSolicitudes);
$("btnLimpiarFiltros").addEventListener("click", () => {
  $("filtroFecha").value = "";
  $("filtroDni").value = "";
  renderSolicitudes();
});

function renderSolicitudes() {
  const lista = $("listaSolicitudes");
  lista.innerHTML = "";
  const fFecha = $("filtroFecha").value;
  const fDni = $("filtroDni").value.trim();

  const filtradas = solicitudesCache.filter((s) => {
    if (s.estado !== estadoFiltro) return false;
    if (fFecha && (s.creadoEl || "").slice(0, 10) !== fFecha) return false;
    if (fDni && !s.dni.startsWith(fDni)) return false;
    return true;
  });

  $("sinResultados").classList.toggle("oculto", filtradas.length > 0);

  filtradas.forEach((s) => {
    const item = document.createElement("div");
    item.className = "solicitud-item";
    const etiquetaEstado = {
      pendiente: '<span class="etiqueta etiqueta-pendiente">Pendiente</span>',
      aprobada: '<span class="etiqueta etiqueta-aprobada">Aprobada</span>',
      rechazada: '<span class="etiqueta etiqueta-rechazada">Rechazada</span>'
    }[s.estado];

    let detalleExtra = "";
    if (s.estado === "aprobada") {
      detalleExtra = `<br>📅 <strong>${s.fecha} ${s.hora}</strong> · ${tipoExamenTexto(s.tipo)}${s.paciente ? " · " + escapar(s.paciente) : ""}`;
    }
    if (s.estado === "rechazada") {
      detalleExtra = `<br>Observación: ${escapar(s.observaciones || "-")}`;
    }

    item.innerHTML = `
      <div class="datos">
        <div>DNI: <span class="dni">${s.dni}</span> &nbsp; ${etiquetaEstado}</div>
        <div class="meta">
          📞 ${s.telefono} · Recibida: ${formatearFechaHora(s.creadoEl)}
          ${s.aprobadaEl ? ` · Revisada: ${formatearFechaHora(s.aprobadaEl)} por ${escapar(s.residente || "")}` : ""}
          ${detalleExtra}
        </div>
      </div>
      <div class="acciones">
        <button class="btn btn-gris btn-chico" data-ver="${s.id}" type="button">👁️ Ver solicitud</button>
        ${s.estado === "pendiente" && rolActual !== "digitador" ? `
          <button class="btn btn-verde btn-chico" data-aprobar="${s.id}" type="button">✅ Aprobar</button>
          <button class="btn btn-rojo btn-chico" data-rechazar="${s.id}" type="button">❌ Rechazar</button>` : ""}
        ${s.estado === "aprobada" ? `
          <button class="btn btn-gris btn-chico" data-sello="${s.id}" type="button">⬇️ Con sello</button>` : ""}
      </div>`;
    lista.appendChild(item);
  });

  lista.querySelectorAll("[data-ver]").forEach((b) =>
    b.addEventListener("click", () => window.open(buscar(b.dataset.ver).archivoUrl, "_blank")));
  lista.querySelectorAll("[data-aprobar]").forEach((b) =>
    b.addEventListener("click", () => abrirAprobar(b.dataset.aprobar)));
  lista.querySelectorAll("[data-rechazar]").forEach((b) =>
    b.addEventListener("click", () => abrirRechazar(b.dataset.rechazar)));
  lista.querySelectorAll("[data-sello]").forEach((b) =>
    b.addEventListener("click", () => descargarSellado(buscar(b.dataset.sello))));
}

function buscar(id) { return solicitudesCache.find((s) => s.id === id); }

function escapar(texto) {
  const div = document.createElement("div");
  div.textContent = texto ?? "";
  return div.innerHTML;
}

// ============================================================
//  APROBAR / RECHAZAR
// ============================================================
function llenarSelectTipos(selectId) {
  const sel = $(selectId);
  sel.innerHTML = '<option value="">— Seleccionar —</option>';
  Object.entries(TIPOS_EXAMEN).forEach(([clave, texto]) => {
    const op = document.createElement("option");
    op.value = clave;
    op.textContent = texto;
    sel.appendChild(op);
  });
}

async function cargarIndicacionesSelect(tipo) {
  const sel = $("aprIndicacionSelect");
  sel.innerHTML = '<option value="">— Elegir para autocompletar —</option>';
  if (!tipo) return;
  const snap = await get(ref(db, `indicaciones/${tipo}`));
  if (snap.exists()) {
    snap.val().forEach((texto, i) => {
      const op = document.createElement("option");
      op.value = i;
      op.textContent = texto.length > 70 ? texto.slice(0, 70) + "…" : texto;
      sel.appendChild(op);
    });
  }
}

function abrirAprobar(id) {
  const s = buscar(id);
  if (!s) return;
  idAprobando = id;
  llenarSelectTipos("aprTipo");
  $("aprPaciente").value = s.paciente || "";
  $("aprFecha").value = s.fecha || fechaHoy();
  $("aprHora").value = s.hora || "";
  $("aprIndicaciones").value = "";
  cargarIndicacionesSelect("");
  $("aprResumen").textContent = `Solicitud de DNI ${s.dni} · ${s.telefono} · Recibida el ${formatearFechaHora(s.creadoEl)}. Revisa la orden antes de confirmar.`;
  $("modalAprobar").classList.add("visible");
}

$("aprTipo").addEventListener("change", () => cargarIndicacionesSelect($("aprTipo").value));
$("aprIndicacionSelect").addEventListener("change", async (e) => {
  const tipo = $("aprTipo").value;
  const idx = e.target.value;
  if (tipo === "" || idx === "") return;
  const snap = await get(ref(db, `indicaciones/${tipo}`));
  if (snap.exists() && snap.val()[idx] !== undefined) {
    $("aprIndicaciones").value = snap.val()[idx];
  }
});

$("aprCancelar").addEventListener("click", () => $("modalAprobar").classList.remove("visible"));
$("aprConfirmar").addEventListener("click", async () => {
  const tipo = $("aprTipo").value;
  const fecha = $("aprFecha").value;
  const hora = $("aprHora").value;
  const indicaciones = $("aprIndicaciones").value.trim();
  if (!tipo) return alert("Selecciona el tipo de examen.");
  if (!fecha || !hora) return alert("Indica fecha y hora de la cita.");
  if (!indicaciones) return alert("Escribe las indicaciones para el paciente.");

  const btn = $("aprConfirmar");
  btn.disabled = true;
  try {
    await update(ref(db, `solicitudes/${idAprobando}`), {
      estado: "aprobada",
      tipo,
      fecha,
      hora,
      indicaciones,
      paciente: $("aprPaciente").value.trim(),
      residente: datosUsuario.nombre,
      aprobadaEl: new Date().toISOString()
    });
    $("modalAprobar").classList.remove("visible");
  } catch (err) {
    console.error(err);
    alert("Error al confirmar la cita. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
  }
});

function abrirRechazar(id) {
  const s = buscar(id);
  if (!s) return;
  idRechazando = id;
  $("recObservaciones").value = "";
  $("recResumen").textContent = `Solicitud de DNI ${s.dni} · ${s.telefono} · Recibida el ${formatearFechaHora(s.creadoEl)}.`;
  $("modalRechazar").classList.add("visible");
}

$("recCancelar").addEventListener("click", () => $("modalRechazar").classList.remove("visible"));
$("recConfirmar").addEventListener("click", async () => {
  const observaciones = $("recObservaciones").value.trim();
  if (!observaciones) return alert("Escribe la observación que verá el paciente.");
  const btn = $("recConfirmar");
  btn.disabled = true;
  try {
    await update(ref(db, `solicitudes/${idRechazando}`), {
      estado: "rechazada",
      observaciones,
      residente: datosUsuario.nombre,
      aprobadaEl: new Date().toISOString()
    });
    $("modalRechazar").classList.remove("visible");
  } catch (err) {
    console.error(err);
    alert("Error al rechazar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
  }
});

// ============================================================
//  DESCARGA CON SELLO (solo en la descarga; original intacto)
// ============================================================
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

// ============================================================
//  LISTADO PARA DIGITADOR ESSI (residente + digitador)
// ============================================================
function inicializarFiltrosListado() {
  const sel = $("listadoTipo");
  sel.innerHTML = '<option value="">Todos</option>';
  Object.entries(TIPOS_EXAMEN).forEach(([clave, texto]) => {
    const op = document.createElement("option");
    op.value = clave;
    op.textContent = texto;
    sel.appendChild(op);
  });
  if (!$("listadoDesde").value) $("listadoDesde").value = fechaHoy();
  if (!$("listadoHasta").value) $("listadoHasta").value = fechaHoy();
}
inicializarFiltrosListado();
$("listadoDesde").addEventListener("change", cargarListado);
$("listadoHasta").addEventListener("change", cargarListado);
$("listadoTipo").addEventListener("change", cargarListado);

async function cargarListado() {
  const desde = $("listadoDesde").value;
  const hasta = $("listadoHasta").value;
  const tipo = $("listadoTipo").value;
  if (!desde || !hasta) return;

  let datos = [];
  if (["residente", "admin"].includes(rolActual)) {
    datos = solicitudesCache;
  } else {
    // digitador: lee directamente de la base de datos (solo aprobadas)
    const snap = await get(ref(db, "solicitudes"));
    snap.forEach((child) => {
      const s = child.val();
      if (s.estado === "aprobada") datos.push({ id: child.key, ...s });
    });
  }

  const filtradas = datos
    .filter((s) => s.estado === "aprobada")
    .filter((s) => s.fecha >= desde && s.fecha <= hasta)
    .filter((s) => !tipo || s.tipo === tipo)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

  const tbody = $("tablaListado").querySelector("tbody");
  tbody.innerHTML = "";
  $("listadoVacio").classList.toggle("oculto", filtradas.length > 0);

  filtradas.forEach((s, i) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><strong>${s.dni}</strong></td>
      <td>${escapar(s.paciente || "-")}</td>
      <td>${tipoExamenTexto(s.tipo)}</td>
      <td>${s.fecha}</td>
      <td>${s.hora}</td>
      <td>${s.telefono}</td>
      <td><button class="btn btn-gris btn-chico" data-doc="${s.id}" type="button">⬇️ Sellado</button></td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-doc]").forEach((b) =>
    b.addEventListener("click", () => {
      const s = [...filtradas].find((x) => x.id === b.dataset.doc);
      if (s) descargarSellado(s);
    }));
}

$("btnListadoPdf").addEventListener("click", () => {
  const desde = $("listadoDesde").value;
  const hasta = $("listadoHasta").value;
  const tipo = $("listadoTipo").value;
  const filtradas = solicitudesCache
    .filter((s) => s.estado === "aprobada")
    .filter((s) => s.fecha >= desde && s.fecha <= hasta)
    .filter((s) => !tipo || s.tipo === tipo)
    .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  if (!filtradas.length) return alert("No hay citas aprobadas en el rango seleccionado.");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "landscape" });
  const ancho = doc.internal.pageSize.getWidth();

  doc.setFillColor(30, 66, 159);
  doc.rect(0, 0, ancho, 24, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(12);
  doc.text(NOMBRE_HOSPITAL, ancho / 2, 9, { align: "center" });
  doc.text(`${NOMBRE_SERVICIO} — LISTADO DE CITAS PARA ESSI`, ancho / 2, 17, { align: "center" });

  doc.setTextColor(17, 24, 39);
  doc.setFontSize(10);
  doc.text(`Rango: ${desde} al ${hasta}${tipo ? "  ·  Examen: " + tipoExamenTexto(tipo) : ""}  ·  Generado: ${new Date().toLocaleString("es-PE")}`, 14, 32);

  const cabeceras = [["N°", "DNI", "Paciente", "Examen", "Fecha", "Hora", "Contacto", "Indicaciones"]];
  const filas = filtradas.map((s, i) => [
    String(i + 1), s.dni, s.paciente || "-", tipoExamenTexto(s.tipo), s.fecha, s.hora, s.telefono,
    (s.indicaciones || "").replace(/\n/g, " ")
  ]);

  doc.autoTable({
    head: cabeceras,
    body: filas,
    startY: 36,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 66, 159] },
    columnStyles: { 7: { cellWidth: 70 } }
  });

  doc.save(`listado_citas_${desde}_${hasta}.pdf`);
});

// ============================================================
//  USUARIOS (admin)
// ============================================================
async function cargarUsuarios() {
  const snap = await get(ref(db, "usuarios"));
  const tbody = $("tablaUsuarios").querySelector("tbody");
  tbody.innerHTML = "";
  snap.forEach((child) => {
    const u = child.val();
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${escapar(child.key)}</strong></td>
      <td>${escapar(u.nombre || "-")}</td>
      <td><span class="etiqueta etiqueta-tipo">${ROLES[u.rol] || u.rol}</span></td>
      <td>${u.activo !== false ? '<span class="etiqueta etiqueta-aprobada">Activo</span>' : '<span class="etiqueta etiqueta-rechazada">Inactivo</span>'}</td>
      <td>
        <button class="btn btn-gris btn-chico" data-nombre="${child.key}" type="button">✏️ Nombre</button>
        <button class="btn btn-gris btn-chico" data-rol="${child.key}" type="button">Rol</button>
        <button class="btn btn-primario btn-chico" data-clave="${child.key}" type="button">🔑 Clave</button>
        <button class="btn ${u.activo !== false ? "btn-rojo" : "btn-verde"} btn-chico" data-toggle="${child.key}" type="button">
          ${u.activo !== false ? "Desactivar" : "Activar"}
        </button>
      </td>`;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll("[data-nombre]").forEach((b) =>
    b.addEventListener("click", async () => {
      const snapU = await get(ref(db, `usuarios/${b.dataset.nombre}`));
      const u = snapU.val();
      const nuevo = prompt("Nombre completo del usuario:", u.nombre || "");
      if (nuevo && nuevo.trim() && nuevo.trim() !== u.nombre) {
        await update(ref(db, `usuarios/${b.dataset.nombre}`), { nombre: nuevo.trim() });
        cargarUsuarios();
      }
    }));
  tbody.querySelectorAll("[data-clave]").forEach((b) =>
    b.addEventListener("click", async () => {
      const snapU = await get(ref(db, `usuarios/${b.dataset.clave}`));
      const u = snapU.val();
      const nueva = prompt(`Nueva clave para ${u.nombre} (mínimo 4 caracteres):`);
      if (!nueva) return;
      if (nueva.length < 4) return alert("La clave debe tener al menos 4 caracteres.");
      if (!confirm(`¿Cambiar la clave de ${u.nombre}?`)) return;
      await update(ref(db, `usuarios/${b.dataset.clave}`), { clave: await hashClave(nueva) });
      alert(`✅ Clave actualizada para ${u.nombre}.`);
    }));
  tbody.querySelectorAll("[data-rol]").forEach((b) =>
    b.addEventListener("click", async () => {
      const snapU = await get(ref(db, `usuarios/${b.dataset.rol}`));
      const u = snapU.val();
      const orden = ["residente", "digitador", "admin"];
      const siguiente = orden[(orden.indexOf(u.rol) + 1) % orden.length];
      if (confirm(`Cambiar rol de ${u.nombre} a «${ROLES[siguiente]}»?`)) {
        await update(ref(db, `usuarios/${b.dataset.rol}`), { rol: siguiente });
        cargarUsuarios();
      }
    }));
  tbody.querySelectorAll("[data-toggle]").forEach((b) =>
    b.addEventListener("click", async () => {
      const snapU = await get(ref(db, `usuarios/${b.dataset.toggle}`));
      const u = snapU.val();
      const nuevo = u.activo !== false ? false : true;
      if (confirm(`${nuevo ? "Activar" : "Desactivar"} al usuario ${u.nombre}?`)) {
        await update(ref(db, `usuarios/${b.dataset.toggle}`), { activo: nuevo });
        cargarUsuarios();
      }
    }));
}

$("btnCrearUsuario").addEventListener("click", async () => {
  const usuario = $("usrUsuario").value.trim().toLowerCase();
  const nombre = $("usrNombre").value.trim();
  const clave = $("usrPassword").value.trim();
  const rol = $("usrRol").value;
  if (!/^[a-z0-9_.-]{3,20}$/.test(usuario)) return alerta("alertaUsuario", "error", "Usuario inválido: 3-20 caracteres (letras, números, punto, guion, sin espacios).");
  if (!nombre || !clave) return alerta("alertaUsuario", "error", "Completa todos los campos.");
  if (clave.length < 4) return alerta("alertaUsuario", "error", "La clave debe tener al menos 4 caracteres.");

  const btn = $("btnCrearUsuario");
  btn.disabled = true;
  try {
    const existente = await get(ref(db, `usuarios/${usuario}`));
    if (existente.exists()) return alerta("alertaUsuario", "error", `El usuario «${usuario}» ya existe. Elige otro.`);
    await set(ref(db, `usuarios/${usuario}`), {
      nombre, clave: await hashClave(clave), rol, activo: true, creadoEl: new Date().toISOString()
    });
    alerta("alertaUsuario", "ok", `✅ Usuario creado: ${nombre} — usuario «${usuario}», rol ${ROLES[rol]}.`);
    $("usrUsuario").value = "";
    $("usrNombre").value = "";
    $("usrPassword").value = "";
    cargarUsuarios();
  } catch (err) {
    console.error(err);
    alerta("alertaUsuario", "error", "No se pudo crear el usuario. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
  }
});

// ============================================================
//  INDICACIONES (admin)
// ============================================================
function llenarSelectIndicacionesAdmin() {
  const sel = $("indTipo");
  sel.innerHTML = "";
  Object.entries(TIPOS_EXAMEN).forEach(([clave, texto]) => {
    const op = document.createElement("option");
    op.value = clave;
    op.textContent = texto;
    sel.appendChild(op);
  });
}
llenarSelectIndicacionesAdmin();

$("btnGuardarIndicacion").addEventListener("click", async () => {
  const tipo = $("indTipo").value;
  const texto = $("indTexto").value.trim();
  if (!texto) return alerta("alertaIndicacion", "error", "Escribe el texto de la indicación.");
  const btn = $("btnGuardarIndicacion");
  btn.disabled = true;
  try {
    const snap = await get(ref(db, `indicaciones/${tipo}`));
    const lista = snap.exists() ? snap.val() : [];
    lista.push(texto);
    await set(ref(db, `indicaciones/${tipo}`), lista);
    $("indTexto").value = "";
    alerta("alertaIndicacion", "ok", "✅ Indicación guardada.");
    cargarIndicaciones();
  } catch (err) {
    console.error(err);
    alerta("alertaIndicacion", "error", "Error al guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
  }
});

async function cargarIndicaciones() {
  const contenedor = $("listaIndicaciones");
  contenedor.innerHTML = "";
  const snap = await get(ref(db, "indicaciones"));
  if (!snap.exists()) {
    contenedor.innerHTML = '<p class="texto-centrado" style="color: var(--gris);">Aún no hay indicaciones registradas.</p>';
    return;
  }
  snap.forEach((child) => {
    const lista = child.val();
    lista.forEach((texto, i) => {
      const item = document.createElement("div");
      item.className = "solicitud-item";
      item.innerHTML = `
        <div class="datos">
          <span class="etiqueta etiqueta-tipo">${TIPOS_EXAMEN[child.key] || child.key}</span>
          <div class="meta" style="margin-top: 6px; white-space: pre-wrap;">${escapar(texto)}</div>
        </div>
        <div class="acciones">
          <button class="btn btn-rojo btn-chico" data-borrar="${child.key}|${i}" type="button">🗑️ Eliminar</button>
        </div>`;
      contenedor.appendChild(item);
    });
  });
  contenedor.querySelectorAll("[data-borrar]").forEach((b) =>
    b.addEventListener("click", async () => {
      const [tipo, idx] = b.dataset.borrar.split("|");
      if (!confirm("¿Eliminar esta indicación pregrabada?")) return;
      const snapI = await get(ref(db, `indicaciones/${tipo}`));
      const lista = snapI.val().filter((_, i) => i !== Number(idx));
      await set(ref(db, `indicaciones/${tipo}`), lista);
      cargarIndicaciones();
    }));
}

// ============================================================
//  QR DE VENTANILLA (admin)
// ============================================================
function generarQr() {
  const caja = $("qrCaja");
  caja.innerHTML = "";
  new QRCode(caja, {
    text: SITE_URL,
    width: 220,
    height: 220,
    correctLevel: QRCode.CorrectLevel.M
  });
  $("qrUrlTexto").textContent = SITE_URL;
}

$("btnImprimirQr").addEventListener("click", () => window.print());

// ============================================================
//  Utilidades
// ============================================================
function alerta(id, tipo, mensaje) {
  const el = $(id);
  el.className = `alerta alerta-${tipo} visible`;
  el.textContent = mensaje;
}
