import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  IonContent, IonHeader, IonPage, IonTitle, IonToolbar, IonButtons, IonBackButton,
  IonButton, IonSpinner, IonToast,
} from '@ionic/react';
import { useParams } from 'react-router-dom';
import { obtenerConfiguracionLocalidad, obtenerMapaLocalidad, type ItemMapaLocalidad } from '../utils/localidadConfig';
import { listarLocalidadesAdmin, type LocalidadAdmin } from '../utils/adminEventos';
import {
  cortesiasDe, libresDe, etiquetaSilla, moverCortesias, type MovimientoCortesia,
} from '../utils/moverCortesias';
import './AdminDescuentos.css';
import './AdminMoverCortesias.css';

/* "Mover cortesías" (solo admin): el admin elige una localidad numerada, marca las sillas ocupadas SIN compra
   (cortesías con nombre, boleto físico o digital) y la silla libre donde empiezan. Se revisa primero (vista previa)
   y luego se mueve: nombre, código / QR y boleto de la puerta pasan a la silla nueva (ver utils/moverCortesias.ts). */

const TIPO: Record<string, string> = { fisico: 'Boleto físico', digital: 'Boleto digital', bloqueo: 'Bloqueada' };

const esNumerada = (loc: LocalidadAdmin) =>
  !!loc.id_localidad && (loc.tipo_localidad === 'fila' || loc.tipo_localidad === 'mesa');

const AdminMoverCortesias: React.FC = () => {
  const { codigoEvento } = useParams<{ codigoEvento: string }>();
  const [localidades, setLocalidades] = useState<LocalidadAdmin[]>([]);
  const [cargandoLocalidades, setCargandoLocalidades] = useState(true);
  const [localidad, setLocalidad] = useState<LocalidadAdmin | null>(null);
  const [idEspacio, setIdEspacio] = useState<number | null>(null);
  const [items, setItems] = useState<ItemMapaLocalidad[]>([]);
  const [cargandoMapa, setCargandoMapa] = useState(false);

  const [busqueda, setBusqueda] = useState('');
  const [sinNombre, setSinNombre] = useState(false);
  const [elegidas, setElegidas] = useState<number[]>([]);
  const [destino, setDestino] = useState('');
  const [revision, setRevision] = useState<{ ok: boolean; mensaje: string; movimientos: MovimientoCortesia[] } | null>(null);
  const [ocupado, setOcupado] = useState<'' | 'revisando' | 'moviendo'>('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    if (!codigoEvento) return;
    setCargandoLocalidades(true);
    listarLocalidadesAdmin(codigoEvento).then(locs => {
      const numeradas = locs.filter(esNumerada);
      setLocalidades(numeradas);
      if (numeradas.length === 1) setLocalidad(numeradas[0]);
      setCargandoLocalidades(false);
    });
  }, [codigoEvento]);

  const cargarMapa = useCallback(async (espacio: number, idLocalidad: number) => {
    setCargandoMapa(true);
    const r = await obtenerMapaLocalidad(espacio, idLocalidad);
    setItems(r.items);
    setCargandoMapa(false);
  }, []);

  useEffect(() => {
    if (!localidad?.id_localidad) return;
    const idLocalidad = localidad.id_localidad;
    setItems([]); setElegidas([]); setDestino(''); setRevision(null); setIdEspacio(null);
    setCargandoMapa(true);
    obtenerConfiguracionLocalidad(idLocalidad).then(cfg => {
      setIdEspacio(cfg.idEspacio);
      if (cfg.idEspacio != null) cargarMapa(cfg.idEspacio, idLocalidad);
      else setCargandoMapa(false);
    });
  }, [localidad, cargarMapa]);

  const cortesias = useMemo(() => cortesiasDe(items, !sinNombre, busqueda), [items, sinNombre, busqueda]);
  const libres = useMemo(() => libresDe(items), [items]);

  const cambiar = (fn: () => void) => { setRevision(null); fn(); };
  const alternar = (id: number) => cambiar(() => setElegidas(e => (e.includes(id) ? e.filter(x => x !== id) : [...e, id])));

  const pedir = async (aplicar: boolean) => {
    if (!localidad?.id_localidad) return;
    setOcupado(aplicar ? 'moviendo' : 'revisando');
    const r = await moverCortesias(localidad.id_localidad, elegidas, Number(destino), aplicar);
    setOcupado('');
    if (r.ok && r.aplicado) {
      setToast(r.mensaje || 'Listo, las sillas se movieron.');
      setElegidas([]); setDestino(''); setRevision(null);
      if (idEspacio != null) cargarMapa(idEspacio, localidad.id_localidad);
      return;
    }
    setRevision({ ok: r.ok, mensaje: r.ok ? 'Revisión correcta. Esto es lo que se va a mover:' : r.mensaje, movimientos: r.movimientos });
  };

  const puedeRevisar = !ocupado && elegidas.length > 0 && !!destino;
  const puedeMover = !ocupado && !!revision && revision.ok;

  return (
    <IonPage>
      <IonHeader>
        <IonToolbar className="admin-toolbar">
          <IonButtons slot="start">
            <IonBackButton defaultHref={`/admin/evento/${codigoEvento}`} text="" />
          </IonButtons>
          <IonTitle size="small">Mover cortesías</IonTitle>
        </IonToolbar>
      </IonHeader>

      <IonContent className="admin-content">
        <div className="descuentos-container">
          <div className="admin-card">
            <p className="admin-sin-datos">
              Elige las sillas ocupadas sin compra y la silla libre donde empiezan. Se mueve el nombre, el boleto (físico o digital)
              y el boleto de la puerta. Solo dentro de la misma localidad.
            </p>
          </div>

          {cargandoLocalidades && <div className="admin-loading-mini"><IonSpinner name="crescent" /></div>}
          {!cargandoLocalidades && localidades.length === 0 && (
            <div className="admin-card"><p className="admin-sin-datos">Este evento no tiene localidades numeradas (filas o mesas).</p></div>
          )}

          {localidades.length > 0 && (
            <div className="admin-card">
              <h3 className="admin-card-titulo">Localidad</h3>
              <select className="mc-input" value={localidad?.id ?? ''} onChange={e => setLocalidad(localidades.find(l => l.id === Number(e.target.value)) ?? null)}>
                <option value="">Elige la localidad…</option>
                {localidades.map(l => <option key={l.id} value={l.id}>{l.localidad}</option>)}
              </select>
            </div>
          )}

          {localidad && cargandoMapa && <div className="admin-loading-mini"><IonSpinner name="crescent" /></div>}

          {localidad && !cargandoMapa && (
            <>
              <div className="admin-card">
                <h3 className="admin-card-titulo">Sillas a mover ({elegidas.length})</h3>
                <input className="mc-input" placeholder="Buscar por nombre, silla o código" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                <label className="mc-check">
                  <input type="checkbox" checked={sinNombre} onChange={e => setSinNombre(e.target.checked)} /> Incluir bloqueadas sin nombre
                </label>
                <div className="mc-acciones">
                  <button type="button" className="mc-link" disabled={!cortesias.length}
                    onClick={() => cambiar(() => setElegidas(e => [...new Set([...e, ...cortesias.map(c => c.idsilla)])]))}>Marcar las que se ven</button>
                  <button type="button" className="mc-link" disabled={!elegidas.length} onClick={() => cambiar(() => setElegidas([]))}>Ninguna</button>
                </div>
                <div className="mc-lista">
                  {cortesias.length === 0 && <p className="admin-sin-datos">No hay cortesías ocupadas sin compra{busqueda ? ' con esa búsqueda' : ''}.</p>}
                  {cortesias.map(it => (
                    <label key={it.idsilla} className="mc-fila">
                      <input type="checkbox" checked={elegidas.includes(it.idsilla)} onChange={() => alternar(it.idsilla)} />
                      <span className="mc-silla">{etiquetaSilla(it)}</span>
                      <span className="mc-nombre">{it.cedula || '(sin nombre)'}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="admin-card">
                <h3 className="admin-card-titulo">Empezar en la silla libre</h3>
                <select className="mc-input" value={destino} onChange={e => cambiar(() => setDestino(e.target.value))}>
                  <option value="">Elige la silla destino…</option>
                  {libres.map(it => <option key={it.idsilla} value={it.idsilla}>{etiquetaSilla(it)}</option>)}
                </select>
                <p className="admin-sin-datos">
                  {elegidas.length > 1 ? `Se usan las ${elegidas.length} sillas siguientes del mismo grupo, en orden.` : 'La cortesía pasa a esta silla.'}
                </p>
              </div>

              {revision && (
                <div className={`admin-card ${revision.ok ? 'mc-ok' : 'mc-error'}`}>
                  <p className="mc-mensaje">{revision.mensaje}</p>
                  {revision.movimientos.map(m => (
                    <div key={m.id_origen} className={`mc-mov ${m.ok ? '' : 'mc-mov-mal'}`}>
                      <strong>{m.de}</strong> → <strong>{m.a}</strong>
                      <div>{m.nombre}{m.ok ? ` · ${TIPO[m.tipo] ?? m.tipo}` : ` · ${m.message}`}</div>
                    </div>
                  ))}
                </div>
              )}

              <div className="mc-botones">
                <IonButton expand="block" fill="outline" disabled={!puedeRevisar} onClick={() => pedir(false)}>
                  {ocupado === 'revisando' ? 'Revisando…' : 'Revisar'}
                </IonButton>
                <IonButton expand="block" disabled={!puedeMover} onClick={() => pedir(true)}>
                  {ocupado === 'moviendo' ? 'Moviendo…' : 'Mover'}
                </IonButton>
              </div>
            </>
          )}
        </div>
        <IonToast isOpen={!!toast} message={toast} duration={3500} onDidDismiss={() => setToast('')} />
      </IonContent>
    </IonPage>
  );
};

export default AdminMoverCortesias;
