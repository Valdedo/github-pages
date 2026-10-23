/**
 * ¿Es una tableta? (Andrés, 23/10/2026: «Tarifas en la tableta» solo en el menú de la tableta del mostrador).
 * Pantalla táctil como puntero principal y lado corto de 600 px o más: tabletas Android y iPad.
 * Los móviles (lado corto < 600 px) y los ordenadores (ratón), no. El iPad con teclado y ratón se presenta
 * como un Mac, así que se mira también si admite varios dedos. La página /mostrador sigue abriéndose en
 * cualquier aparato con su dirección; esto solo decide si sale en el menú.
 */
export function esTableta(): boolean {
  try {
    const tactil = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const ipad = navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent);
    const ladoCorto = Math.min(window.screen.width, window.screen.height);
    return (tactil || ipad) && ladoCorto >= 600;
  } catch {
    return false;
  }
}
