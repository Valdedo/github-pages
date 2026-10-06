/**
 * Apps Script de Casa Fonso (cuenta casafonsomc@gmail.com)
 * - Envía los albaranes firmados por correo desde este Gmail.
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
    if (!d.pdf) throw new Error('Falta el PDF');
    var pdf = Utilities.newBlob(Utilities.base64Decode(d.pdf), 'application/pdf', d.filename || 'albaran.pdf');

    if (d.action === 'backup') {
      var carpeta = carpetaRuta_(d.folder || 'Albaranes firmados');
      var repes = carpeta.getFilesByName(pdf.getName());
      while (repes.hasNext()) repes.next().setTrashed(true); // se sustituye si ya estaba
      carpeta.createFile(pdf);
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
