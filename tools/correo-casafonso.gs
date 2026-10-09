/**
 * Apps Script de Casa Fonso (cuenta casafonsomc@gmail.com)
 * - Envía los albaranes firmados por correo desde este Gmail.
 * - Avisa en la pantalla de Inicio de los correos sin leer y sin contestar.
 * - Guarda los albaranes de proveedor en ALBARANES/<proveedor> en cuanto la app los lee.
 * - Lee las tarifas de proveedor (Google Sheets compartidas con esta cuenta) para el catálogo.
 * - Guarda una copia de cada albarán firmado en Drive:
 *   Mi unidad / Albaranes firmados / <código> - <cliente> / <AAAA-MM> / <nº> firmado.pdf
 *
 * Instalar UNA vez, con la sesión iniciada en casafonsomc@gmail.com:
 * 1. script.google.com → Nuevo proyecto → pegar este código (borrando lo que haya).
 * 2. Implementar → Nueva implementación → tipo «Aplicación web».
 *    Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario.
 * 3. Autorizar los permisos (Gmail y Drive) y copiar la URL que termina en /exec.
 * 4. En Railway, servicio del backend → Variables:
 *      MAIL_RELAY_URL = (la URL /exec)
 *      MAIL_RELAY_KEY = (la misma CLAVE de abajo)
 * Si cambias el código más adelante: Implementar → Gestionar implementaciones → editar → Nueva versión.
 */
// Pon aquí una clave larga inventada (la misma que MAIL_RELAY_KEY en Railway).
// No la subas nunca al repositorio: es público.
var CLAVE = 'PON_AQUI_LA_CLAVE';

function doPost(e) {
  var out = { ok: false };
  try {
    var d = JSON.parse(e.postData.contents);
    if (CLAVE === 'PON_AQUI_LA_CLAVE' || d.key !== CLAVE) throw new Error('Clave incorrecta');
    if (d.action === 'inbox') {
      var b = bandeja_();
      out.ok = true; out.sin_leer = b.sin_leer; out.sin_contestar = b.sin_contestar;
      return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
    }
    if (d.action === 'carpetas') {          // subcarpetas de una carpeta (proveedores)
      var lista = [], it = DriveApp.getFolderById(d.folderId).getFolders();
      while (it.hasNext()) { var f = it.next(); lista.push({ id: f.getId(), name: f.getName() }); }
      out.ok = true; out.carpetas = lista;
      return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
    }
    if (d.action === 'mover') {             // mover un archivo a otra carpeta
      DriveApp.getFileById(d.fileId).moveTo(DriveApp.getFolderById(d.folderId));
      out.ok = true;
      return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
    }
    if (d.action === 'borrar') {            // a la papelera
      DriveApp.getFileById(d.fileId).setTrashed(true);
      out.ok = true;
      return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
    }
    if (d.action === 'hoja') {              // tarifa de proveedor: valores tal como se ven en cada pestaña
      var libro = SpreadsheetApp.openById(d.fileId), hojas = {};
      libro.getSheets().forEach(function (h) {
        if (d.pestanas && d.pestanas.indexOf(h.getName()) < 0) return;
        hojas[h.getName()] = h.getDataRange().getDisplayValues();
      });
      out.ok = true; out.nombre = libro.getName(); out.hojas = hojas;
      out.modificado = DriveApp.getFileById(d.fileId).getLastUpdated().toISOString();
      return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
    }
    if (d.action === 'archivos') {          // PDF de una carpeta y sus subcarpetas (facturas de un proveedor)
      out.ok = true; out.archivos = archivos_(DriveApp.getFolderById(d.folderId), 0);
      return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
    }
    if (!d.pdf) throw new Error('Falta el PDF');
    var pdf = Utilities.newBlob(Utilities.base64Decode(d.pdf), d.mime || 'application/pdf', d.filename || 'albaran.pdf');

    if (d.action === 'backup') {
      var carpeta = d.folderId ? DriveApp.getFolderById(d.folderId) : carpetaRuta_(d.folder || 'Albaranes firmados');
      var repes = carpeta.getFilesByName(pdf.getName());
      while (repes.hasNext()) repes.next().setTrashed(true); // se sustituye si ya estaba
      var nuevo = carpeta.createFile(pdf);
      out.id = nuevo.getId(); out.url = nuevo.getUrl();
    } else {
      if (!d.to) throw new Error('Falta el destinatario');
      GmailApp.sendEmail(d.to, d.subject || 'Albarán · Casa Fonso', d.body || '', {
        attachments: [pdf],
        name: 'Casa Fonso',
      });
    }
    out.ok = true;
  } catch (err) {
    out.error = String(err && err.message || err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Correos de la última semana: sin leer y sin contestar (último mensaje de otra persona). */
function bandeja_() {
  var yo = Session.getEffectiveUser().getEmail().toLowerCase();
  var filtro = ' newer_than:7d -category:promotions -category:social -category:updates -category:forums';
  var dato = function (t) {
    var msgs = t.getMessages(), m = msgs[msgs.length - 1];
    var de = m.getFrom();
    return {
      id: t.getId(),
      de: de.replace(/<.*>/, '').replace(/"/g, '').trim() || de,
      email: (de.match(/<(.+)>/) || [null, de])[1].toLowerCase(),
      asunto: t.getFirstMessageSubject(),
      fecha: m.getDate().toISOString(),
      texto: m.getPlainBody().replace(/\s+/g, ' ').slice(0, 700),
      enlace: 'https://mail.google.com/mail/?authuser=' + encodeURIComponent(yo) + '#all/' + t.getId()
    };
  };
  var esAuto = function (x) { return /no-?reply|notificacion|notification|mailer-daemon/.test(x.email); };
  var sinLeer = GmailApp.search('in:inbox is:unread' + filtro, 0, 20).map(dato).filter(function (x) { return !esAuto(x); });
  var leidos = {}; sinLeer.forEach(function (x) { leidos[x.id] = 1; });
  var dosHoras = Date.now() - 2 * 3600 * 1000;
  var sinContestar = GmailApp.search('in:inbox is:read' + filtro, 0, 40).filter(function (t) {
    var msgs = t.getMessages(), m = msgs[msgs.length - 1];
    return m.getFrom().toLowerCase().indexOf(yo) < 0 && m.getDate().getTime() < dosHoras;
  }).map(dato).filter(function (x) { return !esAuto(x) && !leidos[x.id]; }).slice(0, 15);
  return { sin_leer: sinLeer, sin_contestar: sinContestar };
}

/** Nombre e id de los archivos de una carpeta, entrando en sus subcarpetas (hasta 3 niveles). */
function archivos_(carpeta, nivel) {
  var lista = [], it = carpeta.getFiles();
  while (it.hasNext()) { var f = it.next(); lista.push({ id: f.getId(), name: f.getName() }); }
  if (nivel < 3) {
    var sub = carpeta.getFolders();
    while (sub.hasNext()) lista = lista.concat(archivos_(sub.next(), nivel + 1));
  }
  return lista;
}

/** Crea (si hace falta) y devuelve la carpeta 'A/B/C' dentro de Mi unidad. */
function carpetaRuta_(ruta) {
  var f = DriveApp.getRootFolder();
  ruta.split('/').filter(String).forEach(function (nombre) {
    var it = f.getFoldersByName(nombre);
    f = it.hasNext() ? it.next() : f.createFolder(nombre);
  });
  return f;
}

/** Para comprobar que funciona: ejecútala desde el editor y mira tu bandeja de enviados. */
function prueba() {
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), 'Prueba envío albaranes', 'Funciona.', { name: 'Casa Fonso' });
  carpetaRuta_('Albaranes firmados');
}
