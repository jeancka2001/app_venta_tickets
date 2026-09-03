import { useState } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar,
  IonButtons, IonBackButton, IonButton, IonIcon, IonSpinner, IonInput, IonTextarea, IonToast,
} from '@ionic/react';
import { cloudUploadOutline, imageOutline } from 'ionicons/icons';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  crearEventoAdmin, actualizarDescripcionEvento, subirImagenEvento, type EventoAdmin,
} from '../utils/adminEventos';
import './AdminEventoForm.css';

const IVA_OPCIONES = [
  { valor: '1.00', label: 'Sin IVA (0%)' },
  { valor: '1.12', label: '12%' },
  { valor: '1.15', label: '15%' },
];
const ESTADO_OPCIONES = ['PROCESO', 'PROXIMO', 'ACTIVO'];

const AdminEventoForm: React.FC = () => {
  const { codigoEvento } = useParams<{ codigoEvento?: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const eventoEdit = (location.state as { evento?: EventoAdmin } | null)?.evento ?? null;
  const esEdicion = !!codigoEvento && !!eventoEdit;

  const [nombreConcierto, setNombreConcierto] = useState(eventoEdit?.nombreConcierto ?? '');
  const [fechaConcierto, setFechaConcierto]   = useState(eventoEdit?.fechaConcierto ?? '');
  const [horaConcierto, setHoraConcierto]     = useState(eventoEdit?.horaConcierto ?? '');
  const [lugarConcierto, setLugarConcierto]   = useState(eventoEdit?.lugarConcierto ?? '');
  const [cuidadConcert, setCuidadConcert]     = useState(eventoEdit?.cuidadConcert ?? '');
  const [descripcion, setDescripcion]         = useState(eventoEdit?.descripcionConcierto ?? '');
  const [iva, setIva]                         = useState(eventoEdit?.iva ?? '1.00');
  const [estado, setEstado]                   = useState('ACTIVO');

  const [imagenUrl, setImagenUrl] = useState(eventoEdit?.imagenConcierto ?? '');
  const [mapaUrl, setMapaUrl]     = useState(eventoEdit?.mapaConcierto ?? '');
  const [subiendoImagen, setSubiendoImagen] = useState(false);
  const [subiendoMapa, setSubiendoMapa]     = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [error, setError]         = useState('');
  const [toast, setToast]         = useState('');

  const elegirImagen = async (e: React.ChangeEvent<HTMLInputElement>, tipo: 'imagen' | 'mapa') => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    (tipo === 'imagen' ? setSubiendoImagen : setSubiendoMapa)(true);
    const url = await subirImagenEvento(file);
    if (url) (tipo === 'imagen' ? setImagenUrl : setMapaUrl)(url);
    else setToast('No se pudo subir la imagen.');
    (tipo === 'imagen' ? setSubiendoImagen : setSubiendoMapa)(false);
  };

  const guardar = async () => {
    if (!nombreConcierto.trim() || !fechaConcierto || !horaConcierto || !lugarConcierto.trim() || !cuidadConcert.trim()) {
      setError('Completa nombre, fecha, hora, lugar y ciudad.');
      return;
    }
    if (!esEdicion && !imagenUrl) {
      setError('Sube la imagen principal del evento.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      if (esEdicion && eventoEdit) {
        const resultado = await actualizarDescripcionEvento({
          id_evento: eventoEdit.id,
          nombreConcierto: nombreConcierto.trim(),
          fechaConcierto, horaConcierto,
          lugarConcierto: lugarConcierto.trim(),
          cuidadConcert: cuidadConcert.trim(),
          descripcionConcierto: descripcion.trim(),
          imagenConcierto: imagenUrl || undefined,
          mapaConcierto: mapaUrl || undefined,
        });
        if (resultado.success) { setToast('Evento actualizado.'); navigate(-1); }
        else setError(resultado.message ?? 'No se pudo actualizar el evento.');
      } else {
        const resultado = await crearEventoAdmin({
          nombreConcierto: nombreConcierto.trim(),
          fechaConcierto, horaConcierto,
          lugarConcierto: lugarConcierto.trim(),
          cuidadConcert: cuidadConcert.trim(),
          descripcionConcierto: descripcion.trim(),
          imagenConcierto: imagenUrl,
          mapaConcierto: mapaUrl,
          iva, estado,
        });
        if (resultado.success) {
          setToast('Evento creado. Ahora añade sus localidades.');
          navigate('/dashboard/admin', { replace: true });
        } else {
          setError(resultado.message ?? 'No se pudo crear el evento.');
        }
      }
    } finally {
      setGuardando(false);
    }
  };

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref="/dashboard/admin" text="" />
          </IonButtons>
          <IonTitle>{esEdicion ? 'Editar evento' : 'Nuevo evento'}</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content">
        <div className="admin-form-container">

          <div className="admin-form-card">
            <IonInput className="admin-input" fill="outline" label="Nombre del evento" labelPlacement="floating"
              value={nombreConcierto} onIonInput={(e) => setNombreConcierto(e.detail.value ?? '')} />

            <div className="admin-form-row">
              <div className="admin-form-campo">
                <label>Fecha</label>
                <input type="date" value={fechaConcierto} onChange={(e) => setFechaConcierto(e.target.value)} />
              </div>
              <div className="admin-form-campo">
                <label>Hora</label>
                <input type="time" value={horaConcierto} onChange={(e) => setHoraConcierto(e.target.value)} />
              </div>
            </div>

            <IonInput className="admin-input" fill="outline" label="Lugar" labelPlacement="floating"
              value={lugarConcierto} onIonInput={(e) => setLugarConcierto(e.detail.value ?? '')} />
            <IonInput className="admin-input" fill="outline" label="Ciudad" labelPlacement="floating"
              value={cuidadConcert} onIonInput={(e) => setCuidadConcert(e.detail.value ?? '')} />
            <IonTextarea className="admin-input" fill="outline" label="Descripción" labelPlacement="floating" autoGrow
              value={descripcion} onIonInput={(e) => setDescripcion(e.detail.value ?? '')} />

            {!esEdicion && (
              <div className="admin-form-row">
                <div className="admin-form-campo">
                  <label>IVA</label>
                  <select value={iva} onChange={(e) => setIva(e.target.value)}>
                    {IVA_OPCIONES.map(o => <option key={o.valor} value={o.valor}>{o.label}</option>)}
                  </select>
                </div>
                <div className="admin-form-campo">
                  <label>Estado inicial</label>
                  <select value={estado} onChange={(e) => setEstado(e.target.value)}>
                    {ESTADO_OPCIONES.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <div className="admin-form-card">
            <h3 className="admin-form-titulo"><IonIcon icon={imageOutline} /> Imágenes</h3>

            <div className="admin-imagen-campo">
              <label>Imagen principal {!esEdicion && '*'}</label>
              {imagenUrl && <img src={imagenUrl} alt="Imagen del evento" className="admin-imagen-preview" />}
              <label className="btn-subir-imagen" htmlFor="imagenEventoInput">
                {subiendoImagen ? <IonSpinner name="crescent" /> : <><IonIcon icon={cloudUploadOutline} /> {imagenUrl ? 'Cambiar imagen' : 'Subir imagen'}</>}
              </label>
              <input id="imagenEventoInput" className="admin-input-file" type="file" accept="image/*"
                onChange={(e) => elegirImagen(e, 'imagen')} disabled={subiendoImagen} />
            </div>

            <div className="admin-imagen-campo">
              <label>Mapa / plano de localidades</label>
              {mapaUrl && <img src={mapaUrl} alt="Mapa del evento" className="admin-imagen-preview" />}
              <label className="btn-subir-imagen" htmlFor="mapaEventoInput">
                {subiendoMapa ? <IonSpinner name="crescent" /> : <><IonIcon icon={cloudUploadOutline} /> {mapaUrl ? 'Cambiar mapa' : 'Subir mapa'}</>}
              </label>
              <input id="mapaEventoInput" className="admin-input-file" type="file" accept="image/*"
                onChange={(e) => elegirImagen(e, 'mapa')} disabled={subiendoMapa} />
            </div>
          </div>

          {!esEdicion && (
            <p className="admin-form-hint">
              El evento se crea sin localidades — luego de guardarlo, entra a su detalle para añadirlas con sus precios.
            </p>
          )}

          {error && <p className="admin-form-error">{error}</p>}

          <IonButton expand="block" className="btn-guardar-evento" onClick={guardar} disabled={guardando}>
            {guardando ? <IonSpinner name="crescent" /> : (esEdicion ? 'Guardar cambios' : 'Crear evento')}
          </IonButton>
        </div>

        <IonToast isOpen={!!toast} message={toast} duration={2500} position="top" onDidDismiss={() => setToast('')} />
      </IonContent>
    </IonPage>
  );
};

export default AdminEventoForm;
