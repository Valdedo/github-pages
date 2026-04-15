export type RepairStatus = 'recibida' | 'en_taller' | 'reparada' | 'entregada';

export const REPAIR_STATUS_LABELS: Record<RepairStatus, string> = {
  recibida: 'Recibida', en_taller: 'En taller', reparada: 'Reparada', entregada: 'Entregada',
};

export const REPAIR_STATUS_NEXT: Record<RepairStatus, { status: RepairStatus; label: string } | null> = {
  recibida:  { status: 'en_taller', label: 'Enviar a taller' },
  en_taller: { status: 'reparada',  label: 'Marcar reparada' },
  reparada:  { status: 'entregada', label: 'Marcar entregada' },
  entregada: null,
};

export const REPAIR_STATUS_PREV: Record<RepairStatus, { status: RepairStatus; label: string } | null> = {
  recibida:  null,
  en_taller: { status: 'recibida',  label: 'Deshacer envío a taller' },
  reparada:  { status: 'en_taller', label: 'Volver a "En taller"' },
  entregada: { status: 'reparada',  label: 'Deshacer entrega' },
};
