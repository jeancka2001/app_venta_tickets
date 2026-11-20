import { useCallback, useEffect, useState } from 'react';
import { IonButton, IonIcon, IonCheckbox, IonSpinner, IonToast, IonAlert, IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons, IonSearchbar } from '@ionic/react';
import { gridOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import type { EventoAdmin } from '../utils/adminEventos';
import { canalLocalidadGuardar, canalUsuariosLocalidad, localidadesDelEvento, usuarioSinComisiones, ventaPersonalEvento, ventaPersonalGuardarEvento } from '../utils/panelesAdmin';
import { EditarAsientos, NuevaLocalidad, OpcionesCompra, type LocalidadEvento } from './AdminLocalidadesEditor';
import './Paneles.css';

/* Pestañas del evento (admin) que faltaban en la app y que sí tiene la web:
   - Localidades y asientos: cómo está armada cada localidad, cuántos asientos hay, cuántos se vendieron y sus opciones de compra.
   - Canales y venta por personal: dónde se vende cada localidad y qué cargos no se cobran en la venta por personal.
   - Info: el afiche y los datos del evento. */

const dinero = (v: unknown) => `$${(parseFloat(String(v ?? '0')) || 0).toFixed(2)}`;
const TIPOS: Record<string, string> = { correlativo: 'Correlativo', fila: 'Por filas', mesa: 'Por mesas' };

/* ------------------------------------------------------------------ Localidades y asientos */
export const PestanaLocalidadesAsientos: React.FC<{ codigoEvento: string }> = ({ codigoEvento }) => {
  const navigate = useNavigate();
  const [datos, setDatos] = useState<LocalidadEvento[] | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<{ texto: string; ok: boolean } | null>(null);
  const [modo, setModo] = useState<{ que: 'editar' | 'opciones' | 'nueva'; loc?: LocalidadEvento } | null>(null);
  const [modalidadesOk, setModalidadesOk] = useState(true);

  const cargar = useCallback(async () => {
    const r = await localidadesDelEvento(codigoEvento);
    if (r.success) { setDatos(r.data || []); setModalidadesOk(r.modalidadesDisponibles !== false); setError(''); } else setError(r.message || 'No se pudieron cargar las localidades');
  }, [codigoEvento]);
  useEffect(() => { cargar(); }, [cargar]);
  const avisar = (texto: string, ok = true) => setToast({ texto, ok });
  // Después de un cambio se vuelve a leer la lista y, si se estaba en opciones de compra, se queda ahí con los datos nuevos
  const recargar = async () => {
    await cargar();
    setModo((m) => (m && m.que === 'opciones' ? m : m));
  };

  const cierre = <IonToast isOpen={!!toast} message={toast?.texto} duration={3200} color={toast && !toast.ok ? 'danger' : undefined} onDidDismiss={() => setToast(null)} />;

  if (!datos && !error) return <div className="pn-cargando"><IonSpinner name="crescent" /></div>;
  if (modo && datos) {
    const actual = modo.loc ? datos.find((l) => l.id_localidades === modo.loc!.id_localidades) || modo.loc : undefined;
    return (
      <>
        {modo.que === 'editar' && actual && <EditarAsientos codigoEvento={codigoEvento} loc={actual} toast={avisar} onCerrar={() => setModo(null)} onCambio={recargar} />}
        {modo.que === 'opciones' && actual && <OpcionesCompra key={`${actual.id_localidades}-${(actual.modalidades || []).length}`} codigoEvento={codigoEvento} loc={actual} toast={avisar} onCerrar={() => setModo(null)} onCambio={recargar} />}
        {modo.que === 'nueva' && <NuevaLocalidad codigoEvento={codigoEvento} toast={avisar} onCerrar={() => setModo(null)} onCambio={recargar} />}
        {cierre}
      </>
    );
  }

  const total = (datos || []).reduce((s, l) => s + l.asientos, 0);
  const vendidos = (datos || []).reduce((s, l) => s + l.ocupados, 0);
  return (
    <>
      {error && <div className="pn-error">{error}</div>}
      {datos && (
        <>
          <div className="pn-card">
            <div className="pn-fila"><span className="pn-lbl">Localidades</span><span className="pn-val">{datos.length}</span></div>
            <div className="pn-fila"><span className="pn-lbl">Asientos en total</span><span className="pn-val">{total}</span></div>
            <div className="pn-fila"><span className="pn-lbl">Ocupados</span><span className="pn-val">{vendidos}</span></div>
            <div className="pn-fila"><span className="pn-lbl">Libres</span><span className="pn-val">{total - vendidos}</span></div>
            <IonButton expand="block" fill="outline" className="pn-campo" disabled={!datos.length} onClick={() => setModo({ que: 'nueva' })}>Nueva localidad</IonButton>
          </div>
          {datos.length === 0 && <div className="pn-vacio">Este evento no tiene localidades.</div>}
          {datos.map((l) => {
            const libres = l.asientos - l.ocupados;
            const pct = l.asientos ? Math.round((l.ocupados / l.asientos) * 100) : 0;
            const promos = (l.modalidades || []).filter((m) => m.nombre && !/^individual$/i.test(m.nombre));
            const activas = promos.filter((m) => m.activo).length;
            return (
              <div key={l.id_localidades} className="pn-card">
                <div className="pn-lista-top"><span className="pn-lista-nombre">{l.localidad}</span><span className="pn-badge pn-b-info">{TIPOS[l.tipo] || l.tipo}{Number(l.diseno?.factor) > 1 ? ` x${l.diseno.factor}` : ''}</span></div>
                <div className="pn-fila" style={{ marginTop: 8 }}><span className="pn-lbl">Precio</span><span className="pn-val">{dinero(l.precio_normal)}</span></div>
                <div className="pn-fila"><span className="pn-lbl">Asientos</span><span className="pn-val">{l.asientos} · {l.ocupados} ocupados · {libres} libres</span></div>
                <div style={{ height: 6, borderRadius: 3, background: '#e6e9f4', marginTop: 8, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct >= 90 ? '#c0392b' : '#2d358c' }} />
                </div>
                {promos.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <span className="pn-lbl">Opciones de compra</span>
                    {promos.map((m) => <div key={m.id} className="pn-fila"><span className="pn-val" style={{ fontWeight: 500 }}>{m.nombre}{m.activo ? '' : ' (inactiva)'}</span><span className="pn-val">{dinero(m.precio)} · x{m.factor}</span></div>)}
                  </div>
                )}
                <div className="pn-botones">
                  <IonButton size="small" className="pn-boton-p" onClick={() => setModo({ que: 'editar', loc: l })}>Editar asientos</IonButton>
                  {modalidadesOk && <IonButton size="small" fill="outline" onClick={() => setModo({ que: 'opciones', loc: l })}>Opciones de compra{activas ? ` (${activas})` : ''}</IonButton>}
                  {(l.tipo === 'fila' || l.tipo === 'mesa') && (
                    <IonButton size="small" fill="outline" onClick={() => navigate(`/admin/evento/${codigoEvento}/localidad/${l.id_localidades}/asientos`, { state: { localidadNombre: l.localidad, tipoLocalidad: l.tipo } })}>
                      <IonIcon icon={gridOutline} slot="start" />Ver asientos
                    </IonButton>
                  )}
                </div>
              </div>
            );
          })}
          {!modalidadesOk && <div className="pn-aviso">Falta correr la migración <b>2026-10-16-localidad-modalidades.sql</b> para usar opciones de compra.</div>}
        </>
      )}
      {cierre}
    </>
  );
};

/* ------------------------------------------------------------------ Canales y venta por personal */
interface LocCanal { localidad: string; venta_publica: number; venta_personal: number; usuarios?: number[] }
interface Personal { id: number; nombre: string; usuario: string; perfil: string }
const PERFILES_ADMIN = ['admin', 'super_admin'];
const CARGOS: { clave: 'sin_comision_boleto' | 'sin_comision_metodo' | 'sin_iva'; texto: string; ayuda: string }[] = [
  { clave: 'sin_comision_boleto', texto: 'Comisión por boleto', ayuda: 'El cargo fijo por entrada de la localidad.' },
  { clave: 'sin_comision_metodo', texto: 'Comisión del método de pago', ayuda: 'El % de tarjeta, Deuna, efectivo local, etc.' },
  { clave: 'sin_iva', texto: 'IVA', ayuda: 'Ojo: la factura electrónica de esas ventas sale sin IVA.' },
];

export const PestanaCanales: React.FC<{ codigoEvento: string }> = ({ codigoEvento }) => {
  const [locs, setLocs] = useState<LocCanal[] | null>(null);
  const [config, setConfig] = useState<Record<string, boolean>>({ sin_comision_boleto: false, sin_comision_metodo: false, sin_iva: false });
  const [migracion, setMigracion] = useState(true);
  const [tocado, setTocado] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<{ loc: LocCanal; campo: 'venta_publica' | 'venta_personal'; valor: number } | null>(null);
  const [personal, setPersonal] = useState<Personal[]>([]);
  const [marcados, setMarcados] = useState<number[]>([]);
  const [puedeMarcar, setPuedeMarcar] = useState(false);
  const [buscarVendedor, setBuscarVendedor] = useState('');
  const [marcando, setMarcando] = useState<number | null>(null);
  const [editandoUsuarios, setEditandoUsuarios] = useState<LocCanal | null>(null);
  const [elegidos, setElegidos] = useState<number[]>([]);
  const [buscarModal, setBuscarModal] = useState('');
  const [guardandoUsuarios, setGuardandoUsuarios] = useState(false);

  const cargar = useCallback(async () => {
    const r = await ventaPersonalEvento(codigoEvento);
    if (r.success) {
      setLocs(r.localidades || []); setConfig(r.config || {}); setMigracion(r.migracion !== false); setTocado(false); setError('');
      setPersonal(r.personal || []); setMarcados(r.sin_comisiones || []); setPuedeMarcar(!!r.puede_marcar_usuarios);
    } else setError(r.message || 'No se pudo cargar');
  }, [codigoEvento]);
  useEffect(() => { cargar(); }, [cargar]);

  const aplicarCanal = async (loc: LocCanal, campo: 'venta_publica' | 'venta_personal', valor: number) => {
    const nuevo = { ...loc, [campo]: valor };
    setLocs((l) => (l || []).map((x) => (x.localidad === loc.localidad ? nuevo : x)));
    const r = await canalLocalidadGuardar(codigoEvento, loc.localidad, nuevo.venta_publica, nuevo.venta_personal);
    setToast(r.success ? 'Canal guardado' : r.message || 'No se pudo guardar');
    if (!r.success) cargar();
  };
  const cambiarCanal = (loc: LocCanal, campo: 'venta_publica' | 'venta_personal', valor: number) => {
    const nuevo = { ...loc, [campo]: valor };
    if (!nuevo.venta_publica && !nuevo.venta_personal) setAviso({ loc, campo, valor }); else aplicarCanal(loc, campo, valor);
  };
  const guardarCargos = async () => {
    setGuardando(true);
    const r = await ventaPersonalGuardarEvento(codigoEvento, config);
    setGuardando(false);
    setToast(r.success ? 'Venta por personal guardada' : r.message || 'No se pudo guardar');
    if (r.success) setTocado(false);
  };

  const marcar = async (u: Personal, si: boolean) => {
    setMarcando(u.id);
    const r = await usuarioSinComisiones(u.id, si);
    setMarcando(null);
    if (r.success) setMarcados((m) => (si ? [...new Set([...m, u.id])] : m.filter((x) => x !== u.id))); else setToast(r.message || 'No se pudo guardar');
  };
  const abrirUsuarios = (l: LocCanal) => { setEditandoUsuarios(l); setElegidos(l.usuarios || []); setBuscarModal(''); };
  const guardarUsuarios = async (ids: number[]) => {
    if (!editandoUsuarios) return;
    setGuardandoUsuarios(true);
    const r = await canalUsuariosLocalidad(codigoEvento, editandoUsuarios.localidad, ids);
    setGuardandoUsuarios(false);
    if (r.success) { setToast(ids.length ? 'Localidad solo para esos usuarios' : 'Localidad para todos'); setEditandoUsuarios(null); cargar(); } else setToast(r.message || 'No se pudo guardar');
  };
  const vendedores = personal.filter((u) => !PERFILES_ADMIN.includes(String(u.perfil || '').toLowerCase()));
  const algunCargo = !!(config.sin_comision_boleto || config.sin_comision_metodo || config.sin_iva);
  const nombresMarcados = vendedores.filter((u) => marcados.includes(u.id)).map((u) => u.nombre);
  const filtroV = buscarVendedor.trim().toLowerCase();
  const listaVendedores = vendedores.filter((u) => !filtroV || `${u.nombre} ${u.usuario} ${u.perfil}`.toLowerCase().includes(filtroV)).sort((a, b) => Number(marcados.includes(b.id)) - Number(marcados.includes(a.id))).slice(0, 60);
  const filtroM = buscarModal.trim().toLowerCase();
  const listaModal = vendedores.filter((u) => !filtroM || `${u.nombre} ${u.usuario} ${u.perfil}`.toLowerCase().includes(filtroM)).slice(0, 80);

  if (!locs && !error) return <div className="pn-cargando"><IonSpinner name="crescent" /></div>;
  return (
    <>
      {error && <div className="pn-error">{error}</div>}
      {!migracion && <div className="pn-aviso">Falta correr en la base de datos la actualización de canales de venta (2026-10-16-venta-personal-canales).</div>}
      {locs && (
        <>
          <div className="pn-card">
            <h3 className="pn-titulo">Dónde se vende cada localidad</h3>
            <p className="pn-sub">«Página y app normal» es lo que ve el público. «App de venta y panel» es lo que ve el personal con su usuario. Lo aplica el servidor: las apps no hay que actualizarlas.</p>
            {locs.length === 0 && <p className="pn-vacio">Este evento no tiene localidades.</p>}
            {locs.map((l) => (
              <div key={l.localidad} style={{ marginTop: 12 }}>
                <div className="pn-lista-nombre">{l.localidad}{(l.usuarios || []).length ? <span className="pn-badge pn-b-warning" style={{ marginLeft: 6 }}>solo {(l.usuarios || []).length} usuario(s)</span> : null}</div>
                <div className="pn-switch"><span className="pn-switch-nombre">Página y app normal</span><IonCheckbox checked={Number(l.venta_publica) !== 0} disabled={!migracion} onIonChange={(e) => cambiarCanal(l, 'venta_publica', e.detail.checked ? 1 : 0)} /></div>
                <div className="pn-switch"><span className="pn-switch-nombre">App de venta y panel</span><IonCheckbox checked={Number(l.venta_personal) !== 0} disabled={!migracion} onIonChange={(e) => cambiarCanal(l, 'venta_personal', e.detail.checked ? 1 : 0)} /></div>
                {puedeMarcar && migracion && <IonButton size="small" fill="outline" onClick={() => abrirUsuarios(l)}>Solo para algunos usuarios{(l.usuarios || []).length ? ` (${(l.usuarios || []).length})` : ''}</IonButton>}
              </div>
            ))}
          </div>

          <div className="pn-card">
            <h3 className="pn-titulo">Venta por personal sin comisiones</h3>
            <p className="pn-sub">Qué cargos NO se cobran en este evento a los usuarios marcados como «Vende sin comisiones» (Ajustes → Gestión Personal en la web).</p>
            {CARGOS.map((c) => (
              <div key={c.clave} className="pn-switch">
                <span className="pn-switch-nombre">{c.texto}<br /><span className="pn-lista-pie">{c.ayuda}</span></span>
                <IonCheckbox checked={!!config[c.clave]} disabled={!migracion} onIonChange={(e) => { setConfig({ ...config, [c.clave]: e.detail.checked }); setTocado(true); }} />
              </div>
            ))}
            <IonButton expand="block" className="pn-boton-p pn-campo" disabled={!tocado || guardando || !migracion} onClick={guardarCargos}>Guardar</IonButton>
          </div>

          <div className="pn-card">
            <h3 className="pn-titulo">¿Quién vende sin comisiones?</h3>
            {algunCargo && !nombresMarcados.length && <div className="pn-aviso">Ningún vendedor está marcado: los cargos de arriba no se le quitan a nadie y la app de venta sigue cobrando todo.</div>}
            {!algunCargo && nombresMarcados.length > 0 && <div className="pn-aviso" style={{ background: '#e2f0fe', color: '#0b5cab' }}>Hay vendedores marcados, pero este evento no quita ningún cargo: marca arriba qué no cobrar y pulsa Guardar.</div>}
            {algunCargo && nombresMarcados.length > 0 && <div className="pn-aviso" style={{ background: '#d4f1dd', color: '#155724' }}>En este evento venden sin esos cargos: <b>{nombresMarcados.join(', ')}</b>.</div>}
            <p className="pn-sub" style={{ marginTop: 8 }}>Los administradores (admin / super_admin) siempre venden con todos los cargos. Es por usuario: vale para todos los eventos que quiten cargos.</p>
            {puedeMarcar ? (
              <>
                <IonSearchbar value={buscarVendedor} onIonInput={(e) => setBuscarVendedor(String(e.detail.value || ''))} placeholder="Buscar vendedor" style={{ padding: 0 }} />
                {listaVendedores.map((u) => (
                  <div key={u.id} className="pn-switch"><span className="pn-switch-nombre">{u.nombre} <span className="pn-lista-pie">· {u.usuario} · {u.perfil}</span></span>
                    <IonCheckbox checked={marcados.includes(u.id)} disabled={marcando === u.id || !migracion} onIonChange={(e) => marcar(u, e.detail.checked)} /></div>
                ))}
                {listaVendedores.length === 0 && <p className="pn-vacio">Sin vendedores.</p>}
              </>
            ) : <p className="pn-sub">Solo un administrador puede marcar quién vende sin comisiones.</p>}
          </div>
        </>
      )}
      <IonModal isOpen={!!editandoUsuarios} onDidDismiss={() => setEditandoUsuarios(null)}>
        <IonHeader><IonToolbar className="admin-toolbar"><IonTitle size="small">Solo para algunos usuarios</IonTitle><IonButtons slot="end"><IonButton onClick={() => setEditandoUsuarios(null)}>Cerrar</IonButton></IonButtons></IonToolbar></IonHeader>
        <IonContent className="admin-content">
          <div className="pn-contenedor">
            <p className="pn-sub"><b>{editandoUsuarios?.localidad}</b>: si eliges usuarios, la localidad se oculta para la página, la app normal y el resto del personal: solo la ven y la venden ellos (los administradores siempre la ven).</p>
            <IonSearchbar value={buscarModal} onIonInput={(e) => setBuscarModal(String(e.detail.value || ''))} placeholder="Buscar usuario" style={{ padding: 0 }} />
            <div className="pn-card">
              {listaModal.map((u) => (
                <div key={u.id} className="pn-switch"><span className="pn-switch-nombre">{u.nombre} <span className="pn-lista-pie">· {u.usuario} · {u.perfil}</span></span>
                  <IonCheckbox checked={elegidos.includes(u.id)} onIonChange={(e) => setElegidos((x) => (e.detail.checked ? [...new Set([...x, u.id])] : x.filter((i) => i !== u.id)))} /></div>
              ))}
              {listaModal.length === 0 && <p className="pn-vacio">Sin usuarios.</p>}
            </div>
            <p className="pn-sub">{elegidos.length} elegido(s)</p>
            <div className="pn-botones">
              <IonButton fill="outline" disabled={guardandoUsuarios} onClick={() => guardarUsuarios([])}>Quitar restricción (para todos)</IonButton>
              <IonButton className="pn-boton-p" disabled={guardandoUsuarios} onClick={() => guardarUsuarios(elegidos)}>Guardar</IonButton>
            </div>
          </div>
        </IonContent>
      </IonModal>
      <IonToast isOpen={!!toast} message={toast} duration={2600} onDidDismiss={() => setToast('')} />
      <IonAlert isOpen={!!aviso} onDidDismiss={() => setAviso(null)} header="Sin canal de venta"
        message={aviso ? `"${aviso.loc.localidad}" no se venderá en ningún lado. ¿Continuar?` : ''}
        buttons={[{ text: 'No', role: 'cancel' }, { text: 'Sí', handler: () => { if (aviso) aplicarCanal(aviso.loc, aviso.campo, aviso.valor); } }]} />
    </>
  );
};

/* ------------------------------------------------------------------ Info */
export const PestanaInfo: React.FC<{ evento: EventoAdmin }> = ({ evento }) => {
  const e = evento as EventoAdmin & { descripcionConcierto?: string; imagenConcierto?: string; mapaConcierto?: string };
  return (
    <>
      {e.imagenConcierto && <div className="pn-card" style={{ padding: 0, overflow: 'hidden' }}><img src={e.imagenConcierto} alt={e.nombreConcierto} style={{ width: '100%', display: 'block' }} /></div>}
      <div className="pn-card">
        <h3 className="pn-titulo">{e.nombreConcierto}</h3>
        {e.descripcionConcierto && <div className="pn-cuerpo" style={{ marginBottom: 10 }}>{e.descripcionConcierto}</div>}
        {([['Fecha', e.fechaConcierto], ['Hora', e.horaConcierto], ['Lugar', e.lugarConcierto], ['Ciudad', e.cuidadConcert], ['Código', e.codigoEvento], ['Estado', e.estado]] as [string, string | undefined][])
          .filter(([, v]) => v).map(([k, v]) => <div key={k} className="pn-fila"><span className="pn-lbl">{k}</span><span className="pn-val">{v}</span></div>)}
      </div>
      {e.mapaConcierto && <div className="pn-card" style={{ padding: 0, overflow: 'hidden' }}><img src={e.mapaConcierto} alt="Mapa del evento" style={{ width: '100%', display: 'block' }} /></div>}
    </>
  );
};
