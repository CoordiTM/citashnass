# Sistema de Citas — Radiodiagnóstico y Ecografía (HNASS)

Sistema web para la programación digital de citas de:
- **Exámenes contrastados** (HSG, esofagograma, cistografía, tránsito intestinal, colon contrastado, etc.)
- **Biopsias de mama por ecografía**
- **Ecografías de hospitalización**

Tecnología: **Firebase** (Auth + Realtime Database) + **Cloudinary** (archivos). Sitio 100% estático, listo para **GitHub Pages**.

---

## 1. Estructura

```
citas-rx/
├── index.html          → Portal público (pacientes): solicitar y consultar cita
├── panel.html          → Panel interno (residentes, digitadores, admin)
├── css/styles.css
├── js/
│   ├── config.js       ← ÚNICO ARCHIVO QUE DEBES EDITAR (claves)
│   ├── db.js           → Inicialización Firebase/Cloudinary + utilidades
│   ├── public.js       → Lógica del portal público
│   └── panel.js        → Lógica del panel
└── database.rules.json → Reglas de seguridad de Realtime Database
```

## 2. Configuración de Firebase

1. Entra a [console.firebase.google.com](https://console.firebase.google.com) y crea un proyecto (o reutiliza el del SSP Rx Portátil).
2. **Realtime Database → Crear base de datos** y pega el contenido de `database.rules.json`.
3. En **Configuración del proyecto → General**, copia las claves a `js/config.js`.

### Crear el primer administrador
La primera vez que abras `panel.html` con la base de datos vacía, el sistema mostrará
**"Configuración inicial — crear administrador"**. Defines usuario, nombre y clave, y listo:
desde ahí creas residentes y digitadores desde el propio panel.

> ⚠️ **Importante sobre seguridad:** al no usar autenticación de Firebase, las reglas quedan
> abiertas (cualquiera con la URL puede leer/escribir la base de datos). Las claves de acceso
> se guardan cifradas (hash SHA-256), pero la información de las solicitudes es pública.
> Usa este sistema solo dentro de la red institucional o aceptando ese riesgo; para producción
> abierta se recomienda activar Firebase Authentication y endurecer las reglas.

## 3. Configuración de Cloudinary

1. Crea cuenta en [cloudinary.com](https://cloudinary.com) (plan gratuito basta).
2. **Settings → Upload → Upload presets → Add upload preset**:
   - Signing Mode: **Unsigned**
   - Folder: `citas_rx`
3. Copia el **Cloud name** y el **Upload preset name** a `js/config.js`.

## 4. Despliegue en GitHub Pages

1. Crea un repositorio, por ejemplo `citas-rx`.
2. Sube todo el contenido de esta carpeta.
3. **Settings → Pages → Source: rama `main`, carpeta `/ (root)`**.
4. Al minuto estará en `https://TU_USUARIO.github.io/citas-rx/`.
5. Actualiza `SITE_URL` en `js/config.js` con esa URL (para el QR de ventanilla).

## 5. Flujo de uso

| Actor | Acción |
|---|---|
| Paciente | Escanea QR → sube foto/PDF de la solicitud + DNI + celular |
| Residente | Revisa la orden → **Aprueba** (fecha, hora, indicaciones) o **Rechaza** (con observaciones) |
| Paciente | Consulta por DNI → ve su cita, indicaciones, descarga PDF de la cita y solicitud **sellada** con fecha y hora |
| Digitador | Filtra citas aprobadas → descarga **listado PDF** → registra las citas en el ESSI |
| Admin | Gestiona usuarios, indicaciones pregrabadas y QR de ventanilla |

### Sobre el sello de fecha y hora
El sello se aplica **solo sobre la descarga** (transformación de Cloudinary para imágenes, estampa con pdf-lib para PDF). El archivo original subido por el paciente queda intacto.

## 6. Gestión de usuarios y claves

Desde el panel, el **administrador** puede (todo sin Firebase Auth, acceso con usuario + clave):
- **Crear usuarios**: elige el usuario (único), nombre, clave y rol (residente / digitador / admin).
- **Editar el nombre** de cualquier usuario.
- **Cambiar la clave** directamente (se guarda cifrada con hash SHA-256).
- **Cambiar el rol** y **activar/desactivar** usuarios (un usuario desactivado no puede ingresar).

Las claves nunca se guardan en texto plano: se almacena el hash SHA-256 con una frase secreta
(`CLAVE_SAL` en `js/config.js`), que debes cambiar antes de poner el sistema en uso.

## 7. Notas de seguridad

- Al no usar Firebase Authentication, las reglas de la base de datos quedan abiertas: cualquiera con la URL puede leer y escribir. Esto simplifica el despliegue (GitHub Pages sin servidor), pero expone los datos.
- Los archivos en Cloudinary usan URL con identificador aleatorio (difícil de adivinar), pero son accesibles a quien tenga el link. Evita compartir los links fuera del flujo del sistema.
- Si más adelante quieres reforzar la seguridad, se puede migrar a Firebase Auth (correo/contraseña) sin cambiar la interfaz del sistema; avísame y lo ajustamos.
