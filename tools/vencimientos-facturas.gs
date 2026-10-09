/**
 * VENCIMIENTOS — archivo extra para el proyecto de Apps Script de FACTURAS AUTOMÁTICAS
 * (cuenta de Andrés, el que guarda las facturas en «FACTURAS PARA GESTORIA» y en ALBARANES).
 *
 * Qué hace:
 *  - Cada hora mira las facturas guardadas en «FACTURAS PARA GESTORIA» que aún no ha leído
 *    (primero las más nuevas), saca con Claude cuándo vence cada plazo y lo apunta en la
 *    pestaña «Vencimientos» de la hoja «Log Facturas».
 *  - Manda los vencimientos a la app de Casa Fonso, que los enseña en Inicio solo a Andrés.
 *  - La primera vez repasa todas las facturas antiguas, por tandas de ~5 minutos.
 *
 * Usa la clave de Claude y el modelo de CONFIG (en «Código.gs», el mismo proyecto).
 *
 * Instalar UNA vez:
 *  1. En el proyecto de facturas: «+» → Secuencia de comandos → «Vencimientos» → pegar este código.
 *  2. Rellenar VENC.APP_URL y VENC.APP_CLAVE (la misma que VENCIMIENTOS_CLAVE en Railway).
 *     NO subas la clave al repositorio: es público.
 *  3. Ejecutar «instalarVencimientos» una vez.
 */

const VENC = {
  APP_URL:   'https://PON_AQUI_LA_DIRECCION_DE_LA_APP/api/vencimientos/importar',
  APP_CLAVE: 'PON_AQUI_LA_CLAVE',
  HOJA:      'Vencimientos',
  MINUTOS:   4.5,   // por ejecución (Google corta a los 6)
};

const VENC_COLS = ['ID archivo', 'Archivo', 'Proveedor', 'Nº factura', 'Fecha factura', 'Importe (€)',
                   'Forma de pago', 'Vencimientos', 'Leído el', 'Enlace'];

// ── Instalar: aviso cada hora + primer repaso ───────────────────
function instalarVencimientos() {
  ScriptApp.getProjectTriggers().forEach(t => {
    const h = t.getHandlerFunction();
    if (h === 'revisarVencimientos' || h === 'continuarVencimientos') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('revisarVencimientos').timeBased().everyHours(1).create();
  Logger.log('✅ Vencimientos: se revisará cada hora. Empieza ahora el repaso de las facturas antiguas.');
  revisarVencimientos();
}

function continuarVencimientos() { revisarVencimientos(); }

// ── Lo que se ejecuta cada hora ─────────────────────────────────
function revisarVencimientos() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) { Logger.log('Ya hay otra revisión en marcha.'); return; }
  try {
    const inicio = Date.now();
    borrarContinuaciones_();
    const hoja = hojaVencimientos_();
    const hechos = idsLeidos_(hoja);

    const pendientes = pdfsGestoria_().filter(f => !hechos[f.getId()]);
    Logger.log(`Facturas por leer: ${pendientes.length}`);

    let nuevas = 0, errores = 0, quedan = false;
    for (let i = 0; i < pendientes.length; i++) {
      if ((Date.now() - inicio) / 60000 > VENC.MINUTOS) { quedan = true; break; }
      const f = pendientes[i];
      if (f.getSize() > CONFIG.TAMANO_MAXIMO_PDF) {
        hoja.appendRow([f.getId(), f.getName(), '(demasiado grande)', '', '', '', '', '[]', new Date(), f.getUrl()]);
        continue;
      }
      const r = leerVencimientos_(f.getBlob());
      if (!r) { errores++; continue; }  // se reintenta en la siguiente vuelta
      hoja.appendRow([
        f.getId(), f.getName(),
        r.es_factura ? (r.proveedor || '') : '(no es factura)',
        r.numero || '', r.fecha || '', r.importe === null || r.importe === undefined ? '' : Number(r.importe),
        r.forma_pago || '', JSON.stringify(r.es_factura ? (r.vencimientos || []) : []),
        new Date(), f.getUrl(),
      ]);
      nuevas++;
      Utilities.sleep(1500);
    }
    if (errores >= 5 && nuevas === 0) quedan = false;  // Claude no responde: se probará en la próxima hora
    Logger.log(`Leídas ahora: ${nuevas} · con error: ${errores}${quedan ? ' · quedan más, sigue en 1 minuto' : ''}`);

    const hoy = Utilities.formatDate(new Date(), 'Europe/Madrid', 'yyyy-MM-dd');
    const props = PropertiesService.getScriptProperties();
    if (nuevas > 0 || props.getProperty('VENC_ENVIO') !== hoy) {
      if (enviarALaApp_(hoja)) props.setProperty('VENC_ENVIO', hoy);
    }
    if (quedan) ScriptApp.newTrigger('continuarVencimientos').timeBased().after(60 * 1000).create();
  } finally {
    lock.releaseLock();
  }
}

/** Para mandar otra vez todo a la app a mano (si se ha cambiado algo en la hoja). */
function enviarTodoALaApp() {
  enviarALaApp_(hojaVencimientos_());
}

// ── Claude: cuándo vence la factura ─────────────────────────────
function leerVencimientos_(blob) {
  const prompt = `Es un documento PDF recibido por Casa Fonso (cliente: ${CONFIG.NOMBRES_DESTINATARIO.join(', ')}).

1. ¿Es una factura (o factura rectificativa / abono) que Casa Fonso tiene que pagar o le van a cobrar?
   No lo son: albaranes, pedidos, confirmaciones de pedido, presupuestos, publicidad.
2. Si lo es, saca:
   - proveedor (quien emite la factura), número de factura, fecha de la factura (AAAA-MM-DD) e importe total con IVA.
   - forma de pago, muy breve: «Recibo domiciliado», «Transferencia», «Giro», «Contado», «Tarjeta», «Pagado»…
   - vencimientos: TODOS los plazos con su fecha (AAAA-MM-DD) e importe. Búscalos en la tabla de vencimientos,
     «Vto.», «Vencimiento», «Fecha de cobro», «Efectos». Si solo vienen las condiciones («a 30 días»,
     «30-60-90 días f.f.», «día de pago 10»), calcula las fechas desde la fecha de la factura y reparte el total.
     Si dice que ya está pagada o es al contado, pon un único plazo con la fecha de la factura.
     Si no se puede saber, lista vacía.

Responde SOLO con JSON válido, sin texto ni backticks:
{"es_factura": true, "proveedor": "...", "numero": "...", "fecha": "AAAA-MM-DD", "importe": 123.45,
 "forma_pago": "...", "vencimientos": [{"fecha": "AAAA-MM-DD", "importe": 123.45}]}
o bien {"es_factura": false}`;

  for (let intento = 1; intento <= CONFIG.MAX_INTENTOS; intento++) {
    try {
      const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post',
        contentType: 'application/json',
        headers: { 'x-api-key': CONFIG.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        payload: JSON.stringify({
          model: CONFIG.MODELO,
          max_tokens: 800,
          messages: [{ role: 'user', content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Utilities.base64Encode(blob.getBytes()) } },
            { type: 'text', text: prompt },
          ] }],
        }),
        muteHttpExceptions: true,
      });
      const codigo = r.getResponseCode();
      if (codigo === 429 || codigo === 529) { Utilities.sleep(CONFIG.ESPERA_RATE_LIMIT); continue; }
      if (codigo !== 200) { Logger.log(`Error Claude (${codigo}): ${r.getContentText().slice(0, 300)}`); return null; }
      const texto = JSON.parse(r.getContentText()).content[0].text;
      return JSON.parse(texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1));
    } catch (e) {
      Logger.log(`Excepción leyendo vencimientos (intento ${intento}): ${e.message}`);
      Utilities.sleep(5000);
    }
  }
  return null;
}

// ── Mandar a la app ─────────────────────────────────────────────
function enviarALaApp_(hoja) {
  if (VENC.APP_CLAVE === 'PON_AQUI_LA_CLAVE') { Logger.log('Falta VENC.APP_CLAVE'); return false; }
  const datos = hoja.getDataRange().getValues().slice(1);
  const limite = new Date(Date.now() - 120 * 86400000);  // lo de los últimos 4 meses basta
  const fmt = v => (v instanceof Date) ? Utilities.formatDate(v, 'Europe/Madrid', 'yyyy-MM-dd') : String(v || '');
  const facturas = [];
  datos.forEach(f => {
    const [id, , proveedor, numero, fecha, importe, forma, vtos, leido, url] = f;
    if (!id || String(proveedor).charAt(0) === '(') return;
    let plazos = [];
    try { plazos = JSON.parse(vtos || '[]'); } catch (e) {}
    const ultima = plazos.reduce((m, p) => (p.fecha > m ? p.fecha : m), fmt(fecha) || fmt(leido));
    if (ultima && new Date(ultima) < limite) return;
    facturas.push({ file_id: String(id), proveedor: String(proveedor), numero: String(numero || ''),
                    fecha_factura: fmt(fecha), importe: importe === '' ? null : Number(importe),
                    forma_pago: String(forma || ''), url: String(url || ''), vencimientos: plazos });
  });
  for (let i = 0; i < facturas.length; i += 150) {
    const r = UrlFetchApp.fetch(VENC.APP_URL, {
      method: 'post', contentType: 'application/json', headers: { 'X-Clave': VENC.APP_CLAVE },
      payload: JSON.stringify({ facturas: facturas.slice(i, i + 150) }), muteHttpExceptions: true,
    });
    if (r.getResponseCode() !== 200) {
      Logger.log(`La app no ha aceptado los vencimientos (${r.getResponseCode()}): ${r.getContentText().slice(0, 200)}`);
      return false;
    }
  }
  Logger.log(`📤 Mandadas ${facturas.length} facturas a la app.`);
  return true;
}

// ── Utilidades ──────────────────────────────────────────────────
function hojaVencimientos_() {
  const it = DriveApp.getFilesByName(CONFIG.LOG_SPREADSHEET_NAME);
  const ss = it.hasNext() ? SpreadsheetApp.open(it.next()) : SpreadsheetApp.create(CONFIG.LOG_SPREADSHEET_NAME);
  let h = ss.getSheetByName(VENC.HOJA);
  if (!h) {
    h = ss.insertSheet(VENC.HOJA);
    h.appendRow(VENC_COLS);
    h.setFrozenRows(1);
    h.getRange('F:F').setNumberFormat('#,##0.00 €');
  }
  return h;
}

function idsLeidos_(hoja) {
  const out = {};
  const n = hoja.getLastRow();
  if (n > 1) hoja.getRange(2, 1, n - 1, 1).getValues().forEach(r => { if (r[0]) out[r[0]] = 1; });
  return out;
}

/** Todos los PDF de «FACTURAS PARA GESTORIA» (año/trimestre), los más nuevos primero. */
function pdfsGestoria_() {
  const it = DriveApp.getFoldersByName(CONFIG.CARPETA_GESTORIA);
  if (!it.hasNext()) return [];
  const lista = [];
  const recorrer = carpeta => {
    const fs = carpeta.getFiles();
    while (fs.hasNext()) {
      const f = fs.next();
      if (f.getMimeType() === 'application/pdf' || /\.pdf$/i.test(f.getName())) lista.push(f);
    }
    const sub = carpeta.getFolders();
    while (sub.hasNext()) recorrer(sub.next());
  };
  recorrer(it.next());
  return lista.sort((a, b) => b.getDateCreated() - a.getDateCreated());
}

function borrarContinuaciones_() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'continuarVencimientos') ScriptApp.deleteTrigger(t);
  });
}
