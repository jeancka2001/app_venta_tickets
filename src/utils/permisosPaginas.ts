import axios from 'axios';
import { obtenerStaffData, staffAuthHeaders } from './staffAuth';

/* Qué páginas ve cada usuario — es lo MISMO que "Ajustes > Permisos de páginas" de la web (backend
   MS-LOGIN-BOLETERIA, PermisosPaginas.controller.js, GET /api/v1/paginas/mias):
   - Lista configurada para el usuario o su rol -> se ve SOLO lo de esa lista (también para admin).
   - Sin configuración (null) -> lo de siempre: los roles por defecto de cada página.
   - El admin nunca pierde "Permisos de páginas" (si no, nadie podría corregir una mala configuración).
   Las páginas de la web que la app no tiene (Tickets, Rifa, Casa 593...) no aparecen en el menú. */

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';

export interface PaginaApp {
  /* Misma clave que la web y el backend (PREDETERMINADAS / PAGINAS) */
  clave: string;
  nombre: string;
  ruta: string;
  /* nombre de icono de ionicons (se resuelve en MenuPaginas) */
  icono: string;
  seccion: 'Principal' | 'Administración';
  /* Roles que la ven cuando NO hay configuración guardada (igual que la web) */
  roles: string[];
}

const VENTA = ['admin', 'super_admin', 'vendedores', 'vendedor_secundario', 'suscriptores'];
const ADMINS = ['admin', 'super_admin'];

export const PAGINAS_APP: PaginaApp[] = [
  { clave: 'vender', nombre: 'Vender', ruta: '/dashboard/vender', icono: 'pricetag', seccion: 'Principal', roles: VENTA },
  { clave: 'mi_reporte', nombre: 'Mi reporte', ruta: '/dashboard/reporte', icono: 'stats', seccion: 'Principal', roles: VENTA },
  { clave: 'eventos', nombre: 'Eventos', ruta: '/dashboard/admin', icono: 'shield', seccion: 'Administración', roles: ADMINS },
  { clave: 'reporte_usuarios', nombre: 'Reporte por usuario', ruta: '/admin/reporte-usuarios', icono: 'people', seccion: 'Administración', roles: ADMINS },
  { clave: 'comisiones', nombre: 'Comisiones de vendedores', ruta: '/comisiones', icono: 'cash', seccion: 'Administración', roles: ADMINS },
  { clave: 'metodos_pago', nombre: 'Métodos de pago', ruta: '/admin/metodos-pago', icono: 'card', seccion: 'Administración', roles: ADMINS },
  { clave: 'devoluciones', nombre: 'Devoluciones', ruta: '/devoluciones', icono: 'return', seccion: 'Administración', roles: ['admin'] },
  { clave: 'soporte', nombre: 'Soporte', ruta: '/soporte', icono: 'help', seccion: 'Administración', roles: ADMINS },
  { clave: 'correos', nombre: 'Correos masivos', ruta: '/correos-masivos', icono: 'mail', seccion: 'Administración', roles: ['admin'] },
  { clave: 'meta_pixel', nombre: 'Píxeles de publicidad', ruta: '/pixeles', icono: 'analytics', seccion: 'Administración', roles: ['admin'] },
  { clave: 'permisos', nombre: 'Permisos de páginas', ruta: '/permisos-paginas', icono: 'key', seccion: 'Administración', roles: ['admin'] },
];

/* Páginas de la web que la app usa solo para decidir si muestra un botón (no tienen pantalla propia en el menú) */
const ROLES_EXTRA: Record<string, string[]> = {
  // Buscar cliente > Editar datos (en el backend: PREDETERMINADAS.suscriptores)
  suscriptores: ADMINS,
};

const norm = (p: unknown) => String(p ?? '').trim().toLowerCase();

/* ---------- caché por usuario (para que el menú aparezca al instante y se actualice solo) ---------- */
const CLAVE_CACHE = 'misPaginasApp';
const EVENTO = 'paginas-actualizadas';

interface Cache { id: number | string; paginas: string[] | null; }

export const leerMisPaginas = (): string[] | null => {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE_CACHE) || 'null') as Cache | null;
    const u = obtenerStaffData();
    return c && u && String(c.id) === String(u.id) ? c.paginas : null;
  } catch {
    return null;
  }
};

const guardarMisPaginas = (paginas: string[] | null) => {
  const u = obtenerStaffData();
  if (!u) return;
  try {
    localStorage.setItem(CLAVE_CACHE, JSON.stringify({ id: u.id, paginas }));
  } catch { /* sin caché */ }
  window.dispatchEvent(new CustomEvent(EVENTO));
};

export const borrarMisPaginas = () => {
  try { localStorage.removeItem(CLAVE_CACHE); } catch { /* nada */ }
  window.dispatchEvent(new CustomEvent(EVENTO));
};

/* Trae del servidor las páginas del usuario de la sesión. Si no hay conexión se queda con lo último que sabía
   (no se le quita el menú a nadie por un corte de internet). Devuelve true si se pudo actualizar. */
export const actualizarMisPaginas = async (): Promise<boolean> => {
  if (!obtenerStaffData()) return false;
  try {
    const { data } = await axios.get(`${URL_BASE}/paginas/mias`, { headers: staffAuthHeaders(), timeout: 12000 });
    if (!data || data.success === false) return false;
    const lista = Array.isArray(data.paginas) ? (data.paginas as unknown[]).map(String) : null;
    guardarMisPaginas(lista);
    return true;
  } catch {
    return false;
  }
};

/* ---------- reglas ---------- */
export const puedeVerClave = (clave: string, perfil?: string, paginas: string[] | null = leerMisPaginas()): boolean => {
  const p = norm(perfil);
  if (!p) return false;
  if (clave === 'permisos' && p === 'admin') return true;
  if (Array.isArray(paginas)) return paginas.includes(clave);
  const roles = PAGINAS_APP.find((x) => x.clave === clave)?.roles ?? ROLES_EXTRA[clave] ?? [];
  return roles.includes(p);
};

export const puedoVer = (clave: string): boolean => puedeVerClave(clave, obtenerStaffData()?.perfil);

/* Páginas del menú que ve el usuario de la sesión */
export const paginasVisibles = (): PaginaApp[] => {
  const perfil = obtenerStaffData()?.perfil;
  const paginas = leerMisPaginas();
  return PAGINAS_APP.filter((p) => puedeVerClave(p.clave, perfil, paginas));
};

export const EVENTO_PAGINAS = EVENTO;
