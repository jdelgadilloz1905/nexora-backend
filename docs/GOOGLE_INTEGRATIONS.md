# Nexora - Integraciones con Google APIs

Este documento describe todas las integraciones de Google disponibles en Nexora, sus casos de uso y estado de implementación.

---

## Resumen de APIs

| API | Scope | Estado | Prioridad |
|-----|-------|--------|-----------|
| Google Calendar | `calendar`, `calendar.events` | ✅ Implementado | Alta |
| Gmail | `gmail.readonly`, `gmail.send`, `gmail.modify` | ✅ Implementado | Alta |
| Google Tasks | `tasks`, `tasks.readonly` | ✅ Implementado | Alta |
| People (Contacts) | `contacts.readonly` | ✅ Implementado | Media |
| Google Drive | `drive.readonly` | ✅ Implementado | Media |
| Google Sheets | `spreadsheets.readonly` | 🔄 Pendiente | Baja |
| Google Docs | `documents.readonly` | 🔄 Pendiente | Baja |

---

## 1. Google Calendar API

### Estado: ✅ Implementado

### Descripción
Permite a Nexora gestionar el calendario del usuario: ver eventos, crear reuniones, verificar disponibilidad.

### Scopes utilizados
- `https://www.googleapis.com/auth/calendar`
- `https://www.googleapis.com/auth/calendar.events`

### Herramientas disponibles

| Tool | Descripción |
|------|-------------|
| `get_calendar_events` | Obtener eventos en un rango de fechas |
| `get_today_events` | Ver eventos de hoy |
| `get_upcoming_events` | Ver próximos eventos (1-7 días) |
| `create_calendar_event` | Crear nuevo evento/reunión |
| `update_calendar_event` | Modificar evento existente |
| `delete_calendar_event` | Eliminar/cancelar evento |
| `check_availability` | Verificar disponibilidad en un horario |

### Casos de uso

```
Usuario: "¿Qué tengo para hoy?"
Nexora: [usa get_today_events] → Lista de reuniones del día

Usuario: "Agenda una reunión con Juan mañana a las 10am"
Nexora: [usa create_calendar_event] → Evento creado

Usuario: "Mueve la reunión de las 3pm a las 5pm"
Nexora: [usa update_calendar_event] → Evento actualizado

Usuario: "¿Estoy libre mañana a las 2pm?"
Nexora: [usa check_availability] → "Sí, estás libre de 1pm a 4pm"

Usuario: "Cancela la reunión con el cliente"
Nexora: [usa delete_calendar_event] → Evento eliminado
```

### Archivo de implementación
- `src/modules/integrations/google-calendar.service.ts`

---

## 2. Gmail API

### Estado: ✅ Implementado

### Descripción
Permite a Nexora gestionar el correo del usuario: leer, enviar, responder, buscar y organizar emails.

### Scopes utilizados
- `https://www.googleapis.com/auth/gmail.readonly`
- `https://www.googleapis.com/auth/gmail.send`
- `https://www.googleapis.com/auth/gmail.modify`

### Herramientas disponibles

| Tool | Descripción |
|------|-------------|
| `get_emails` | Obtener correos de la bandeja de entrada |
| `get_unread_emails` | Ver correos no leídos |
| `search_emails` | Buscar correos con query de Gmail |
| `read_email` | Leer contenido completo de un correo |
| `send_email` | Enviar correo nuevo (con preview) |
| `reply_email` | Responder a un correo existente (con preview) |
| `archive_email` | Archivar correo |
| `mark_email_read` | Marcar como leído |
| `get_unread_count` | Contar correos sin leer |

### Casos de uso

```
Usuario: "¿Tengo correos sin leer?"
Nexora: [usa get_unread_emails] → "Tienes 5 correos sin leer..."

Usuario: "Busca correos de Juan"
Nexora: [usa search_emails con query "from:juan"] → Lista de correos

Usuario: "Lee el primer correo"
Nexora: [usa read_email] → Contenido completo del correo

Usuario: "Envía un correo a maria@empresa.com diciendo que confirmo la cita"
Nexora: [usa send_email con confirmed=false] → Preview
Usuario: "Sí, envíalo"
Nexora: [usa send_email con confirmed=true] → Correo enviado

Usuario: "Responde al correo de Pedro diciendo gracias"
Nexora: [usa reply_email] → Preview y luego envío

Usuario: "Archiva el correo de la newsletter"
Nexora: [usa archive_email] → Correo archivado
```

### Características especiales
- **Preview antes de enviar**: Siempre muestra borrador antes de enviar
- **Búsqueda por remitente**: `reply_email` puede buscar por nombre
- **Threading correcto**: Las respuestas mantienen el hilo

### Archivo de implementación
- `src/modules/integrations/google-gmail.service.ts`

---

## 3. Google Tasks API

### Estado: ✅ Implementado

### Descripción
Permite a Nexora gestionar las tareas del usuario con un sistema de prioridades (HIGH, MEDIUM, LOW, NOISE) y sincronización con Google Tasks.

### Scopes utilizados
- `https://www.googleapis.com/auth/tasks`
- `https://www.googleapis.com/auth/tasks.readonly`

### Sistema de prioridades
| Prioridad | Emoji | Vencimiento default | Descripción |
|-----------|-------|---------------------|-------------|
| HIGH | 🔴 | 1 día | Urgente, impacto directo en el negocio |
| MEDIUM | 🟡 | 2 días | Importante, debe hacerse pronto |
| LOW | 🟢 | 5 días | Puede esperar, bajo impacto |
| NOISE | 🟣 | Sin fecha | Sin clasificar, requiere decisión |

### Herramientas disponibles

| Tool | Descripción |
|------|-------------|
| `get_tasks` | Obtener tareas (filtrar por prioridad/estado) |
| `create_task` | Crear nueva tarea con prioridad y fecha |
| `complete_task` | Marcar tarea como completada |
| `get_briefing` | Resumen ejecutivo del día |

### Casos de uso

```
Usuario: "¿Qué tareas tengo pendientes?"
Nexora: [usa get_tasks] → Lista de tareas organizadas por prioridad

Usuario: "¿Qué tengo urgente?"
Nexora: [usa get_tasks con priority=HIGH]
→ "Tienes 2 tareas urgentes:
   🔴 Preparar presupuesto para cliente - vence hoy
   🔴 Revisar contrato - vence hoy"

Usuario: "Crea una tarea para llamar al banco mañana"
Nexora: "¿Es urgente (HIGH) o puede esperar (MEDIUM)?"
Usuario: "Medium"
Nexora: [usa create_task] → "✓ Tarea creada: Llamar al banco - 🟡 MEDIUM - vence mañana"

Usuario: "Tengo que enviar el informe hoy"
Nexora: [detecta urgencia y usa create_task con HIGH]
→ "✓ Tarea creada: Enviar el informe - 🔴 HIGH - vence hoy"

Usuario: "Ya terminé lo del presupuesto"
Nexora: [usa complete_task] → "✓ Completada: Preparar presupuesto. Te quedan 3 tareas HIGH."

Usuario: "Dame mi resumen del día"
Nexora: [usa get_briefing + get_today_events + get_unread_emails]
→ "Buenos días. Tu día:
   🔴 HIGH: 2 tareas urgentes
   🟡 MEDIUM: 3 tareas importantes
   📅 Reuniones: 2 hoy (10am, 3pm)
   📧 Correos sin leer: 5
   ¿Empezamos con las urgentes?"

Usuario: "Quizás debería revisar las redes sociales"
Nexora: "Lo clasifico como 🟣 NOISE. ¿Lo hacemos (asignar prioridad) o lo descartamos?"
Usuario: "Descártalo"
Nexora: "✓ Descartado. Nos enfocamos en lo importante."

Usuario: "¿Qué tareas completé esta semana?"
Nexora: [usa get_tasks con status=COMPLETED]
→ Lista de tareas completadas
```

### Filosofía DO SOMETHING / DO NOTHING
Para items clasificados como NOISE, Nexora ayuda al usuario a decidir:
- **DO SOMETHING**: Convertir en tarea real con prioridad
- **DO NOTHING**: Descartar, archivar o ignorar

Pregunta clave: "¿Esta tarea hace crecer el negocio o solo mantiene ocupado al usuario?"

### Archivo de implementación
- `src/modules/integrations/google-tasks.service.ts`
- `src/modules/tasks/tasks.service.ts` (tareas internas de Nexora)

---

## 4. People API (Contacts)

### Estado: ✅ Implementado

### Descripción
Permite a Nexora acceder a los contactos de Google del usuario para buscar información de contacto.

### Scopes utilizados
- `https://www.googleapis.com/auth/contacts.readonly`

### Herramientas disponibles

| Tool | Descripción |
|------|-------------|
| `get_contacts` | Listar contactos de Google |
| `search_contacts` | Buscar contacto por nombre, email o empresa |

### Casos de uso

```
Usuario: "¿Cuál es el correo de María García?"
Nexora: [usa search_contacts con query "María García"]
→ "María García: maria.garcia@empresa.com, +52 555 123 4567, Empresa XYZ"

Usuario: "Muéstrame mis contactos"
Nexora: [usa get_contacts] → Lista de contactos con nombre, email, teléfono

Usuario: "Busca el teléfono de TechCorp"
Nexora: [usa search_contacts con query "TechCorp"]
→ "Juan Pérez (TechCorp): +52 555 987 6543"

Usuario: "Envía un correo a Roberto preguntando por el proyecto"
Nexora: [usa search_contacts para encontrar email de Roberto]
Nexora: [usa send_email con el email encontrado]
→ Preview del correo a roberto@empresa.com
```

### Diferencia con Memory
- **Contactos de Google**: Datos oficiales sincronizados con Google
- **Memory (recall)**: Información que el usuario ha compartido en conversaciones
- **Estrategia**: Primero buscar en Contactos, luego en Memory

### Archivo de implementación
- `src/modules/integrations/google-contacts.service.ts`

---

## 5. Google Drive API

### Estado: ✅ Implementado

### Descripción
Permite a Nexora buscar, listar y acceder a archivos en Google Drive del usuario.

### Scopes utilizados
- `https://www.googleapis.com/auth/drive.readonly`

### Herramientas disponibles

| Tool | Descripción |
|------|-------------|
| `search_drive_files` | Buscar archivos por nombre (con filtro opcional por tipo) |
| `list_recent_files` | Listar archivos recientes |
| `list_drive_files_by_type` | Listar archivos por tipo (document, spreadsheet, presentation, folder, pdf) |
| `list_shared_files` | Ver archivos compartidos conmigo |
| `list_starred_files` | Ver archivos destacados |
| `get_file_info` | Obtener información detallada de un archivo |
| `get_storage_quota` | Ver espacio de almacenamiento usado/disponible |

### Casos de uso

```
Usuario: "Busca el documento del proyecto Alpha"
Nexora: [usa search_drive_files] → Lista de documentos que coinciden

Usuario: "¿Cuáles son mis archivos más recientes?"
Nexora: [usa list_recent_files] → "Presentación Q4.pptx (hace 2 horas)..."

Usuario: "Muéstrame mis hojas de cálculo"
Nexora: [usa list_drive_files_by_type con type=spreadsheet]
→ Lista de spreadsheets con nombre, fecha y link

Usuario: "¿Quién tiene acceso al presupuesto?"
Nexora: [busca archivo "presupuesto"] + [usa get_file_info]
→ Lista de personas con acceso y sus permisos

Usuario: "¿Qué archivos me han compartido?"
Nexora: [usa list_shared_files] → Lista de archivos compartidos

Usuario: "Mis archivos destacados"
Nexora: [usa list_starred_files] → Archivos con estrella

Usuario: "¿Cuánto espacio tengo en Drive?"
Nexora: [usa get_storage_quota]
→ "Usas 12.5 GB de 15 GB. Te quedan 2.5 GB disponibles."
```

### Tipos de archivo soportados
- **document**: Google Docs
- **spreadsheet**: Google Sheets
- **presentation**: Google Slides
- **folder**: Carpetas
- **pdf**: Archivos PDF

### Información de archivos
Cada archivo incluye:
- ID, nombre, tipo
- Link de acceso directo
- Fecha de creación/modificación
- Tamaño (si aplica)
- Propietarios
- Estado de compartido/destacado
- Permisos (en get_file_info)

### Archivo de implementación
- `src/modules/integrations/google-drive.service.ts`

---

## 6. Google Sheets API

### Estado: 🔄 Pendiente de implementación

### Descripción
Permitirá a Nexora leer y eventualmente escribir datos en hojas de cálculo de Google.

### Scopes a utilizar
- `https://www.googleapis.com/auth/spreadsheets.readonly` (lectura)
- `https://www.googleapis.com/auth/spreadsheets` (lectura/escritura)

### Herramientas planificadas

| Tool | Descripción |
|------|-------------|
| `read_spreadsheet` | Leer datos de una hoja de cálculo |
| `get_spreadsheet_info` | Obtener información del spreadsheet |
| `search_in_spreadsheet` | Buscar valor en una hoja |
| `create_spreadsheet` | Crear nueva hoja de cálculo |
| `write_to_spreadsheet` | Escribir datos en una hoja |

### Casos de uso planificados

```
Usuario: "Muéstrame los datos de ventas del Q4"
Nexora: [busca spreadsheet "ventas"] + [read_spreadsheet]
→ Tabla con datos de ventas

Usuario: "¿Cuál fue el total de ventas en octubre?"
Nexora: [read_spreadsheet + analiza] → "El total de octubre fue $45,000"

Usuario: "Crea un spreadsheet con el resumen de tareas"
Nexora: [get_tasks] + [create_spreadsheet]
→ "Creé una hoja con 15 tareas: [link]"

Usuario: "Agrega una fila con los datos del nuevo cliente"
Nexora: [write_to_spreadsheet] → Fila agregada
```

### Consideraciones de implementación
- **Lectura primero**: Implementar solo lectura inicialmente
- **Especificar rango**: Leer rangos específicos para no cargar hojas enormes
- **Formateo inteligente**: Presentar datos de forma legible

### Archivo de implementación (futuro)
- `src/modules/integrations/google-sheets.service.ts`

---

## 7. Google Docs API

### Estado: 🔄 Pendiente de implementación

### Descripción
Permitirá a Nexora leer y crear documentos de Google Docs.

### Scopes a utilizar
- `https://www.googleapis.com/auth/documents.readonly` (lectura)
- `https://www.googleapis.com/auth/documents` (lectura/escritura)

### Herramientas planificadas

| Tool | Descripción |
|------|-------------|
| `read_document` | Leer contenido de un documento |
| `get_document_info` | Obtener metadata del documento |
| `create_document` | Crear nuevo documento |
| `append_to_document` | Agregar contenido a un documento |
| `summarize_document` | Resumir el contenido de un documento |

### Casos de uso planificados

```
Usuario: "¿Qué dice el documento de especificaciones?"
Nexora: [busca doc] + [read_document] → Contenido o resumen

Usuario: "Resume el documento del proyecto Alpha"
Nexora: [read_document] + [LLM summarize]
→ "El documento describe: 1) Objetivos... 2) Timeline..."

Usuario: "Crea un documento con las notas de la reunión de hoy"
Nexora: [create_document con contenido de reunión]
→ "Documento creado: [link]"

Usuario: "Agrega el resumen de tareas al documento de proyecto"
Nexora: [append_to_document] → Contenido agregado
```

### Consideraciones de implementación
- **Lectura primero**: Solo lectura inicialmente
- **Límite de contenido**: Documentos muy largos deben resumirse
- **Integración con reuniones**: Crear notas de reuniones automáticamente

### Archivo de implementación (futuro)
- `src/modules/integrations/google-docs.service.ts`

---

## Orden de implementación recomendado

1. ✅ **Google Calendar** - Crítico para productividad
2. ✅ **Gmail** - Crítico para comunicación
3. ✅ **Google Tasks** - Gestión de tareas
4. ✅ **People API** - Buscar contactos
5. ✅ **Google Drive** - Buscar archivos
6. 🔄 **Google Sheets** - Leer datos (SIGUIENTE)
7. 🔄 **Google Docs** - Leer/crear documentos

---

## Reconexión de Google

Cuando se agregan nuevos scopes (permisos), los usuarios existentes deben reconectar su cuenta de Google:

1. Ir a **Configuración** en Nexora
2. Click en **Desconectar Google**
3. Click en **Conectar Google**
4. Autorizar los nuevos permisos en la pantalla de Google

---

## Seguridad y privacidad

### Principios
- **Mínimo privilegio**: Solo solicitar scopes necesarios
- **Lectura primero**: Preferir scopes de solo lectura cuando sea posible
- **Confirmación de acciones**: Preview antes de enviar correos, compartir archivos
- **No almacenar contenido**: Solo metadata, no contenido de emails/documentos

### Datos almacenados
- Tokens de acceso (encriptados)
- Email del usuario
- Scopes autorizados
- Fecha de conexión

### Datos NO almacenados
- Contenido de correos
- Contenido de documentos
- Lista de contactos (solo se consulta en tiempo real)

---

**Última actualización**: 2026-01-15
**Autor**: Claude + Usuario
