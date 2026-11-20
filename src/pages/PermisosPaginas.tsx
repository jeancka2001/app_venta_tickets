import { useCallback, useEffect, useMemo, useState } from 'react';
import { IonButton, IonCheckbox, IonSegment, IonSegmentButton, IonLabel, IonSelect, IonSelectOption, IonSearchbar, IonRefresher, IonRefresherContent, IonAlert } from '@ionic/react';
import PanelPagina from '../components/PanelPagina';
import { actualizarMisPaginas } from '../utils/permisosPaginas';
import { listarRoles, listarUsuarios, permisosConfig, permisosGuardarRol, permisosGuardarUsuario } from '../utils/panelesAdmin';

/* Ajustes > Permisos de páginas: qué páginas ve cada ROL y cada USUARIO (la misma configuración de la web: lo que se marque aquí
   vale también allá). Sin configuración, cada quien ve lo de siempre. Con una lista, ve SOLO esas (el admin también).
   Al cambiar los permisos de alguien, su menú se actualiza solo en pocos minutos (o al volver a abrir la app). */

const PAGINAS: { clave: string; nombre: string; seccion: string }[] = [
  { clave: 'inicio', nombre: 'Inicio', seccion: 'General' },
  { clave: 'noticias', nombre: 'Noticias', seccion: 'General' },
  { clave: 'casa593', nombre: 'Casa 593', seccion: 'General' },
  { clave: 'tickets', nombre: 'Tickets (diseñar e imprimir boletos)', seccion: 'General' },
  { clave: 'sorteo', nombre: 'Rifa / Sorteo', seccion: 'General' },
  { clave: 'devoluciones', nombre: 'Devoluciones', seccion: 'General' },
  { clave: 'soporte', nombre: 'Soporte (tickets de los clientes)', seccion: 'General' },
  { clave: 'correos', nombre: 'Correos masivos', seccion: 'General' },
  { clave: 'qr_viewer', nombre: 'QR Viewer', seccion: 'General' },
  { clave: 'preregistros', nombre: 'Preregistros', seccion: 'General' },
  { clave: 'stand', nombre: 'Venta en stand', seccion: 'General' },
  { clave: 'espacios', nombre: 'Crear espacio', seccion: 'Gestión de eventos' },
  { clave: 'eventos', nombre: 'Eventos', seccion: 'Gestión de eventos' },
  { clave: 'evento_localidades', nombre: 'Eventos: Localidades y asientos', seccion: 'Gestión de eventos' },
  { clave: 'suscriptores', nombre: 'Suscriptores', seccion: 'Clientes' },
  { clave: 'vender', nombre: 'Vender tickets', seccion: 'Ventas' },
  { clave: 'aprobar', nombre: 'Ventas por aprobar', seccion: 'Ventas' },
  { clave: 'informe', nombre: 'Informe de ventas', seccion: 'Ventas' },
  { clave: 'mi_reporte', nombre: 'Mi reporte (mis ventas y comisión)', seccion: 'Ventas' },
  { clave: 'reporte_usuarios', nombre: 'Reporte por usuario', seccion: 'Ventas' },
  { clave: 'comisiones', nombre: 'Comisiones de vendedores', seccion: 'Ventas' },
  { clave: 'ventas_sin_registro', nombre: 'Ventas sin registro (boletos físicos)', seccion: 'Ventas' },
  { clave: 'comprobantes', nombre: 'Comprobantes de pago', seccion: 'Ventas' },
  { clave: 'gestion_personal', nombre: 'Gestión personal (usuarios)', seccion: 'Ajustes' },
  { clave: 'historial', nombre: 'Historial', seccion: 'Ajustes' },
  { clave: 'tokens_api', nombre: 'Tokens API', seccion: 'Ajustes' },
  { clave: 'metodos_pago', nombre: 'Métodos de pago', seccion: 'Ajustes' },
  { clave: 'webhook_logs', nombre: 'Log webhooks', seccion: 'Ajustes' },
  { clave: 'meta_pixel', nombre: 'Píxeles de publicidad (Meta / TikTok)', seccion: 'Ajustes' },
  { clave: 'push', nombre: 'Notificaciones push', seccion: 'Ajustes' },
  { clave: 'permisos', nombre: 'Permisos de páginas', seccion: 'Ajustes' },
];
const SECCIONES = [...new Set(PAGINAS.map((p) => p.seccion))];
const CLAVES_CONOCIDAS = new Set(PAGINAS.map((p) => p.clave));
// Las páginas que la APP tiene (el resto solo se ve en la web)
const EN_APP = new Set(['vender', 'mi_reporte', 'eventos', 'reporte_usuarios', 'comisiones', 'metodos_pago', 'devoluciones', 'soporte', 'correos', 'meta_pixel', 'permisos']);

interface Usuario { id: number; name?: string; username?: string; perfil?: string }
const nombreUsuario = (u: Usuario) => u.name || u.username || `#${u.id}`;
const norm = (v: unknown) => String(v ?? '').trim().toLowerCase();

const PermisosPaginas: React.FC = () => {
  const [vista, setVista] = useState<'roles' | 'usuarios'>('roles');
  const [config, setConfig] = useState<{ perfiles: { perfil: string; paginas: string[] }[]; usuarios: { id_usuario: number; paginas: string[] }[] } | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [rol, setRol] = useState('');
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [buscar, setBuscar] = useState('');
  const [borrador, setBorrador] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [confirmar, setConfirmar] = useState(false);

  const cargar = useCallback(async () => {
    const [c, r, u] = await Promise.all([permisosConfig(), listarRoles(), listarUsuarios()]);
    if (!c.success) { setError(c.message || 'No se pudo leer la configuración'); return; }
    setError('');
    setConfig({ perfiles: c.perfiles || [], usuarios: c.usuarios || [] });
    setRoles([...new Set([...(Array.isArray(r.data) ? r.data : []).map((x: { roles?: string }) => norm(x.roles)), 'stand'].filter(Boolean))]);
    setUsuarios(Array.isArray(u.users) ? u.users : []);
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  // Al elegir un rol / usuario se carga lo que tiene guardado (null = lo de siempre)
  useEffect(() => {
    if (!config) return;
    if (vista === 'roles') setBorrador(rol ? config.perfiles.find((p) => p.perfil === rol)?.paginas ?? null : null);
    else setBorrador(usuario ? config.usuarios.find((x) => x.id_usuario === usuario.id)?.paginas ?? null : null);
  }, [config, vista, rol, usuario]);

  const hayEleccion = vista === 'roles' ? !!rol : !!usuario;
  const marcada = (clave: string) => !!borrador && borrador.includes(clave);
  const alternar = (clave: string, si: boolean) => setBorrador((b) => {
    const base = b || [];
    return si ? [...new Set([...base, clave])] : base.filter((c) => c !== clave);
  });

  const guardar = async (paginas: string[] | null) => {
    setGuardando(true);
    const r = vista === 'roles' ? await permisosGuardarRol(rol, paginas) : await permisosGuardarUsuario(usuario!.id, paginas);
    setGuardando(false);
    setToast(r.success ? 'Guardado' : r.message || 'No se pudo guardar');
    if (r.success) { await cargar(); actualizarMisPaginas(); }
  };

  const filtrados = useMemo(() => usuarios.filter((u) => `${nombreUsuario(u)} ${u.username || ''} ${u.perfil || ''}`.toLowerCase().includes(buscar.toLowerCase())).slice(0, 40), [usuarios, buscar]);
  // Páginas guardadas que esta pantalla no muestra (p. ej. secciones de Casa 593) se conservan tal cual
  const extras = (borrador || []).filter((c) => !CLAVES_CONOCIDAS.has(c));

  return (
    <PanelPagina titulo="Permisos de páginas" toast={toast} onToastCerrado={() => setToast('')} cargando={!config && !error}
      encabezado={(
        <IonSegment className="pn-segmentos" value={vista} onIonChange={(e) => { setVista(e.detail.value as 'roles' | 'usuarios'); setBorrador(null); }}>
          <IonSegmentButton value="roles"><IonLabel>Por rol</IonLabel></IonSegmentButton>
          <IonSegmentButton value="usuarios"><IonLabel>Por usuario</IonLabel></IonSegmentButton>
        </IonSegment>
      )}>
      <IonRefresher slot="fixed" onIonRefresh={async (e) => { await cargar(); e.detail.complete(); }}><IonRefresherContent /></IonRefresher>
      {error && <div className="pn-error">{error}</div>}
      {config && (
        <>
          <p className="pn-sub">Sin configuración, cada quien ve lo de siempre. Con una lista, ve <b>solo</b> esas páginas (también el admin). Lo de un usuario manda sobre lo de su rol.</p>
          {vista === 'roles' ? (
            <div className="pn-card">
              <IonSelect label="Rol" labelPlacement="floating" fill="outline" value={rol} onIonChange={(e) => setRol(String(e.detail.value))} interface="action-sheet">
                {roles.map((r) => <IonSelectOption key={r} value={r}>{r}{config.perfiles.some((p) => p.perfil === r) ? ' · personalizado' : ''}</IonSelectOption>)}
              </IonSelect>
            </div>
          ) : (
            <div className="pn-card">
              <IonSearchbar value={buscar} onIonInput={(e) => setBuscar(String(e.detail.value || ''))} placeholder="Buscar usuario" style={{ padding: 0 }} />
              {filtrados.map((u) => (
                <div key={u.id} className="pn-switch pn-card-click" onClick={() => setUsuario(u)}>
                  <span className="pn-switch-nombre" style={{ fontWeight: usuario?.id === u.id ? 700 : 400 }}>{nombreUsuario(u)} <span className="pn-lista-pie">· {u.perfil}{config.usuarios.some((x) => x.id_usuario === u.id) ? ' · personalizado' : ''}</span></span>
                  {usuario?.id === u.id && <span className="pn-badge pn-b-info">elegido</span>}
                </div>
              ))}
            </div>
          )}

          {hayEleccion && (
            <>
              <div className="pn-card">
                <div className="pn-switch">
                  <span className="pn-switch-nombre"><b>{vista === 'roles' ? `Rol ${rol}` : nombreUsuario(usuario!)}</b><br /><span className="pn-lista-pie">{borrador === null ? (vista === 'roles' ? 'Ve lo de siempre' : 'Usa las páginas de su rol') : 'Lista personalizada'}</span></span>
                  <IonButton size="small" fill="outline" onClick={() => (borrador === null ? setBorrador([]) : setConfirmar(true))}>{borrador === null ? 'Personalizar' : vista === 'roles' ? 'Volver a lo de siempre' : 'Usar las de su rol'}</IonButton>
                </div>
                {borrador !== null && borrador.length === 0 && <div className="pn-aviso" style={{ marginTop: 10 }}>Sin ninguna página marcada no vería nada. Marca las que sí.</div>}
              </div>

              {borrador !== null && SECCIONES.map((s) => (
                <div key={s} className="pn-card">
                  <h3 className="pn-titulo">{s}</h3>
                  {PAGINAS.filter((p) => p.seccion === s).map((p) => (
                    <div key={p.clave} className="pn-switch">
                      <span className="pn-switch-nombre">{p.nombre}{EN_APP.has(p.clave) ? <span className="pn-lista-pie"> · también en la app</span> : ''}</span>
                      <IonCheckbox checked={marcada(p.clave)} onIonChange={(e) => alternar(p.clave, e.detail.checked)} />
                    </div>
                  ))}
                </div>
              ))}
              {borrador !== null && extras.length > 0 && <p className="pn-sub">También tiene guardadas: {extras.join(', ')} (se conservan).</p>}
              {borrador !== null && <IonButton expand="block" className="pn-boton-p" disabled={guardando} onClick={() => guardar(borrador)}>Guardar permisos</IonButton>}
            </>
          )}
        </>
      )}
      <IonAlert isOpen={confirmar} onDidDismiss={() => setConfirmar(false)} header={vista === 'roles' ? '¿Volver a lo de siempre?' : '¿Usar las páginas de su rol?'}
        message="Se borra la lista personalizada." buttons={[{ text: 'No', role: 'cancel' }, { text: 'Sí', handler: () => { guardar(null); } }]} />
    </PanelPagina>
  );
};

export default PermisosPaginas;
