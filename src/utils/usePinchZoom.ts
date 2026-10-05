import { RefObject, useEffect, useRef } from 'react';
import { flushSync } from 'react-dom';

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 3;

const limitar = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, +z.toFixed(2)));

/* Pellizcar con dos dedos para acercar/alejar el mapa de sillas/mesas, sobre
   el mismo estado `zoom` que usan los botones −/+ (el CSS `zoom` del canvas).

   Con touch events y no pointer events a propósito: con pointer events, en
   cuanto los dedos se mueven el WebView toma el gesto como scroll y manda
   pointercancel, y el pellizco se corta. Los touch events siguen llegando y,
   al hacer preventDefault solo cuando hay 2 dedos, se frena el scroll mientras
   dura el pellizco. Con un dedo no se toca nada: scroll y toque de cada
   asiento funcionan igual que siempre.

   `activo`: el contenedor solo existe una vez cargado el mapa, así que el
   efecto se vuelve a enganchar cuando aparece. */
export const usePinchZoom = (
  ref: RefObject<HTMLElement | null>,
  zoom: number,
  setZoom: (z: number) => void,
  activo: boolean,
) => {
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const setZoomRef = useRef(setZoom);
  setZoomRef.current = setZoom;

  useEffect(() => {
    const el = ref.current;
    if (!el || !activo) return;

    let distInicio = 0;
    let zoomInicio = 1;
    const distancia = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      distInicio = distancia(e.touches);
      zoomInicio = zoomRef.current;
    };

    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || distInicio === 0) return;
      e.preventDefault();
      const nuevo = limitar(zoomInicio * (distancia(e.touches) / distInicio));
      const anterior = zoomRef.current;
      if (nuevo === anterior) return;

      /* Mantiene bajo los dedos el mismo punto del mapa (si no, el zoom
         siempre se va hacia la esquina superior izquierda). */
      const rect = el.getBoundingClientRect();
      const fx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const fy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
      const px = (el.scrollLeft + fx) / anterior;
      const py = (el.scrollTop + fy) / anterior;

      zoomRef.current = nuevo;
      flushSync(() => setZoomRef.current(nuevo));
      el.scrollLeft = px * nuevo - fx;
      el.scrollTop = py * nuevo - fy;
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) distInicio = 0;
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [ref, activo]);
};
