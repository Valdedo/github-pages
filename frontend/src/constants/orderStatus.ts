export type OrderStatus = 'pendiente' | 'pedido' | 'parcial' | 'recibido' | 'entregado' | 'cancelado';

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pendiente: 'Por pedir', pedido: 'Pedido', parcial: 'Parcial',
  recibido: 'Recibido', entregado: 'Entregado', cancelado: 'Cancelado',
};

export const ORDER_STATUS_NEXT: Record<string, { status: string; label: string } | null> = {
  pendiente: { status: 'pedido',    label: 'Marcar como pedido' },
  pedido:    { status: 'recibido',  label: 'Marcar recibido' },
  parcial:   { status: 'recibido',  label: 'Marcar recibido' },
  recibido:  { status: 'entregado', label: 'Marcar entregado al cliente' },
  entregado: null,
  cancelado: null,
};

export const ORDER_STATUS_PREV: Record<string, { status: OrderStatus; label: string } | null> = {
  pendiente: null,
  pedido:    { status: 'pendiente', label: 'Volver a "Por pedir"' },
  parcial:   { status: 'pedido',    label: 'Volver a "Pedido"' },
  recibido:  { status: 'pedido',    label: 'Deshacer recepción' },
  entregado: { status: 'recibido',  label: 'Volver a "Recibido"' },
  cancelado: { status: 'pendiente', label: 'Reactivar pedido' },
};
