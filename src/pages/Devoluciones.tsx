import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IonSearchbar, IonButton, IonTextarea, IonSelect, IonSelectOption, IonInput, IonCheckbox, IonRefresher, IonRefresherContent, IonAlert } from '@ionic/react';
import PanelPagina, { PaginaFija } from '../components/PanelPagina';
import { listarEventosAdmin, type EventoAdmin } from '../utils/adminEventos';
import { devolucionAdmin, devolucionAnularCompra, devolucionComentar, devolucionConfig, devolucionEstado, devolucionResolver, devolucionesResumen } from '../utils/panelesAdmin';
import { archivoABase64, type ArchivoBase64 } from '../utils/imagenes';

/* Admin > Devoluciones: si un evento se cancela, se habilita su página de devolución (/devolucion/<código> en la web) y aquí se
   gestionan las solicitudes: ver los datos de la cuenta, cambiar el estado y dejar comentarios. Misma página que la web (versión de bolsillo). */

const ESTADOS = ['Pendiente', 'En proceso', 'Documentos recibidos', 'Datos incorrectos', 'Devuelta', 'Rechazada', 'Cancelada'];
const BADGE: Record<string, string> = {
  Pendiente: 'pn-b-warning', 'En proceso': 'pn-b-info', 'Documentos recibidos': 'pn-b-info', 'Datos incorrectos': 'pn-b-rojo', Devuelta: 'pn-b-ok', Rechazada: 'pn-b-gris', Cancelada: 'pn-b-gris',
};
const dinero = (v: number) => `$${(Number(v) || 0).toFixed(2)}`;
const fecha = (v?: string) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };

interface Resumen { activo?: boolean; vencida?: boolean; total?: number; por_revisar?: number }

const ListaEventos: React.FC = () => {
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
  res_mensaje?: string; res_correo_estado?: string; res_correo_detalle?: string; res_link?: string;
  compra_ids?: string[]; compra_anulada?: boolean; anulacion_detalle?: string | null;
  ventas?: { id: number | string; entradas?: number; estado_pago?: string; incluye_otros_eventos?: boolean; liberada?: boolean }[];
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
            <div key={s.id} className={`pn-card pn-card-click ${s.estado === 'Devuelta' ? 'pn-card-resuelto' : ''}`} onClick={() => setSel(s)}>
              <div className="pn-lista-item">
                <div className="pn-lista-top"><span className="pn-lista-nombre">{s.codigo} · {s.nombre}</span><span className={`pn-badge ${BADGE[s.estado] || 'pn-b-gris'}`}>{s.estado === 'Devuelta' ? 'Resuelto ✓' : s.estado}</span></div>
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
  // Resolver (devuelta): valor, aviso por correo y comprobantes
  const [monto, setMonto] = useState(() => String(s.res_monto ?? s.valor ?? ''));
  const [mensaje, setMensaje] = useState(s.res_mensaje || '');
  const [avisar, setAvisar] = useState(true);
  const [archivos, setArchivos] = useState<ArchivoBase64[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);
  // Anular compra
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [confirmarAnular, setConfirmarAnular] = useState(false);
  const [confirmarResolver, setConfirmarResolver] = useState(false);

  const ejecutar = async (fn: () => Promise<{ success?: boolean; message?: string }>, ok: string, despues?: () => void) => {
    setGuardando(true);
    const r = await fn();
    setGuardando(false);
    if (r.success) { setToast(ok); despues?.(); onCambio(); } else setToast(r.message || 'No se pudo guardar');
  };

  const agregarArchivos = async (lista: FileList | null) => {
    if (!lista || !lista.length) return;
    setLeyendo(true);
    try {
      const nuevos: ArchivoBase64[] = [];
      for (const f of Array.from(lista)) nuevos.push(await archivoABase64(f));
      setArchivos((a) => [...a, ...nuevos].slice(0, 3));
      if (archivos.length + nuevos.length > 3) setToast('Máximo 3 comprobantes por vez.');
    } catch (e) { setToast(e instanceof Error ? e.message : 'No se pudo leer el archivo'); } finally { setLeyendo(false); if (entrada.current) entrada.current.value = ''; }
  };
  const resolver = () => ejecutar(
    () => devolucionResolver(codigoEvento, s.id, { nota, monto: monto.trim() === '' ? null : monto, mensaje: mensaje.trim(), notificar: avisar && !!s.email, comprobantes: archivos.map((a) => ({ nombre: a.nombre, datos: a.datos })) }),
    avisar && s.email ? 'Resuelta. El correo al cliente está en camino.' : 'Resuelta',
    () => { setArchivos([]); setNota(''); });
  const compras = (s.compra_ids || []).filter(Boolean);
  const estadoCompra = (id: string) => (s.ventas || []).find((v) => String(v.id) === String(id));
  const pendientes = compras.filter((id) => { const v = estadoCompra(id); return !(v?.liberada ?? v?.estado_pago === 'Anulado'); });
  const anular = () => ejecutar(
    () => devolucionAnularCompra(codigoEvento, s.id, pendientes.length > 1 ? elegidas.map(Number) : undefined),
    'Devolución completada: compra en estado Devuelto, asientos liberados con QR nuevo', () => setElegidas([]));
  const puedeResolver = !['Rechazada', 'Cancelada'].includes(s.estado);

  return (
    <PanelPagina titulo={`Solicitud ${s.codigo}`} toast={toast} onToastCerrado={() => setToast('')} acciones={<IonButton onClick={onVolver}>Lista</IonButton>}>
      <div className={`pn-card ${s.estado === 'Devuelta' ? 'pn-card-resuelto' : ''}`}>
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
      </div>
      {puedeResolver && (
        <div className="pn-card">
          <h3 className="pn-titulo">{s.estado === 'Devuelta' ? 'Devolución resuelta' : 'Resolver: ya se devolvió el dinero'}</h3>
          {s.estado === 'Devuelta' && s.res_correo_estado && <p className="pn-sub">Aviso por correo: <b>{s.res_correo_estado}</b>{s.res_correo_detalle ? ` · ${s.res_correo_detalle}` : ''}</p>}
          {s.res_link && <IonButton fill="outline" size="small" href={s.res_link} target="_blank">Ver la página del cliente</IonButton>}
          <div className="pn-campo"><IonInput type="number" inputmode="decimal" label="Valor devuelto $" labelPlacement="floating" fill="outline" value={monto} onIonInput={(e) => setMonto(String(e.detail.value || ''))} /></div>
          <div className="pn-campo"><IonTextarea label="Mensaje para el cliente (opcional)" labelPlacement="floating" fill="outline" rows={2} value={mensaje} onIonInput={(e) => setMensaje(String(e.detail.value || ''))} /></div>
          <div className="pn-switch"><span className="pn-switch-nombre">Avisarle por correo{s.email ? <span className="pn-lista-pie"> · {s.email}</span> : <span className="pn-lista-pie"> · sin correo</span>}</span><IonCheckbox checked={avisar && !!s.email} disabled={!s.email} onIonChange={(e) => setAvisar(e.detail.checked)} /></div>
          <div className="pn-campo">
            <input ref={entrada} type="file" accept="image/*,application/pdf" multiple style={{ display: 'none' }} onChange={(e) => agregarArchivos(e.target.files)} />
            <IonButton expand="block" fill="outline" disabled={leyendo || archivos.length >= 3} onClick={() => entrada.current?.click()}>{leyendo ? 'Preparando…' : 'Agregar foto del comprobante'}</IonButton>
            {archivos.map((a, i) => <div key={i} className="pn-switch"><span className="pn-switch-nombre">{a.nombre}</span><IonButton size="small" fill="clear" color="danger" onClick={() => setArchivos((l) => l.filter((_, j) => j !== i))}>Quitar</IonButton></div>)}
            <p className="pn-sub" style={{ marginTop: 6 }}>Hasta 3 fotos o PDF. El cliente las ve en su página privada y en el correo.</p>
          </div>
          <IonButton expand="block" className="pn-boton-p pn-campo" disabled={guardando || leyendo} onClick={() => setConfirmarResolver(true)}>{s.estado === 'Devuelta' ? 'Guardar y avisar de nuevo' : 'Marcar como Devuelta'}</IonButton>
        </div>
      )}

      {s.estado === 'Devuelta' && (
        <div className="pn-card">
          <h3 className="pn-titulo">Compra del cliente</h3>
          {s.compra_anulada ? (
            <><p className="pn-sub">Devolución completada: la compra está en estado Devuelto, sus asientos quedaron libres con QR nuevo.</p>{s.anulacion_detalle && <div className="pn-cuerpo" style={{ marginTop: 8 }}>{s.anulacion_detalle}</div>}</>
          ) : (
            <>
              <p className="pn-sub">La compra ya quedó en estado Devuelto (no suma en las ventas y se registra en la Factura Final). «Devolución completada» cierra la compra: libera los asientos y cambia el QR de sus entradas (las viejas dejan de servir). Hazlo cuando ya devolviste el dinero.</p>
              {pendientes.length > 1 && pendientes.map((id) => {
                const v = estadoCompra(id);
                return <div key={id} className="pn-switch"><span className="pn-switch-nombre">Compra {id}{v?.entradas ? <span className="pn-lista-pie"> · {v.entradas} entrada{v.entradas === 1 ? '' : 's'}</span> : null}{v?.incluye_otros_eventos ? <span className="pn-lista-pie"> · incluye otros eventos</span> : null}</span><IonCheckbox checked={elegidas.includes(id)} onIonChange={(e) => setElegidas((x) => (e.detail.checked ? [...new Set([...x, id])] : x.filter((i) => i !== id)))} /></div>;
              })}
              <IonButton expand="block" color="success" className="pn-campo" disabled={guardando || pendientes.length === 0 || (pendientes.length > 1 && elegidas.length === 0)} onClick={() => setConfirmarAnular(true)}>Devolución completada</IonButton>
              {pendientes.length === 0 && <p className="pn-sub" style={{ marginTop: 6 }}>Esta solicitud no tiene compras pendientes por completar.</p>}
            </>
          )}
        </div>
      )}

      <div className="pn-card">
        <h3 className="pn-titulo">Comentarios del equipo</h3>
        <div className="pn-historial">
          {(s.comentarios || []).length === 0 && <p className="pn-sub">Sin comentarios.</p>}
          {(s.comentarios || []).map((c, i) => <div key={i} className="pn-nota"><div className="pn-nota-texto">{c.comentario}</div><div className="pn-nota-pie">{c.autor} · {fecha(c.creado_en)}</div></div>)}
        </div>
        <div className="pn-campo"><IonTextarea label="Agregar un comentario" labelPlacement="floating" fill="outline" rows={2} value={comentario} maxlength={1000} onIonInput={(e) => setComentario(String(e.detail.value || ''))} /></div>
        <IonButton expand="block" className="pn-boton-p pn-campo" disabled={guardando || !comentario.trim()} onClick={() => ejecutar(() => devolucionComentar(codigoEvento, s.id, comentario), 'Comentario guardado', () => setComentario(''))}>Guardar comentario</IonButton>
      </div>
      <IonAlert isOpen={confirmarResolver} onDidDismiss={() => setConfirmarResolver(false)} header="¿Marcar como devuelta?"
        message={`${monto ? `Valor $${monto}. ` : ''}${avisar && s.email ? `Se le avisará a ${s.email}.` : 'No se le avisará por correo.'}`}
        buttons={[{ text: 'No', role: 'cancel' }, { text: 'Sí', handler: () => { resolver(); } }]} />
      <IonAlert isOpen={confirmarAnular} onDidDismiss={() => setConfirmarAnular(false)} header="¿Devolución completada?"
        message="La compra queda en estado Devuelto, se liberan los asientos y las entradas viejas dejan de servir. No se puede deshacer."
        buttons={[{ text: 'No', role: 'cancel' }, { text: 'Sí, completar', role: 'destructive', handler: () => { anular(); } }]} />
    </PanelPagina>
  );
};

const Devoluciones: React.FC = () => <PaginaFija><ListaEventos /></PaginaFija>;

export default Devoluciones;
