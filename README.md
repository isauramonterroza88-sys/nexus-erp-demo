# NEXUS ERP CORE

ERP/CRM modular y multiempresa inspirado en Odoo. Backend Express (puerto 5000) con JWT y aislamiento por `company_id`; cliente React + Vite + Tailwind (puerto 5173).

## Ejecutar
```bash
npm run install:all      # instala backend y cliente
npm start                # API en http://localhost:5000
npm --prefix client run dev   # cliente en http://localhost:5173
# o ambos a la vez: npm run dev:all
npm test                 # 30 pruebas de integración del backend
```

## Usuarios de demostración (contraseña `Nexus#2026`)
Se listan en la pantalla de ingreso. Empresa **alfa** (todos los módulos, 7 roles) y **beta** (CRM, Servicios, RRHH). Cualquier empresa nueva se registra desde "Registrar empresa" y empieza vacía y aislada.

## Variables de entorno
| Variable | Uso |
|---|---|
| `JWT_SECRET` | Secreto de firma HS256 (obligatorio en producción) |
| `FRONTEND_ORIGIN` | Origen permitido por CORS |
| `NEXUS_DEMO=false` | Oculta credenciales de demostración |
| `NEXUS_LISTAR_EMPRESAS=false` | Oculta el listado público de empresas |
| `VITE_API_URL` | URL de la API para el cliente |

## Arquitectura
- `core/`: base de datos en memoria por empresa, seguridad (scrypt, JWT), guards (autenticar, permiso, trazas), bus de eventos.
- `modules/`: auth, app_store, ventas_crm, finanzas, cadena_suministro, recursos_humanos, marketing, servicios, motor_analitico.
- Sincronía entre módulos: `factura.emitida` descuenta stock y envía el comprobante; `factura.pagada` recalcula métricas y confirma el pago.
- Los datos viven en memoria: se pierden al reiniciar. Para producción, sustituir `core/database.js` por PostgreSQL (esquema en `01_schema.sql`).

## Módulos, cargos y accesos
La plataforma ofrece los módulos; cada empresa define sus propios cargos (roles) con el nombre que use. Una empresa nueva solo tiene el rol Administrador. Desde **Roles y permisos** el administrador:
- crea los cargos de su organización y elige, para cada módulo activo, si ese cargo lo edita, solo lo consulta o no lo ve;
- define la pantalla con la que entra cada cargo y elimina los que no use;
- asigna el cargo a cada usuario.
Los módulos se contratan en la Tienda de Apps; solo los módulos activos aparecen al configurar un cargo. Los cambios aplican de inmediato y el servidor los hace cumplir. El rol Administrador está protegido para que la empresa nunca quede sin quien la administre. Las empresas de demostración (alfa y beta) traen cargos de ejemplo.

## Modo demostración (ferias y presentaciones)
Con `NEXUS_DEMO` distinto de `false`, el administrador ve **Guía de demostración**: recorrido de 3 minutos, direcciones para abrir el sistema desde celulares en la misma red Wi-Fi y un botón para reiniciar los datos entre visitantes. En producción defina `NEXUS_DEMO=false` para ocultarlo y para dejar de aceptar orígenes de la red local.
