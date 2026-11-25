import { useCallback, useEffect, useRef, useState } from 'react';
import { IonButton, IonIcon, IonTextarea, IonFooter, IonToolbar, IonRefresher, IonRefresherContent, IonModal, IonHeader, IonTitle, IonButtons, IonContent, IonInput, IonSpinner } from '@ionic/react';
import { useNavigate } from 'react-router-dom';
import { arrowBackOutline, sendOutline, addOutline, personOutline, closeOutline } from 'ionicons/icons';
import PanelPagina, { PaginaFija } from '../components/PanelPagina';
import { chatsLista, chatsMensajes, chatsResponder, chatsClientes, chatsIniciar } from '../utils/panelesAdmin';

/* Admin > Chats: conversación en vivo con los clientes que escriben desde el chat de la página.
   Misma página que la web: lista con filtros, conversación y respuesta. Al responder, el chat queda asignado a quien contesta. */

const FILTROS: { v: string; t: string; c: string }[] = [
  { v: 'sin_responder', t: 'Por atender', c: 'sin_responder' },
  { v: 'mios', t: 'Míos', c: 'mios' },
  { v: 'sin_asignar', t: 'Sin asignar', c: 'sin_asignar' },
  { v: 'activos', t: 'Activos', c: 'activos' },
  { v: 'cerrados', t: 'Cerrados', c: 'cerrados' },
];
const BADGE: Record<string, string> = { Abierto: 'pn-b-warning', 'En proceso': 'pn-b-info', Resuelto: 'pn-b-ok', Cerrado: 'pn-b-gris' };

const hace = (v?: string) => {
  const d = v ? new Date(v) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const min = Math.max(Math.round((Date.now() - d.getTime()) / 60000), 0);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 1440) return `hace ${Math.round(min / 60)} h`;
  return `hace ${Math.round(min / 1440)} d`;
};
const hora = (v?: string) => {
  const d = v ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
};

interface Chat {
  id: number; codigo: string; nombre?: string; categoria_texto?: string; estado: string; operador?: string; esperando_equipo?: boolean;
  ultimo_texto?: string; ultimo_de?: string; ultimo_en?: string; mio?: boolean; telefono?: string;
}
interface ClienteBusqueda { id: number; cedula: string; nombre: string; email?: string; telefono?: string; chat_activo?: number | null }
interface Mensaje { id: number; de: 'cliente' | 'equipo' | 'sistema'; autor?: string; texto: string; creado_en?: string }

/* "Nuevo chat": escribirle a una persona que no ha abierto un chat. Si ya tiene uno activo, el mensaje va en ese. */
const NuevoChat: React.FC<{ abierto: boolean; onCerrar: () => void; onCreado: (id: number) => void }> = ({ abierto, onCerrar, onCreado }) => {
  const [q, setQ] = useState('');
  const [resultados, setResultados] = useState<ClienteBusqueda[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [elegido, setElegido] = useState<ClienteBusqueda | null>(null);
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (abierto) { setQ(''); setResultados(null); setElegido(null); setTexto(''); setError(''); } }, [abierto]);
  useEffect(() => {
    if (!abierto || elegido) return;
    const b = q.trim();
    if (b.length < 3) { setResultados(null); return; }
    let vigente = true;
    const t = setTimeout(async () => {
      setBuscando(true);
      const r = await chatsClientes(b);
      if (!vigente) return;
      setBuscando(false);
      if (r.success) { setResultados(r.clientes || []); setError(''); } else setError(r.message || 'No se pudo buscar');
    }, 350);
    return () => { vigente = false; clearTimeout(t); };
  }, [q, abierto, elegido]);

  const enviar = async () => {
    if (!elegido || !texto.trim() || enviando) return;
    setEnviando(true); setError('');
    const r = await chatsIniciar(elegido.cedula, texto.trim());
    setEnviando(false);
    if (r.success) onCreado(r.id); else setError(r.message || 'No se pudo enviar el mensaje');
  };

  return (
    <IonModal isOpen={abierto} onDidDismiss={onCerrar}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Nuevo chat</IonTitle>
          <IonButtons slot="end"><IonButton onClick={onCerrar} aria-label="Cerrar"><IonIcon icon={closeOutline} slot="icon-only" /></IonButton></IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        <p className="pn-lbl">Escríbele a una persona aunque no haya abierto un chat. Le llega a su cuenta en la página (y por correo si tiene uno).</p>
        {!elegido ? (
          <>
            <IonInput fill="outline" placeholder="Nombre, cédula, correo o celular (mín. 3 letras)" value={q} onIonInput={(e) => setQ(String(e.detail.value || ''))} />
            {buscando && <div className="pn-vacio"><IonSpinner name="crescent" /></div>}
            {resultados && !buscando && resultados.length === 0 && <div className="pn-vacio">No se encontró a nadie con esos datos.</div>}
            {(resultados || []).map((c) => (
              <div key={c.id} className="pn-card pn-card-click" onClick={() => setElegido(c)}>
                <div className="pn-lista-item">
                  <div className="pn-lista-top"><span className="pn-lista-nombre">{c.nombre || 'Sin nombre'}</span>{c.chat_activo ? <span className="pn-badge pn-b-warning">Chat activo</span> : null}</div>
                  <span className="pn-lista-pie">{[c.cedula, c.email, c.telefono].filter(Boolean).join(' · ')}</span>
                </div>
              </div>
            ))}
          </>
        ) : (
          <>
            <div className="pn-card">
              <div className="pn-lista-top"><span className="pn-lista-nombre">{elegido.nombre}</span><IonButton size="small" fill="clear" onClick={() => setElegido(null)}>Cambiar</IonButton></div>
              <span className="pn-lista-pie">{[elegido.cedula, elegido.email, elegido.telefono].filter(Boolean).join(' · ')}</span>
            </div>
            {elegido.chat_activo ? <div className="pn-chat-sistema">Esta persona ya tiene un chat activo: tu mensaje irá en ese mismo chat.</div> : null}
            <IonTextarea fill="outline" autoGrow rows={4} placeholder="Escribe el mensaje…" value={texto} maxlength={1000} onIonInput={(e) => setTexto(String(e.detail.value || ''))} />
          </>
        )}
        {error && <div className="pn-error">{error}</div>}
        <IonButton expand="block" disabled={!elegido || !texto.trim() || enviando} onClick={enviar} style={{ marginTop: 12 }}>
          <IonIcon icon={sendOutline} slot="start" />{enviando ? 'Enviando…' : 'Enviar'}
        </IonButton>
      </IonContent>
    </IonModal>
  );
};

const ListaChats: React.FC = () => {
  const [filtro, setFiltro] = useState('sin_responder');
  const [datos, setDatos] = useState<{ chats: Chat[]; conteos: Record<string, number> } | null>(null);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState<number | null>(null);
  const [nuevoAbierto, setNuevoAbierto] = useState(false);
  const peticion = useRef(0);

  const cargar = useCallback(async () => {
    const mia = ++peticion.current;
    const r = await chatsLista({ filtro, limite: 50 });
    if (mia !== peticion.current) return;
    if (r.success) { setDatos({ chats: r.chats, conteos: r.conteos || {} }); setError(''); } else setError(r.message || 'No se pudieron cargar los chats');
  }, [filtro]);
  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { const i = setInterval(cargar, 15000); return () => clearInterval(i); }, [cargar]);

  if (abierto !== null) return <Conversacion id={abierto} onVolver={() => { setAbierto(null); cargar(); }} />;

  return (
    <PanelPagina titulo="Chats"
      acciones={<IonButton onClick={() => setNuevoAbierto(true)} aria-label="Nuevo chat"><IonIcon icon={addOutline} slot="start" />Nuevo</IonButton>}
      encabezado={(
        <div className="pn-chips">
          {FILTROS.map((f) => (
            <button key={f.v} className={`pn-chip ${filtro === f.v ? 'pn-chip-activo' : ''}`} onClick={() => setFiltro(f.v)}>{f.t} · {datos?.conteos?.[f.c] ?? 0}</button>
          ))}
        </div>
      )}>
      <IonRefresher slot="fixed" onIonRefresh={async (e) => { await cargar(); e.detail.complete(); }}><IonRefresherContent /></IonRefresher>
      <NuevoChat abierto={nuevoAbierto} onCerrar={() => setNuevoAbierto(false)} onCreado={(id) => { setNuevoAbierto(false); setFiltro('activos'); setAbierto(id); }} />
      {error && <div className="pn-error">{error}</div>}
      {!datos && !error && <div className="pn-vacio">Cargando…</div>}
      {datos && datos.chats.length === 0 && <div className="pn-vacio">{filtro === 'sin_responder' ? 'No hay chats esperando respuesta. 🎉' : 'No hay chats con ese filtro.'}</div>}
      {datos?.chats.map((c) => (
        <div key={c.id} className="pn-card pn-card-click" onClick={() => setAbierto(c.id)}>
          <div className="pn-lista-item">
            <div className="pn-lista-top">
              <span className="pn-lista-nombre">{c.nombre || 'Cliente'}</span>
              <span className={`pn-badge ${BADGE[c.estado] || 'pn-b-gris'}`}>{c.estado}</span>
            </div>
            {c.esperando_equipo && <span className="pn-badge pn-b-rojo" style={{ alignSelf: 'flex-start' }}>Espera respuesta</span>}
            <span className="pn-lista-texto">{c.ultimo_de === 'equipo' ? 'Tú/equipo: ' : ''}{c.ultimo_texto}</span>
            <span className="pn-lista-pie">{c.codigo} · {c.categoria_texto} · {hace(c.ultimo_en)}{c.operador ? ` · ${c.operador}` : ' · Sin asignar'}</span>
          </div>
        </div>
      ))}
    </PanelPagina>
  );
};

const Conversacion: React.FC<{ id: number; onVolver: () => void }> = ({ id, onVolver }) => {
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<(Chat & { cliente_en_linea?: boolean; cedula?: string }) | null>(null);
  const [mensajes, setMensajes] = useState<Mensaje[]>([]);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [texto, setTexto] = useState('');
  const [enviando, setEnviando] = useState(false);
  const ultimo = useRef(0);
  const fin = useRef<HTMLDivElement>(null);

  const cargar = useCallback(async (completo = false) => {
    const r = await chatsMensajes(id, completo ? 0 : ultimo.current);
    if (!r.success) { if (completo) setError(r.message || 'No se pudo cargar la conversación'); return; }
    setError('');
    setTicket(r.ticket);
    const nuevos: Mensaje[] = r.mensajes || [];
    if (!nuevos.length && !completo) return;
    setMensajes((prev) => {
      const base = completo ? [] : prev;
      const vistos = new Set(base.map((m) => `${m.de}-${m.id}`));
      return [...base, ...nuevos.filter((m) => !vistos.has(`${m.de}-${m.id}`))];
    });
    ultimo.current = nuevos.reduce((a, m) => Math.max(a, Number(m.id) || 0), completo ? 0 : ultimo.current);
  }, [id]);

  useEffect(() => { cargar(true); }, [cargar]);
  useEffect(() => { const i = setInterval(() => cargar(false), 5000); return () => clearInterval(i); }, [cargar]);
  useEffect(() => { fin.current?.scrollIntoView({ block: 'end' }); }, [mensajes]);

  const enviar = async () => {
    const t = texto.trim();
    if (!t || enviando) return;
    setEnviando(true);
    const r = await chatsResponder(id, t);
    setEnviando(false);
    if (r.success) { setTexto(''); cargar(false); } else setToast(r.message || 'No se pudo enviar la respuesta');
  };

  const terminado = ticket && (ticket.estado === 'Resuelto' || ticket.estado === 'Cerrado');
  return (
    <>
      <PanelPagina titulo={ticket ? `${ticket.nombre || 'Cliente'} · ${ticket.codigo}` : 'Chat'} toast={toast} onToastCerrado={() => setToast('')} cargando={!ticket && !error}
        acciones={<IonButton onClick={onVolver} aria-label="Volver a la lista"><IonIcon icon={arrowBackOutline} slot="start" />Chats</IonButton>}>
        {error && <div className="pn-error">{error}</div>}
        {ticket && (
          <div className="pn-card">
            <div className="pn-fila"><span className="pn-lbl">Estado</span><span className={`pn-badge ${BADGE[ticket.estado] || 'pn-b-gris'}`}>{ticket.estado}</span></div>
            <div className="pn-fila"><span className="pn-lbl">Atiende</span><span className="pn-val">{ticket.operador || 'Sin asignar (al responder te lo asignas)'}</span></div>
            {ticket.cliente_en_linea && <div className="pn-fila"><span className="pn-lbl">Cliente</span><span className="pn-badge pn-b-ok">En línea</span></div>}
            {ticket.cedula && (
              <IonButton size="small" fill="outline" onClick={() => navigate('/dashboard/buscar', { state: { cedula: ticket.cedula } })}>
                <IonIcon icon={personOutline} slot="start" />Perfil y compras
              </IonButton>
            )}
          </div>
        )}
        <div className="pn-chat">
          {mensajes.map((m) => m.de === 'sistema'
            ? <div key={`s-${m.id}`} className="pn-chat-sistema">{m.texto}</div>
            : (
              <div key={`${m.de}-${m.id}`} className={`pn-burbuja ${m.de === 'equipo' ? 'pn-burbuja-yo' : 'pn-burbuja-cliente'}`}>
                <span className="pn-burbuja-autor">{m.autor}</span>
                <p>{m.texto}</p>
                <time>{hora(m.creado_en)}</time>
              </div>
            ))}
          {terminado && <div className="pn-chat-sistema">Chat {ticket?.estado?.toLowerCase()}. Si le escribes, se vuelve a abrir.</div>}
          <div ref={fin} />
        </div>
      </PanelPagina>
      <IonFooter>
        <IonToolbar className="pn-redactar">
          <IonTextarea autoGrow rows={1} fill="outline" placeholder="Escribe tu respuesta…" value={texto} maxlength={1000} onIonInput={(e) => setTexto(String(e.detail.value || ''))} />
          <IonButton slot="end" className="pn-enviar" disabled={enviando || !texto.trim()} onClick={enviar} aria-label="Enviar respuesta"><IonIcon icon={sendOutline} slot="icon-only" /></IonButton>
        </IonToolbar>
      </IonFooter>
    </>
  );
};

const Chats: React.FC = () => <PaginaFija><ListaChats /></PaginaFija>;

export default Chats;
