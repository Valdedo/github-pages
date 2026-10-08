/** Nombres de los estados de reparaciones y pedidos: los mismos en toda la app. */
import type { OrderStatus, RepairStatus } from '../types';

export const REPARACION_ESTADO: Record<RepairStatus, string> = {
  recibida: 'Recibida', en_taller: 'En el taller', reparada: 'Lista', entregada: 'Entregada',
};

/** Botón para pasar al siguiente estado. */
export const REPARACION_SIGUIENTE: Record<RepairStatus, string> = {
  recibida: 'Enviar al taller', en_taller: 'Marcar como lista', reparada: 'Entregar al cliente', entregada: '',
};

export const PEDIDO_ESTADO: Record<OrderStatus, string> = {
  pendiente: 'Por pedir', pedido: 'Pedido', parcial: 'Llegando', recibido: 'Ha llegado', entregado: 'Entregado', cancelado: 'Cancelado',
};
