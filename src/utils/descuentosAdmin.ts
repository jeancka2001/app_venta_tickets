import axios from 'axios';
import { staffAuthHeaders } from './staffAuth';

/* CRUD de "tipos de descuento" por evento -- mismo backend y contrato que
   usa TicketsWeb (DescuentosPanel.js / utils/DescuentosEventoQuery), solo
   que acá restringido a lo esencial para configurar rápido desde el
   celular: nombre, %, si va sobre precio base o final, activo/inactivo,
   mensaje y vendedores autorizados. El link/QR público y el reporte de
   usos siguen gestionándose únicamente desde la web -- esta pantalla nunca
   los toca (ver los campos "preservar tal cual" en GuardarDescuentoPayload). */

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

export type AplicaSobre = 'base' | 'final';

export interface UsuarioAutorizado {
  id_admin: number;
  nombre: string;
}

export interface DescuentoEventoAdmin {
  id: number;
  codigoEvento: string;
  nombre: string;
  porcentaje: number;
  mensaje_motivo: string | null;
  activo: boolean;
  aplica_sobre: AplicaSobre;
  usuarios: UsuarioAutorizado[];
  usos_validos: number;
  usos_totales: number;
  codigo_link?: string | null;
  // No se editan desde esta pantalla (solo desde la web) -- se guardan tal
  // cual vienen para reenviarlos sin cambios al actualizar, y así no borrar
  // por accidente una vigencia/tope que ya tenía configurado un link público.
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  max_usos?: number | null;
  usos_por_cedula?: number | null;
}

export const listarDescuentosEvento = async (codigoEvento: string): Promise<DescuentoEventoAdmin[]> => {
  try {
    const { data } = await axios.get(`${URL_BASE}/evento_descuentos`, {
      headers: staffAuthHeaders(),
      params: { codigoEvento },
    });
    return Array.isArray(data?.data) ? data.data : [];
  } catch {
    return [];
  }
};

export interface GuardarDescuentoPayload {
  id?: number;
  codigoEvento?: string;
  nombre: string;
  porcentaje: number;
  mensaje_motivo: string;
  activo: boolean;
  aplica_sobre: AplicaSobre;
  usuarios: number[];
  fecha_inicio?: string | null;
  fecha_fin?: string | null;
  max_usos?: number | null;
  usos_por_cedula?: number | null;
}

export const guardarDescuentoEvento = async (
  payload: GuardarDescuentoPayload
): Promise<{ success: boolean; message?: string }> => {
  try {
    const { data } = await axios.post(`${URL_BASE}/evento_descuentos`, payload, {
      headers: staffAuthHeaders(),
    });
    return { success: !!data?.success, message: data?.message };
  } catch (err) {
    const status = axios.isAxiosError(err) ? err.response?.status : undefined;
    return {
      success: false,
      message: status === 401 || status === 403
        ? 'Tu sesión expiró o no tienes permiso para gestionar los descuentos de este evento.'
        : 'Error de conexión al guardar el descuento.',
    };
  }
};

export const eliminarDescuentoEvento = async (id: number): Promise<{ success: boolean; message?: string }> => {
  try {
    const { data } = await axios.post(`${URL_BASE}/evento_descuentos/eliminar`, { id }, {
      headers: staffAuthHeaders(),
    });
    return { success: !!data?.success, message: data?.message };
  } catch {
    return { success: false, message: 'Error de conexión al eliminar el descuento.' };
  }
};

export interface UsuarioParaAutorizar {
  id: number;
  nombre: string;
  username: string;
  perfil: string;
}

/* Mismo endpoint que GetUserList() en TicketsWeb (utils/QueryUser) --
   trae TODOS los usuarios del sistema para armar el checklist de
   "vendedores autorizados". Se mapea a solo lo que hace falta mostrar. */
export const listarUsuariosParaAutorizar = async (): Promise<UsuarioParaAutorizar[]> => {
  try {
    const { data } = await axios.get(`${URL_BASE}/listas_user`, {
      headers: staffAuthHeaders(),
    });
    const users = Array.isArray(data?.users) ? data.users : [];
    return users.map((u: { id: number; name?: string; username?: string; perfil?: string }) => ({
      id: u.id,
      nombre: u.name || u.username || `#${u.id}`,
      username: u.username || '',
      perfil: u.perfil || '',
    }));
  } catch {
    return [];
  }
};
