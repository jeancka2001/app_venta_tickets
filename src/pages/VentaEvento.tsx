import { useState, useEffect } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonButton, IonIcon, IonInput, IonSpinner, IonText, IonBadge, IonModal,
  useIonViewWillEnter,
} from '@ionic/react';
import {
  chevronBackOutline, searchOutline, checkmarkCircleOutline,
  personAddOutline, peopleOutline, chevronForwardOutline,
  mapOutline, gridOutline, closeOutline, alertCircleOutline,
} from 'ionicons/icons';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from '../utils/msLoginAuth';
import { staffAuthHeaders } from '../utils/staffAuth';
import ZoomableImage from '../components/ZoomableImage';
import { errorDeRuc } from '../utils/identificacion';
import { CELULAR_GENERICO, celularFalta, correoFalta, correoSintetico, esCelularGenerico, esCorreoSintetico, sufijoAleatorio } from '../utils/clienteGenerico';
import './VentaEvento.css';

const URL_BASE = 'https://api.t-ickets.com/ms_login/api/v1';
const API_HDR = { ...MS_LOGIN_AUTH_HEADERS, 'Content-Type': 'application/json' };

export interface Cliente {
  id: number;
  cedula: string;
  nombreCompleto: string;
  email: string;
  movil: string;
  ciudad?: string;
  esNuevo: boolean;
}

interface Localidad {
  id: number;
  id_localidad: number;
  localidad: string;
  precio_normal: string;
  // Precio para discapacidad / tercera edad (descuento 50%); 0 o vacio = la localidad no lo tiene
  precio_discapacidad?: string;
  cantidad_disponible: number;
  tipo_localidad: string;
  comision_boleto?: string;
  // Boletos por precio (x2: dos entradas / dos sillas de la misma mesa por un precio)
  factor_boletos?: string | number | null;
  // Opciones de compra de la localidad (promociones con las mismas sillas): Evento -> Localidades y asientos
  modalidades?: { codigo: string; nombre: string; precio: string; factor: number }[];
  // Opcion elegida (se arma aqui: una fila por opcion)
  modalidadCodigo?: string;
  modalidadNombre?: string;
}

interface EventoState {
  evento?: {
    id: number;
    nombreConcierto: string;
    mapaConcierto: string;
    codigoEvento: string;
    iva?: string;
  };
}

const VentaEvento: React.FC = () => {
  const { codigoEvento } = useParams<{ codigoEvento: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const st = (location.state as EventoState) ?? {};
  const evento = st.evento;

  /* ── Cliente ── */
  const [cedulaBusqueda, setCedulaBusqueda] = useState('');
  const [buscando, setBuscando]     = useState(false);
  const [cliente, setCliente]       = useState<Cliente | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);
  const [error, setError]           = useState('');

  /* Formulario de cliente nuevo */
  const [nombreNuevo, setNombreNuevo] = useState('');
  /* Correo y celular: null = el vendedor no los ha tocado y se muestra el dato de relleno */
  const [emailEscrito, setEmailEscrito] = useState<string | null>(null);
  const [movilEscrito, setMovilEscrito] = useState<string | null>(null);
  const [movilCivil, setMovilCivil]     = useState('');
  const [sufijo, setSufijo]             = useState(sufijoAleatorio);
  const [ciudadNuevo, setCiudadNuevo] = useState('');
  /* De dónde salieron los datos precargados del formulario -- null cuando
     el vendedor tiene que llenarlo a mano (ni el SRI ni Manta encontraron
     nada para esa cédula). */
  const [fuenteDatos, setFuenteDatos] = useState<'SRI' | 'MANTA' | null>(null);

  /* ── Localidades / precios ── */
  const [precios, setPrecios]         = useState<Localidad[]>([]);
  const [cargandoPrecios, setCargandoPrecios] = useState(false);

  /* ── Imágenes del evento (mapa del lugar / división por bloques) ──
     Mismo endpoint y misma lógica de respaldo que Localidad.tsx: si no hay
     imagen de bloques configurada, "Ver bloques" cae al mapa del lugar. Acá
     se ofrecen desde antes de elegir localidad, para que el vendedor pueda
     mostrárselas al cliente mientras decide qué sector prefiere. */
  const [imagenBloques, setImagenBloques] = useState<string | null>(null);
  const [modalImagen, setModalImagen] = useState<'mapa' | 'bloques' | null>(null);
 
  useEffect(() => { 
    if (!codigoEvento) return;
    axios.get(`${URL_BASE}/imagenBloques/${codigoEvento}`, { headers: API_HDR })
      .then(({ data }) => {
        if (data?.success && data?.imagen_bloques) setImagenBloques(data.imagen_bloques);
      })
      .catch(() => {});
  }, [codigoEvento]);

  const imagenBloquesMostrar = imagenBloques || evento?.mapaConcierto || null;

  /* Si la cédula no está registrada como suscriptor, la web (getCedula() en
     DatosUsuarioLocalStorag.js) intenta autocompletar el nombre consultando
     el Registro Civil vía SRI y, si ese falla/no tiene datos, cae a Manta
     como respaldo -- mismos endpoints y mismo orden acá, para no obligar al
     vendedor a escribir el nombre completo a mano cada vez. */
  const buscarEnRegistroCivil = async (
    cedula: string
  ): Promise<{ name: string; telefono: string; direccion: string; fuente: 'SRI' | 'MANTA' } | null> => {
    for (const [ruta, fuente] of [
      ['consultar_cedula_sri', 'SRI'],
      ['consultar_cedula_turnos', 'MANTA'],
    ] as const) {
      try {
        const { data } = await axios.get(`${URL_BASE}/${ruta}/${cedula}`, { headers: API_HDR });
        if (data.success && data.data) {
          return {
            name: data.data.name ?? '',
            telefono: data.data.telefono ?? '',
            direccion: data.data.direccion ?? '',
            fuente,
          };
        }
      } catch { /* intenta la siguiente fuente */ }
    }
    return null;
  };

  const buscarCliente = async () => {
    const cedula = cedulaBusqueda.trim();
    if (!cedula) { setError('Ingresa una cédula o RUC.'); return; }
    // Venta a un RUC: tiene que ser valido (la cedula y demas identificaciones no cambian)
    const rucMal = errorDeRuc(cedula);
    if (rucMal) { setError(rucMal); return; }
    setBuscando(true);
    setError('');
    setNoEncontrado(false);
    setFuenteDatos(null);
    try {
      const { data } = await axios.post(
        `${URL_BASE}/consultar_cedula`,
        { cedula, email: '' },
        { headers: API_HDR }
      );
      if (data.success && data.data) {
        const nombre = data.data.nombreCompleto ?? '';
        const email = data.data.email ?? '';
        const movil = data.data.movil ?? '';
        setCliente({
          id: Number(data.data.id) || 0,
          cedula,
          nombreCompleto: nombre,
          // Si le falta el correo o el celular, la venta sale con el de relleno (no se cambia su ficha)
          email: correoFalta(email) ? correoSintetico(nombre, cedula, sufijoAleatorio()) : email,
          movil: celularFalta(movil) ? CELULAR_GENERICO : movil,
          ciudad: data.data.ciudad ?? '',
          esNuevo: false,
        });
      } else {
        setNoEncontrado(true);
        setNombreNuevo(''); setEmailEscrito(null); setMovilEscrito(null); setMovilCivil(''); setCiudadNuevo('');
        setSufijo(sufijoAleatorio());
        const civil = await buscarEnRegistroCivil(cedula);
        if (civil) {
          setNombreNuevo(civil.name);
          setMovilCivil(civil.telefono);
          setCiudadNuevo(civil.direccion);
          setFuenteDatos(civil.fuente);
        }
      }
    } catch {
      setError('Error de conexión al buscar el cliente.');
    } finally {
      setBuscando(false);
    }
  };

  /* Cuántas veces seguidas falló la creación por correo duplicado -- para
     escalar el mensaje si insiste con el mismo correo (o uno igual de
     usado) en vez de repetir el mismo error genérico. Se reinicia al
     tocar el campo de correo (intento nuevo) o al crear con éxito. */
  const [, setIntentosCorreoDup] = useState(0);

  const manejarErrorCrearCliente = (mensajeBackend?: string) => {
    const esCorreoDuplicado = /correo.*(registrad|usad|existe|repite|otro)/i.test(mensajeBackend || '');
    if (esCorreoDuplicado) {
      setIntentosCorreoDup(prev => {
        const siguiente = prev + 1;
        setError(siguiente >= 2
          ? 'Ese correo sigue sin funcionar. Prueba con otro usuario: busca al cliente por su cédula en vez de crearlo de nuevo, o usa un correo distinto.'
          : 'Ese correo ya está registrado con otro cliente. Cambia el correo e intenta de nuevo.');
        return siguiente;
      });
    } else {
      setIntentosCorreoDup(0);
      setError(mensajeBackend ?? 'No se pudo crear el cliente.');
    }
  };

  const correoAuto = correoSintetico(nombreNuevo, cedulaBusqueda.trim(), sufijo);
  const movilAuto = celularFalta(movilCivil) ? CELULAR_GENERICO : movilCivil;
  const emailNuevo = emailEscrito ?? correoAuto;
  const movilNuevo = movilEscrito ?? movilAuto;
  const usaCorreoRelleno = !emailNuevo.trim() || esCorreoSintetico(emailNuevo);
  const usaCelularRelleno = !movilNuevo.trim() || esCelularGenerico(movilNuevo);

  const crearCliente = async () => {
    const cedula = cedulaBusqueda.trim();
    const rucMal = errorDeRuc(cedula);
    if (rucMal) { setError(rucMal); return; }
    if (!nombreNuevo.trim()) {
      setError('Escribe el nombre del nuevo cliente.');
      return;
    }
    // Un campo borrado vuelve al dato de relleno
    const correo = emailNuevo.trim().toLowerCase() || correoAuto;
    const celular = movilNuevo.trim() || movilAuto;
    setBuscando(true);
    setError('');
    // Si choca el correo de relleno (muy raro), se genera otro y basta con volver a tocar "Crear cliente"
    const fallo = (mensaje?: string) => {
      if (esCorreoSintetico(correo) && /correo.*(registrad|cuenta)/i.test(mensaje || '')) {
        setSufijo(sufijoAleatorio());
        setEmailEscrito(null);
        setError('Ese correo de relleno ya existía. Se generó otro: toca "Crear cliente" de nuevo.');
      } else manejarErrorCrearCliente(mensaje);
    };
    try {
      const { data } = await axios.post(
        `${URL_BASE}/crear_suscriptor`,
        {
          nombreCompleto: nombreNuevo.trim(),
          email: correo,
          password: cedula,
          movil: celular,
          ciudad: ciudadNuevo.trim(),
          cedula,
        },
        { headers: API_HDR }
      );
      if (data.success) {
        setCliente({
          id: Number(data.data?.id ?? data.id) || 0,
          cedula,
          nombreCompleto: nombreNuevo.trim(),
          email: correo,
          movil: celular,
          ciudad: ciudadNuevo.trim(),
          esNuevo: true,
        });
        setNoEncontrado(false);
        setIntentosCorreoDup(0);
      } else {
        fallo(data.message);
      }
    } catch (err: unknown) {
      // El backend responde 409/400 (con mensaje) cuando el correo ya está
      // en uso -- axios lo trata como error y antes se perdía ese mensaje
      // detrás de un genérico "Error de conexión".
      const mensaje = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      if (mensaje) fallo(mensaje);
      else setError('Error de conexión al crear el cliente.');
    } finally {
      setBuscando(false);
    }
  };

  const cambiarCliente = () => {
    setCliente(null);
    setNoEncontrado(false);
    setCedulaBusqueda('');
    setNombreNuevo(''); setEmailEscrito(null); setMovilEscrito(null); setMovilCivil(''); setCiudadNuevo('');
    setFuenteDatos(null);
    setCompraPendiente(null);
  };

  /* ── Compra pendiente ──
     Si el cliente ya tiene una orden sin resolver (Pendiente/Comprobar),
     no se le deja generar otra -- se le muestra esa orden para que la
     retome en vez de duplicarla. Se consulta apenas se resuelve el
     cliente (antes de mostrar el paso 2 de localidades). */
  const [compraPendiente, setCompraPendiente] = useState<{
    id: number; forma_pago: string; estado_pago: string; total_pago: string;
    fechaCreacion: string; nombreConcierto: string;
  } | null>(null);
  const [verificandoPendiente, setVerificandoPendiente] = useState(false);

  useEffect(() => {
    if (!cliente) return;
    setVerificandoPendiente(true);
    setCompraPendiente(null);
    axios.get(`${URL_BASE}/compra_pendiente`, {
      headers: API_HDR,
      params: { cedula: cliente.cedula, ...(codigoEvento ? { codigoEvento } : {}) },
    })
      .then(({ data }) => { if (data?.success && data?.pendiente) setCompraPendiente(data.data); })
      .catch(() => {})
      .finally(() => setVerificandoPendiente(false));
  }, [cliente, codigoEvento]);

  /* Arranque limpio en CADA entrada a esta pantalla -- Ionic puede
     reactivar una instancia que ya existía en su stack en vez de montar
     una nueva, así que el estado de useState (cliente, cédula buscada)
     puede quedar "pegado" de una venta anterior. Sin esto, al vender de
     nuevo aparecía la misma cédula/cliente de la compra que se acababa de
     completar, como si la venta anterior no se hubiera cerrado. */
  useIonViewWillEnter(() => {
    setCliente(null);
    setCedulaBusqueda('');
    setNoEncontrado(false);
    setError('');
    setNombreNuevo(''); setEmailEscrito(null); setMovilEscrito(null); setMovilCivil(''); setCiudadNuevo('');
    setFuenteDatos(null);
    setPrecios([]);
    setCompraPendiente(null);
  });

  useEffect(() => {
    if (!cliente || !codigoEvento) return;
    setCargandoPrecios(true);
    // Mismo motivo que en Vender.tsx: este endpoint lo filtra el backend
    // por usuario_evento, así que va con el JWT del vendedor logueado.
    axios.get(`https://api.t-ickets.com/ms_login/ListaPreciosLocaDispo/${codigoEvento}`, {
      headers: staffAuthHeaders(),
    })
      .then(({ data }) => { if (data.success) setPrecios(data.data); })
      .catch(() => {})
      .finally(() => setCargandoPrecios(false));
  }, [cliente, codigoEvento]);

  const seleccionarLocalidad = (precio: Localidad) => {
    navigate(`/localidad/${precio.id_localidad}`, {
      state: {
        nombre: precio.localidad,
        precio: precio.precio_normal,
        // Las opciones de compra (promociones) no tienen descuento Dis./Ter. edad: solo la compra individual
        precioDiscapacidad: precio.modalidadCodigo ? 0 : (parseFloat(precio.precio_discapacidad || '0') || 0),
        tipo: precio.tipo_localidad,
        nombreEvento: evento?.nombreConcierto ?? '',
        mapaConcierto: evento?.mapaConcierto ?? '',
        codigoEvento: codigoEvento ?? '',
        idPrecio: precio.id,
        comisionBoleto: precio.comision_boleto ?? '0',
        factorBoletos: Number(precio.factor_boletos) || 1,
        modalidadCodigo: precio.modalidadCodigo || '',
        iva: evento?.iva ?? '1.00',
        cliente,
      },
    });
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="venta-toolbar">
          <IonButtons slot="start">
            <IonButton onClick={() => navigate(-1)}>
              <IonIcon icon={chevronBackOutline} slot="icon-only" />
            </IonButton>
          </IonButtons>
          <IonTitle size="small">{evento?.nombreConcierto ?? 'Vender entrada'}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="venta-content">
        <div className="venta-container">

          {(evento?.mapaConcierto || imagenBloquesMostrar) && (
            <div className="imagenes-evento-row">
              {evento?.mapaConcierto && (
                <IonButton fill="outline" size="small" className="btn-imagen-evento"
                  onClick={() => setModalImagen('mapa')}>
                  <IonIcon icon={mapOutline} slot="start" />
                  Ver mapa
                </IonButton>
              )}
              {imagenBloquesMostrar && (
                <IonButton fill="outline" size="small" className="btn-imagen-evento"
                  onClick={() => setModalImagen('bloques')}>
                  <IonIcon icon={gridOutline} slot="start" />
                  Ver bloques
                </IonButton>
              )}
            </div>
          )}

          {/* ── Paso 1: cliente ── */}
          <div className="venta-card">
            <h3 className="venta-card-title">Cliente</h3>

            {!cliente ? (
              <>
                <div className="cliente-buscar-row">
                  <IonInput
                    className="cliente-input"
                    fill="outline"
                    placeholder="Cédula o RUC del cliente"
                    inputmode="numeric"
                    value={cedulaBusqueda}
                    onIonInput={(e) => setCedulaBusqueda(e.detail.value ?? '')}
                  />
                  <IonButton className="btn-buscar" onClick={buscarCliente} disabled={buscando}>
                    {buscando ? <IonSpinner name="crescent" /> : <IonIcon icon={searchOutline} />}
                  </IonButton>
                </div>

                {noEncontrado && (
                  <div className="cliente-nuevo-form">
                    <p className="cliente-nuevo-aviso">
                      <IonIcon icon={personAddOutline} />
                      {fuenteDatos
                        ? ` No está registrado`
                        : ' No se encontró en ningún registro — completa sus datos para crearlo'}
                    </p>
                    <IonInput className="cliente-input" fill="outline" label="Nombre completo" labelPlacement="floating"
                      value={nombreNuevo} onIonInput={(e) => setNombreNuevo(e.detail.value ?? '')} />
                    {(usaCorreoRelleno || usaCelularRelleno) && (
                      <p className="cliente-relleno-aviso" role="status">
                        <IonIcon icon={alertCircleOutline} />
                        <span><strong>Pide los datos reales al cliente.</strong> Si no los tiene, puedes crearlo con los de relleno que ya están puestos{usaCorreoRelleno ? '; no recibirá nada por correo' : ''}.</span>
                      </p>
                    )}
                    <IonInput className="cliente-input" fill="outline" label="Correo electrónico" labelPlacement="floating" type="email"
                      value={emailNuevo} clearInput
                      helperText={usaCorreoRelleno ? 'De relleno · borra con la ✕ para escribir el real' : undefined}
                      onIonInput={(e) => { setEmailEscrito(String(e.detail.value ?? '')); setIntentosCorreoDup(0); }} />
                    <IonInput className="cliente-input" fill="outline" label="Celular" labelPlacement="floating" type="tel"
                      value={movilNuevo} clearInput
                      helperText={usaCelularRelleno ? 'De relleno · borra con la ✕ para escribir el real' : undefined}
                      onIonInput={(e) => setMovilEscrito(String(e.detail.value ?? ''))} />
                    <IonInput className="cliente-input" fill="outline" label="Ciudad" labelPlacement="floating"
                      value={ciudadNuevo} onIonInput={(e) => setCiudadNuevo(e.detail.value ?? '')} />
                    <IonButton expand="block" className="btn-crear-cliente" onClick={crearCliente} disabled={buscando}>
                      {buscando ? <IonSpinner name="crescent" /> : 'Crear cliente'}
                    </IonButton>
                  </div>
                )}
              </>
            ) : (
              <div className="cliente-encontrado">
                <IonIcon icon={checkmarkCircleOutline} className="cliente-ok-icon" />
                <div className="cliente-datos">
                  <span className="cliente-nombre">{cliente.nombreCompleto || cliente.cedula}</span>
                  <span className="cliente-sub">{cliente.cedula} · {cliente.email || 'sin correo'}</span>
                  {(esCorreoSintetico(cliente.email) || esCelularGenerico(cliente.movil)) && (
                    <span className="cliente-sub cliente-sub-relleno">
                      Con {[esCorreoSintetico(cliente.email) && 'correo', esCelularGenerico(cliente.movil) && 'celular'].filter(Boolean).join(' y ')} de relleno. Si consigues los reales, cámbialos en Buscar cliente.
                    </span>
                  )}
                  {cliente.esNuevo && <IonBadge className="badge-nuevo">Cliente nuevo</IonBadge>}
                </div>
                <IonButton fill="clear" size="small" onClick={cambiarCliente}>Cambiar</IonButton>
              </div>
            )}

            {error && <p className="venta-error">{error}</p>}
          </div>

          {/* ── Compra pendiente: bloquea el paso 2 hasta que se resuelva ── */}
          {cliente && verificandoPendiente && (
            <div className="venta-card">
              <div className="loading-precios"><IonSpinner name="crescent" /></div>
            </div>
          )}

          {cliente && !verificandoPendiente && compraPendiente && (
            <div className="venta-card">
              <h3 className="venta-card-title">
                <IonIcon icon={alertCircleOutline} /> Compra pendiente
              </h3>
              <p className="cliente-nuevo-aviso venta-pendiente-aviso">
                <IonIcon icon={alertCircleOutline} />
                Este cliente ya tiene una compra sin resolver ({compraPendiente.estado_pago}) de
                "{compraPendiente.nombreConcierto}" por ${parseFloat(compraPendiente.total_pago || '0').toFixed(2)}.
                Resuélvela antes de generar una nueva.
              </p>
              <IonButton expand="block" className="btn-crear-cliente"
                onClick={() => navigate(`/detalle-compra/${compraPendiente.id}`)}>
                Ver compra pendiente
              </IonButton>
            </div>
          )}

          {/* ── Paso 2: localidades ── */}
          {cliente && !verificandoPendiente && !compraPendiente && (
            <div className="venta-card">
              <h3 className="venta-card-title">
                <IonIcon icon={peopleOutline} /> Selecciona la localidad
              </h3>

              {cargandoPrecios && (
                <div className="loading-precios"><IonSpinner name="crescent" /></div>
              )}

              {!cargandoPrecios && precios.length === 0 && (
                <IonText color="medium"><p className="sin-precios">No hay localidades disponibles</p></IonText>
              )}

              {!cargandoPrecios && precios.flatMap((p) => [p, ...(p.modalidades || []).map((m) => ({
                ...p, precio_normal: String(m.precio), factor_boletos: m.factor, modalidadCodigo: m.codigo, modalidadNombre: m.nombre,
              }))]).map((p) => (
                <div key={`${p.id}-${p.modalidadCodigo || ''}`} className="localidad-row" onClick={() => seleccionarLocalidad(p)}>
                  <div className="localidad-info">
                    <span className="localidad-nombre">
                      {p.localidad.replace(/__+/g, '').trim()}{p.modalidadNombre ? ` · ${p.modalidadNombre}` : ((p.modalidades || []).length ? ' · Individual' : '')}
                    </span>
                    <span className="localidad-disp">{p.cantidad_disponible} disponibles</span>
                  </div>
                  <div className="localidad-precio-row">
                    <span className="localidad-precio">${parseFloat(p.precio_normal).toFixed(2)}</span>
                    <IonIcon icon={chevronForwardOutline} />
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      </IonContent>

      <IonModal isOpen={!!modalImagen} onDidDismiss={() => setModalImagen(null)}
        breakpoints={[0, 1]} initialBreakpoint={1}>
        <IonHeader>
          <IonToolbar className="venta-toolbar">
            <IonTitle>{modalImagen === 'mapa' ? 'Mapa del lugar' : 'División por bloques'}</IonTitle>
            <IonButtons slot="end">
              <IonButton onClick={() => setModalImagen(null)}>
                <IonIcon icon={closeOutline} slot="icon-only" />
              </IonButton>
            </IonButtons>
          </IonToolbar>
        </IonHeader>
        <IonContent className="venta-content" scrollY={false}>
          {modalImagen === 'mapa' && evento?.mapaConcierto && (
            <ZoomableImage src={evento.mapaConcierto} alt="Mapa del lugar" />
          )}
          {modalImagen === 'bloques' && imagenBloquesMostrar && (
            <ZoomableImage src={imagenBloquesMostrar} alt="División por bloques" />
          )}
        </IonContent>
      </IonModal>
    </IonPage>
  );
};

export default VentaEvento;
