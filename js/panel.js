// Panel interno: residentes, digitadores y administradores
// Sin Firebase Auth: acceso con usuario + clave cifrada en la base de datos.
import {
  ref, get, update, remove, onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import {
  db, set, hashClave,
  generarPdfSellado, mostrarVistaPrevia, nombreExamen, esCitada,
  formatearFechaHora, tipoExamenTexto, fechaHoy,
  NOMBRE_HOSPITAL, NOMBRE_SERVICIO, TIPOS_EXAMEN, TIPO_CITA_RESIDENTE, ROLES
} from "./db.js";
import { firebaseConfig, SITE_URL } from "./config.js";

const $ = (id) => document.getElementById(id);
const SESION_KEY = "citas_rx_sesion";

let rolActual = null;
let datosUsuario = null;
let estadoFiltro = "pendiente";
let solicitudesCache = [];
let idAprobando = null;
let idRechazando = null;
let idCitando = null;

// ============================================================
//  SESIÓN (usuario + clave, sin Firebase Auth)
// ============================================================
// La sesión vive en sessionStorage: cada pestaña tiene su propia sesión
// y al cerrar la pestaña se cierra la sesión automáticamente.
function guardarSesion(u) { sessionStorage.setItem(SESION_KEY, JSON.stringify(u)); }
function obtenerSesion() {
  try { return JSON.parse(sessionStorage.getItem(SESION_KEY)); } catch { return null; }
}
function cerrarSesion() {
  sessionStorage.removeItem(SESION_KEY);
  localStorage.removeItem(SESION_KEY); // limpiar sesión antigua (localStorage)
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
  escucharSolicitudes();
  cargarSolicitudes();
  cargarSeccion(seccionPorDefecto());
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
      sessionStorage.removeItem(SESION_KEY);
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
  // La primera sección que su rol puede ver (el digitador NUNCA ve solicitudes)
  const disponibles = Object.entries(SECCIONES).filter(([, cfg]) => cfg.roles.includes(rolActual));
  return disponibles.length ? disponibles[0][0] : "solicitudes";
}

// ============================================================
//  NAVEGACIÓN POR ROL
// ============================================================
const SECCIONES = {
  solicitudes: { titulo: "📋 Solicitudes", roles: ["residente", "admin"] },
  porCitar: { titulo: "📅 Por citar", roles: ["digitador", "admin"] },
  listado: { titulo: "🖨️ Listado ESSI", roles: ["residente", "digitador", "admin"] },
  usuarios: { titulo: "👥 Usuarios", roles: ["admin"] },
  indicaciones: { titulo: "📌 Indicaciones", roles: ["admin"] },
  estudios: { titulo: "🩻 Estudios", roles: ["admin"] },
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
  // Candado: si el rol no tiene permiso para esta sección, ir a la suya
  if (!SECCIONES[clave] || !SECCIONES[clave].roles.includes(rolActual)) {
    clave = seccionPorDefecto();
  }
  document.querySelectorAll("#navegacionRoles .pestana").forEach((b) =>
    b.classList.toggle("activa", b.dataset.seccion === clave));
  Object.keys(SECCIONES).forEach((s) =>
    $(`seccion${s[0].toUpperCase()}${s.slice(1)}`).classList.toggle("oculto", s !== clave));

  if (clave === "solicitudes") renderSolicitudes();
  if (clave === "porCitar") renderPorCitar();
  if (clave === "listado") cargarListado();
  if (clave === "usuarios") cargarUsuarios();
  if (clave === "indicaciones") {
    $("campoIndEstudio").classList.toggle("oculto", $("indTipo").value !== TIPO_CITA_RESIDENTE);
    llenarSelectEstudiosIndicaciones();
    cargarIndicaciones();
  }
  if (clave === "estudios") cargarEstudios();
  if (clave === "qr") generarQr();
}

// ============================================================
//  SOLICITUDES (residente)
// ============================================================
let ultimoErrorCarga = "";

async function cargarSolicitudes() {
  try {
    // Lectura directa por HTTP: funciona aunque la red corte el WebSocket
    // que usa el SDK de Firebase (la misma URL .json que abriste en el navegador).
    const resp = await fetch(`${firebaseConfig.databaseURL}/solicitudes.json`);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    solicitudesCache = [];
    if (data) {
      Object.entries(data).forEach(([id, valor]) => solicitudesCache.push({ id, ...valor }));
    }
    solicitudesCache.sort((a, b) => (b.creadoEl || "").localeCompare(a.creadoEl || ""));
    ultimoErrorCarga = "";
    if (!$("seccionSolicitudes").classList.contains("oculto")) renderSolicitudes();
    if (!$("seccionPorCitar").classList.contains("oculto")) renderPorCitar();
    if (!$("seccionListado").classList.contains("oculto")) cargarListado();
  } catch (err) {
    ultimoErrorCarga = "⚠️ Error al cargar solicitudes: " + (err && err.message ? err.message : String(err));
    console.error(ultimoErrorCarga, err);
    if (!$("seccionSolicitudes").classList.contains("oculto")) renderSolicitudes();
  }
}

function escucharSolicitudes() {
  // Tiempo real (si la red lo permite)…
  onValue(ref(db, "solicitudes"), () => cargarSolicitudes());
  // …y refresco periódico + al volver a la pestaña, por si el firewall corta el WebSocket
  setInterval(cargarSolicitudes, 60000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) cargarSolicitudes();
  });
}

document.querySelectorAll("#pestanasEstado .pestana").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll("#pestanasEstado .pestana").forEach((b) => b.classList.remove("activa"));
    btn.classList.add("activa");
    estadoFiltro = btn.dataset.estado;
    cargarSolicitudes();
  });
});

$("filtroFecha").addEventListener("change", cargarSolicitudes);
$("filtroDni").addEventListener("input", renderSolicitudes);
$("btnLimpiarFiltros").addEventListener("click", () => {
  $("filtroFecha").value = "";
  $("filtroDni").value = "";
  cargarSolicitudes();
});
$("btnActualizarSolicitudes").addEventListener("click", cargarSolicitudes);

function renderSolicitudes() {
  if (rolActual === "digitador") return; // doble candado: el digitador jamás ve solicitudes
  const lista = $("listaSolicitudes");
  lista.innerHTML = "";
  const fFecha = $("filtroFecha").value;
  const fDni = $("filtroDni").value.trim();

  const filtradas = solicitudesCache.filter((s) => {
    if (estadoFiltro === "citada" ? !esCitada(s) : s.estado !== estadoFiltro) return false;
    if (fFecha && (s.creadoEl || "").slice(0, 10) !== fFecha) return false;
    if (fDni && !s.dni.startsWith(fDni)) return false;
    return true;
  });

  $("sinResultados").classList.toggle("oculto", filtradas.length > 0);
  if (filtradas.length === 0) {
    $("sinResultados").textContent = ultimoErrorCarga
      ? ultimoErrorCarga + " — revisa F12 → Consola para más detalle."
      : "No hay solicitudes con estos filtros.";
  }

  filtradas.forEach((s) => {
    const item = document.createElement("div");
    item.className = "solicitud-item";
    const etiquetaEstado = {
      pendiente: '<span class="etiqueta etiqueta-pendiente">Pendiente</span>',
      validada: '<span class="etiqueta etiqueta-validada">Validada — por citar</span>',
      citada: '<span class="etiqueta etiqueta-aprobada">Citada</span>',
      aprobada: '<span class="etiqueta etiqueta-aprobada">Citada</span>',
      rechazada: '<span class="etiqueta etiqueta-rechazada">Rechazada</span>'
    }[s.estado];

    let detalleExtra = "";
    if (esCitada(s)) {
      detalleExtra = `<br>📅 <strong>${s.fecha} ${s.hora}</strong> · ${nombreExamen(s)}${s.paciente ? " · " + escapar(s.paciente) : ""}${s.citadaPor ? ` · Citada por ${escapar(s.citadaPor)}` : ""}`;
    }
    if (s.estado === "validada") {
      detalleExtra = `<br>🩻 ${nombreExamen(s)}${s.paciente ? " · " + escapar(s.paciente) : ""} — ⏳ esperando que digitación asigne fecha y hora`;
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
          <button class="btn btn-verde btn-chico" data-aprobar="${s.id}" type="button">✅ Revisar</button>
          <button class="btn btn-rojo btn-chico" data-rechazar="${s.id}" type="button">❌ Rechazar</button>` : ""}
        ${esCitada(s) ? `
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

async function llenarSelectEstudios() {
  const sel = $("aprEstudio");
  sel.innerHTML = '<option value="">— Seleccionar estudio —</option>';
  try {
    const estudios = await leerEstudios();
    estudios.forEach((texto) => {
      const op = document.createElement("option");
      op.value = texto;
      op.textContent = texto;
      sel.appendChild(op);
    });
  } catch (err) {
    console.error("Error al cargar estudios:", err);
  }
}

// Según el tipo elegido, el modal cambia:
//  - contraste → pide estudio específico + fecha y hora (el residente cita)
//  - eco/biopsia → sin fecha ni hora (el digitador citará después): «Validar»
function actualizarModalAprobar() {
  const tipo = $("aprTipo").value;
  const esContraste = tipo === TIPO_CITA_RESIDENTE;
  $("campoEstudio").classList.toggle("oculto", !esContraste);
  $("campoFecha").classList.toggle("oculto", !esContraste);
  $("campoHora").classList.toggle("oculto", !esContraste);
  $("aprAvisoDigitador").classList.toggle("oculto", !tipo || esContraste);
  $("aprConfirmar").textContent = esContraste ? "Confirmar cita" : "Validar solicitud";
}

async function cargarIndicacionesSelect(tipo, estudio) {
  const sel = $("aprIndicacionSelect");
  sel.innerHTML = '<option value="">— Elegir para autocompletar —</option>';
  if (!tipo) return;
  try {
    const lista = await leerIndicacionesTipo(tipo, estudio);
    lista.forEach((texto, i) => {
      const op = document.createElement("option");
      op.value = i;
      op.textContent = texto.length > 70 ? texto.slice(0, 70) + "…" : texto;
      sel.appendChild(op);
    });
  } catch (err) {
    console.error("Error al cargar indicaciones:", err);
  }
}

function abrirAprobar(id) {
  const s = buscar(id);
  if (!s) return;
  idAprobando = id;
  llenarSelectTipos("aprTipo");
  llenarSelectEstudios();
  $("aprPaciente").value = s.paciente || "";
  $("aprFecha").value = s.fecha || fechaHoy();
  $("aprHora").value = s.hora || "";
  $("aprIndicaciones").value = "";
  cargarIndicacionesSelect("", "");
  actualizarModalAprobar();
  $("aprResumen").textContent = `Solicitud de DNI ${s.dni} · ${s.telefono} · Recibida el ${formatearFechaHora(s.creadoEl)}. Revisa la orden antes de confirmar.`;
  $("modalAprobar").classList.add("visible");
}

$("aprTipo").addEventListener("change", () => {
  actualizarModalAprobar();
  if ($("aprTipo").value !== TIPO_CITA_RESIDENTE) $("aprEstudio").value = "";
  cargarIndicacionesSelect($("aprTipo").value, $("aprEstudio").value);
});
$("aprEstudio").addEventListener("change", () =>
  cargarIndicacionesSelect($("aprTipo").value, $("aprEstudio").value));
$("aprIndicacionSelect").addEventListener("change", async (e) => {
  const tipo = $("aprTipo").value;
  const idx = e.target.value;
  if (tipo === "" || idx === "") return;
  try {
    const lista = await leerIndicacionesTipo(tipo, $("aprEstudio").value);
    if (lista[idx] !== undefined) $("aprIndicaciones").value = lista[idx];
  } catch (err) {
    console.error("Error al cargar indicación:", err);
  }
});

$("aprCancelar").addEventListener("click", () => $("modalAprobar").classList.remove("visible"));
$("aprConfirmar").addEventListener("click", async () => {
  const tipo = $("aprTipo").value;
  const esContraste = tipo === TIPO_CITA_RESIDENTE;
  const estudio = $("aprEstudio").value;
  const fecha = $("aprFecha").value;
  const hora = $("aprHora").value;
  const indicaciones = $("aprIndicaciones").value.trim();
  if (!tipo) return alert("Selecciona el tipo de examen.");
  if (esContraste && !estudio) return alert("Selecciona el estudio específico que se va a realizar.");
  if (esContraste && (!fecha || !hora)) return alert("Indica fecha y hora de la cita.");
  if (!indicaciones) return alert("Escribe las indicaciones para el paciente.");

  const btn = $("aprConfirmar");
  btn.disabled = true;
  try {
    // Contraste: el residente cita de una vez. Eco/biopsia: queda «validada»
    // y el digitador le asignará fecha y hora desde «Por citar».
    const datos = esContraste
      ? { estado: "citada", tipo, estudio, fecha, hora, indicaciones }
      : { estado: "validada", tipo, estudio: "", indicaciones };
    await update(ref(db, `solicitudes/${idAprobando}`), {
      ...datos,
      paciente: $("aprPaciente").value.trim(),
      residente: datosUsuario.nombre,
      aprobadaEl: new Date().toISOString()
    });
    $("modalAprobar").classList.remove("visible");
  } catch (err) {
    console.error(err);
    alert("Error al confirmar. Intenta de nuevo.");
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
//  DESCARGA CON SELLO — primero vista previa, luego se decide
//  (el PDF se genera siempre, incluso para fotos; original intacto)
// ============================================================
async function descargarSellado(sol) {
  try {
    const { bytes, nombre } = await generarPdfSellado(sol);
    mostrarVistaPrevia(bytes, nombre);
  } catch (err) {
    console.error(err);
    alert("No se pudo generar el documento sellado. Intenta de nuevo.");
  }
}

// ============================================================
//  POR CITAR (digitador): solicitudes validadas por el residente
//  de ecografías/biopsias, a las que el digitador asigna fecha y hora
// ============================================================
function renderPorCitar() {
  const lista = $("listaPorCitar");
  lista.innerHTML = "";
  const filtradas = solicitudesCache
    .filter((s) => s.estado === "validada")
    .sort((a, b) => (b.aprobadaEl || "").localeCompare(a.aprobadaEl || ""));

  $("porCitarVacio").classList.toggle("oculto", filtradas.length > 0);
  $("porCitarVacio").textContent = ultimoErrorCarga
    ? ultimoErrorCarga + " — revisa F12 → Consola para más detalle."
    : "No hay solicitudes esperando fecha. Aquí aparecerán las ecografías y biopsias que el residente valide.";

  filtradas.forEach((s) => {
    const item = document.createElement("div");
    item.className = "solicitud-item";
    item.innerHTML = `
      <div class="datos">
        <div>DNI: <span class="dni">${s.dni}</span> &nbsp; <span class="etiqueta etiqueta-validada">Validada — sin fecha</span></div>
        <div class="meta">
          📞 ${s.telefono} · ${nombreExamen(s)}${s.paciente ? " · " + escapar(s.paciente) : ""}
          <br>Validada el ${formatearFechaHora(s.aprobadaEl)} por ${escapar(s.residente || "-")}
          ${s.indicaciones ? `<br>Indicaciones: ${escapar(s.indicaciones)}` : ""}
        </div>
      </div>
      <div class="acciones">
        <button class="btn btn-gris btn-chico" data-ver="${s.id}" type="button">👁️ Ver solicitud</button>
        <button class="btn btn-primario btn-chico" data-citar="${s.id}" type="button">📅 Asignar fecha</button>
      </div>`;
    lista.appendChild(item);
  });

  lista.querySelectorAll("[data-ver]").forEach((b) =>
    b.addEventListener("click", () => window.open(buscar(b.dataset.ver).archivoUrl, "_blank")));
  lista.querySelectorAll("[data-citar]").forEach((b) =>
    b.addEventListener("click", () => abrirCitar(b.dataset.citar)));
}

function abrirCitar(id, editando = false) {
  const s = buscar(id);
  if (!s) return;
  idCitando = id;
  $("citTitulo").textContent = editando ? "✏️ Editar fecha y hora de la cita" : "📅 Asignar fecha y hora de la cita";
  $("citResumen").textContent = `DNI ${s.dni} · ${nombreExamen(s)} · ${s.telefono}.`;
  $("citFecha").value = s.fecha || fechaHoy();
  $("citHora").value = s.hora || "";
  $("modalCitar").classList.add("visible");
}

$("citCancelar").addEventListener("click", () => $("modalCitar").classList.remove("visible"));
$("citConfirmar").addEventListener("click", async () => {
  const fecha = $("citFecha").value;
  const hora = $("citHora").value;
  if (!fecha || !hora) return alert("Indica fecha y hora de la cita.");
  const btn = $("citConfirmar");
  btn.disabled = true;
  try {
    await update(ref(db, `solicitudes/${idCitando}`), {
      estado: "citada",
      fecha,
      hora,
      citadaEl: new Date().toISOString(),
      citadaPor: datosUsuario.nombre
    });
    $("modalCitar").classList.remove("visible");
  } catch (err) {
    console.error(err);
    alert("Error al asignar la cita. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
  }
});

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

  // Mismo origen de datos para todos los roles (residente, digitador y admin)
  if (!solicitudesCache.length) await cargarSolicitudes();

  // El filtro es por FECHA DE APROBACIÓN/VALIDACIÓN (lo que el residente aprobó ese día),
  // no por la fecha futura de la cita.
  const filtradas = solicitudesCache
    .filter(esCitada)
    .filter((s) => {
      const dia = (s.aprobadaEl || "").slice(0, 10);
      return dia >= desde && dia <= hasta;
    })
    .filter((s) => !tipo || s.tipo === tipo)
    .sort((a, b) => (b.aprobadaEl || "").localeCompare(a.aprobadaEl || ""));

  const tbody = $("tablaListado").querySelector("tbody");
  tbody.innerHTML = "";
  $("listadoVacio").classList.toggle("oculto", filtradas.length > 0);

  const cargadas = filtradas.filter((s) => s.cargadoESSI).length;
  $("listadoContador").textContent = filtradas.length
    ? `${cargadas} de ${filtradas.length} cargadas en ESSI`
    : "";

  filtradas.forEach((s, i) => {
    const tr = document.createElement("tr");
    if (s.cargadoESSI) tr.classList.add("fila-atenuada");
    tr.innerHTML = `
      <td>${i + 1}</td>
      <td><strong>${s.dni}</strong></td>
      <td>${escapar(s.paciente || "-")}</td>
      <td>${nombreExamen(s)}</td>
      <td>${s.fecha}</td>
      <td>${s.hora}</td>
      <td>${formatearFechaHora(s.aprobadaEl)}</td>
      <td>${s.telefono}</td>
      <td>
        <label class="check-essi" title="Marcar cuando se haya cargado en ESSI">
          <input type="checkbox" data-essi="${s.id}" ${s.cargadoESSI ? "checked" : ""}> Cargado
        </label>
      </td>
      <td>
        <button class="btn btn-gris btn-chico" data-doc="${s.id}" type="button">⬇️ Sellado</button>
        ${s.tipo !== TIPO_CITA_RESIDENTE ? `<button class="btn btn-gris btn-chico" data-editar-cita="${s.id}" type="button" title="Corregir fecha u hora">✏️</button>` : ""}
      </td>`;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll("[data-doc]").forEach((b) =>
    b.addEventListener("click", () => {
      const s = [...filtradas].find((x) => x.id === b.dataset.doc);
      if (s) descargarSellado(s);
    }));
  tbody.querySelectorAll("[data-editar-cita]").forEach((b) =>
    b.addEventListener("click", () => abrirCitar(b.dataset.editarCita, true)));
  tbody.querySelectorAll("[data-essi]").forEach((c) =>
    c.addEventListener("change", async () => {
      try {
        const resp = await fetch(`${firebaseConfig.databaseURL}/solicitudes/${c.dataset.essi}.json`, {
          method: "PATCH",
          body: JSON.stringify({ cargadoESSI: c.checked, cargadoESSEl: c.checked ? new Date().toISOString() : null })
        });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const s = solicitudesCache.find((x) => x.id === c.dataset.essi);
        if (s) { s.cargadoESSI = c.checked; }
        c.closest("tr").classList.toggle("fila-atenuada", c.checked);
        const total = filtradas.length;
        const hechas = filtradas.filter((x) => (x.id === c.dataset.essi ? c.checked : x.cargadoESSI)).length;
        $("listadoContador").textContent = `${hechas} de ${total} cargadas en ESSI`;
      } catch (err) {
        console.error(err);
        c.checked = !c.checked;
        alert("No se pudo guardar la marca. Intenta de nuevo.");
      }
    }));
}

$("btnListadoPdf").addEventListener("click", async () => {
  await cargarSolicitudes(); // asegura datos frescos para cualquier rol
  const desde = $("listadoDesde").value;
  const hasta = $("listadoHasta").value;
  const tipo = $("listadoTipo").value;
  const filtradas = solicitudesCache
    .filter(esCitada)
    .filter((s) => {
      const dia = (s.aprobadaEl || "").slice(0, 10);
      return dia >= desde && dia <= hasta;
    })
    .filter((s) => !tipo || s.tipo === tipo)
    .sort((a, b) => (b.aprobadaEl || "").localeCompare(a.aprobadaEl || ""));
  if (!filtradas.length) return alert("No hay citas aprobadas en el rango seleccionado (por fecha de aprobación). Amplía las fechas (desde/hasta).");

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
  doc.text(`Aprobadas del ${desde} al ${hasta}${tipo ? "  ·  Examen: " + tipoExamenTexto(tipo) : ""}  ·  Generado: ${new Date().toLocaleString("es-PE")}`, 14, 32);

  const cabeceras = [["N°", "DNI", "Paciente", "Examen", "Fecha cita", "Hora", "Aprobada el", "Contacto", "Indicaciones", "ESSI"]];
  const filas = filtradas.map((s, i) => [
    String(i + 1), s.dni, s.paciente || "-", nombreExamen(s), s.fecha, s.hora,
    formatearFechaHora(s.aprobadaEl), s.telefono,
    (s.indicaciones || "").replace(/\n/g, " "),
    s.cargadoESSI ? "✓" : "—"
  ]);

  doc.autoTable({
    head: cabeceras,
    body: filas,
    startY: 36,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [30, 66, 159] },
    columnStyles: { 7: { cellWidth: 70 } }
  });

  // Vista previa primero; se descarga solo si se decide
  mostrarVistaPrevia(doc.output("arraybuffer"), `listado_citas_${desde}_${hasta}.pdf`);
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
//  ESTUDIOS CONTRASTADOS (admin)
// ============================================================
async function leerEstudios() {
  const resp = await fetch(`${firebaseConfig.databaseURL}/estudios.json`);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const data = await resp.json();
  return Array.isArray(data) ? data : [];
}

async function guardarEstudios(lista) {
  const resp = await fetch(`${firebaseConfig.databaseURL}/estudios.json`, {
    method: "PUT",
    body: JSON.stringify(lista || [])
  });
  if (!resp.ok) throw new Error("HTTP " + resp.status);
}

async function cargarEstudios() {
  const contenedor = $("listaEstudios");
  contenedor.innerHTML = "";
  let estudios = [];
  try {
    estudios = await leerEstudios();
  } catch (err) {
    console.error(err);
    alerta("alertaEstudio", "error", "No se pudo cargar la lista de estudios.");
  }
  $("estudiosVacio").classList.toggle("oculto", estudios.length > 0);
  estudios.forEach((texto, i) => {
    const item = document.createElement("div");
    item.className = "solicitud-item";
    item.innerHTML = `
      <div class="datos"><div class="meta">${escapar(texto)}</div></div>
      <div class="acciones">
        <button class="btn btn-gris btn-chico" data-editar-est="${i}" type="button">✏️ Editar</button>
        <button class="btn btn-rojo btn-chico" data-borrar-est="${i}" type="button">🗑️ Eliminar</button>
      </div>`;
    contenedor.appendChild(item);
  });
  contenedor.querySelectorAll("[data-editar-est]").forEach((b) =>
    b.addEventListener("click", async () => {
      const i = Number(b.dataset.editarEst);
      const actual = estudios[i] || "";
      const nuevo = prompt("Nombre del estudio:", actual);
      if (nuevo === null) return;
      if (!nuevo.trim()) return alert("El nombre no puede quedar vacío.");
      if (nuevo.trim() === actual) return;
      estudios[i] = nuevo.trim();
      try {
        await guardarEstudios(estudios);
        cargarEstudios();
      } catch (err) {
        console.error(err);
        alert("No se pudo guardar. Intenta de nuevo.");
      }
    }));
  contenedor.querySelectorAll("[data-borrar-est]").forEach((b) =>
    b.addEventListener("click", async () => {
      const i = Number(b.dataset.borrarEst);
      if (!confirm(`¿Eliminar el estudio «${estudios[i]}»? Las indicaciones guardadas bajo ese nombre también dejarán de mostrarse.`)) return;
      estudios.splice(i, 1);
      try {
        await guardarEstudios(estudios);
        cargarEstudios();
      } catch (err) {
        console.error(err);
        alert("No se pudo eliminar. Intenta de nuevo.");
      }
    }));
}

$("btnAgregarEstudio").addEventListener("click", async () => {
  const texto = $("estNombre").value.trim();
  if (!texto) return alerta("alertaEstudio", "error", "Escribe el nombre del estudio (ej: HSG).");
  const btn = $("btnAgregarEstudio");
  btn.disabled = true;
  try {
    const lista = await leerEstudios();
    lista.push(texto);
    await guardarEstudios(lista);
    $("estNombre").value = "";
    alerta("alertaEstudio", "ok", `✅ Estudio «${texto}» agregado.`);
    cargarEstudios();
  } catch (err) {
    console.error(err);
    alerta("alertaEstudio", "error", "No se pudo guardar. Intenta de nuevo.");
  } finally {
    btn.disabled = false;
  }
});

// ============================================================
//  INDICACIONES (admin) — por estudio específico en contrastes
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

async function llenarSelectEstudiosIndicaciones() {
  const sel = $("indEstudio");
  sel.innerHTML = '<option value="">— Seleccionar estudio —</option>';
  try {
    (await leerEstudios()).forEach((texto) => {
      const op = document.createElement("option");
      op.value = texto;
      op.textContent = texto;
      sel.appendChild(op);
    });
  } catch (err) {
    console.error(err);
  }
}

function estudioSeleccionadoIndicaciones() {
  return $("indTipo").value === TIPO_CITA_RESIDENTE ? $("indEstudio").value : "";
}

async function leerIndicacionesTipo(tipo, estudio) {
  const resp = await fetch(`${firebaseConfig.databaseURL}/indicaciones/${tipo}.json`);
  if (!resp.ok) throw new Error("HTTP " + resp.status);
  const data = await resp.json();
  if (tipo === TIPO_CITA_RESIDENTE) {
    // Formato: objeto { "HSG": [indicaciones…], "Cistografía": […] }
    if (!data || Array.isArray(data)) return [];
    return Array.isArray(data[estudio]) ? data[estudio] : [];
  }
  return Array.isArray(data) ? data : [];
}

async function guardarListaIndicaciones(tipo, estudio, lista) {
  if (tipo === TIPO_CITA_RESIDENTE) {
    const resp = await fetch(`${firebaseConfig.databaseURL}/indicaciones/${tipo}.json`);
    if (!resp.ok) throw new Error("HTTP " + resp.status);
    const data = await resp.json();
    const obj = (data && !Array.isArray(data)) ? data : {};
    obj[estudio] = lista || [];
    const r2 = await fetch(`${firebaseConfig.databaseURL}/indicaciones/${tipo}.json`, {
      method: "PUT",
      body: JSON.stringify(obj)
    });
    if (!r2.ok) throw new Error("HTTP " + r2.status);
    return;
  }
  const resp = await fetch(`${firebaseConfig.databaseURL}/indicaciones/${tipo}.json`, {
    method: "PUT",
    body: JSON.stringify(lista || [])
  });
  if (!resp.ok) throw new Error("HTTP " + resp.status);
}

$("indTipo").addEventListener("change", () => {
  $("campoIndEstudio").classList.toggle("oculto", $("indTipo").value !== TIPO_CITA_RESIDENTE);
  cargarIndicaciones();
});
$("indEstudio").addEventListener("change", cargarIndicaciones);

$("btnGuardarIndicacion").addEventListener("click", async () => {
  const tipo = $("indTipo").value;
  const estudio = estudioSeleccionadoIndicaciones();
  const texto = $("indTexto").value.trim();
  if (tipo === TIPO_CITA_RESIDENTE && !estudio) {
    return alerta("alertaIndicacion", "error", "Selecciona primero el estudio (o agrégalo en la sección «Estudios»).");
  }
  if (!texto) return alerta("alertaIndicacion", "error", "Escribe el texto de la indicación.");
  const btn = $("btnGuardarIndicacion");
  btn.disabled = true;
  try {
    const lista = await leerIndicacionesTipo(tipo, estudio);
    lista.push(texto);
    await guardarListaIndicaciones(tipo, estudio, lista);
    $("indTexto").value = "";
    alerta("alertaIndicacion", "ok", `✅ Indicación agregada a «${estudio || TIPOS_EXAMEN[tipo]}».`);
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
  let data = null;
  let estudios = [];
  try {
    const resp = await fetch(`${firebaseConfig.databaseURL}/indicaciones.json`);
    if (resp.ok) data = await resp.json();
    estudios = await leerEstudios();
  } catch (err) {
    console.error(err);
  }
  const grupos = [];
  // Contrastes: un grupo por estudio específico
  const porEstudio = (data && data[TIPO_CITA_RESIDENTE] && !Array.isArray(data[TIPO_CITA_RESIDENTE])) ? data[TIPO_CITA_RESIDENTE] : {};
  estudios.forEach((estudio) => {
    const lista = Array.isArray(porEstudio[estudio]) ? porEstudio[estudio] : [];
    if (lista.length) grupos.push({ titulo: `🩻 ${TIPOS_EXAMEN[TIPO_CITA_RESIDENTE]} — ${estudio}`, tipo: TIPO_CITA_RESIDENTE, estudio, lista });
  });
  // Biopsia y ecografía: un solo grupo por categoría
  Object.entries(TIPOS_EXAMEN).forEach(([tipo, nombre]) => {
    if (tipo === TIPO_CITA_RESIDENTE) return;
    const lista = (data && Array.isArray(data[tipo])) ? data[tipo] : [];
    if (lista.length) grupos.push({ titulo: `🩻 ${nombre}`, tipo, estudio: "", lista });
  });

  if (!grupos.length) {
    contenedor.innerHTML = '<p class="texto-centrado" style="color: var(--gris);">Aún no hay indicaciones registradas.</p>';
    return;
  }
  grupos.forEach((g) => {
    const titulo = document.createElement("h3");
    titulo.style.cssText = "margin: 14px 0 8px; color: var(--azul-oscuro); font-size: .95rem;";
    titulo.textContent = `${g.titulo} (${g.lista.length})`;
    contenedor.appendChild(titulo);
    g.lista.forEach((texto, i) => {
      const item = document.createElement("div");
      item.className = "solicitud-item";
      item.innerHTML = `
        <div class="datos">
          <div class="meta" style="white-space: pre-wrap;">${escapar(texto)}</div>
        </div>
        <div class="acciones">
          <button class="btn btn-gris btn-chico" data-editar="${g.tipo}|${g.estudio}|${i}" type="button">✏️ Editar</button>
          <button class="btn btn-rojo btn-chico" data-borrar="${g.tipo}|${g.estudio}|${i}" type="button">🗑️ Eliminar</button>
        </div>`;
      contenedor.appendChild(item);
    });
  });
  contenedor.querySelectorAll("[data-editar]").forEach((b) =>
    b.addEventListener("click", async () => {
      const [tipo, estudio, idx] = b.dataset.editar.split("|");
      const lista = await leerIndicacionesTipo(tipo, estudio);
      const actual = lista[Number(idx)] || "";
      const nuevo = prompt("Edita la indicación (el residente podrá ajustarla aún más al aprobar):", actual);
      if (nuevo === null) return;
      if (!nuevo.trim()) return alert("La indicación no puede quedar vacía.");
      if (nuevo.trim() === actual) return;
      if (!confirm("¿Guardar los cambios de esta indicación?")) return;
      lista[Number(idx)] = nuevo.trim();
      await guardarListaIndicaciones(tipo, estudio, lista);
      cargarIndicaciones();
    }));
  contenedor.querySelectorAll("[data-borrar]").forEach((b) =>
    b.addEventListener("click", async () => {
      const [tipo, estudio, idx] = b.dataset.borrar.split("|");
      if (!confirm("¿Eliminar esta indicación pregrabada?")) return;
      const lista = (await leerIndicacionesTipo(tipo, estudio)).filter((_, i) => i !== Number(idx));
      await guardarListaIndicaciones(tipo, estudio, lista);
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
