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
export const PERFILES_VENTA = ['admin', 'super_admin', 'vendedores', 'vendedor_secundario', 'suscriptores'];

export interface StaffData {
  id: number;
  name?: string;
  username?: string;
  perfil: string;
  /* Segundos epoch -- lo agrega jwt.sign() solo por tener expiresIn:'1h'
     en LoginAdmin.controller.js, no es un campo real de la tabla admin. */
  exp?: number;
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

/* El JWT dura 1h (ver expiresIn en LoginAdmin.controller.js) y jwt.sign le
   agrega el claim `exp` (segundos epoch) al payload -- decodificarJWT() ya
   lo trae. Sin este chequeo, un vendedor que sigue usando la app pasada la
   hora quedaba con un token vencido en localStorage que la app seguia
   mandando como si fuera valido: el backend no podia decodificarlo
   (ValidacionBasic -> req.userData quedaba null) y trataba la llamada como
   ANONIMA -- mismo criterio permisivo que usa para la tienda publica sin
   login -- así que CUALQUIER restriccion por usuario (eventos_asignados,
   usuario_metodos_pago) dejaba de aplicarse en silencio: el vendedor volvia
   a ver TODOS los eventos/metodos de pago, no los que el admin le asigno. */
const staffVencido = (staff: StaffData | null): boolean => {
  const exp = staff && typeof staff.exp === 'number' ? staff.exp : null;
  return exp !== null && Date.now() >= exp * 1000;
};

export const obtenerStaffData = (): StaffData | null => {
  const token = localStorage.getItem(STORAGE_KEY);
  if (!token) return null;
  const staff = decodificarJWT(token);
  if (staff && staffVencido(staff)) {
    logoutStaff();
    return null;
  }
  return staff;
};

/* Reusa obtenerStaffData() (que ya autolimpia si vencio) para que
   staffAuthHeaders() nunca mande un JWT vencido como si fuera valido. */
export const obtenerStaffToken = (): string | null =>
  obtenerStaffData() ? localStorage.getItem(STORAGE_KEY) : null;

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
