# Sincronizar boletos físicos con asientos numerados

Pantalla de admin: **Admin › Evento › Sincronizar físicos**
(`/admin/evento/:codigoEvento/sincronizar-fisicos`, `src/pages/AdminSincronizarFisicos.tsx`).

Sirve para boletos impresos con número correlativo que se quieren asignar a
asientos de una localidad **numerada** (fila/mesa) del mapa digital, sin pasar
por una compra. El admin elige los asientos en el mapa y, por cada uno, puede
escribir una cédula (o cualquier texto) y escanear el QR del boleto físico.

## Endpoint que necesita la app (MS-LOGIN-BOLETERIA)

`POST /ms_login/api/v1/boletos_fisicos/sincronizar_asientos`

Cabeceras: las de siempre de ms_login más `Authorization: Bearer <JWT del admin>`.
Solo debe aceptarse para perfil `admin` / `super_admin`.

```json
{
  "codigoEvento": "EMHNKL",
  "id_localidad": 10,
  "id_operador": 7,
  "asientos": [
    { "id_localidades_items": 102, "codigo_barras": "000123", "cedula": "0912345678", "seccion": "General" },
    { "id_localidades_items": 103, "codigo_barras": null,     "cedula": null,         "seccion": null }
  ]
}
```

Por cada asiento (idealmente en una transacción por asiento, para que uno que
falle no frene a los demás):

1. Validar que `localidades_items.id = id_localidades_items` pertenezca a
   `id_localidad` y esté `Disponible`. Si no, devolver ese asiento con `ok:false`.
2. Si viene `codigo_barras`, validar que ningún otro `localidades_items` lo
   tenga ya en `id_registra_compra` y que en `boletos_fisicos` (si existe para
   ese `codigoEvento`) no esté `Vendido`/`Anulado`.
3. Actualizar el asiento:
   - `estado = 'Ocupado'`, `fecha_ocupado = NOW()`
   - `cedula = <cedula>` o `NULL` (el mapa lo pinta rojo solo si tiene cédula)
   - `id_registra_compra = <codigo_barras>` si viene — es el mismo QR del
     boleto físico, igual que hace `AsignarBoletoFisico`
   - `id_registraCompra = NULL` — así la app distingue una asignación manual
     de una compra real.
4. Si vino `codigo_barras` y `seccion`: marcar esa fila de `boletos_fisicos`
   como usada (`estado`, `id_localidades_items`, `id_operador`, fecha), igual
   que `AsignarBoletoFisico` pero sin `id_registraCompra`.
5. Para que el boleto se pueda **canjear en la puerta** (`Boleteria/BoletoScan`
   busca `ticket_usuarios` por `id_localidades_items`), crear una fila en
   `ticket_usuarios` con ese `id_localidades_items`, `cedula`, `localidad`,
   `codigoEvento`, `canje = 'NO CANJEADO'` y valor 0.
6. Registrar en el log quién hizo la asignación (`id_operador`).

Respuesta:

```json
{
  "success": true,
  "resultados": [
    { "id_localidades_items": 102, "ok": true },
    { "id_localidades_items": 103, "ok": false, "message": "El asiento ya no está disponible." }
  ]
}
```

La app muestra el mensaje de cada asiento que falla y deja esos asientos en la
lista para reintentar. Si la ruta no existe (404) avisa que falta desplegar el
backend.

## Consulta del QR (`Boleteria/info-boleto/:codigo`)

No hace falta cambiarla: como el código queda en
`localidades_items.id_registra_compra`, al escanear el boleto físico devuelve
`tipo: "asiento"` con la fila/silla, la localidad y la `cedula`. Con
`id_registraCompra = null` y `estado = Ocupado`, "Escanear boleto" lo muestra
como **Boleto físico sincronizado (sin compra)**. Si tiene `id_registraCompra`,
muestra la compra.

## Liberar una asignación

Implementado en `MS-LOGIN-BOLETERIA` (`SincronizarAsientosFisicos` en
`BoletosFisicos.controller.js`). Un código que no está en el inventario se
registra en `boletos_fisicos` con la sección `SINCRONIZADO`, guardando el QR
digital original en `qr_original`.

Se libera con la herramienta de siempre (**Ver / editar asientos › Liberar**,
que llama a `liberar_asientos_admin`): borra el ticket, restaura el QR digital
original y deja el boleto físico `Disponible`. Ojo: la pantalla de la app no
deja tocar un asiento ocupado **con cédula** (lo trata como de un cliente), así
que un asiento sincronizado con cédula hoy no se puede liberar desde esa
pantalla (el endpoint sí lo permite).
