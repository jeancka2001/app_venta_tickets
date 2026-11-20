import { useCallback, useEffect, useRef, useState } from 'react';
import { IonButton, IonInput, IonTextarea, IonSelect, IonSelectOption, IonSegment, IonSegmentButton, IonLabel, IonAlert, IonRefresher, IonRefresherContent, IonCheckbox, IonModal, IonHeader, IonToolbar, IonTitle, IonContent, IonButtons } from '@ionic/react';
import PanelPagina from '../components/PanelPagina';
import { correosAccion, correosAudiencia, correosCampanas, correosEnviar, correosInicio, correosPrueba } from '../utils/panelesAdmin';
import { construirCorreo, PARTES_INICIALES, type PartesCorreo } from '../utils/plantillaCorreo';
import { subirImagenEvento } from '../utils/adminEventos';

/* Admin > Correos masivos: avisos por correo a los clientes de un evento (compraron / no compraron / todos) o a una lista de correos.
   Versión de bolsillo de la página web: mensaje en texto simple (se arma el HTML solo), prueba a tus correos antes de enviar y seguimiento de cada envío. */

interface EventoCorreo { codigoEvento: string; nombre: string; fecha: string; estado: string }
interface Campana { id: number; asunto: string; estado: string; es_prueba: boolean; total: number; enviados: number; rechazados: number; errores: number; pendientes: number; creado_en: string; activa?: boolean }

const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Texto simple -> HTML: cada línea en blanco separa un párrafo, los saltos de línea se respetan
const aHtml = (t: string) => t.trim().split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px;font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#1a1e52">${escapar(p).replace(/\n/g, '<br>')}</p>`).join('');
const correosDe = (t: string) => [...new Set(t.split(/[\s,;]+/).map((c) => c.trim()).filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c)))];
const fecha = (v?: string) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-EC', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''; };
const BADGE: Record<string, string> = { Enviando: 'pn-b-info', Terminada: 'pn-b-ok', Pausada: 'pn-b-warning', Cancelada: 'pn-b-gris' };

const CorreosMasivos: React.FC = () => {
  const [vista, setVista] = useState<'nuevo' | 'envios'>('nuevo');
  const [inicio, setInicio] = useState<{ servicio: boolean; eventos: EventoCorreo[]; registrados: number } | null>(null);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [tipo, setTipo] = useState<'eventos' | 'lista'>('eventos');
  const [quien, setQuien] = useState('compraron');
  const [eventos, setEventos] = useState<string[]>([]);
  const [todosEventos, setTodosEventos] = useState(false);
  const [lista, setLista] = useState('');
  const [asunto, setAsunto] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [modoMsg, setModoMsg] = useState<'texto' | 'diseno'>('texto');
  const [partes, setPartes] = useState<PartesCorreo>({ ...PARTES_INICIALES });
  const [vistaPrevia, setVistaPrevia] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const archivoImagen = useRef<HTMLInputElement>(null);
  const [prueba, setPrueba] = useState('');
  const [cuenta, setCuenta] = useState<{ total: number; invalidos: number } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const [campanas, setCampanas] = useState<Campana[]>([]);

  const cargarInicio = useCallback(async () => {
    const r = await correosInicio();
    if (r.success) { setInicio({ servicio: !!r.servicio, eventos: r.eventos || [], registrados: r.registrados || 0 }); setError(''); } else setError(r.message || 'No se pudo cargar');
  }, []);
  const cargarCampanas = useCallback(async () => { const r = await correosCampanas(); if (r.success) setCampanas(r.data || []); }, []);
  useEffect(() => { cargarInicio(); cargarCampanas(); }, [cargarInicio, cargarCampanas]);
  useEffect(() => { if (vista !== 'envios') return undefined; const i = setInterval(cargarCampanas, 8000); return () => clearInterval(i); }, [vista, cargarCampanas]);

  const cambiarParte = (k: keyof PartesCorreo, v: string | boolean) => setPartes((p) => ({ ...p, [k]: v }));
  const htmlFinal = () => (modoMsg === 'diseno' ? construirCorreo(partes) : aHtml(mensaje));
  const contenidoListo = modoMsg === 'diseno' ? !!partes.cuerpo.trim() : !!mensaje.trim();
  const subirImagen = async (f: File | undefined) => {
    if (!f) return;
    setSubiendo(true);
    const url = await subirImagenEvento(f);
    setSubiendo(false);
    if (archivoImagen.current) archivoImagen.current.value = '';
    if (url) cambiarParte('imagen', url); else setToast('No se pudo subir la imagen. Intenta de nuevo o pega un link.');
  };

  const audiencia = () => (tipo === 'lista' ? { tipo: 'lista', correos: correosDe(lista) } : { tipo: 'eventos', quien, eventos: todosEventos ? 'todos' : eventos });
  const lista_ok = tipo === 'lista' ? correosDe(lista).length > 0 : todosEventos || eventos.length > 0;

  const contar = async () => {
    setOcupado(true);
    const r = await correosAudiencia(audiencia());
    setOcupado(false);
    if (r.success) setCuenta({ total: r.total, invalidos: r.invalidos || 0 }); else setToast(r.message || 'No se pudo calcular');
  };
  const probar = async () => {
    const mios = correosDe(prueba);
    if (!mios.length) return setToast('Escribe tu correo para la prueba.');
    if (!asunto.trim() || !contenidoListo) return setToast('Escribe el asunto y el mensaje.');
    setOcupado(true);
    const r = await correosPrueba(asunto.trim(), htmlFinal(), mios);
    setOcupado(false);
    setToast(r.success ? `Prueba enviada a ${mios.join(', ')}` : r.message || 'No se pudo enviar la prueba');
  };
  const enviar = async () => {
    setOcupado(true);
    const r = await correosEnviar(asunto.trim(), htmlFinal(), audiencia());
    setOcupado(false);
    if (r.success) { setToast('Envío iniciado. Puedes seguirlo en "Envíos".'); setVista('envios'); cargarCampanas(); setAsunto(''); setMensaje(''); setPartes({ ...PARTES_INICIALES }); setCuenta(null); } else setToast(r.message || 'No se pudo iniciar el envío');
  };
  const accion = async (id: number, a: string) => { const r = await correosAccion(id, a); setToast(r.success ? 'Listo' : r.message || 'No se pudo'); cargarCampanas(); };

  return (
    <PanelPagina titulo="Correos masivos" toast={toast} onToastCerrado={() => setToast('')} cargando={!inicio && !error}
      encabezado={(
        <IonSegment className="pn-segmentos" value={vista} onIonChange={(e) => setVista(e.detail.value as 'nuevo' | 'envios')}>
          <IonSegmentButton value="nuevo"><IonLabel>Nuevo correo</IonLabel></IonSegmentButton>
          <IonSegmentButton value="envios"><IonLabel>Envíos</IonLabel></IonSegmentButton>
        </IonSegment>
      )}>
      <IonRefresher slot="fixed" onIonRefresh={async (e) => { await Promise.all([cargarInicio(), cargarCampanas()]); e.detail.complete(); }}><IonRefresherContent /></IonRefresher>
      {error && <div className="pn-error">{error}</div>}
      {inicio && !inicio.servicio && <div className="pn-aviso">El servicio de correo no está configurado en el servidor: puedes preparar el mensaje, pero no se enviará.</div>}

      {vista === 'nuevo' && inicio && (
        <>
          <div className="pn-card">
            <h3 className="pn-titulo">¿A quién?</h3>
            <IonSegment value={tipo} onIonChange={(e) => { setTipo(e.detail.value as 'eventos' | 'lista'); setCuenta(null); }}>
              <IonSegmentButton value="eventos"><IonLabel>Clientes de eventos</IonLabel></IonSegmentButton>
              <IonSegmentButton value="lista"><IonLabel>Lista de correos</IonLabel></IonSegmentButton>
            </IonSegment>
            {tipo === 'eventos' ? (
              <>
                <div className="pn-campo">
                  <IonSelect label="Quiénes" labelPlacement="floating" fill="outline" value={quien} onIonChange={(e) => { setQuien(String(e.detail.value)); setCuenta(null); }}>
                    <IonSelectOption value="compraron">Los que compraron</IonSelectOption>
                    <IonSelectOption value="no_compraron">Los que NO compraron</IonSelectOption>
                    <IonSelectOption value="todos">Todos los registrados</IonSelectOption>
                  </IonSelect>
                </div>
                <div className="pn-campo">
                  <IonSelect label="Eventos" labelPlacement="floating" fill="outline" multiple value={todosEventos ? ['__todos'] : eventos} placeholder="Elige uno o varios"
                    onIonChange={(e) => {
                      const v = (e.detail.value as string[]) || [];
                      if (v.includes('__todos')) { setTodosEventos(true); setEventos([]); } else { setTodosEventos(false); setEventos(v); }
                      setCuenta(null);
                    }}>
                    <IonSelectOption value="__todos">Todos los eventos</IonSelectOption>
                    {inicio.eventos.map((e) => <IonSelectOption key={e.codigoEvento} value={e.codigoEvento}>{e.nombre}</IonSelectOption>)}
                  </IonSelect>
                </div>
              </>
            ) : (
              <div className="pn-campo"><IonTextarea label="Correos (separados por coma, espacio o salto de línea)" labelPlacement="floating" fill="outline" rows={4} value={lista} onIonInput={(e) => { setLista(String(e.detail.value || '')); setCuenta(null); }} /></div>
            )}
            <IonButton expand="block" fill="outline" className="pn-campo" disabled={!lista_ok || ocupado} onClick={contar}>¿A cuántos correos saldría?</IonButton>
            {cuenta && <p className="pn-sub" style={{ marginTop: 8 }}><b>{cuenta.total}</b> correo{cuenta.total === 1 ? '' : 's'}{cuenta.invalidos ? ` (${cuenta.invalidos} no válidos se omiten)` : ''}.</p>}
          </div>

          <div className="pn-card">
            <h3 className="pn-titulo">Mensaje</h3>
            <IonSegment value={modoMsg} onIonChange={(e) => setModoMsg(e.detail.value as 'texto' | 'diseno')}>
              <IonSegmentButton value="texto"><IonLabel>Texto simple</IonLabel></IonSegmentButton>
              <IonSegmentButton value="diseno"><IonLabel>Con diseño</IonLabel></IonSegmentButton>
            </IonSegment>
            <div className="pn-campo"><IonInput label="Asunto" labelPlacement="floating" fill="outline" value={asunto} maxlength={150} onIonInput={(e) => setAsunto(String(e.detail.value || ''))} /></div>
            {modoMsg === 'texto' ? (
              <>
                <div className="pn-campo"><IonTextarea label="Mensaje" labelPlacement="floating" fill="outline" rows={7} value={mensaje} onIonInput={(e) => setMensaje(String(e.detail.value || ''))} /></div>
                <p className="pn-sub" style={{ marginTop: 6 }}>Deja una línea en blanco entre párrafos. Para imagen, título y botón usa «Con diseño».</p>
              </>
            ) : (
              <>
                <div className="pn-campo">
                  <input ref={archivoImagen} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => subirImagen(e.target.files?.[0])} />
                  <IonInput label="Imagen de arriba (link)" labelPlacement="floating" fill="outline" placeholder="https://…" value={partes.imagen} onIonInput={(e) => cambiarParte('imagen', String(e.detail.value || ''))} />
                  <IonButton size="small" fill="outline" disabled={subiendo} onClick={() => archivoImagen.current?.click()} style={{ marginTop: 6 }}>{subiendo ? 'Subiendo…' : 'Subir una foto del teléfono'}</IonButton>
                </div>
                {partes.imagen && <div className="pn-campo"><IonInput label="Al tocar la imagen abre (opcional)" labelPlacement="floating" fill="outline" placeholder="https://tickets.com.ec/…" value={partes.imagenLink} onIonInput={(e) => cambiarParte('imagenLink', String(e.detail.value || ''))} /></div>}
                <div className="pn-campo"><IonInput label="Título (opcional)" labelPlacement="floating" fill="outline" value={partes.titulo} maxlength={120} onIonInput={(e) => cambiarParte('titulo', String(e.detail.value || ''))} /></div>
                <div className="pn-campo"><IonTextarea label="Mensaje" labelPlacement="floating" fill="outline" rows={7} value={partes.cuerpo} onIonInput={(e) => cambiarParte('cuerpo', String(e.detail.value || ''))} /></div>
                <p className="pn-sub" style={{ marginTop: 6 }}>Línea en blanco = párrafo nuevo · **así** = negrita · {'{{nombre}}'} = nombre del cliente.</p>
                <div className="pn-switch"><span className="pn-switch-nombre">Agregar un botón</span><IonCheckbox checked={partes.botonActivo} onIonChange={(e) => cambiarParte('botonActivo', e.detail.checked)} /></div>
                {partes.botonActivo && (
                  <>
                    <div className="pn-campo"><IonInput label="Texto del botón" labelPlacement="floating" fill="outline" value={partes.botonTexto} maxlength={40} onIonInput={(e) => cambiarParte('botonTexto', String(e.detail.value || ''))} /></div>
                    <div className="pn-campo"><IonInput label="El botón abre (link)" labelPlacement="floating" fill="outline" placeholder="https://tickets.com.ec/…" value={partes.botonLink} onIonInput={(e) => cambiarParte('botonLink', String(e.detail.value || ''))} /></div>
                  </>
                )}
                <div className="pn-campo"><IonInput label="Pie del correo" labelPlacement="floating" fill="outline" value={partes.pie} maxlength={200} onIonInput={(e) => cambiarParte('pie', String(e.detail.value || ''))} /></div>
                <IonButton expand="block" fill="outline" className="pn-campo" disabled={!contenidoListo} onClick={() => setVistaPrevia(true)}>Ver cómo queda</IonButton>
              </>
            )}
            <div className="pn-campo"><IonInput label="Tu correo para la prueba" labelPlacement="floating" fill="outline" type="email" value={prueba} onIonInput={(e) => setPrueba(String(e.detail.value || ''))} /></div>
            <div className="pn-botones">
              <IonButton fill="outline" disabled={ocupado} onClick={probar}>Enviar prueba</IonButton>
              <IonButton className="pn-boton-p" disabled={ocupado || !lista_ok || !asunto.trim() || !contenidoListo || !inicio.servicio} onClick={() => setConfirmar(true)}>Enviar</IonButton>
            </div>
          </div>
        </>
      )}

      {vista === 'envios' && (
        <>
          {campanas.length === 0 && <div className="pn-vacio">Todavía no hay envíos.</div>}
          {campanas.map((c) => (
            <div key={c.id} className="pn-card">
              <div className="pn-lista-top"><span className="pn-lista-nombre">{c.asunto}</span><span className={`pn-badge ${BADGE[c.estado] || 'pn-b-gris'}`}>{c.es_prueba ? 'Prueba' : c.estado}</span></div>
              <div className="pn-lista-pie" style={{ marginTop: 4 }}>{fecha(c.creado_en)} · {c.enviados}/{c.total} enviados{c.pendientes ? ` · ${c.pendientes} pendientes` : ''}{c.errores + c.rechazados ? ` · ${c.errores + c.rechazados} con problema` : ''}</div>
              {!c.es_prueba && (
                <div className="pn-botones">
                  {c.estado === 'Enviando' && <IonButton size="small" fill="outline" onClick={() => accion(c.id, 'pausar')}>Pausar</IonButton>}
                  {c.estado === 'Pausada' && <IonButton size="small" fill="outline" onClick={() => accion(c.id, 'reanudar')}>Reanudar</IonButton>}
                  {(c.estado === 'Enviando' || c.estado === 'Pausada') && <IonButton size="small" fill="outline" color="danger" onClick={() => accion(c.id, 'cancelar')}>Cancelar</IonButton>}
                  {c.errores > 0 && <IonButton size="small" fill="outline" onClick={() => accion(c.id, 'reintentar')}>Reintentar errores</IonButton>}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      <IonModal isOpen={vistaPrevia} onDidDismiss={() => setVistaPrevia(false)}>
        <IonHeader><IonToolbar className="admin-toolbar"><IonTitle size="small">Vista previa</IonTitle><IonButtons slot="end"><IonButton onClick={() => setVistaPrevia(false)}>Cerrar</IonButton></IonButtons></IonToolbar></IonHeader>
        <IonContent><iframe title="Vista previa del correo" sandbox="" style={{ width: '100%', height: '100%', border: 0 }} srcDoc={`<meta name="viewport" content="width=device-width,initial-scale=1">${htmlFinal().replace(/\{\{\s*nombre\s*\}\}/gi, 'María')}`} /></IonContent>
      </IonModal>
      <IonAlert isOpen={confirmar} onDidDismiss={() => setConfirmar(false)} header="¿Enviar el correo?"
        message={cuenta ? `Saldrá a ${cuenta.total} correo${cuenta.total === 1 ? '' : 's'}. No se puede deshacer.` : 'Saldrá a todos los de la selección. No se puede deshacer.'}
        buttons={[{ text: 'No', role: 'cancel' }, { text: 'Sí, enviar', handler: () => { enviar(); } }]} />
    </PanelPagina>
  );
};

export default CorreosMasivos;
