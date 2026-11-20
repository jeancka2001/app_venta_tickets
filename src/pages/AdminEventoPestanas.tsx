import { useCallback, useEffect, useState } from 'react';
import { IonButton, IonIcon, IonCheckbox, IonSpinner, IonToast, IonAlert } from '@ionic/react';
import { gridOutline } from 'ionicons/icons';
import { useNavigate } from 'react-router-dom';
import type { EventoAdmin } from '../utils/adminEventos';
import { canalLocalidadGuardar, localidadesDelEvento, ventaPersonalEvento, ventaPersonalGuardarEvento } from '../utils/panelesAdmin';
import './Paneles.css';

/* Pestañas del evento (admin) que faltaban en la app y que sí tiene la web:
   - Localidades y asientos: cómo está armada cada localidad, cuántos asientos hay, cuántos se vendieron y sus opciones de compra.
   - Canales y venta por personal: dónde se vende cada localidad y qué cargos no se cobran en la venta por personal.
   - Info: el afiche y los datos del evento. */

const dinero = (v: unknown) => `$${(parseFloat(String(v ?? '0')) || 0).toFixed(2)}`;
const TIPOS: Record<string, string> = { correlativo: 'Correlativo', fila: 'Por filas', mesa: 'Por mesas' };

/* ------------------------------------------------------------------ Localidades y asientos */
interface LocEvento {
  id_localidades: number; localidad: string; precio_normal: string; tipo: string; asientos: number; ocupados: number;
  modalidades?: { id: number; nombre: string; precio: number; factor: number; activo: boolean }[];
}

export const PestanaLocalidadesAsientos: React.FC<{ codigoEvento: string }> = ({ codigoEvento }) => {
  const navigate = useNavigate();
  const [datos, setDatos] = useState<LocEvento[] | null>(null);
  const [error, setError] = useState('');

  const cargar = useCallback(async () => {
    const r = await localidadesDelEvento(codigoEvento);
    if (r.success) { setDatos(r.data || []); setError(''); } else setError(r.message || 'No se pudieron cargar las localidades');
  }, [codigoEvento]);
  useEffect(() => { cargar(); }, [cargar]);

  if (!datos && !error) return <div className="pn-cargando"><IonSpinner name="crescent" /></div>;
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
          </div>
          {datos.length === 0 && <div className="pn-vacio">Este evento no tiene localidades.</div>}
          {datos.map((l) => {
            const libres = l.asientos - l.ocupados;
            const pct = l.asientos ? Math.round((l.ocupados / l.asientos) * 100) : 0;
            const promos = (l.modalidades || []).filter((m) => m.nombre && !/^individual$/i.test(m.nombre));
            return (
              <div key={l.id_localidades} className="pn-card">
                <div className="pn-lista-top"><span className="pn-lista-nombre">{l.localidad}</span><span className="pn-badge pn-b-info">{TIPOS[l.tipo] || l.tipo}</span></div>
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
                {(l.tipo === 'fila' || l.tipo === 'mesa') && (
                  <IonButton expand="block" fill="outline" size="small" className="pn-campo"
                    onClick={() => navigate(`/admin/evento/${codigoEvento}/localidad/${l.id_localidades}/asientos`, { state: { localidadNombre: l.localidad, tipoLocalidad: l.tipo } })}>
                    <IonIcon icon={gridOutline} slot="start" />Ver / editar asientos
                  </IonButton>
                )}
              </div>
            );
          })}
          <p className="pn-sub">Para cambiar el tipo de una localidad, agregar filas, mesas o sillas, o crear una localidad nueva, usa la pestaña «Localidades y asientos» de la web: ahí se revisa el cambio antes de aplicarlo para no perder ventas.</p>
        </>
      )}
    </>
  );
};

/* ------------------------------------------------------------------ Canales y venta por personal */
interface LocCanal { localidad: string; venta_publica: number; venta_personal: number; usuarios?: number[] }
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

  const cargar = useCallback(async () => {
    const r = await ventaPersonalEvento(codigoEvento);
    if (r.success) { setLocs(r.localidades || []); setConfig(r.config || {}); setMigracion(r.migracion !== false); setTocado(false); setError(''); } else setError(r.message || 'No se pudo cargar');
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
            <p className="pn-sub" style={{ marginTop: 8 }}>Marcar quién vende sin comisiones y las localidades «solo para algunos usuarios» se hace desde la web.</p>
          </div>
        </>
      )}
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
