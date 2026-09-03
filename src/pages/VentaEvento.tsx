import { useState, useEffect } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonButton, IonIcon, IonInput, IonSpinner, IonText, IonBadge, IonModal,
} from '@ionic/react';
import {
  chevronBackOutline, searchOutline, checkmarkCircleOutline,
  personAddOutline, peopleOutline, chevronForwardOutline,
  mapOutline, gridOutline, closeOutline,
} from 'ionicons/icons';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { MS_LOGIN_AUTH_HEADERS } from '../utils/msLoginAuth';
import { staffAuthHeaders } from '../utils/staffAuth';
import ZoomableImage from '../components/ZoomableImage';
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
  cantidad_disponible: number;
  tipo_localidad: string;
  comision_boleto?: string;
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
  const [emailNuevo, setEmailNuevo]   = useState('');
  const [movilNuevo, setMovilNuevo]   = useState('');
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
    if (!cedula) { setError('Ingresa una cédula.'); return; }
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
        setCliente({
          id: Number(data.data.id) || 0,
          cedula,
          nombreCompleto: data.data.nombreCompleto ?? '',
          email: data.data.email ?? '',
          movil: data.data.movil ?? '',
          ciudad: data.data.ciudad ?? '',
          esNuevo: false,
        });
      } else {
        setNoEncontrado(true);
        setNombreNuevo(''); setEmailNuevo(''); setMovilNuevo(''); setCiudadNuevo('');
        const civil = await buscarEnRegistroCivil(cedula);
        if (civil) {
          setNombreNuevo(civil.name);
          setMovilNuevo(civil.telefono);
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

  const crearCliente = async () => {
    const cedula = cedulaBusqueda.trim();
    if (!nombreNuevo.trim() || !emailNuevo.trim() || !movilNuevo.trim()) {
      setError('Completa nombre, correo y celular del nuevo cliente.');
      return;
    }
    setBuscando(true);
    setError('');
    try {
      const { data } = await axios.post(
        `${URL_BASE}/crear_suscriptor`,
        {
          nombreCompleto: nombreNuevo.trim(),
          email: emailNuevo.trim().toLowerCase(),
          password: cedula,
          movil: movilNuevo.trim(),
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
          email: emailNuevo.trim().toLowerCase(),
          movil: movilNuevo.trim(),
          ciudad: ciudadNuevo.trim(),
          esNuevo: true,
        });
        setNoEncontrado(false);
        setIntentosCorreoDup(0);
      } else {
        manejarErrorCrearCliente(data.message);
      }
    } catch (err: unknown) {
      // El backend responde 409/400 (con mensaje) cuando el correo ya está
      // en uso -- axios lo trata como error y antes se perdía ese mensaje
      // detrás de un genérico "Error de conexión".
      const mensaje = axios.isAxiosError(err) ? err.response?.data?.message : undefined;
      if (mensaje) manejarErrorCrearCliente(mensaje);
      else setError('Error de conexión al crear el cliente.');
    } finally {
      setBuscando(false);
    }
  };

  const cambiarCliente = () => {
    setCliente(null);
    setNoEncontrado(false);
    setCedulaBusqueda('');
    setNombreNuevo(''); setEmailNuevo(''); setMovilNuevo(''); setCiudadNuevo('');
    setFuenteDatos(null);
  };

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
        tipo: precio.tipo_localidad,
        nombreEvento: evento?.nombreConcierto ?? '',
        mapaConcierto: evento?.mapaConcierto ?? '',
        codigoEvento: codigoEvento ?? '',
        idPrecio: precio.id,
        comisionBoleto: precio.comision_boleto ?? '0',
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
                    placeholder="Cédula del cliente"
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
                    <IonInput className="cliente-input" fill="outline" label="Correo electrónico" labelPlacement="floating" type="email"
                      value={emailNuevo}
                      onIonInput={(e) => { setEmailNuevo(e.detail.value ?? ''); setIntentosCorreoDup(0); }} />
                    <IonInput className="cliente-input" fill="outline" label="Celular" labelPlacement="floating" type="tel"
                      value={movilNuevo} onIonInput={(e) => setMovilNuevo(e.detail.value ?? '')} />
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
                  {cliente.esNuevo && <IonBadge className="badge-nuevo">Cliente nuevo</IonBadge>}
                </div>
                <IonButton fill="clear" size="small" onClick={cambiarCliente}>Cambiar</IonButton>
              </div>
            )}

            {error && <p className="venta-error">{error}</p>}
          </div>

          {/* ── Paso 2: localidades ── */}
          {cliente && (
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

              {!cargandoPrecios && precios.map((p) => (
                <div key={p.id} className="localidad-row" onClick={() => seleccionarLocalidad(p)}>
                  <div className="localidad-info">
                    <span className="localidad-nombre">{p.localidad.replace(/__+/g, '').trim()}</span>
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
