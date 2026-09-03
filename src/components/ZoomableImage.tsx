import { useRef, useState } from 'react';
import './ZoomableImage.css';

/* Visor de imagen con zoom táctil: pellizcar con dos dedos para acercar,
   arrastrar cuando está ampliada, doble toque para alternar zoom. Sin
   librería aparte — solo Pointer Events (funciona igual con dedo o mouse). */

interface Props {
  src: string;
  alt?: string;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOBLE_TOQUE_MS = 300;

const distancia = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y);

const ZoomableImage: React.FC<Props> = ({ src, alt }) => {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  const pointers   = useRef(new Map<number, { x: number; y: number }>());
  const distInicio = useRef(0);
  const scaleInicio = useRef(1);
  const dragInicio  = useRef({ x: 0, y: 0 });
  const ultimoToque = useRef(0);

  const clamp = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const alternarZoom = () => {
    if (scale > 1) { setScale(1); setPos({ x: 0, y: 0 }); }
    else { setScale(2.5); }
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      distInicio.current = distancia(...(Array.from(pointers.current.values()) as [{ x: number; y: number }, { x: number; y: number }]));
      scaleInicio.current = scale;
    } else if (pointers.current.size === 1) {
      dragInicio.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2 && distInicio.current > 0) {
      const [a, b] = Array.from(pointers.current.values());
      setScale(clamp(scaleInicio.current * (distancia(a, b) / distInicio.current)));
    } else if (pointers.current.size === 1 && scale > 1) {
      setPos({ x: e.clientX - dragInicio.current.x, y: e.clientY - dragInicio.current.y });
    }
  };

  const soltar = (e: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) distInicio.current = 0;

    if (pointers.current.size === 0) {
      const ahora = Date.now();
      if (ahora - ultimoToque.current < DOBLE_TOQUE_MS) alternarZoom();
      ultimoToque.current = ahora;
    }
  };

  return (
    <div
      className="zoom-image-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={soltar}
      onPointerCancel={soltar}
    >
      <img
        src={src}
        alt={alt ?? ''}
        className="zoom-image"
        draggable={false}
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
      />
    </div>
  );
};

export default ZoomableImage;
