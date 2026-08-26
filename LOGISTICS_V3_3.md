# GOY XPRESS — Integración logística v3.3

## Cliente
- Entrega programada y Express con 10 minutos de espera incluidos; después $0.10/min.
- Depósitos: $3.50 hasta 3 cheques; $0.50 por cheque adicional; efectivo máximo $1,000.
- Servicios diversos con cotización personalizada y aceptación/rechazo del cliente.
- Plantillas recurrentes preparadas en backend para reutilizar solicitudes.
- Períodos mensuales con corte operativo el día 30.

## Mensajero
- Estados operativos: Recogido, En camino, Entrega finalizada.
- Foto obligatoria de recogida y entrega.
- Foto de cheques/depósitos y de valores recaudados.
- GPS de la entrega para administración.
- Contador de espera con aviso a WhatsApp al llegar a 10 minutos y decisión retirarse/continuar.

## Administrador web
- Cambio de tipo/nombre del servicio y reajuste de tarifa con motivo.
- Cotización de Servicios diversos.
- Consulta de última ubicación GPS.
- Liberación de cartera solamente con entrega finalizada y evidencia de depósito.
- Reportes por período mensual: CSV, Excel y opción de guardar/imprimir PDF.

## Seguridad y arquitectura
- Una sola API y un solo estado PostgreSQL/Neon.
- Las acciones móviles de cada solicitud usan un secreto individual; conocer el código de pedido no basta para cargar evidencia o GPS.
- La ubicación GPS no se expone en endpoints públicos del cliente.
- No se fusiona el backend Supabase del PR anterior para evitar dos fuentes de datos.
