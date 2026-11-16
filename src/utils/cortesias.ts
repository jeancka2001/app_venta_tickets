import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from './msLoginAuth';

/* Cortesias ($0.00): solo las registra un usuario autorizado (Editar usuario > "Puede registrar cortesias" en la web;
   admin y super_admin siempre pueden). Esto solo decide si se muestra la opcion: el backend igual valida la venta. */
const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

export const puedeRegistrarCortesia = async (idUsuario?: number | string): Promise<boolean> => {
  const id = parseInt(String(idUsuario ?? ''), 10);
  if (!(id > 0)) return false;
  try {
    const { data } = await axios.get(`${URL_BASE}/venta_personal/cortesia_permiso/${id}`, {
      headers: { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' },
    });
    return data?.permitido === true;
  } catch {
    return false;
  }
};
