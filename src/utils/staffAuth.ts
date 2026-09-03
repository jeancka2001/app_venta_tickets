import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from './msLoginAuth';

/* Login de personal (vendedores/admin/suscriptores-revendedores) — es un
   login DISTINTO al de clientes de app_tickets: pega contra /auth_admin
   (tabla `admin`), no /auth_suscriptor. Misma cuenta que ya usan para
   entrar al panel web (auth/login). */

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';
const API_HDR = { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' };

const STORAGE_KEY = 'staffToken';

/* Perfiles que pueden vender (mismo permiso[] que /Vender-Tickets en
   routesub.js de la web). "Aprobar-Ventas" (cola de depósitos) queda
   fuera del alcance de esta app a propósito. */
export const PERFILES_VENTA = ['admin', 'super_admin', 'vendedores', 'suscriptores'];

export interface StaffData {
  id: number;
  name?: string;
  username?: string;
  perfil: string;
  [k: string]: unknown;
}

/* Decodifica el payload de un JWT sin verificar firma — solo para leer
   claims (perfil, id, name) en el cliente, igual que jwtDecode() en la
   web (DatosUsuarioLocalStorag.js). No requiere librería aparte. */
const decodificarJWT = (token: string): StaffData | null => {
  try {
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const loginStaff = async (
  username: string,
  password: string
): Promise<{ success: boolean; data?: StaffData; message?: string }> => {
  try {
    const { data } = await axios.post(
      `${URL_BASE}/auth_admin`,
      { username, password },
      { headers: API_HDR }
    );
    if (data.success && data.token) {
      const staff = decodificarJWT(data.token);
      if (!staff) return { success: false, message: 'No se pudo leer la sesión.' };
      localStorage.setItem(STORAGE_KEY, data.token);
      return { success: true, data: staff };
    }
    return { success: false, message: data.message ?? 'Usuario o contraseña incorrectos.' };
  } catch {
    return { success: false, message: 'Error de conexión. Verifica tu internet e intenta de nuevo.' };
  }
};

export const obtenerStaffData = (): StaffData | null => {
  const token = localStorage.getItem(STORAGE_KEY);
  if (!token) return null;
  const staff = decodificarJWT(token);
  return staff;
};

export const obtenerStaffToken = (): string | null => localStorage.getItem(STORAGE_KEY);

/* Cabeceras para llamadas a ms_login que el backend filtra por usuario
   (listareventos, ListaPreciosLocaDispo/ListaPreciosLocalidades,
   evento_por_codigo -- ver getRequestUser()/hasGlobalAccess() en
   CrearEvento.controller.js): llevan el JWT de sesión del propio
   vendedor logueado, no el token de servicio de MS_LOGIN_AUTH_HEADERS
   (ese es de acceso global y por eso un vendedor con eventos
   restringidos veía TODOS los eventos, no solo los suyos). El backend
   decodifica este JWT para resolver `perfil`/`id` y aplica el filtro
   `usuario_evento` salvo que el perfil sea "admin". */
export const staffAuthHeaders = (): Record<string, string> => {
  const token = obtenerStaffToken();
  return {
    ...MS_LOGIN_AUTH_HEADERS,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const logoutStaff = (): void => {
  localStorage.removeItem(STORAGE_KEY);
};

export const puedeVender = (perfil?: string): boolean =>
  !!perfil && PERFILES_VENTA.includes(perfil);
