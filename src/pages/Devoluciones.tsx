import { useCallback, useEffect, useMemo, useState } from 'react';
import { IonSearchbar, IonButton, IonTextarea, IonSelect, IonSelectOption, IonInput, IonCheckbox, IonRefresher, IonRefresherContent } from '@ionic/react';
import PanelPagina from '../components/PanelPagina';
import { listarEventosAdmin, type EventoAdmin } from '../utils/adminEventos';
import { devolucionAdmin, devolucionComentar, devolucionConfig, devolucionEstado, devolucionesResumen } from '../utils/panelesAdmin';

/* Admin > Devoluciones: si un evento se cancela, se habilita su página de devolución (/devolucion/<código> en la web) y aquí se
   gestionan las solicitudes: ver los datos de la cuenta, cambiar el estado y dejar comentarios. Misma página que la web (versión de bolsillo). */

const ESTADOS = ['Pendiente', 'En proceso', 'Documentos recibidos', 'Datos incorrectos', 'Devuelta', 'Rechazada', 'Cancelada'];
const BADGE: Record<string, string> = {
  Pendiente: 'pn-b-warning', 'En proceso': 'pn-b-info', 'Documentos recibidos': 'pn-b-info', 'Datos incorrectos': 'pn-b-rojo', Devuelta: 'pn-b-ok', Rechazada: 'pn-b-gris', Cancelada: 'pn-b-gris',
};
const dinero = (v: number) => `$${(Number(v) || 0).toFixed(2)}`;
const fecha = (v?: string) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };

interface Resumen { activo?: boolean; vencida?: boolean; total?: number; por_revisar?: number }

const Devoluciones: React.FC = () => {
  const [eventos, setEventos] = useState<EventoAdmin[] | null>(null);
  const [resumen, setResumen] = useState<Record<string, Resumen>>({});
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<EventoAdmin | null>(null);

  const cargar = useCallback(async () => {
    try {
      const [ev, r] = await Promise.all([listarEventosAdmin(), devolucionesResumen()]);
      // Los cancelados primero: son los que normalmente piden devolución
      setEventos([...ev].sort((a, b) => Number(b.estado === 'CANCELADO') - Number(a.estado === 'CANCELADO') || String(b.fechaConcierto).localeCompare(String(a.fechaConcierto))));
      if (r.success) { setResumen(r.data || {}); setError(''); } else setError(r.message || 'No se pudo cargar el resumen');
    } catch { setError('No se pudieron cargar los eventos.'); setEventos([]); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  const filtrados = useMemo(() => (eventos || []).filter((e) => e.nombreConcierto?.toLowerCase().includes(busqueda.toLowerCase())), [eventos, busqueda]);

  if (abierto) return <DetalleEvento evento={abierto} onVolver={() => { setAbierto(null); cargar(); }} />;

  return (
    <PanelPagina titulo="Devoluciones" cargando={!eventos && !error}
      encabezado={<IonSearchbar value={busqueda} onIonInput={(e) => setBusqueda(String(e.detail.value || ''))} placeholder="Buscar evento" />}>
      <IonRefresher slot="fixed" onIonRefresh={async (e) => { await cargar(); e.detail.complete(); }}><IonRefresherContent /></IonRefresher>
      <p className="pn-sub">Si un evento se cancela, habilita su página de devolución: los clientes ponen su cédula, se verifica su compra y dejan los datos de su cuenta.</p>
      {error && <div className="pn-error">{error}</div>}
      {filtrados.length === 0 && eventos && <div className="pn-vacio">No hay eventos.</div>}
      {filtrados.map((e) => {
        const r = resumen[e.codigoEvento] || {};
        return (
          <div key={e.codigoEvento} className="pn-card pn-card-click" onClick={() => setAbierto(e)}>
            <div className="pn-lista-item">
              <div className="pn-lista-top">
                <span className="pn-lista-nombre">{e.nombreConcierto}</span>
                <span className={`pn-badge ${e.estado === 'CANCELADO' ? 'pn-b-rojo' : 'pn-b-gris'}`}>{e.estado}</span>
              </div>
              <span className="pn-lista-pie">
                {r.activo ? (r.vencida ? 'Plazo vencido' : 'Devolución habilitada') : 'Devolución apagada'}
                {r.total ? ` · ${r.total} solicitud${r.total === 1 ? '' : 'es'}` : ''}{r.por_revisar ? ` · ${r.por_revisar} por revisar` : ''}
              </span>
            </div>
          </div>
        );
      })}
    </PanelPagina>
  );
};

interface Solicitud {
  id: number; codigo: string; nombre: string; cedula: string; email: string; telefono: string; cantidad: number; valor: number; banco: string; tipo_cuenta: string; numero_cuenta: string;
  titular: string; cedula_titular: string; titular_distinto?: boolean; estado: string; nota?: string; fecha?: string; observacion?: string; res_monto?: number | null;
  comentarios?: { autor: string; comentario: string; creado_en: string }[];
}

const DetalleEvento: React.FC<{ evento: EventoAdmin; onVolver: () => void }> = ({ evento, onVolver }) => {
  const [d, setD] = useState<{ config: { activo: boolean; motivo: string; instrucciones: string; fecha_limite: string; vencida?: boolean }; resumen: { total: number; valor_por_devolver: number; valor_devuelto: number }; solicitudes: Solicitud[] } | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [filtro, setFiltro] = useState('');
  const [sel, setSel] = useState<Solicitud | null>(null);
  const [cfg, setCfg] = useState({ activo: false, motivo: '', instrucciones: '', fecha_limite: '' });
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await devolucionAdmin(evento.codigoEvento);
    if (r.success) {
      setD({ config: r.config, resumen: r.resumen, solicitudes: r.solicitudes });
      setCfg({ activo: !!r.config.activo, motivo: r.config.motivo || '', instrucciones: r.config.instrucciones || '', fecha_limite: r.config.fecha_limite || '' });
      setError('');
      setSel((actual) => (actual ? (r.solicitudes as Solicitud[]).find((s) => s.id === actual.id) || null : null));
    } else setError(r.message || 'No se pudo cargar');
  }, [evento.codigoEvento]);
  useEffect(() => { cargar(); }, [cargar]);

  const guardarConfig = async () => {
    setGuardando(true);
    const r = await devolucionConfig(evento.codigoEvento, cfg);
    setGuardando(false);
    setToast(r.success ? 'Configuración guardada' : r.message || 'No se pudo guardar');
    if (r.success) cargar();
  };

  const lista = (d?.solicitudes || []).filter((s) => !filtro || s.estado === filtro);

  if (sel) return <DetalleSolicitud solicitud={sel} codigoEvento={evento.codigoEvento} onVolver={() => setSel(null)} onCambio={cargar} />;

  return (
    <PanelPagina titulo={evento.nombreConcierto} volverA={undefined} toast={toast} onToastCerrado={() => setToast('')} cargando={!d && !error}
      acciones={<IonButton onClick={onVolver}>Eventos</IonButton>}>
      {error && <div className="pn-error">{error}</div>}
      {d && (
        <>
          <div className="pn-card">
            <h3 className="pn-titulo">Página de devolución</h3>
            <div className="pn-switch"><span className="pn-switch-nombre">Habilitada (los clientes pueden pedir la devolución)</span><IonCheckbox checked={cfg.activo} onIonChange={(e) => setCfg({ ...cfg, activo: e.detail.checked })} /></div>
            <div className="pn-campo"><IonInput label="Motivo (lo ve el cliente)" labelPlacement="floating" fill="outline" value={cfg.motivo} maxlength={500} onIonInput={(e) => setCfg({ ...cfg, motivo: String(e.detail.value || '') })} /></div>
            <div className="pn-campo"><IonTextarea label="Instrucciones (plazos, contacto)" labelPlacement="floating" fill="outline" rows={3} value={cfg.instrucciones} onIonInput={(e) => setCfg({ ...cfg, instrucciones: String(e.detail.value || '') })} /></div>
            <div className="pn-campo"><IonInput type="date" label="Último día para pedirla" labelPlacement="floating" fill="outline" value={cfg.fecha_limite} onIonInput={(e) => setCfg({ ...cfg, fecha_limite: String(e.detail.value || '') })} /></div>
            <IonButton expand="block" className="pn-boton-p pn-campo" disabled={guardando} onClick={guardarConfig}>Guardar</IonButton>
            {d.config.vencida && <div className="pn-aviso" style={{ marginTop: 10 }}>El plazo ya venció: la página no se ve en la web.</div>}
          </div>

          <div className="pn-card">
            <div className="pn-fila"><span className="pn-lbl">Solicitudes</span><span className="pn-val">{d.resumen.total}</span></div>
            <div className="pn-fila"><span className="pn-lbl">Por devolver</span><span className="pn-val">{dinero(d.resumen.valor_por_devolver)}</span></div>
            <div className="pn-fila"><span className="pn-lbl">Devuelto</span><span className="pn-val">{dinero(d.resumen.valor_devuelto)}</span></div>
          </div>

          <div className="pn-card" style={{ padding: '10px 0 4px' }}>
            <div className="pn-chips" style={{ background: 'transparent' }}>
              {['', ...ESTADOS].map((e) => <button key={e || 'todas'} className={`pn-chip ${filtro === e ? 'pn-chip-activo' : ''}`} onClick={() => setFiltro(e)}>{e || 'Todas'}</button>)}
            </div>
          </div>
          {lista.length === 0 && <div className="pn-vacio">No hay solicitudes.</div>}
          {lista.map((s) => (
            <div key={s.id} className="pn-card pn-card-click" onClick={() => setSel(s)}>
              <div className="pn-lista-item">
                <div className="pn-lista-top"><span className="pn-lista-nombre">{s.codigo} · {s.nombre}</span><span className={`pn-badge ${BADGE[s.estado] || 'pn-b-gris'}`}>{s.estado}</span></div>
                <span className="pn-lista-pie">{s.cantidad} entrada{s.cantidad === 1 ? '' : 's'} · {dinero(s.valor)} · {s.banco} · {fecha(s.fecha)}</span>
                {s.titular_distinto && <span className="pn-lista-pie" style={{ color: '#7a5200' }}>La cuenta es de otra persona</span>}
              </div>
            </div>
          ))}
        </>
      )}
    </PanelPagina>
  );
};

const DetalleSolicitud: React.FC<{ solicitud: Solicitud; codigoEvento: string; onVolver: () => void; onCambio: () => void }> = ({ solicitud: s, codigoEvento, onVolver, onCambio }) => {
  const [estado, setEstado] = useState(s.estado);
  const [nota, setNota] = useState('');
  const [comentario, setComentario] = useState('');
  const [toast, setToast] = useState('');
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setEstado(s.estado); }, [s.estado]);

  const ejecutar = async (fn: () => Promise<{ success?: boolean; message?: string }>, ok: string, despues?: () => void) => {
    setGuardando(true);
    const r = await fn();
    setGuardando(false);
    if (r.success) { setToast(ok); despues?.(); onCambio(); } else setToast(r.message || 'No se pudo guardar');
  };

  return (
    <PanelPagina titulo={`Solicitud ${s.codigo}`} toast={toast} onToastCerrado={() => setToast('')} acciones={<IonButton onClick={onVolver}>Lista</IonButton>}>
      <div className="pn-card">
        <div className="pn-fila"><span className="pn-lbl">Estado</span><span className={`pn-badge ${BADGE[s.estado] || 'pn-b-gris'}`}>{s.estado}</span></div>
        {([['Cliente', s.nombre], ['Cédula', s.cedula], ['Correo', s.email], ['Celular', s.telefono], ['Entradas', `${s.cantidad} · ${dinero(s.valor)}`], ['Recibió', s.res_monto != null ? dinero(s.res_monto) : '']] as [string, string][])
          .filter(([, v]) => v).map(([k, v]) => <div key={k} className="pn-fila"><span className="pn-lbl">{k}</span><span className="pn-val">{v}</span></div>)}
      </div>
      <div className="pn-card">
        <h3 className="pn-titulo">Cuenta para devolver</h3>
        {([['Banco', s.banco], ['Tipo', s.tipo_cuenta], ['N.º de cuenta', s.numero_cuenta], ['Titular', s.titular], ['Cédula del titular', s.cedula_titular]] as [string, string][])
          .map(([k, v]) => <div key={k} className="pn-fila"><span className="pn-lbl">{k}</span><span className="pn-val">{v}</span></div>)}
        {s.titular_distinto && <div className="pn-aviso" style={{ marginTop: 10 }}>La cuenta es de otra persona: conviene revisarlo antes de transferir.</div>}
        {s.observacion && <div className="pn-cuerpo" style={{ marginTop: 10 }}>{s.observacion}</div>}
      </div>
      <div className="pn-card">
        <h3 className="pn-titulo">Gestión</h3>
        <div className="pn-campo">
          <IonSelect label="Estado" labelPlacement="floating" fill="outline" value={estado} onIonChange={(e) => setEstado(String(e.detail.value))} interface="action-sheet">
            {ESTADOS.map((e) => <IonSelectOption key={e} value={e}>{e}</IonSelectOption>)}
          </IonSelect>
        </div>
        <div className="pn-campo"><IonInput label="Nota (opcional)" labelPlacement="floating" fill="outline" value={nota} maxlength={500} onIonInput={(e) => setNota(String(e.detail.value || ''))} /></div>
        <IonButton expand="block" fill="outline" className="pn-campo" disabled={guardando || estado === s.estado} onClick={() => ejecutar(() => devolucionEstado(codigoEvento, s.id, estado, nota), 'Estado actualizado', () => setNota(''))}>Cambiar estado</IonButton>
        <p className="pn-sub" style={{ marginTop: 8 }}>Para resolver con comprobante y aviso por correo, o anular la compra, usa la página web de Devoluciones.</p>
      </div>
      <div className="pn-card">
        <h3 className="pn-titulo">Comentarios del equipo</h3>
        <div className="pn-historial">
          {(s.comentarios || []).length === 0 && <p className="pn-sub">Sin comentarios.</p>}
          {(s.comentarios || []).map((c, i) => <div key={i} className="pn-nota"><div className="pn-nota-texto">{c.comentario}</div><div className="pn-nota-pie">{c.autor} · {fecha(c.creado_en)}</div></div>)}
        </div>
        <div className="pn-campo"><IonTextarea label="Agregar un comentario" labelPlacement="floating" fill="outline" rows={2} value={comentario} maxlength={1000} onIonInput={(e) => setComentario(String(e.detail.value || ''))} /></div>
        <IonButton expand="block" className="pn-boton-p pn-campo" disabled={guardando || !comentario.trim()} onClick={() => ejecutar(() => devolucionComentar(codigoEvento, s.id, comentario), 'Comentario guardado', () => setComentario(''))}>Guardar comentario</IonButton>
      </div>
    </PanelPagina>
  );
};

export default Devoluciones;
