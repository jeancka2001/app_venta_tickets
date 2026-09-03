import { useState, useEffect, useCallback } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonIcon, IonSpinner, IonText, IonBadge,
  IonButton, IonTextarea, IonInput, IonAlert, IonActionSheet, IonToast, IonModal,
} from '@ionic/react';
import {
  alertCircleOutline, checkmarkCircleOutline, ticketOutline, banOutline,
  linkOutline, personAddOutline, refreshOutline, printOutline, logoWhatsapp,
  chatbubbleEllipsesOutline, documentTextOutline, checkmarkDoneOutline,
  imageOutline, addOutline, searchOutline, mailOutline, closeOutline, saveOutline,
} from 'ionicons/icons';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from '../utils/msLoginAuth';
import { obtenerStaffData } from '../utils/staffAuth';
import { generarYDescargarFactura } from '../utils/factura';
import ZoomableImage from '../components/ZoomableImage';
import './DetalleCompra.css';

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';
const URL_MIKROTI = 'https://api.t-ickets.com/mikroti';
const URL_MIKROTIV2 = 'https://api.t-ickets.com/mikrotiv2';
const URL_UPLOAD_IMG = 'https://codigomarret.online/upload/api/img';
const TICKET_PDF_URL = 'https://api.t-ickets.com/ticket/api/v1/ticket_pdf_link';
const API_HDR = { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' };

interface InfoConcierto {
  nombreConcierto: string;
  localidad_nombre: string;
  cantidad: string;
  CODIGEVENTO?: string;
}
interface TicketUsuario {
  id?: number;
  cedula?: string;
  estado: string;
  canje: string;
  sillas?: string;
  localidad?: string | number;
}
interface Comentario {
  id: number;
  comentario: string;
  operador?: string;
  name?: string;
}
interface Registro {
  id: number;
  cedula: string;
  forma_pago: string;
  total_pago: string;
  info_concierto: InfoConcierto[];
  estado_pago: string;
  fechaCreacion: string;
  ticket_usuarios?: TicketUsuario[];
  comentarios?: Comentario[];
  link_pago?: string | null;
  link_comprobante?: string | null;
  numerTransacion?: string | null;
  banco?: string | null;
  estado_envio?: number | boolean | null;
}
interface ComprobanteExtra {
  id: number;
  url_imagen: string;
  fechaCreacion?: string;
}
interface RegistroDuplicado {
  id: number;
  cedula?: string;
}

/* Métodos que requieren aprobación manual (quedan "Pendiente"/"Comprobar"
   hasta que alguien confirma el depósito/transferencia) -- mismos que la
   web trata como pago manual en ConsolidaBoleto(). */
const METODOS_MANUALES = ['Deposito', 'Transferencia'];

const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const formatFecha = (fecha: string) => {
  if (!fecha) return '—';
  const solo = fecha.split(' ')[0].split('T')[0];
  const [y, m, d] = solo.split('-');
  if (!y || !m || !d) return fecha;
  const hora = fecha.split(' ')[1]?.slice(0, 5) ?? '';
  return `${d} ${MESES[parseInt(m) - 1] ?? m} ${y}${hora ? ' · ' + hora : ''}`;
};

const DetalleCompra: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const staff = obtenerStaffData();

  const [registro, setRegistro] = useState<Registro | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError]       = useState('');
  const [toast, setToast]       = useState('');

  /* Datos del cliente (para el recibo y WhatsApp) -- no vienen en
     listarRegistros, se consultan aparte, sin bloquear la carga principal. */
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteEmail, setClienteEmail]   = useState('');
  const [clienteMovil, setClienteMovil]   = useState('');

  const [procesando, setProcesando] = useState<string | null>(null);
  const [confirmarAnular, setConfirmarAnular] = useState(false);
  const [elegirBanco, setElegirBanco] = useState(false);
  const [nuevoComentario, setNuevoComentario] = useState('');

  /* ── Comprobante(s) de depósito/transferencia ── */
  const [comprobantesExtra, setComprobantesExtra] = useState<ComprobanteExtra[]>([]);
  const [imagenModal, setImagenModal] = useState<string | null>(null);
  const [numeroEdit, setNumeroEdit] = useState('');
  const [duplicados, setDuplicados] = useState<RegistroDuplicado[] | null>(null);
  const [mensajeDuplicado, setMensajeDuplicado] = useState('');

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    setError('');
    try {
      /* La ruta solo está registrada como POST en el backend -- un GET
         devuelve 404 aunque los parámetros vayan bien, por eso el error. */
      const { data } = await axios.post(`${URL_BASE}/listarRegistros`, {}, {
        headers: MS_LOGIN_AUTH_HEADERS,
        params: { id_registro: id },
      });
      const fila = Array.isArray(data?.data) ? data.data[0] : null;
      if (!fila) { setError('No se encontró el registro.'); return; }
      setRegistro(fila);
      setNumeroEdit(fila.numerTransacion ?? '');
      axios.post(`${URL_BASE}/consultar_cedula`, { cedula: fila.cedula, email: '' }, { headers: API_HDR })
        .then(({ data: cli }) => {
          if (cli?.success && cli?.data) {
            setClienteNombre(cli.data.nombreCompleto ?? '');
            setClienteEmail(cli.data.email ?? '');
            setClienteMovil(cli.data.movil ?? '');
          }
        })
        .catch(() => {});
      if (METODOS_MANUALES.includes(fila.forma_pago)) {
        axios.get(`${URL_MIKROTI}/Boleteria/comprobantes/${fila.id}`, { headers: MS_LOGIN_AUTH_HEADERS })
          .then(({ data: extra }) => {
            if (extra?.estado && Array.isArray(extra.data)) setComprobantesExtra(extra.data);
          })
          .catch(() => {});
      }
    } catch {
      setError('Error de conexión al cargar el detalle.');
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => { cargar(); }, [cargar]);

  const boletos = registro?.ticket_usuarios ?? [];
  const esperados = (registro?.info_concierto ?? []).reduce((acc, c) => acc + (parseInt(c.cantidad) || 0), 0);
  const faltanBoletos = registro?.estado_pago === 'Pagado' && boletos.length < esperados;
  const todosCanjeados = boletos.length > 0 && boletos.every(b => b.canje === 'CANJEADO');
  const esManual = !!registro && METODOS_MANUALES.includes(registro.forma_pago);
  const puedeAprobar = !!registro && esManual && ['Pendiente', 'Comprobar'].includes(registro.estado_pago);
  const linkPago = registro?.link_pago || registro?.link_comprobante || '';

  /* ── Anular compra ── */
  const anularCompra = async () => {
    if (!registro) return;
    setProcesando('anular');
    try {
      const { data } = await axios.post(`${URL_BASE}/anularCompra`,
        { id: registro.id, id_usuario: 0, id_operador: staff?.id || 0 },
        { headers: API_HDR });
      if (data.success) { setToast('Compra anulada correctamente.'); await cargar(); }
      else setToast(data.message ?? 'No se pudo anular la compra.');
    } catch {
      setToast('Error de conexión al anular.');
    } finally {
      setProcesando(null);
      setConfirmarAnular(false);
    }
  };

  /* ── Copiar link de pago ── */
  const copiarLinkPago = () => {
    if (!linkPago) { setToast('No hay link de pago registrado en esta compra.'); return; }
    navigator.clipboard.writeText(linkPago)
      .then(() => setToast('Link de pago copiado.'))
      .catch(() => setToast('No se pudo copiar el link.'));
  };

  /* ── Generar y copiar link de asignación de asientos ── */
  const generarLinkAsientos = async () => {
    if (!registro) return;
    setProcesando('link-asientos');
    try {
      const { data } = await axios.post(`${URL_BASE}/generar_link_asignacion`,
        { id_registraCompra: registro.id }, { headers: API_HDR });
      if (data.success && data.link) {
        await navigator.clipboard.writeText(data.link).catch(() => {});
        setToast('Link de asignación de asientos copiado.');
      } else {
        setToast(data.message ?? 'No se pudo generar el link de asignación.');
      }
    } catch {
      setToast('Error de conexión al generar el link.');
    } finally {
      setProcesando(null);
    }
  };

  /* ── Aprobar pago pendiente (Deposito/Transferencia) ──
     Para Deposito, la web primero pregunta el banco -- se pide con un
     IonActionSheet antes de llamar a esta función. */
  const aprobarPago = async (banco?: string) => {
    if (!registro) return;
    setProcesando('aprobar');
    try {
      const payload = {
        id_usuario:  staff?.id || 0,
        id_operador: staff?.id || 0,
        forma_pago:  registro.forma_pago,
        link_comprobante: registro.link_comprobante,
        id: registro.id,
        numeroTransaccion: registro.numerTransacion,
        cedula: registro.cedula,
        estado: 'Pagado',
        bancos: banco || registro.banco,
        enviar_correo: true, generar_ticket: true, send_email: true,
        notify: true, notificar: true, enviar_ticket: true,
      };
      const { data } = await axios.post(`${URL_BASE}/registraPagos`, payload, { headers: API_HDR });
      if (data.success) { setToast('Pago aprobado — se generaron los boletos.'); await cargar(); }
      else setToast(data.message ?? 'No se pudo aprobar el pago.');
    } catch {
      setToast('Error de conexión al aprobar el pago.');
    } finally {
      setProcesando(null);
      setElegirBanco(false);
    }
  };

  const tocarAprobar = () => {
    if (registro?.forma_pago === 'Deposito') setElegirBanco(true);
    else aprobarPago();
  };

  /* ── Regenerar boletos faltantes ── */
  const regenerarBoletos = async () => {
    if (!registro) return;
    setProcesando('regenerar');
    try {
      const { data } = await axios.post(`${URL_BASE}/validar_existencia_asientos`,
        { id_registraCompra: registro.id, cedula: registro.cedula }, { headers: API_HDR });
      if (data.success) { setToast('Boletos regenerados.'); await cargar(); }
      else setToast(data.message ?? 'No se pudieron regenerar los boletos.');
    } catch {
      setToast('Error de conexión al regenerar los boletos.');
    } finally {
      setProcesando(null);
    }
  };

  /* ── Canjear todos los boletos ── */
  const canjearTodos = async () => {
    if (!registro) return;
    setProcesando('canjear');
    try {
      const { data } = await axios.post(`${URL_BASE}/canje_boleto`,
        { id_registraCompra: registro.id, canjeado: 'CANJEADO' }, { headers: API_HDR });
      if (data.success) { setToast('Boletos canjeados.'); await cargar(); }
      else setToast(data.message ?? 'No se pudo canjear los boletos.');
    } catch {
      setToast('Error de conexión al canjear.');
    } finally {
      setProcesando(null);
    }
  };

  /* ── Ver/descargar PDF de un boleto puntual ── */
  const verPdfBoleto = async (ticket: TicketUsuario) => {
    if (!registro || !ticket.id) return;
    setProcesando(`pdf-${ticket.id}`);
    try {
      const codigoEvento = registro.info_concierto?.[0]?.CODIGEVENTO || '';
      const { data } = await axios.post(TICKET_PDF_URL,
        { cedula: registro.cedula, codigoEvento, id_ticket_usuarios: [ticket.id] },
        { headers: API_HDR });
      const link = data?.link ?? data?.data?.link ?? data?.url;
      if (link) window.open(String(link).replace('flash', 'api'), '_system');
      else setToast('No se pudo obtener el PDF de este boleto.');
    } catch {
      setToast('Error de conexión al pedir el PDF.');
    } finally {
      setProcesando(null);
    }
  };

  /* ── Imprimir / guardar recibo en PDF ── */
  const imprimirRecibo = async () => {
    if (!registro) return;
    setProcesando('recibo');
    try {
      const resultado = await generarYDescargarFactura({
        id: registro.id,
        nombreConcierto: registro.info_concierto?.[0]?.nombreConcierto ?? '',
        localidades: (registro.info_concierto ?? []).map(c => ({ nombre: c.localidad_nombre, cantidad: c.cantidad })),
        formaPago: registro.forma_pago,
        total: parseFloat(registro.total_pago || '0'),
        cliente: clienteNombre,
        correo: clienteEmail,
        cedula: registro.cedula,
        fechaRegistro: registro.fechaCreacion,
        numeroComprobante: registro.numerTransacion ?? undefined,
      });
      setToast(resultado.ok ? 'Comprobante guardado en Documentos del teléfono.' : (resultado.mensaje ?? 'No se pudo generar el comprobante.'));
    } finally {
      setProcesando(null);
    }
  };

  /* ── Contactar al cliente por WhatsApp ── */
  const contactarWhatsapp = () => {
    const digitos = clienteMovil.replace(/\D/g, '');
    if (!digitos) { setToast('El cliente no tiene celular registrado.'); return; }
    const numero = digitos.startsWith('593') ? digitos : `593${digitos.replace(/^0/, '')}`;
    window.open(`https://api.whatsapp.com/send?phone=${numero}`, '_blank');
  };

  /* ── Comentarios ── */
  const agregarComentario = async () => {
    const texto = nuevoComentario.trim();
    if (!texto || !id) return;
    setProcesando('comentario');
    try {
      const { data } = await axios.post(`${URL_BASE}/Comentario_registro`,
        { id_registro: Number(id), id_operador: staff?.id || 0, comentario: texto },
        { headers: API_HDR });
      if (data.success) { setNuevoComentario(''); await cargar(); }
      else setToast(data.message ?? 'No se pudo guardar el comentario.');
    } catch {
      setToast('Error de conexión al guardar el comentario.');
    } finally {
      setProcesando(null);
    }
  };

  /* ── Añadir un comprobante adicional (foto o galería) ── */
  const elegirImagenInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (file) agregarComprobanteExtra(file);
  };

  const agregarComprobanteExtra = async (file: File) => {
    if (!registro) return;
    setProcesando('comprobante-extra');
    try {
      const form = new FormData();
      form.append('file', file);
      const { data: subida } = await axios.post(URL_UPLOAD_IMG, form);
      if (!subida?.success || !subida?.url) {
        setToast('No se pudo subir la imagen.');
        return;
      }
      const { data } = await axios.post(`${URL_MIKROTI}/Boleteria/comprobantes`,
        { id_registraCompra: registro.id, url_imagen: subida.url }, { headers: API_HDR });
      if (data?.estado) {
        setComprobantesExtra(prev => [...prev, { id: Date.now(), url_imagen: subida.url, fechaCreacion: new Date().toISOString() }]);
        setToast('Comprobante agregado.');
      } else {
        setToast(data?.mensaje ?? 'No se pudo agregar el comprobante.');
      }
    } catch {
      setToast('Error de conexión al subir el comprobante.');
    } finally {
      setProcesando(null);
    }
  };

  /* ── Editar manualmente el número de comprobante/transacción ── */
  const guardarNumeroTransaccion = async () => {
    if (!registro) return;
    const numero = numeroEdit.trim();
    if (!numero) { setToast('Ingresa un número de comprobante.'); return; }
    setProcesando('num-transaccion');
    try {
      const { data } = await axios.post(`${URL_BASE}/ActualizarNumeroTransaccion`,
        { id_registraCompra: registro.id, numeroTransaccion: numero, id_usuario: 0, id_operador: staff?.id || 0 },
        { headers: API_HDR });
      if (data.success) {
        setRegistro(prev => prev ? { ...prev, numerTransacion: numero } : prev);
        setToast('Número de comprobante actualizado.');
      } else {
        setToast(data.message ?? 'No se pudo actualizar el número.');
      }
    } catch {
      setToast('Error de conexión al actualizar el número.');
    } finally {
      setProcesando(null);
    }
  };

  /* ── Verificar si el número de comprobante se repite en otra compra ── */
  const verificarDuplicado = async () => {
    const numero = (numeroEdit || registro?.numerTransacion || '').trim();
    if (!numero) { setToast('No hay número de comprobante para verificar.'); return; }
    setProcesando('verificar-duplicado');
    setDuplicados(null);
    setMensajeDuplicado('');
    try {
      const { data } = await axios.post(`${URL_BASE}/BuscarNumeroTransaccion`,
        { numeroTransaccion: numero }, { headers: API_HDR });
      if (data.success && Array.isArray(data.data)) {
        setDuplicados(data.data.filter((r: RegistroDuplicado) => r.id !== registro?.id));
        setMensajeDuplicado(`Este número aparece en ${data.data.length} compra(s).`);
      } else if (data.success) {
        setMensajeDuplicado('Comprobante único, no se encontró en otra compra.');
      } else {
        setMensajeDuplicado(data.message ?? 'No se encontró ese número de comprobante.');
      }
    } catch {
      setToast('Error de conexión al verificar el comprobante.');
    } finally {
      setProcesando(null);
    }
  };

  /* ── Habilitar nuevo envío de boletos (reenvío) ── */
  const habilitarReenvio = async () => {
    if (!registro) return;
    setProcesando('reenvio');
    try {
      const { data } = await axios.get(`${URL_MIKROTIV2}/api/reenvio/${registro.id}`, { headers: MS_LOGIN_AUTH_HEADERS });
      if (data?.estado) { setToast('Se habilitó un nuevo envío de boletos.'); await cargar(); }
      else setToast('No se pudo habilitar el reenvío.');
    } catch {
      setToast('Error de conexión al habilitar el reenvío.');
    } finally {
      setProcesando(null);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="detalle-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard/buscar" text="" />
          </IonButtons>
          <IonTitle>Detalle de compra</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="detalle-content">
        {cargando && (
          <div className="detalle-loading"><IonSpinner name="crescent" /></div>
        )}

        {!cargando && error && (
          <div className="detalle-loading"><IonText color="danger"><p>{error}</p></IonText></div>
        )}

        {!cargando && registro && (
          <div className="detalle-container">

            {/* ── Resumen ── */}
            <div className="detalle-card">
              <h3 className="detalle-card-title">Compra #{registro.id}</h3>
              <p className="detalle-evento">{registro.info_concierto?.[0]?.nombreConcierto ?? '—'}</p>
              <div className="detalle-fila">
                <span className="detalle-lbl">Cliente</span>
                <span className="detalle-val">{clienteNombre || registro.cedula}</span>
              </div>
              <div className="detalle-fila">
                <span className="detalle-lbl">Cédula</span>
                <span className="detalle-val">{registro.cedula}</span>
              </div>
              <div className="detalle-fila">
                <span className="detalle-lbl">Localidad</span>
                <span className="detalle-val">{registro.info_concierto?.[0]?.localidad_nombre ?? '—'}</span>
              </div>
              <div className="detalle-fila">
                <span className="detalle-lbl">Cantidad</span>
                <span className="detalle-val">{esperados}</span>
              </div>
              <div className="detalle-fila">
                <span className="detalle-lbl">Forma de pago</span>
                <span className="detalle-val">{registro.forma_pago}</span>
              </div>
              <div className="detalle-fila">
                <span className="detalle-lbl">Fecha</span>
                <span className="detalle-val">{formatFecha(registro.fechaCreacion)}</span>
              </div>
              <div className="detalle-fila">
                <span className="detalle-lbl">Estado</span>
                <IonBadge className={`badge-estado estado-${registro.estado_pago?.toLowerCase()}`}>
                  {registro.estado_pago}
                </IonBadge>
              </div>
              {boletos.length > 0 && (
                <div className="detalle-fila">
                  <span className="detalle-lbl">Envío de boletos</span>
                  <IonBadge className={`badge-estado ${registro.estado_envio ? 'estado-pagado' : 'estado-pendiente'}`}>
                    {registro.estado_envio ? 'Enviado' : 'No enviado'}
                  </IonBadge>
                </div>
              )}
              <div className="detalle-fila detalle-total-fila">
                <span className="detalle-lbl">Total</span>
                <span className="detalle-total">${parseFloat(registro.total_pago || '0').toFixed(2)}</span>
              </div>
            </div>

            {faltanBoletos && (
              <div className="detalle-aviso-falta">
                <IonIcon icon={alertCircleOutline} />
                <span>
                  La compra está pagada pero solo se generaron {boletos.length} de {esperados} boletos.
                </span>
              </div>
            )}

            {/* ── Comprobante de depósito/transferencia ── */}
            {esManual && (
              <div className="detalle-card">
                <h3 className="detalle-card-title">
                  <IonIcon icon={imageOutline} /> Comprobante
                </h3>

                <div className="comprobantes-galeria">
                  {registro.link_comprobante && (
                    <button className="comprobante-thumb" onClick={() => setImagenModal(registro.link_comprobante!)}>
                      <img src={registro.link_comprobante} alt="Comprobante" />
                    </button>
                  )}
                  {comprobantesExtra.map((c) => (
                    <button key={c.id} className="comprobante-thumb" onClick={() => setImagenModal(c.url_imagen)}>
                      <img src={c.url_imagen} alt="Comprobante adicional" />
                    </button>
                  ))}
                  {!registro.link_comprobante && comprobantesExtra.length === 0 && (
                    <p className="detalle-sin-boletos">No se ha subido ninguna imagen de comprobante.</p>
                  )}
                </div>

                <p className="comprobante-hint-compartir">
                  Sube el comprobante que genera la opción "Compartir" del banco o de Deuna, no una captura de pantalla —
                  ese trae toda la información necesaria (banco, monto, número de comprobante).
                </p>

                <label className="btn-adjuntar-foto" htmlFor="comprobanteExtraInput">
                  {procesando === 'comprobante-extra'
                    ? <IonSpinner name="crescent" />
                    : <><IonIcon icon={addOutline} /> Añadir comprobante</>}
                </label>
                <input
                  id="comprobanteExtraInput"
                  className="comprobante-input-file"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={elegirImagenInput}
                  disabled={procesando === 'comprobante-extra'}
                />

                <div className="comprobante-numero-campo">
                  <label htmlFor="numeroComprobanteInput">Número de comprobante / transacción</label>
                  <div className="comprobante-numero-row">
                    <IonInput
                      id="numeroComprobanteInput"
                      className="comprobante-numero-input"
                      fill="outline"
                      placeholder="Ej. 000123456"
                      value={numeroEdit}
                      onIonInput={(e) => setNumeroEdit(e.detail.value ?? '')}
                    />
                    <IonButton fill="solid" className="btn-num-accion btn-num-guardar" onClick={guardarNumeroTransaccion}
                      disabled={procesando === 'num-transaccion'}>
                      {procesando === 'num-transaccion' ? <IonSpinner name="crescent" /> : <IonIcon icon={saveOutline} />}
                    </IonButton>
                    <IonButton fill="outline" className="btn-num-accion" onClick={verificarDuplicado}
                      disabled={procesando === 'verificar-duplicado'}>
                      {procesando === 'verificar-duplicado' ? <IonSpinner name="crescent" /> : <IonIcon icon={searchOutline} />}
                    </IonButton>
                  </div>
                </div>

                {mensajeDuplicado && (
                  <p className={`comprobante-mensaje-dup ${duplicados && duplicados.length > 0 ? 'dup-alerta' : ''}`}>
                    {mensajeDuplicado}
                  </p>
                )}
                {duplicados && duplicados.length > 0 && (
                  <div className="duplicados-lista">
                    {duplicados.map((d) => (
                      <a key={d.id} href={`/detalle-compra/${d.id}`} className="duplicado-item">
                        Compra #{d.id} {d.cedula ? `· ${d.cedula}` : ''}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Acciones ── */}
            <div className="detalle-card">
              <h3 className="detalle-card-title">Acciones</h3>
              <div className="acciones-lista">

                {puedeAprobar && (
                  <IonButton expand="block" className="btn-accion btn-accion-primaria"
                    onClick={tocarAprobar} disabled={procesando === 'aprobar'}>
                    {procesando === 'aprobar'
                      ? <IonSpinner name="crescent" />
                      : <><IonIcon icon={checkmarkCircleOutline} slot="start" /> Aprobar pago</>}
                  </IonButton>
                )}

                {faltanBoletos && (
                  <IonButton expand="block" fill="outline" className="btn-accion"
                    onClick={regenerarBoletos} disabled={procesando === 'regenerar'}>
                    {procesando === 'regenerar'
                      ? <IonSpinner name="crescent" />
                      : <><IonIcon icon={refreshOutline} slot="start" /> Regenerar boletos faltantes</>}
                  </IonButton>
                )}

                {boletos.length > 0 && !todosCanjeados && (
                  <IonButton expand="block" fill="outline" className="btn-accion"
                    onClick={canjearTodos} disabled={procesando === 'canjear'}>
                    {procesando === 'canjear'
                      ? <IonSpinner name="crescent" />
                      : <><IonIcon icon={checkmarkDoneOutline} slot="start" /> Canjear todos los boletos</>}
                  </IonButton>
                )}

                {boletos.length > 0 && (
                  <IonButton expand="block" fill="outline" className="btn-accion"
                    onClick={habilitarReenvio} disabled={procesando === 'reenvio'}>
                    {procesando === 'reenvio'
                      ? <IonSpinner name="crescent" />
                      : <><IonIcon icon={mailOutline} slot="start" /> Habilitar nuevo envío de boletos</>}
                  </IonButton>
                )}

                {registro.estado_pago === 'Pagado' && (
                  <IonButton expand="block" fill="outline" className="btn-accion"
                    onClick={generarLinkAsientos} disabled={procesando === 'link-asientos'}>
                    {procesando === 'link-asientos'
                      ? <IonSpinner name="crescent" />
                      : <><IonIcon icon={personAddOutline} slot="start" /> Copiar link para asignar asientos</>}
                  </IonButton>
                )}

                {!!linkPago && (
                  <IonButton expand="block" fill="outline" className="btn-accion" onClick={copiarLinkPago}>
                    <IonIcon icon={linkOutline} slot="start" /> Copiar link de pago
                  </IonButton>
                )}

                <IonButton expand="block" fill="outline" className="btn-accion"
                  onClick={imprimirRecibo} disabled={procesando === 'recibo'}>
                  {procesando === 'recibo'
                    ? <IonSpinner name="crescent" />
                    : <><IonIcon icon={printOutline} slot="start" /> Imprimir recibo</>}
                </IonButton>

                <IonButton expand="block" fill="outline" className="btn-accion" onClick={contactarWhatsapp}>
                  <IonIcon icon={logoWhatsapp} slot="start" /> Contactar por WhatsApp
                </IonButton>

                {registro.estado_pago !== 'Anulado' && (
                  <IonButton expand="block" fill="outline" className="btn-accion btn-accion-peligro"
                    onClick={() => setConfirmarAnular(true)} disabled={procesando === 'anular'}>
                    {procesando === 'anular'
                      ? <IonSpinner name="crescent" />
                      : <><IonIcon icon={banOutline} slot="start" /> Anular compra</>}
                  </IonButton>
                )}
              </div>
            </div>

            {/* ── Comentarios ── */}
            <div className="detalle-card">
              <h3 className="detalle-card-title">
                <IonIcon icon={chatbubbleEllipsesOutline} /> Comentarios
              </h3>

              {(!registro.comentarios || registro.comentarios.length === 0) && (
                <p className="detalle-sin-boletos">Sin comentarios todavía.</p>
              )}

              {(registro.comentarios ?? []).map((c) => (
                <div key={c.id} className="comentario-row">
                  <span className="comentario-texto">{c.comentario}</span>
                  <span className="comentario-autor">{c.operador || c.name || 'Operador'}</span>
                </div>
              ))}

              <IonTextarea
                className="comentario-input"
                fill="outline"
                placeholder="Escribe un comentario…"
                autoGrow
                value={nuevoComentario}
                onIonInput={(e) => setNuevoComentario(e.detail.value ?? '')}
              />
              <IonButton expand="block" fill="outline" className="btn-accion" onClick={agregarComentario}
                disabled={procesando === 'comentario' || !nuevoComentario.trim()}>
                {procesando === 'comentario'
                  ? <IonSpinner name="crescent" />
                  : <><IonIcon icon={documentTextOutline} slot="start" /> Agregar comentario</>}
              </IonButton>
            </div>

            {/* ── Boletos generados ── */}
            <div className="detalle-card">
              <h3 className="detalle-card-title">
                <IonIcon icon={ticketOutline} /> Boletos generados ({boletos.length})
              </h3>

              {boletos.length === 0 && (
                <p className="detalle-sin-boletos">
                  {registro.estado_pago === 'Pagado'
                    ? 'Aún no se han generado boletos para esta compra.'
                    : 'Los boletos se generan cuando la compra queda pagada.'}
                </p>
              )}

              {boletos.map((b, i) => (
                <div key={b.id ?? i} className="boleto-row">
                  <IonIcon
                    icon={b.canje === 'CANJEADO' ? checkmarkCircleOutline : ticketOutline}
                    className={b.canje === 'CANJEADO' ? 'boleto-icon-canjeado' : 'boleto-icon'}
                  />
                  <div className="boleto-info">
                    <span className="boleto-silla">{b.sillas || `Boleto ${i + 1}`}</span>
                    <span className="boleto-estado">{b.canje === 'CANJEADO' ? 'Canjeado' : 'Sin canjear'}</span>
                  </div>
                  {!!b.id && (
                    <IonButton fill="clear" size="small" onClick={() => verPdfBoleto(b)}
                      disabled={procesando === `pdf-${b.id}`}>
                      {procesando === `pdf-${b.id}` ? <IonSpinner name="crescent" /> : 'PDF'}
                    </IonButton>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </IonContent>

      <IonAlert
        isOpen={confirmarAnular}
        header="¿Anular esta compra?"
        message={boletos.length > 0
          ? 'Esta compra tiene asientos asignados. Al anularla, sus asientos se liberarán y quedarán disponibles para la venta. ¿Deseas continuar?'
          : '¿Estás seguro de que deseas anular esta compra?'}
        buttons={[
          { text: 'No', role: 'cancel' },
          { text: 'Sí, anular', role: 'destructive', handler: anularCompra },
        ]}
        onDidDismiss={() => setConfirmarAnular(false)}
      />

      <IonActionSheet
        isOpen={elegirBanco}
        header="¿En qué banco se recibió el depósito?"
        buttons={[
          { text: 'Banco Pichincha', handler: () => aprobarPago('Pichincha') },
          { text: 'Banco Guayaquil', handler: () => aprobarPago('Guayaquil') },
          { text: 'Cancelar', role: 'cancel' },
        ]}
        onDidDismiss={() => setElegirBanco(false)}
      />

      <IonToast
        isOpen={!!toast}
        message={toast}
        duration={3000}
        position="top"
        onDidDismiss={() => setToast('')}
      />

      <IonModal isOpen={!!imagenModal} onDidDismiss={() => setImagenModal(null)}
        breakpoints={[0, 1]} initialBreakpoint={1}>
        <IonHeader>
          <IonToolbar className="detalle-toolbar">
            <IonTitle>Comprobante</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setImagenModal(null)}>
                <IonIcon icon={closeOutline} slot="icon-only" />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="detalle-content" scrollY={false}>
          {imagenModal && <ZoomableImage src={imagenModal} alt="Comprobante" />}
        </IonContent>
      </IonModal>
    </IonPage>
  );
};

export default DetalleCompra;
