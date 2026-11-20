import { useState } from 'react';
import { IonButton, IonInput, IonSelect, IonSelectOption, IonCheckbox, IonAlert } from '@ionic/react';
import { disenoAplicar, disenoRevisar, localidadNueva, opcionCompraGuardar, type Diseno } from '../utils/panelesAdmin';
import { aEntero as num, clonar, disenoInicial, gruposIncompletos, limpiarDiseno as limpiar, mostrarMesa, numeroFinal, siguienteLetra, totalDe } from '../utils/disenoLocalidad';
import './Paneles.css';

/* Editor de localidades del evento (mismo que "Localidades y asientos" de la web): cambiar el tipo (correlativo / filas / mesas),
   agregar o quitar filas, mesas y sillas, crear localidades y opciones de compra (promos). Siempre se REVISA el cambio antes de aplicarlo:
   los asientos vendidos, reservados o impresos nunca se borran (al cambiar de tipo se reubican y conservan su compra y su QR). */

export interface LocalidadEvento {
  id_localidades: number; localidad: string; precio_normal: string; tipo: string; asientos: number; ocupados: number; diseno: Diseno;
  modalidades?: { id: number; codigo?: string; nombre: string; precio: number; factor: number; activo: boolean }[];
}

const TIPOS = [{ valor: 'correlativo', texto: 'Correlativo (sin asiento fijo)' }, { valor: 'fila', texto: 'Por filas (sillas numeradas)' }, { valor: 'mesa', texto: 'Por mesas' }];
const textoTipo = (t: string) => TIPOS.find((x) => x.valor === t)?.texto.split(' (')[0] || t;
const FACTORES = [{ valor: 1, texto: '1 boleto por precio (normal)' }, { valor: 2, texto: '2 por 1 precio (x2)' }, { valor: 3, texto: '3 por 1 precio (x3)' }, { valor: 4, texto: '4 por 1 precio (x4)' }];

interface Revision {
  tipoAnterior: string; tipoNuevo: string; mantener: number; agregar: number; quitar: number; mover: number; total: number;
  movidos?: { id: number; de: string; a: string }[]; conflictos?: string[]; otrosEventos?: string[];
}

/* ---------- editor de filas / mesas / cantidad ---------- */
const EditorDiseno: React.FC<{ diseno: Diseno; setDiseno: (fn: (d: Diseno) => Diseno) => void; existentes: Set<string> | null }> = ({ diseno, setDiseno, existentes }) => {
  const [ag, setAg] = useState({ filas: '1', sillas: '10', mesas: '1', sillasMesa: '6' });
  const esNuevaFila = (fila: string) => !(existentes && existentes.has(`F|${String(fila).toUpperCase()}`));
  const esNuevaMesa = (mesa: string) => !(existentes && existentes.has(`M|${String(mesa).toUpperCase()}`));
  const cambiar = (fn: (d: Diseno) => void) => setDiseno((d) => { const c = clonar(d); fn(c); return c; });

  if (diseno.tipo === 'correlativo') {
    return (
      <div className="pn-campo">
        <IonInput type="number" inputmode="numeric" label="Cantidad de entradas" labelPlacement="floating" fill="outline" value={diseno.cantidad ?? ''} onIonInput={(e) => cambiar((d) => { d.cantidad = num(e.detail.value); })} />
        {!!diseno.ocupados && <p className="pn-sub" style={{ marginTop: 4 }}>{diseno.ocupados} vendidas o reservadas (no puede quedar con menos).</p>}
      </div>
    );
  }

  if (diseno.tipo === 'fila') {
    return (
      <div>
        {(diseno.filas || []).map((f, i) => (
          <div key={i} className="pn-switch" style={{ alignItems: 'flex-end', gap: 8 }}>
            <div style={{ flex: 1 }}>
              {esNuevaFila(f.fila)
                ? <IonInput label="Fila" labelPlacement="floating" fill="outline" value={f.fila} onIonInput={(e) => cambiar((d) => { d.filas![i].fila = String(e.detail.value || ''); })} />
                : <div><span className="pn-lbl">Fila</span><div className="pn-val" style={{ textAlign: 'left' }}>{f.fila}{f.ocupados ? <span className="pn-badge pn-b-warning" style={{ marginLeft: 6 }}>{f.ocupados} vendidas</span> : null}</div></div>}
            </div>
            <div style={{ width: 96 }}><IonInput type="number" inputmode="numeric" label="Sillas" labelPlacement="floating" fill="outline" value={f.sillas ?? ''} onIonInput={(e) => cambiar((d) => { d.filas![i].sillas = num(e.detail.value); })} /></div>
            <IonButton size="small" fill="clear" color="danger" disabled={!!f.ocupados || (diseno.filas || []).length === 1} onClick={() => cambiar((d) => { d.filas!.splice(i, 1); })}>Quitar</IonButton>
          </div>
        ))}
        <div className="pn-botones" style={{ alignItems: 'flex-end' }}>
          <div style={{ width: 80 }}><IonInput type="number" inputmode="numeric" label="Filas" labelPlacement="floating" fill="outline" value={ag.filas} onIonInput={(e) => setAg({ ...ag, filas: String(e.detail.value || '') })} /></div>
          <div style={{ width: 90 }}><IonInput type="number" inputmode="numeric" label="Sillas c/u" labelPlacement="floating" fill="outline" value={ag.sillas} onIonInput={(e) => setAg({ ...ag, sillas: String(e.detail.value || '') })} /></div>
          <IonButton fill="outline" onClick={() => cambiar((d) => { for (let i = 0; i < num(ag.filas); i++) d.filas!.push({ fila: siguienteLetra(d.filas!.map((f) => f.fila)), sillas: num(ag.sillas) || 1 }); })}>Agregar filas</IonButton>
        </div>
      </div>
    );
  }

  const mesasNuevas = (d: Diseno, fila: NonNullable<Diseno['filas']>[number], cantidad: number, sillas: number) => {
    const usadas = new Set(d.filas!.flatMap((f) => (f.mesas || []).map((m) => String(m.mesa).toUpperCase())));
    let n = (fila.mesas || []).reduce((mx, m) => Math.max(mx, numeroFinal(mostrarMesa(m.mesa))), 0);
    for (let i = 0; i < cantidad; i++) {
      let nombre: string;
      do { nombre = `${fila.fila}${++n}`; } while (usadas.has(nombre.toUpperCase()));
      usadas.add(nombre.toUpperCase());
      fila.mesas = [...(fila.mesas || []), { mesa: nombre, sillas }];
    }
  };
  return (
    <div>
      {(diseno.filas || []).map((f, i) => {
        const vendidasFila = (f.mesas || []).reduce((s, m) => s + (m.ocupados || 0), 0);
        return (
          <div key={i} className="pn-card" style={{ boxShadow: 'none', border: '1px solid #e6e9f4', marginBottom: 10 }}>
            <div className="pn-lista-top">
              <span className="pn-lista-nombre">Fila {f.fila}</span>
              <IonButton size="small" fill="clear" color="danger" disabled={!!vendidasFila || (diseno.filas || []).length === 1} onClick={() => cambiar((d) => { d.filas!.splice(i, 1); })}>Quitar fila</IonButton>
            </div>
            {(f.mesas || []).map((m, j) => (
              <div key={j} className="pn-switch" style={{ alignItems: 'flex-end', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  {esNuevaMesa(m.mesa)
                    ? <IonInput label="Mesa" labelPlacement="floating" fill="outline" value={m.mesa} onIonInput={(e) => cambiar((d) => { d.filas![i].mesas![j].mesa = String(e.detail.value || ''); })} />
                    : <div><span className="pn-lbl">Mesa</span><div className="pn-val" style={{ textAlign: 'left' }}>{mostrarMesa(m.mesa)}{m.ocupados ? <span className="pn-badge pn-b-warning" style={{ marginLeft: 6 }}>{m.ocupados} vendidas</span> : null}</div></div>}
                </div>
                <div style={{ width: 90 }}><IonInput type="number" inputmode="numeric" label="Sillas" labelPlacement="floating" fill="outline" value={m.sillas ?? ''} onIonInput={(e) => cambiar((d) => { d.filas![i].mesas![j].sillas = num(e.detail.value); })} /></div>
                <IonButton size="small" fill="clear" color="danger" disabled={!!m.ocupados || (f.mesas || []).length === 1} onClick={() => cambiar((d) => { d.filas![i].mesas!.splice(j, 1); })}>Quitar</IonButton>
              </div>
            ))}
            <div className="pn-botones" style={{ alignItems: 'flex-end' }}>
              <div style={{ width: 80 }}><IonInput type="number" inputmode="numeric" label="Mesas" labelPlacement="floating" fill="outline" value={ag.mesas} onIonInput={(e) => setAg({ ...ag, mesas: String(e.detail.value || '') })} /></div>
              <div style={{ width: 90 }}><IonInput type="number" inputmode="numeric" label="Sillas c/u" labelPlacement="floating" fill="outline" value={ag.sillasMesa} onIonInput={(e) => setAg({ ...ag, sillasMesa: String(e.detail.value || '') })} /></div>
              <IonButton fill="outline" onClick={() => cambiar((d) => mesasNuevas(d, d.filas![i], num(ag.mesas), num(ag.sillasMesa) || 1))}>Agregar mesas</IonButton>
            </div>
          </div>
        );
      })}
      <IonButton fill="outline" onClick={() => cambiar((d) => { const fila = { fila: siguienteLetra(d.filas!.map((x) => x.fila)), mesas: [] as { mesa: string; sillas: number }[] }; d.filas!.push(fila); mesasNuevas(d, fila, num(ag.mesas) || 1, num(ag.sillasMesa) || 1); })}>Agregar fila de mesas</IonButton>
    </div>
  );
};

const ResumenRevision: React.FC<{ r: Revision }> = ({ r }) => {
  const hayConflicto = (r.conflictos || []).length > 0;
  return (
    <div className={hayConflicto ? 'pn-error' : 'pn-aviso'} style={hayConflicto ? undefined : { background: '#e2f0fe', color: '#0b5cab' }}>
      {r.tipoAnterior !== r.tipoNuevo && <div>Cambia de <b>{textoTipo(r.tipoAnterior)}</b> a <b>{textoTipo(r.tipoNuevo)}</b>.</div>}
      <div>Se mantienen <b>{r.mantener}</b> asientos · se agregan <b>{r.agregar}</b> · se quitan <b>{r.quitar}</b> libres{r.mover ? <> · se reubican <b>{r.mover}</b> vendidos o reservados</> : null} · total <b>{r.total}</b>.</div>
      {(r.movidos || []).length > 0 && (
        <details style={{ marginTop: 6 }}><summary>Ver reubicaciones (conservan su compra y su QR)</summary>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>{(r.movidos || []).map((m) => <li key={m.id}>{m.de} → {m.a}</li>)}</ul></details>
      )}
      {(r.conflictos || []).map((c, i) => <div key={i} style={{ fontWeight: 700 }}>⚠ {c}</div>)}
      {(r.otrosEventos || []).length > 0 && <div style={{ fontWeight: 700 }}>⚠ Esta localidad también la usa {(r.otrosEventos || []).join(', ')}: el cambio afecta a esos eventos.</div>}
    </div>
  );
};

const SelectorTipoFactor: React.FC<{ diseno: Diseno; onTipo: (t: Diseno['tipo']) => void; onFactor: (f: number) => void }> = ({ diseno, onTipo, onFactor }) => (
  <>
    <div className="pn-campo">
      <IonSelect label="Tipo" labelPlacement="floating" fill="outline" value={diseno.tipo} interface="action-sheet" onIonChange={(e) => onTipo(String(e.detail.value) as Diseno['tipo'])}>
        {TIPOS.map((t) => <IonSelectOption key={t.valor} value={t.valor}>{t.texto}</IonSelectOption>)}
      </IonSelect>
    </div>
    <div className="pn-campo">
      <IonSelect label="Boletos por precio" labelPlacement="floating" fill="outline" value={Number(diseno.factor) || 1} interface="action-sheet" onIonChange={(e) => onFactor(Number(e.detail.value))}>
        {FACTORES.map((f) => <IonSelectOption key={f.valor} value={f.valor}>{f.texto}</IonSelectOption>)}
      </IonSelect>
    </div>
    {Number(diseno.factor) > 1 && (
      <div className="pn-aviso" style={{ marginTop: 10, background: '#e2f0fe', color: '#0b5cab' }}>
        {diseno.tipo === 'correlativo' ? <>Cada precio da <b>{diseno.factor} entradas</b>.</> : <>Se venden de <b>{diseno.factor} en {diseno.factor} sillas en la misma {diseno.tipo === 'mesa' ? 'mesa' : 'fila'}</b> por un precio.</>} Cada entrada tiene su QR.
        {gruposIncompletos(diseno).length > 0 && <div style={{ color: '#7f1d1d', marginTop: 4 }}>⚠ No se pueden vender completas: {gruposIncompletos(diseno).join(', ')} (sus sillas no son múltiplo de {diseno.factor}).</div>}
      </div>
    )}
  </>
);

type Avisar = (mensaje: string, ok?: boolean) => void;

/* ---------- Editar asientos de una localidad ---------- */
export const EditarAsientos: React.FC<{ codigoEvento: string; loc: LocalidadEvento; toast: Avisar; onCerrar: () => void; onCambio: () => void }> = ({ codigoEvento, loc, toast, onCerrar, onCambio }) => {
  const [diseno, setDisenoEstado] = useState<Diseno>(() => disenoInicial(loc.tipo as Diseno['tipo'], loc.diseno));
  const [revision, setRevision] = useState<Revision | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [confirmar, setConfirmar] = useState(false);
  const existentes = new Set<string>([
    ...((loc.diseno.filas || []).map((f) => `F|${String(f.fila).toUpperCase()}`)),
    ...((loc.diseno.filas || []).flatMap((f) => (f.mesas || []).map((m) => `M|${String(m.mesa).toUpperCase()}`))),
  ]);
  const setDiseno = (fn: (d: Diseno) => Diseno) => { setRevision(null); setDisenoEstado(fn); };

  const revisar = async () => {
    setOcupado(true);
    const r = await disenoRevisar(codigoEvento, loc.id_localidades, limpiar(diseno));
    setOcupado(false);
    if (r.success || r.conflictos) setRevision(r as unknown as Revision); else toast(r.message || 'No se pudo revisar', false);
  };
  const aplicar = async () => {
    setOcupado(true);
    const r = await disenoAplicar(codigoEvento, loc.id_localidades, limpiar(diseno));
    setOcupado(false);
    if (r.success) { toast(r.aplicado ? 'Localidad actualizada' : 'No había cambios'); onCambio(); onCerrar(); } else { if (r.conflictos) setRevision(r as unknown as Revision); toast(r.message || 'No se pudo aplicar', false); }
  };

  return (
    <>
      <div className="pn-card">
        <div className="pn-lista-top"><h3 className="pn-titulo" style={{ margin: 0 }}>Editar asientos · {loc.localidad}</h3><IonButton size="small" fill="clear" onClick={onCerrar}>Volver</IonButton></div>
        <p className="pn-sub" style={{ marginTop: 4 }}>Los asientos vendidos, reservados o impresos nunca se borran. Siempre verás el resumen antes de aplicar.</p>
        <SelectorTipoFactor diseno={diseno} onTipo={(t) => setDiseno(() => disenoInicial(t, loc.diseno))} onFactor={(f) => setDiseno((d) => ({ ...d, factor: f }))} />
        {diseno.tipo !== loc.tipo && <p className="pn-sub" style={{ marginTop: 8, color: '#7a5200' }}>Cambio de tipo: los {loc.ocupados} vendidos o reservados se reubican en los primeros asientos.</p>}
      </div>
      <div className="pn-card">
        <EditorDiseno diseno={diseno} setDiseno={setDiseno} existentes={existentes} />
        <p className="pn-sub" style={{ marginTop: 10 }}>Total: {totalDe(diseno)} asientos</p>
      </div>
      {revision && <ResumenRevision r={revision} />}
      <div className="pn-botones">
        <IonButton fill="outline" disabled={ocupado} onClick={revisar}>{ocupado ? 'Revisando…' : 'Revisar cambios'}</IonButton>
        <IonButton className="pn-boton-p" disabled={ocupado || !revision || (revision.conflictos || []).length > 0} onClick={() => setConfirmar(true)}>Aplicar cambios</IonButton>
      </div>
      <IonAlert isOpen={confirmar} onDidDismiss={() => setConfirmar(false)} header="¿Aplicar los cambios?" message={`Se modifican los asientos a la venta de "${loc.localidad}".`}
        buttons={[{ text: 'No', role: 'cancel' }, { text: 'Sí, aplicar', handler: () => { aplicar(); } }]} />
    </>
  );
};

/* ---------- Localidad nueva ---------- */
export const NuevaLocalidad: React.FC<{ codigoEvento: string; toast: Avisar; onCerrar: () => void; onCambio: () => void }> = ({ codigoEvento, toast, onCerrar, onCambio }) => {
  const [f, setF] = useState({ nombre: '', descripcion: '', precio: '', comision: '1' });
  const [diseno, setDiseno] = useState<Diseno>(() => disenoInicial('correlativo', null));
  const [ocupado, setOcupado] = useState(false);

  const crear = async () => {
    if (!f.nombre.trim()) return toast('Escribe el nombre de la localidad', false);
    if (f.precio === '' || !(Number(f.precio) >= 0)) return toast('Escribe el precio', false);
    setOcupado(true);
    const r = await localidadNueva(codigoEvento, { nombre: f.nombre.trim(), descripcion: f.descripcion.trim(), diseno: limpiar(diseno), precio_normal: Number(f.precio), comision_boleto: Number(f.comision || 0) });
    setOcupado(false);
    if (r.success) {
      toast(r.enMapa === false ? 'Localidad creada, pero el evento no tiene mapa: en la página no se verá (sí en la app de venta)' : `Localidad "${f.nombre.trim()}" creada con ${r.asientos} asientos: ya se vende`, r.enMapa !== false);
      onCambio(); onCerrar();
    } else toast(r.message || 'No se pudo crear la localidad', false);
  };

  return (
    <>
      <div className="pn-card">
        <div className="pn-lista-top"><h3 className="pn-titulo" style={{ margin: 0 }}>Nueva localidad</h3><IonButton size="small" fill="clear" onClick={onCerrar}>Volver</IonButton></div>
        <div className="pn-campo"><IonInput label="Nombre" labelPlacement="floating" fill="outline" value={f.nombre} maxlength={100} onIonInput={(e) => setF({ ...f, nombre: String(e.detail.value || '') })} /></div>
        <div className="pn-campo"><IonInput label="Descripción" labelPlacement="floating" fill="outline" value={f.descripcion} onIonInput={(e) => setF({ ...f, descripcion: String(e.detail.value || '') })} /></div>
        <div className="pn-campo"><IonInput type="number" inputmode="decimal" label="Precio $" labelPlacement="floating" fill="outline" value={f.precio} onIonInput={(e) => setF({ ...f, precio: String(e.detail.value || '') })} /></div>
        <div className="pn-campo"><IonInput type="number" inputmode="decimal" label="Comisión por boleto $" labelPlacement="floating" fill="outline" value={f.comision} onIonInput={(e) => setF({ ...f, comision: String(e.detail.value || '') })} /></div>
        <p className="pn-sub" style={{ marginTop: 8 }}>Se crea en el mismo espacio del evento y aparece en la lista de localidades. Para dibujarla en el mapa usa Espacios → Diseñar mapa en la web; los demás precios se ajustan en la pestaña Resumen.</p>
        <SelectorTipoFactor diseno={diseno} onTipo={(t) => setDiseno((d) => ({ ...disenoInicial(t, null), factor: d.factor }))} onFactor={(fa) => setDiseno((d) => ({ ...d, factor: fa }))} />
      </div>
      <div className="pn-card">
        <EditorDiseno diseno={diseno} setDiseno={(fn) => setDiseno(fn)} existentes={null} />
        <p className="pn-sub" style={{ marginTop: 10 }}>Total: {totalDe(diseno)} asientos</p>
      </div>
      <IonButton expand="block" className="pn-boton-p" disabled={ocupado} onClick={crear}>{ocupado ? 'Creando…' : 'Crear localidad'}</IonButton>
    </>
  );
};

/* ---------- Opciones de compra (promociones como "Promo 2x1") ---------- */
interface Opcion { id?: number; nombre: string; precio: string | number; factor: number; activo: boolean }
export const OpcionesCompra: React.FC<{ codigoEvento: string; loc: LocalidadEvento; toast: Avisar; onCerrar: () => void; onCambio: () => void }> = ({ codigoEvento, loc, toast, onCerrar, onCambio }) => {
  const reales = (loc.modalidades || []).filter((m) => !/^individual$/i.test(m.nombre));
  const [lista, setLista] = useState<Opcion[]>(() => reales.map((m) => ({ id: m.id, nombre: m.nombre, precio: m.precio, factor: m.factor, activo: m.activo })));
  const [nueva, setNueva] = useState<Opcion>({ nombre: '', precio: '', factor: 2, activo: true });
  const [guardando, setGuardando] = useState<string | null>(null);
  const numerada = loc.tipo !== 'correlativo';

  const guardar = async (op: Opcion, clave: string) => {
    if (!String(op.nombre || '').trim()) return toast('Escribe el nombre de la opción', false);
    if (!(Number(op.precio) > 0)) return toast('Escribe el precio de la opción', false);
    setGuardando(clave);
    const r = await opcionCompraGuardar(codigoEvento, loc.id_localidades, { ...(op.id ? { id: op.id } : {}), nombre: String(op.nombre).trim(), precio: Number(op.precio), factor: Number(op.factor) || 1, activo: op.activo !== false });
    setGuardando(null);
    if (r.success) { toast('Opción guardada'); if (!op.id) setNueva({ nombre: '', precio: '', factor: 2, activo: true }); onCambio(); } else toast(r.message || 'No se pudo guardar', false);
  };
  const cambiar = (i: number, campo: keyof Opcion, valor: string | number | boolean) => setLista((l) => l.map((x, j) => (j === i ? { ...x, [campo]: valor } : x)));

  const fila = (op: Opcion, onChange: (c: keyof Opcion, v: string | number | boolean) => void, clave: string) => (
    <div key={clave} className="pn-card" style={{ boxShadow: 'none', border: '1px solid #e6e9f4', marginBottom: 10 }}>
      <div className="pn-campo" style={{ marginTop: 0 }}><IonInput label="Nombre de la opción" placeholder="Ej. Promo 2x1" labelPlacement="floating" fill="outline" value={op.nombre} onIonInput={(e) => onChange('nombre', String(e.detail.value || ''))} /></div>
      <div className="pn-botones" style={{ marginTop: 8 }}>
        <div style={{ flex: 1 }}><IonInput type="number" inputmode="decimal" label="Precio $" labelPlacement="floating" fill="outline" value={op.precio} onIonInput={(e) => onChange('precio', String(e.detail.value || ''))} /></div>
        <div style={{ flex: 1 }}>
          <IonSelect label="Por precio" labelPlacement="floating" fill="outline" value={Number(op.factor) || 1} onIonChange={(e) => onChange('factor', Number(e.detail.value))}>
            {FACTORES.map((x) => <IonSelectOption key={x.valor} value={x.valor}>{x.valor === 1 ? '1 entrada' : `${x.valor} ${numerada ? 'sillas' : 'entradas'}`}</IonSelectOption>)}
          </IonSelect>
        </div>
      </div>
      <div className="pn-switch"><span className="pn-switch-nombre">Activa</span><IonCheckbox checked={op.activo !== false} onIonChange={(e) => onChange('activo', e.detail.checked)} /></div>
      <IonButton expand="block" className="pn-boton-p" disabled={guardando === clave} onClick={() => guardar(op, clave)}>{guardando === clave ? '…' : op.id ? 'Guardar' : 'Agregar'}</IonButton>
    </div>
  );

  return (
    <>
      <div className="pn-card">
        <div className="pn-lista-top"><h3 className="pn-titulo" style={{ margin: 0 }}>Opciones de compra · {loc.localidad}</h3><IonButton size="small" fill="clear" onClick={onCerrar}>Volver</IonButton></div>
        <p className="pn-sub" style={{ marginTop: 4 }}>Al elegir {loc.localidad} el comprador escoge <b>Individual</b> (${Number(loc.precio_normal || 0).toFixed(2)} c/u, el precio normal) o una de estas opciones, siempre con las mismas sillas de la localidad.{numerada ? ' Con 2 o más sillas por precio, se eligen de la misma mesa o fila.' : ''} Vale en la página y en la app de venta; cada entrada tiene su QR.</p>
      </div>
      {lista.map((op, i) => fila(op, (c, v) => cambiar(i, c, v), `op-${op.id}`))}
      <h3 className="pn-titulo" style={{ margin: '4px 2px' }}>Nueva opción</h3>
      {fila(nueva, (c, v) => setNueva((n) => ({ ...n, [c]: v })), 'nueva')}
    </>
  );
};
