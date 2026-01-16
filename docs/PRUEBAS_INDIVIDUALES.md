# Pruebas Individuales - Nexora

Documento de pruebas unitarias para cada funcionalidad de Nexora.

---

## 1. GOOGLE CALENDAR

### Test 1.1: Ver eventos de hoy
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Qué tengo para hoy?` |
| **Tool esperado** | `get_today_events` |
| **Respuesta esperada** | Lista de eventos con hora, título, duración |
| **Validación** | Comparar con Google Calendar |

### Test 1.2: Ver eventos de la semana
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Qué reuniones tengo esta semana?` |
| **Tool esperado** | `get_upcoming_events` |
| **Respuesta esperada** | Lista de eventos de los próximos 7 días |

### Test 1.3: Crear evento
| Campo | Valor |
|-------|-------|
| **Prompt** | `Crea una reunión mañana a las 10am llamada "Test Nexora" de 30 minutos` |
| **Tool esperado** | `create_calendar_event` |
| **Parámetros** | title: "Test Nexora", duration: 30, startTime: mañana 10:00 |
| **Validación** | Verificar en Google Calendar que existe |

### Test 1.4: Verificar disponibilidad
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Estoy libre mañana a las 3pm?` |
| **Tool esperado** | `check_availability` |
| **Respuesta esperada** | Sí/No con detalles de conflictos |

### Test 1.5: Modificar evento
| Campo | Valor |
|-------|-------|
| **Prompt** | `Mueve la reunión "Test Nexora" a las 11am` |
| **Tool esperado** | `update_calendar_event` |
| **Validación** | Verificar cambio de hora en Calendar |

### Test 1.6: Eliminar evento
| Campo | Valor |
|-------|-------|
| **Prompt** | `Cancela la reunión "Test Nexora"` |
| **Tool esperado** | `delete_calendar_event` |
| **Validación** | Verificar que no existe en Calendar |

---

## 2. GMAIL

### Test 2.1: Ver correos no leídos
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Tengo correos sin leer?` |
| **Tool esperado** | `get_unread_emails` |
| **Respuesta esperada** | Lista con remitente, asunto, fecha |

### Test 2.2: Contar correos no leídos
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Cuántos emails nuevos tengo?` |
| **Tool esperado** | `get_unread_count` |
| **Respuesta esperada** | Número de correos sin leer |

### Test 2.3: Buscar correos
| Campo | Valor |
|-------|-------|
| **Prompt** | `Busca correos de esta semana` |
| **Tool esperado** | `search_emails` |
| **Query** | `newer_than:7d` |
| **Respuesta esperada** | Lista filtrada de correos |

### Test 2.4: Buscar por remitente
| Campo | Valor |
|-------|-------|
| **Prompt** | `Busca correos de Google` |
| **Tool esperado** | `search_emails` |
| **Query** | `from:google` |

### Test 2.5: Leer correo
| Campo | Valor |
|-------|-------|
| **Prompt** | `Lee el primer correo` |
| **Tool esperado** | `read_email` |
| **Respuesta esperada** | Contenido completo del correo |

### Test 2.6: Enviar correo (Preview)
| Campo | Valor |
|-------|-------|
| **Prompt** | `Envía un correo a test@test.com diciendo "Prueba"` |
| **Tool esperado** | `send_email` con `confirmed=false` |
| **Respuesta esperada** | Preview del correo + pregunta "¿Lo envío?" |

### Test 2.7: Confirmar envío
| Campo | Valor |
|-------|-------|
| **Prompt** | `Sí, envíalo` (después del preview) |
| **Tool esperado** | `send_email` con `confirmed=true` |
| **Validación** | Correo aparece en "Enviados" |

### Test 2.8: Archivar correo
| Campo | Valor |
|-------|-------|
| **Prompt** | `Archiva el último correo` |
| **Tool esperado** | `archive_email` |
| **Validación** | Correo sale de inbox |

### Test 2.9: Responder correo
| Campo | Valor |
|-------|-------|
| **Prompt** | `Responde al correo de [nombre] diciendo gracias` |
| **Tool esperado** | `reply_email` |
| **Validación** | Threading correcto (mismo hilo) |

---

## 3. GOOGLE TASKS

### Test 3.1: Ver todas las tareas
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Qué tareas tengo pendientes?` |
| **Tool esperado** | `get_tasks` |
| **Respuesta esperada** | Lista organizada por prioridad |

### Test 3.2: Filtrar por prioridad HIGH
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Qué tengo urgente?` |
| **Tool esperado** | `get_tasks` con `priority=HIGH` |
| **Respuesta esperada** | Solo tareas 🔴 HIGH |

### Test 3.3: Filtrar por prioridad MEDIUM
| Campo | Valor |
|-------|-------|
| **Prompt** | `Mis tareas medium` |
| **Tool esperado** | `get_tasks` con `priority=MEDIUM` |
| **Respuesta esperada** | Solo tareas 🟡 MEDIUM |

### Test 3.4: Crear tarea HIGH
| Campo | Valor |
|-------|-------|
| **Prompt** | `Crea una tarea urgente: Llamar al cliente` |
| **Tool esperado** | `create_task` con `priority=HIGH` |
| **Validación** | Tarea creada con vencimiento hoy |

### Test 3.5: Crear tarea MEDIUM
| Campo | Valor |
|-------|-------|
| **Prompt** | `Crea una tarea medium: Revisar documentación` |
| **Tool esperado** | `create_task` con `priority=MEDIUM` |
| **Validación** | Tarea creada con vencimiento en 2 días |

### Test 3.6: Crear tarea LOW
| Campo | Valor |
|-------|-------|
| **Prompt** | `Crea una tarea de baja prioridad: Organizar archivos` |
| **Tool esperado** | `create_task` con `priority=LOW` |
| **Validación** | Tarea creada con vencimiento en 5 días |

### Test 3.7: Completar tarea
| Campo | Valor |
|-------|-------|
| **Prompt** | `Completa la tarea de llamar al cliente` |
| **Tool esperado** | `complete_task` |
| **Validación** | Tarea marcada como completada |

### Test 3.8: Briefing diario
| Campo | Valor |
|-------|-------|
| **Prompt** | `Dame mi briefing del día` |
| **Tool esperado** | `get_briefing` + `get_today_events` + `get_unread_emails` |
| **Respuesta esperada** | Resumen con tareas, reuniones, correos |

### Test 3.9: Ver tareas completadas
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Qué tareas completé?` |
| **Tool esperado** | `get_tasks` con `status=COMPLETED` |

---

## 4. PEOPLE API (CONTACTS)

### Test 4.1: Listar contactos
| Campo | Valor |
|-------|-------|
| **Prompt** | `Muéstrame mis contactos` |
| **Tool esperado** | `get_contacts` |
| **Respuesta esperada** | Lista con nombre, email, teléfono |

### Test 4.2: Buscar por nombre
| Campo | Valor |
|-------|-------|
| **Prompt** | `Busca el contacto de [Nombre]` |
| **Tool esperado** | `search_contacts` |
| **Respuesta esperada** | Datos del contacto encontrado |

### Test 4.3: Buscar por empresa
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Tengo contactos de Google?` |
| **Tool esperado** | `search_contacts` con query "Google" |

### Test 4.4: Obtener email de contacto
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Cuál es el correo de [Nombre]?` |
| **Tool esperado** | `search_contacts` |
| **Respuesta esperada** | Email del contacto |

### Test 4.5: Contacto no encontrado
| Campo | Valor |
|-------|-------|
| **Prompt** | `Busca a PersonaQueNoExiste12345` |
| **Tool esperado** | `search_contacts` |
| **Respuesta esperada** | Mensaje "No encontré contactos..." |

---

## 5. GOOGLE DRIVE

### Test 5.1: Archivos recientes
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Cuáles son mis archivos más recientes?` |
| **Tool esperado** | `list_recent_files` |
| **Respuesta esperada** | Lista con nombre, tipo, fecha, link |

### Test 5.2: Listar documentos
| Campo | Valor |
|-------|-------|
| **Prompt** | `Muéstrame mis documentos` |
| **Tool esperado** | `list_drive_files_by_type` con `fileType=document` |
| **Respuesta esperada** | Solo Google Docs |

### Test 5.3: Listar hojas de cálculo
| Campo | Valor |
|-------|-------|
| **Prompt** | `Muéstrame mis hojas de cálculo` |
| **Tool esperado** | `list_drive_files_by_type` con `fileType=spreadsheet` |
| **Respuesta esperada** | Solo Google Sheets |

### Test 5.4: Listar presentaciones
| Campo | Valor |
|-------|-------|
| **Prompt** | `Muéstrame mis presentaciones` |
| **Tool esperado** | `list_drive_files_by_type` con `fileType=presentation` |
| **Respuesta esperada** | Solo Google Slides |

### Test 5.5: Listar carpetas
| Campo | Valor |
|-------|-------|
| **Prompt** | `Muéstrame mis carpetas` |
| **Tool esperado** | `list_drive_files_by_type` con `fileType=folder` |

### Test 5.6: Buscar archivo
| Campo | Valor |
|-------|-------|
| **Prompt** | `Busca archivos que contengan "proyecto"` |
| **Tool esperado** | `search_drive_files` |
| **Respuesta esperada** | Archivos que coinciden |

### Test 5.7: Archivos compartidos
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Qué archivos me han compartido?` |
| **Tool esperado** | `list_shared_files` |
| **Respuesta esperada** | Lista con propietario |

### Test 5.8: Archivos destacados
| Campo | Valor |
|-------|-------|
| **Prompt** | `Mis archivos destacados` |
| **Tool esperado** | `list_starred_files` |

### Test 5.9: Espacio de almacenamiento
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Cuánto espacio tengo en Drive?` |
| **Tool esperado** | `get_storage_quota` |
| **Respuesta esperada** | Usado/Total/Disponible |

### Test 5.10: Info de archivo
| Campo | Valor |
|-------|-------|
| **Prompt** | `Dame información del primer archivo` (después de listar) |
| **Tool esperado** | `get_file_info` |
| **Respuesta esperada** | Detalles completos incluyendo permisos |

---

## 6. MEMORY SYSTEM

### Test 6.1: Guardar preferencia
| Campo | Valor |
|-------|-------|
| **Prompt** | `Recuerda que prefiero las reuniones por la mañana` |
| **Tool esperado** | `remember` con `type=preference` |
| **Validación** | Memoria guardada |

### Test 6.2: Guardar contacto
| Campo | Valor |
|-------|-------|
| **Prompt** | `Recuerda que Juan Pérez trabaja en TechCorp, su email es juan@techcorp.com` |
| **Tool esperado** | `remember` con `type=contact` |

### Test 6.3: Guardar proyecto
| Campo | Valor |
|-------|-------|
| **Prompt** | `Recuerda que el proyecto Alpha tiene deadline el 30 de enero` |
| **Tool esperado** | `remember` con `type=project` |

### Test 6.4: Guardar instrucción
| Campo | Valor |
|-------|-------|
| **Prompt** | `Recuerda que cuando escriba a clientes debo usar tono formal` |
| **Tool esperado** | `remember` con `type=instruction` |

### Test 6.5: Buscar en memoria
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Qué sabes sobre mis preferencias?` |
| **Tool esperado** | `recall` con query "preferencias" |

### Test 6.6: Buscar contacto en memoria
| Campo | Valor |
|-------|-------|
| **Prompt** | `¿Cuál es el email de Juan?` |
| **Tool esperado** | `search_contacts` → si no encuentra → `recall` |

### Test 6.7: Ver todas las memorias
| Campo | Valor |
|-------|-------|
| **Prompt** | `Muéstrame todo lo que recuerdas de mí` |
| **Tool esperado** | `get_memories` |

### Test 6.8: Olvidar memoria
| Campo | Valor |
|-------|-------|
| **Prompt** | `Olvida mi preferencia de reuniones` |
| **Tool esperado** | `forget` |
| **Validación** | Memoria eliminada |

---

## 7. PRUEBAS COMBINADAS

### Test 7.1: Briefing Completo
| Campo | Valor |
|-------|-------|
| **Prompt** | `Buenos días, dame un resumen completo de mi día` |
| **Tools esperados** | `get_briefing`, `get_today_events`, `get_unread_emails` |
| **Respuesta esperada** | Tareas + Reuniones + Correos |

### Test 7.2: Contacto → Email
| Campo | Valor |
|-------|-------|
| **Setup** | `Recuerda que María trabaja en ABC, email maria@abc.com` |
| **Prompt** | `Envía un correo a María preguntando por el proyecto` |
| **Tools esperados** | `search_contacts` → `recall` → `send_email` |

### Test 7.3: Drive + Info
| Campo | Valor |
|-------|-------|
| **Prompt** | `Busca el documento más reciente y dime quién tiene acceso` |
| **Tools esperados** | `list_recent_files` → `get_file_info` |

### Test 7.4: Memoria + Acción
| Campo | Valor |
|-------|-------|
| **Setup** | `Recuerda que estoy en el proyecto Beta` |
| **Prompt** | `Busca archivos de mi proyecto actual` |
| **Tools esperados** | `recall` → `search_drive_files` con "Beta" |

### Test 7.5: Workflow Completo
| Campo | Valor |
|-------|-------|
| **Prompt** | `Revisa correos, crea tareas importantes, y dime qué reuniones tengo` |
| **Tools esperados** | `get_unread_emails`, `create_task`, `get_today_events` |

---

## CHECKLIST DE VALIDACIÓN

### Google Calendar
- [ ] Test 1.1: Ver eventos de hoy
- [ ] Test 1.2: Ver eventos de la semana
- [ ] Test 1.3: Crear evento
- [ ] Test 1.4: Verificar disponibilidad
- [ ] Test 1.5: Modificar evento
- [ ] Test 1.6: Eliminar evento

### Gmail
- [ ] Test 2.1: Ver correos no leídos
- [ ] Test 2.2: Contar correos
- [ ] Test 2.3: Buscar correos
- [ ] Test 2.4: Buscar por remitente
- [ ] Test 2.5: Leer correo
- [ ] Test 2.6: Enviar (preview)
- [ ] Test 2.7: Confirmar envío
- [ ] Test 2.8: Archivar
- [ ] Test 2.9: Responder

### Google Tasks
- [ ] Test 3.1: Ver tareas
- [ ] Test 3.2: Filtrar HIGH
- [ ] Test 3.3: Filtrar MEDIUM
- [ ] Test 3.4: Crear HIGH
- [ ] Test 3.5: Crear MEDIUM
- [ ] Test 3.6: Crear LOW
- [ ] Test 3.7: Completar
- [ ] Test 3.8: Briefing
- [ ] Test 3.9: Ver completadas

### People API
- [ ] Test 4.1: Listar contactos
- [ ] Test 4.2: Buscar por nombre
- [ ] Test 4.3: Buscar por empresa
- [ ] Test 4.4: Obtener email
- [ ] Test 4.5: No encontrado

### Google Drive
- [ ] Test 5.1: Archivos recientes
- [ ] Test 5.2: Documentos
- [ ] Test 5.3: Hojas de cálculo
- [ ] Test 5.4: Presentaciones
- [ ] Test 5.5: Carpetas
- [ ] Test 5.6: Buscar
- [ ] Test 5.7: Compartidos
- [ ] Test 5.8: Destacados
- [ ] Test 5.9: Espacio
- [ ] Test 5.10: Info archivo

### Memory
- [ ] Test 6.1: Guardar preferencia
- [ ] Test 6.2: Guardar contacto
- [ ] Test 6.3: Guardar proyecto
- [ ] Test 6.4: Guardar instrucción
- [ ] Test 6.5: Buscar memoria
- [ ] Test 6.6: Buscar contacto
- [ ] Test 6.7: Ver todas
- [ ] Test 6.8: Olvidar

### Combinadas
- [ ] Test 7.1: Briefing completo
- [ ] Test 7.2: Contacto → Email
- [ ] Test 7.3: Drive + Info
- [ ] Test 7.4: Memoria + Acción
- [ ] Test 7.5: Workflow completo

---

**Total de pruebas**: 47
**Fecha de creación**: 2026-01-15
