/**
 * Envío de correos de la app de Casa Fonso desde casafonsomc@gmail.com
 *
 * Instalar UNA vez, con la sesión iniciada en casafonsomc@gmail.com:
 * 1. script.google.com → Nuevo proyecto → pegar este código (borrando lo que haya).
 * 2. Implementar → Nueva implementación → tipo «Aplicación web».
 *    Ejecutar como: Yo (casafonsomc@gmail.com) · Quién tiene acceso: Cualquier usuario.
 * 3. Autorizar los permisos de Gmail y copiar la URL que termina en /exec.
 * 4. En Railway, servicio del backend → Variables:
 *      MAIL_RELAY_URL = (la URL /exec)
 *      MAIL_RELAY_KEY = (la misma CLAVE de abajo)
 */
// Pon aquí una clave larga inventada (la misma que MAIL_RELAY_KEY en Railway).
// No la subas nunca al repositorio: es público.
var CLAVE = 'PON_AQUI_LA_CLAVE';

function doPost(e) {
  var out = { ok: false };
  try {
    var d = JSON.parse(e.postData.contents);
    if (CLAVE === 'PON_AQUI_LA_CLAVE' || d.key !== CLAVE) throw new Error('Clave incorrecta');
    if (!d.to || !d.pdf) throw new Error('Faltan datos');
    var pdf = Utilities.newBlob(Utilities.base64Decode(d.pdf), 'application/pdf', d.filename || 'albaran.pdf');
    GmailApp.sendEmail(d.to, d.subject || 'Albarán · Casa Fonso', d.body || '', {
      attachments: [pdf],
      name: 'Casa Fonso',
    });
    out.ok = true;
  } catch (err) {
    out.error = String(err && err.message || err);
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

/** Para comprobar que funciona: ejecútala desde el editor y mira tu bandeja de enviados. */
function prueba() {
  GmailApp.sendEmail(Session.getActiveUser().getEmail(), 'Prueba envío albaranes', 'Funciona.', { name: 'Casa Fonso' });
}
