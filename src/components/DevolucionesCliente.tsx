import { useEffect, useState } from 'react';
import { devolucionesDeCliente } from '../utils/panelesAdmin';
import '../pages/Paneles.css';

/* Buscar cliente > apartado "Devoluciones": si el cliente pidió devoluciones, aquí está toda la información de cada una (estado, entradas,
   cuenta, valor devuelto, aviso por correo, estado de sus compras y comentarios del equipo). Si no tiene, o el usuario no tiene permiso
   a Devoluciones, no se muestra nada. */

interface Venta { id: number | string; estado_pago?: string; total_pago?: number; entradas?: number; liberada?: boolean; forma_pago?: string }
interface Comentario { autor?: string; texto?: string; comentario?: string; fecha?: string; creado_en?: string }
interface Solicitud {
  id: number; codigo: string; codigoEvento: string; evento: string; estado: string; cantidad: number; valor: number; total_pagado?: number;
  banco?: string; tipo_cuenta?: string; numero_cuenta?: string; titular?: string; cedula_titular?: string; titular_distinto?: boolean;
  email?: string; telefono?: string; observacion?: string; nota?: string; fecha?: string; actualizado?: string;
  res_monto?: number | null; res_mensaje?: string; res_en?: string | null; res_correo_estado?: string; res_correo_detalle?: string;
  compra_anulada?: boolean; anulacion_detalle?: string | null; compra_ids?: string[]; ventas?: Venta[]; comentarios?: Comentario[];
}

const BADGE: Record<string, string> = {
  Pendiente: 'pn-b-warning', 'En proceso': 'pn-b-info', 'Documentos recibidos': 'pn-b-info', 'Datos incorrectos': 'pn-b-rojo', Devuelta: 'pn-b-ok', Rechazada: 'pn-b-gris', Cancelada: 'pn-b-gris',
};
const dinero = (v: unknown) => `$${(Number(v) || 0).toFixed(2)}`;
const fecha = (v?: string | null) => { const d = v ? new Date(v) : null; return d && !Number.isNaN(d.getTime()) ? d.toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''; };

const DevolucionesCliente: React.FC<{ cedula: string }> = ({ cedula }) => {
  const [lista, setLista] = useState<Solicitud[]>([]);
  const [abierta, setAbierta] = useState<number | null>(null);

  useEffect(() => {
    let vigente = true;
    setLista([]);
    setAbierta(null);
    devolucionesDeCliente(cedula).then((r) => {
      if (!vigente || !r.success || !Array.isArray(r.solicitudes)) return;
      const sols = r.solicitudes as Solicitud[];
      setLista(sols);
      if (sols.length === 1) setAbierta(sols[0].id);
    }).catch(() => undefined);
    return () => { vigente = false; };
  }, [cedula]);

  if (!lista.length) return null;

  const fila = (k: string, v: unknown) => (v === undefined || v === null || v === '' ? null : <div key={k} className="pn-fila"><span className="pn-lbl">{k}</span><span className="pn-val">{String(v)}</span></div>);

  return (
    <div className="pn-card" style={{ marginBottom: 12 }}>
      <h3 className="pn-titulo">Devoluciones ({lista.length})</h3>
      {lista.map((s) => {
        const abiertaEsta = abierta === s.id;
        const resuelta = s.estado === 'Devuelta';
        return (
          <div key={s.id} className={`pn-sol ${resuelta ? 'pn-sol-resuelta' : ''}`}>
            <div className="pn-sol-cab" onClick={() => setAbierta(abiertaEsta ? null : s.id)} role="button" aria-expanded={abiertaEsta}>
              <div className="pn-lista-item">
                <div className="pn-lista-top">
                  <span className="pn-lista-nombre">{s.codigo} · {s.evento}</span>
                  <span className={`pn-badge ${BADGE[s.estado] || 'pn-b-gris'}`}>{resuelta ? 'Resuelto ✓' : s.estado}</span>
                </div>
                <span className="pn-lista-pie">{s.cantidad} entrada{s.cantidad === 1 ? '' : 's'} · {dinero(s.valor)} · {fecha(s.fecha)}</span>
              </div>
            </div>
            {abiertaEsta && (
              <div className="pn-sol-cuerpo">
                {fila('Estado', resuelta ? 'Resuelto (ya se devolvió el dinero)' : s.estado)}
                {fila('Evento', `${s.evento}${s.codigoEvento ? ` (${s.codigoEvento})` : ''}`)}
                {fila('Entradas', s.cantidad)}
                {fila('Valor de las entradas', dinero(s.valor))}
                {s.total_pagado ? fila('Total pagado', dinero(s.total_pagado)) : null}
                {resuelta && s.res_monto !== null && s.res_monto !== undefined ? fila('Valor devuelto', dinero(s.res_monto)) : null}
                {resuelta ? fila('Resuelto el', fecha(s.res_en || s.actualizado)) : null}
                {resuelta && s.res_correo_estado ? fila('Aviso por correo', `${s.res_correo_estado}${s.res_correo_detalle ? ` · ${s.res_correo_detalle}` : ''}`) : null}
                {s.res_mensaje ? fila('Mensaje al cliente', s.res_mensaje) : null}

                <h4 className="pn-sub-titulo">Cuenta para devolver</h4>
                {fila('Banco', [s.banco, s.tipo_cuenta].filter(Boolean).join(' · '))}
                {fila('N.º de cuenta', s.numero_cuenta)}
                {fila('Titular', s.titular)}
                {fila('Cédula del titular', s.cedula_titular)}
                {s.titular_distinto && <div className="pn-aviso">La cuenta es de otra persona.</div>}
                {fila('Correo', s.email)}
                {fila('Celular', s.telefono)}
                {s.observacion ? fila('Observación del cliente', s.observacion) : null}
                {s.nota ? fila('Nota del equipo', s.nota) : null}

                {(s.ventas || []).length > 0 && (
                  <>
                    <h4 className="pn-sub-titulo">Compras</h4>
                    {(s.ventas || []).map((v) => (
                      <div key={v.id} className="pn-fila">
                        <span className="pn-lbl">Compra {v.id}{v.entradas ? ` · ${v.entradas} entrada${v.entradas === 1 ? '' : 's'}` : ''}</span>
                        <span className="pn-val">
                          {v.estado_pago || '—'}{v.estado_pago === 'Devuelto' ? (v.liberada ? ' · asientos liberados' : ' · asientos sin liberar') : ''} · {dinero(v.total_pago)}
                        </span>
                      </div>
                    ))}
                  </>
                )}
                {resuelta && fila('Compra anulada', s.compra_anulada ? 'Sí: asientos libres y QR cambiado' : 'Todavía no (los boletos del cliente siguen activos)')}
                {s.anulacion_detalle ? <p className="pn-sub">{s.anulacion_detalle}</p> : null}

                {(s.comentarios || []).length > 0 && (
                  <>
                    <h4 className="pn-sub-titulo">Comentarios del equipo</h4>
                    <div className="pn-historial">
                      {(s.comentarios || []).map((c, i) => (
                        <div key={i} className="pn-nota"><div className="pn-nota-texto">{c.texto ?? c.comentario}</div><div className="pn-nota-pie">{c.autor} · {fecha(c.fecha ?? c.creado_en)}</div></div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default DevolucionesCliente;
