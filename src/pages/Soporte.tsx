import { useCallback, useEffect, useRef, useState } from 'react';
import { IonSearchbar, IonButton, IonIcon, IonTextarea, IonCheckbox, IonSelect, IonSelectOption, IonInput, IonRefresher, IonRefresherContent } from '@ionic/react';
import { logoWhatsapp, arrowBackOutline } from 'ionicons/icons';
import PanelPagina from '../components/PanelPagina';
import { soporteComentar, soporteDetalle, soporteEstado, soporteLista, soporteTomar } from '../utils/panelesAdmin';

/* Admin > Soporte: tickets que los clientes crean desde el chat de WhatsApp de Tickets Ecuador ("Pagos y problemas").
   Misma página que la web: ver, tomar, cambiar el estado y comentar (interno o visible para el cliente). */

const ESTADOS = ['Abierto', 'En proceso', 'Resuelto', 'Cerrado'];
const FILTROS = [{ v: 'activos', t: 'Por atender' }, ...ESTADOS.map((e) => ({ v: e, t: e })), { v: '', t: 'Todos' }];
const BADGE: Record<string, string> = { Abierto: 'pn-b-warning', 'En proceso': 'pn-b-info', Resuelto: 'pn-b-ok', Cerrado: 'pn-b-gris' };
const AYUDA: Record<string, string> = {
  Abierto: 'Recién llegado, nadie lo ha tomado.', 'En proceso': 'Un asesor lo está revisando.', Resuelto: 'Ya se atendió el caso del cliente.', Cerrado: 'Terminado, sin más que hacer.',
};
const TIPO_NOTA: Record<string, { t: string; c: string }> = {
  nota: { t: 'Nota interna', c: '' }, publica: { t: 'Visible para el cliente', c: 'pn-nota-publica' }, estado: { t: 'Estado', c: 'pn-nota-estado' }, sistema: { t: 'Sistema', c: '' },
};

const hace = (v?: string) => {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const min = Math.max(Math.round((Date.now() - d.getTime()) / 60000), 0);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
};
const fecha = (v?: string) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
};
const enlaceWhatsApp = (tel?: string) => {
  const n = String(tel || '').replace(/\D/g, '');
  if (n.length < 7) return '';
  return `https://wa.me/${n.startsWith('593') ? n : n.startsWith('0') ? `593${n.slice(1)}` : n}`;
};

interface Ticket {
  id: number; codigo: string; categoria_texto: string; cedula?: string; nombre?: string; email?: string; telefono?: string; codigoEvento?: string;
  descripcion: string; estado: string; operador?: string; id_operador?: number; creado_en?: string;
}
interface Nota { id: number; autor: string; tipo: string; texto: string; creado_en: string }

const Soporte: React.FC = () => {
  const [estado, setEstado] = useState('activos');
  const [texto, setTexto] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const [datos, setDatos] = useState<{ tickets: Ticket[]; conteos: Record<string, number>; total: number } | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const peticion = useRef(0);

  useEffect(() => { const t = setTimeout(() => setBusqueda(texto.trim()), 350); return () => clearTimeout(t); }, [texto]);

  const cargar = useCallback(async () => {
    const mia = ++peticion.current;
    const r = await soporteLista({ estado, q: busqueda, limite: 50 });
    if (mia !== peticion.current) return;
    if (r.success) { setDatos({ tickets: r.tickets, conteos: r.conteos, total: r.total }); setError(''); } else setError(r.message || 'No se pudieron cargar los tickets');
  }, [estado, busqueda]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { const i = setInterval(cargar, 60000); return () => clearInterval(i); }, [cargar]);

  const num = (v: string) => {
    const c = datos?.conteos || {};
    return v === 'activos' ? (c.Abierto || 0) + (c['En proceso'] || 0) : v === '' ? Object.values(c).reduce((a, b) => a + b, 0) : c[v] || 0;
  };

  if (abierto !== null) return <DetalleTicket id={abierto} onVolver={() => { setAbierto(null); cargar(); }} />;

  return (
    <PanelPagina titulo="Soporte" toast={toast} onToastCerrado={() => setToast('')}
      encabezado={(
        <>
          <div className="pn-chips">
            {FILTROS.map((f) => (
              <button key={f.v || 'todos'} className={`pn-chip ${estado === f.v ? 'pn-chip-activo' : ''}`} onClick={() => setEstado(f.v)}>{f.t} · {num(f.v)}</button>
            ))}
          </div>
          <IonSearchbar value={texto} onIonInput={(e) => setTexto(String(e.detail.value || ''))} placeholder="Código, nombre, cédula, celular o texto" debounce={0} />
        </>
      )}>
      <IonRefresher slot="fixed" onIonRefresh={async (e) => { await cargar(); e.detail.complete(); }}><IonRefresherContent /></IonRefresher>
      {error && <div className="pn-error">{error}</div>}
      {!datos && !error && <div className="pn-vacio">Cargando…</div>}
      {datos && datos.tickets.length === 0 && <div className="pn-vacio">{busqueda || estado !== 'activos' ? 'No hay tickets con ese filtro.' : 'No hay tickets por atender. 🎉'}</div>}
      {datos?.tickets.map((t) => (
        <div key={t.id} className="pn-card pn-card-click" onClick={() => setAbierto(t.id)}>
          <div className="pn-lista-item">
            <div className="pn-lista-top">
              <span className="pn-lista-nombre">{t.codigo} · {t.nombre || 'Sin nombre'}</span>
              <span className={`pn-badge ${BADGE[t.estado] || 'pn-b-gris'}`}>{t.estado}</span>
            </div>
            <span className="pn-lista-texto">{t.descripcion}</span>
            <span className="pn-lista-pie">{t.categoria_texto} · {t.telefono || t.cedula || ''} · {hace(t.creado_en)}{t.operador ? ` · ${t.operador}` : ''}</span>
          </div>
        </div>
      ))}
    </PanelPagina>
  );
};

const DetalleTicket: React.FC<{ id: number; onVolver: () => void }> = ({ id, onVolver }) => {
  const [d, setD] = useState<{ ticket: Ticket; notas: Nota[] } | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [estado, setEstado] = useState('');
  const [nota, setNota] = useState('');
  const [comentario, setComentario] = useState('');
  const [publico, setPublico] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    const r = await soporteDetalle(id);
    if (r.success) { setD({ ticket: r.ticket, notas: r.notas }); setEstado(r.ticket.estado); setError(''); } else setError(r.message || 'No se pudo cargar el ticket');
  }, [id]);
  useEffect(() => { cargar(); }, [cargar]);

  const ejecutar = async (accion: () => Promise<{ success?: boolean; message?: string }>, ok: string, despues?: () => void) => {
    setGuardando(true);
    const r = await accion();
    setGuardando(false);
    if (r.success) { setToast(ok); despues?.(); cargar(); } else setToast(r.message || 'No se pudo guardar');
  };

  const t = d?.ticket;
  const wa = t ? enlaceWhatsApp(t.telefono) : '';
  return (
    <PanelPagina titulo={t ? `Ticket ${t.codigo}` : 'Ticket'} toast={toast} onToastCerrado={() => setToast('')} cargando={!d && !error}
      acciones={<IonButton onClick={onVolver} aria-label="Volver a la lista"><IonIcon icon={arrowBackOutline} slot="start" />Lista</IonButton>}>
      {error && <div className="pn-error">{error}</div>}
      {t && d && (
        <>
          <div className="pn-card">
            <div className="pn-fila"><span className="pn-lbl">Estado</span><span className={`pn-badge ${BADGE[t.estado] || 'pn-b-gris'}`}>{t.estado}</span></div>
            {[['Cliente', t.nombre], ['Cédula', t.cedula], ['Correo', t.email], ['Celular', t.telefono], ['Tipo', t.categoria_texto], ['Evento', t.codigoEvento], ['Creado', fecha(t.creado_en)], ['Responsable', t.operador]]
              .filter(([, v]) => v).map(([k, v]) => <div key={k as string} className="pn-fila"><span className="pn-lbl">{k}</span><span className="pn-val">{v}</span></div>)}
            {wa && <IonButton expand="block" fill="outline" href={wa} target="_blank" className="pn-campo"><IonIcon icon={logoWhatsapp} slot="start" />Escribir por WhatsApp</IonButton>}
          </div>

          <div className="pn-card">
            <h3 className="pn-titulo">Lo que escribió el cliente</h3>
            <div className="pn-cuerpo">{t.descripcion}</div>
          </div>

          <div className="pn-card">
            <h3 className="pn-titulo">Gestión</h3>
            {!t.id_operador && t.estado !== 'Resuelto' && t.estado !== 'Cerrado' && (
              <IonButton expand="block" className="pn-boton-p" disabled={guardando} onClick={() => ejecutar(() => soporteTomar(t.id), 'Ticket tomado')}>Tomar este ticket</IonButton>
            )}
            <div className="pn-campo">
              <IonSelect label="Estado" labelPlacement="floating" fill="outline" value={estado} onIonChange={(e) => setEstado(String(e.detail.value))} interface="action-sheet">
                {ESTADOS.map((e) => <IonSelectOption key={e} value={e}>{e}</IonSelectOption>)}
              </IonSelect>
              <p className="pn-sub" style={{ marginTop: 4 }}>{AYUDA[estado]}</p>
            </div>
            <div className="pn-campo"><IonInput label="Nota del cambio (opcional)" labelPlacement="floating" fill="outline" value={nota} maxlength={600} onIonInput={(e) => setNota(String(e.detail.value || ''))} /></div>
            <IonButton expand="block" fill="outline" disabled={guardando || estado === t.estado} onClick={() => ejecutar(() => soporteEstado(t.id, estado, nota), 'Estado actualizado', () => setNota(''))}>Cambiar estado</IonButton>
          </div>

          <div className="pn-card">
            <h3 className="pn-titulo">Historial</h3>
            <div className="pn-historial">
              {d.notas.length === 0 && <p className="pn-sub">Sin movimientos todavía.</p>}
              {d.notas.map((n) => (
                <div key={n.id} className={`pn-nota ${(TIPO_NOTA[n.tipo] || TIPO_NOTA.nota).c}`}>
                  <div className="pn-nota-texto">{n.texto}</div>
                  <div className="pn-nota-pie">{(TIPO_NOTA[n.tipo] || TIPO_NOTA.nota).t} · {n.autor} · {fecha(n.creado_en)}</div>
                </div>
              ))}
            </div>
            <div className="pn-campo"><IonTextarea label="Agregar un comentario" labelPlacement="floating" fill="outline" rows={3} value={comentario} maxlength={1000} onIonInput={(e) => setComentario(String(e.detail.value || ''))} /></div>
            <div className="pn-switch"><span className="pn-switch-nombre">Que lo vea el cliente cuando consulte su ticket en el chat</span><IonCheckbox checked={publico} onIonChange={(e) => setPublico(e.detail.checked)} /></div>
            <IonButton expand="block" className="pn-boton-p" disabled={guardando || !comentario.trim()}
              onClick={() => ejecutar(() => soporteComentar(t.id, comentario, publico), 'Comentario guardado', () => { setComentario(''); setPublico(false); })}>Guardar comentario</IonButton>
          </div>
        </>
      )}
    </PanelPagina>
  );
};

export default Soporte;
