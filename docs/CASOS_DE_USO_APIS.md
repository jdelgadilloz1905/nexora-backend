# Casos de Uso - APIs Recién Integradas

Este documento describe casos de uso prácticos para las 3 APIs recientemente integradas en Nexora:
1. **Google Tasks API** - Gestión de tareas
2. **People API (Contacts)** - Contactos de Google
3. **Google Drive API** - Archivos en la nube

---

## 1. Google Tasks API

### Herramientas disponibles
| Tool | Descripción |
|------|-------------|
| `get_tasks` | Obtener tareas (filtrar por prioridad/estado) |
| `create_task` | Crear nueva tarea con prioridad y fecha |
| `complete_task` | Marcar tarea como completada |
| `get_briefing` | Resumen ejecutivo del día |

### Sistema de prioridades
| Prioridad | Emoji | Vencimiento | Uso |
|-----------|-------|-------------|-----|
| HIGH | 🔴 | 1 día | Urgente, impacto directo |
| MEDIUM | 🟡 | 2 días | Importante, hacerlo pronto |
| LOW | 🟢 | 5 días | Puede esperar |
| NOISE | 🟣 | Sin fecha | Requiere decisión |

---

### Caso 1.1: Ver tareas pendientes
```
Usuario: "¿Qué tareas tengo pendientes?"
Usuario: "Mis tareas"
Usuario: "¿Qué tengo que hacer?"

Nexora: [usa get_tasks]
→ "Tienes 5 tareas pendientes:

🔴 HIGH (vencen hoy):
- Preparar presupuesto para cliente
- Revisar contrato de servicios

🟡 MEDIUM (próximos días):
- Actualizar documentación
- Llamar al banco

🟢 LOW:
- Organizar archivos"
```

### Caso 1.2: Ver solo tareas urgentes
```
Usuario: "¿Qué tengo urgente?"
Usuario: "Mis tareas HIGH"
Usuario: "¿Qué es lo más importante hoy?"

Nexora: [usa get_tasks con priority=HIGH]
→ "Tienes 2 tareas urgentes para hoy:
🔴 Preparar presupuesto para cliente - vence hoy
🔴 Revisar contrato de servicios - vence hoy

¿Empezamos con el presupuesto?"
```

### Caso 1.3: Crear tarea con prioridad explícita
```
Usuario: "Crea una tarea urgente: llamar al cliente sobre el proyecto"

Nexora: [usa create_task con priority=HIGH]
→ "✅ Tarea creada:
🔴 Llamar al cliente sobre el proyecto
Vence: hoy

¿Algo más que agregar?"
```

### Caso 1.4: Crear tarea - Nexora sugiere prioridad
```
Usuario: "Tengo que enviar el informe mañana"

Nexora: "Dado que es para mañana, ¿lo clasifico como 🔴 HIGH (urgente) o 🟡 MEDIUM?"

Usuario: "High"

Nexora: [usa create_task con priority=HIGH, dueDate=mañana]
→ "✅ Tarea creada:
🔴 Enviar el informe
Vence: mañana (16 enero)"
```

### Caso 1.5: Crear tarea sin urgencia clara
```
Usuario: "Quizás debería revisar las redes sociales"

Nexora: "Lo clasifico como 🟣 NOISE porque no está claro si es importante para tu negocio.
¿Lo hacemos (asignarle prioridad) o lo descartamos?"

Usuario: "Descártalo"

Nexora: "✅ Descartado. Nos enfocamos en lo importante."
```

### Caso 1.6: Completar tarea
```
Usuario: "Ya terminé el presupuesto"
Usuario: "Completa la tarea del presupuesto"

Nexora: [usa complete_task]
→ "✅ Completada: Preparar presupuesto para cliente

Te quedan 4 tareas pendientes:
- 1 urgente (revisar contrato)
- 2 medium
- 1 low

¿Seguimos con el contrato?"
```

### Caso 1.7: Briefing diario completo
```
Usuario: "Dame mi resumen del día"
Usuario: "Buenos días, ¿qué tengo para hoy?"
Usuario: "Briefing"

Nexora: [usa get_briefing + get_today_events + get_unread_emails]
→ "Buenos días. Tu día:

🔴 HIGH (urgentes):
- Preparar presupuesto para cliente
- Revisar contrato de servicios

🟡 MEDIUM:
- Actualizar documentación
- Llamar al banco

📅 Reuniones hoy:
- 10:00 - Standup con equipo (30 min)
- 15:00 - Llamada con cliente ABC (1 hora)

📧 Correos sin leer: 7

¿Empezamos con el presupuesto antes del standup?"
```

### Caso 1.8: Ver tareas completadas
```
Usuario: "¿Qué tareas completé esta semana?"
Usuario: "Mis logros de la semana"

Nexora: [usa get_tasks con status=COMPLETED]
→ "Esta semana completaste 8 tareas:

✅ Enviar propuesta a cliente XYZ
✅ Revisar contratos pendientes
✅ Actualizar perfil de LinkedIn
✅ Preparar presentación Q4
✅ Responder emails urgentes
✅ Llamar a proveedor
✅ Organizar reunión de equipo
✅ Actualizar CRM

¡Buen progreso! 💪"
```

---

## 2. People API (Contacts)

### Herramientas disponibles
| Tool | Descripción |
|------|-------------|
| `get_contacts` | Listar contactos de Google |
| `search_contacts` | Buscar por nombre, email o empresa |

---

### Caso 2.1: Buscar contacto por nombre
```
Usuario: "¿Cuál es el correo de María García?"
Usuario: "Dame el email de María"
Usuario: "Busca a María García"

Nexora: [usa search_contacts con query="María García"]
→ "Encontré a María García:
📧 Email: maria.garcia@empresa.com
📱 Teléfono: +52 555 123 4567
🏢 Empresa: Tech Solutions
👔 Cargo: Gerente de Proyectos

¿Quieres que le envíe un correo?"
```

### Caso 2.2: Buscar contacto por empresa
```
Usuario: "¿Tengo contactos de Microsoft?"
Usuario: "Busca contactos de Microsoft"

Nexora: [usa search_contacts con query="Microsoft"]
→ "Encontré 2 contactos de Microsoft:

1. Juan Pérez
   📧 juan.perez@microsoft.com
   📱 +52 555 987 6543
   👔 Account Manager

2. Ana López
   📧 ana.lopez@microsoft.com
   👔 Technical Consultant

¿Necesitas contactar a alguno?"
```

### Caso 2.3: Buscar teléfono de contacto
```
Usuario: "¿Cuál es el teléfono de Carlos?"
Usuario: "Dame el número de Carlos Rodríguez"

Nexora: [usa search_contacts con query="Carlos"]
→ "Carlos Rodríguez:
📱 Teléfono: +52 555 456 7890
📧 Email: carlos@empresa.com
🏢 Empresa: Inversiones ABC

¿Quieres que le envíe un mensaje?"
```

### Caso 2.4: Listar todos los contactos
```
Usuario: "Muéstrame mis contactos"
Usuario: "¿Cuántos contactos tengo?"

Nexora: [usa get_contacts]
→ "Tienes 45 contactos en Google. Aquí los primeros 20:

1. Ana López - ana@empresa.com
2. Carlos Rodríguez - carlos@abc.com
3. Diana Martínez - diana@tech.com
...

¿Buscas a alguien en específico?"
```

### Caso 2.5: Contacto no encontrado - usar memoria
```
Usuario: "¿Cuál es el correo de Pedro?"

Nexora: [usa search_contacts - no encuentra]
Nexora: [usa recall para buscar en memoria]
→ "No encontré a Pedro en tus contactos de Google, pero recuerdo que mencionaste:
Pedro Sánchez - pedro@startup.io (CEO de TechStartup)

¿Es este Pedro? ¿Quieres que guarde su contacto en mi memoria?"
```

### Caso 2.6: Integración con envío de correo
```
Usuario: "Envía un correo a Roberto preguntando por el proyecto"

Nexora: [usa search_contacts para encontrar email de Roberto]
→ "Encontré a Roberto Díaz (roberto@cliente.com).

📧 Preview del correo:
**Para:** roberto@cliente.com
**Asunto:** Consulta sobre el proyecto
**Mensaje:**
Hola Roberto,

¿Cómo va el proyecto? Me gustaría saber el estado actual.

Saludos

---
¿Lo envío o quieres que modifique algo?"
```

### Caso 2.7: Buscar múltiples contactos
```
Usuario: "¿Tengo el contacto de alguien de TechCorp?"

Nexora: [usa search_contacts con query="TechCorp"]
→ "Encontré 3 contactos de TechCorp:

1. Laura Gómez (Directora Comercial)
   📧 laura@techcorp.com

2. Miguel Torres (Desarrollador Senior)
   📧 miguel.torres@techcorp.com

3. Sofía Ruiz (CEO)
   📧 sofia.ruiz@techcorp.com

¿A quién necesitas contactar?"
```

---

## 3. Google Drive API

### Herramientas disponibles
| Tool | Descripción |
|------|-------------|
| `search_drive_files` | Buscar archivos por nombre |
| `list_recent_files` | Archivos recientes |
| `list_drive_files_by_type` | Filtrar por tipo (docs, sheets, slides, etc.) |
| `list_shared_files` | Archivos compartidos conmigo |
| `list_starred_files` | Archivos destacados |
| `get_file_info` | Información detallada de archivo |
| `get_storage_quota` | Espacio de almacenamiento |

### Tipos de archivo
| Tipo | Descripción |
|------|-------------|
| `document` | Google Docs |
| `spreadsheet` | Google Sheets |
| `presentation` | Google Slides |
| `folder` | Carpetas |
| `pdf` | Archivos PDF |

---

### Caso 3.1: Buscar archivo por nombre
```
Usuario: "Busca el documento del proyecto Alpha"
Usuario: "¿Dónde está el archivo de presupuesto?"

Nexora: [usa search_drive_files con query="proyecto Alpha"]
→ "Encontré 3 archivos relacionados con 'proyecto Alpha':

1. 📄 Proyecto Alpha - Especificaciones
   Tipo: Google Doc
   Modificado: 14 enero 2026
   🔗 [Abrir archivo](link)

2. 📊 Proyecto Alpha - Presupuesto
   Tipo: Google Sheet
   Modificado: 10 enero 2026
   🔗 [Abrir archivo](link)

3. 📑 Proyecto Alpha - Presentación
   Tipo: Google Slides
   Modificado: 5 enero 2026
   🔗 [Abrir archivo](link)

¿Cuál necesitas?"
```

### Caso 3.2: Ver archivos recientes
```
Usuario: "¿Cuáles son mis archivos más recientes?"
Usuario: "Mis archivos de hoy"
Usuario: "¿Qué estuve trabajando?"

Nexora: [usa list_recent_files]
→ "Tus archivos más recientes:

1. 📄 Informe Mensual Enero
   Modificado: hace 2 horas

2. 📊 Ventas Q4 2025
   Modificado: hace 5 horas

3. 📑 Presentación Cliente ABC
   Modificado: ayer

4. 📁 Carpeta Proyecto Beta
   Modificado: ayer

5. 📄 Notas Reunión Equipo
   Modificado: hace 2 días

¿Quieres abrir alguno?"
```

### Caso 3.3: Listar documentos
```
Usuario: "Muéstrame mis documentos"
Usuario: "¿Qué Google Docs tengo?"

Nexora: [usa list_drive_files_by_type con fileType="document"]
→ "Tus documentos de Google Docs:

1. 📄 Informe Mensual Enero - 14 ene
2. 📄 Especificaciones Proyecto Alpha - 10 ene
3. 📄 Notas Reunión Equipo - 8 ene
4. 📄 Propuesta Comercial TechCorp - 5 ene
5. 📄 Manual de Procesos - 2 ene

Total: 15 documentos
¿Buscas algo específico?"
```

### Caso 3.4: Listar hojas de cálculo
```
Usuario: "Mis hojas de cálculo"
Usuario: "¿Qué spreadsheets tengo?"
Usuario: "Muéstrame mis Excel"

Nexora: [usa list_drive_files_by_type con fileType="spreadsheet"]
→ "Tus hojas de cálculo (Google Sheets):

1. 📊 Ventas Q4 2025 - 14 ene
2. 📊 Presupuesto 2026 - 12 ene
3. 📊 Proyecto Alpha - Presupuesto - 10 ene
4. 📊 Control de Gastos - 8 ene
5. 📊 Base de Datos Clientes - 5 ene

Total: 23 hojas de cálculo
¿Cuál necesitas abrir?"
```

### Caso 3.5: Listar presentaciones
```
Usuario: "Mis presentaciones"
Usuario: "¿Qué slides tengo?"

Nexora: [usa list_drive_files_by_type con fileType="presentation"]
→ "Tus presentaciones (Google Slides):

1. 📑 Presentación Cliente ABC - 13 ene
2. 📑 Proyecto Alpha - Presentación - 5 ene
3. 📑 Pitch Deck Startup - 28 dic
4. 📑 Review Q4 2025 - 20 dic
5. 📑 Onboarding Nuevos Empleados - 15 dic

Total: 12 presentaciones"
```

### Caso 3.6: Ver archivos compartidos conmigo
```
Usuario: "¿Qué archivos me han compartido?"
Usuario: "Archivos compartidos conmigo"

Nexora: [usa list_shared_files]
→ "Archivos compartidos contigo recientemente:

1. 📄 Contrato de Servicios
   Propietario: Laura (Jurídico)
   Compartido: hace 1 día

2. 📊 Reporte Ventas Enero
   Propietario: Carlos (Ventas)
   Compartido: hace 2 días

3. 📑 Presentación Board Meeting
   Propietario: CEO
   Compartido: hace 3 días

4. 📄 Feedback Proyecto Beta
   Propietario: María (Producto)
   Compartido: hace 1 semana

¿Quieres abrir alguno?"
```

### Caso 3.7: Ver archivos destacados
```
Usuario: "Mis archivos destacados"
Usuario: "Archivos con estrella"
Usuario: "Mis favoritos en Drive"

Nexora: [usa list_starred_files]
→ "Tus archivos destacados:

⭐ 📄 Documentación Principal del Proyecto
⭐ 📊 Presupuesto Anual 2026
⭐ 📑 Pitch Deck Actualizado
⭐ 📁 Carpeta Clientes Importantes
⭐ 📄 Plantilla de Propuestas

¿Necesitas acceder a alguno?"
```

### Caso 3.8: Ver espacio de almacenamiento
```
Usuario: "¿Cuánto espacio tengo en Drive?"
Usuario: "Mi almacenamiento de Google"
Usuario: "¿Me queda espacio en Drive?"

Nexora: [usa get_storage_quota]
→ "Tu almacenamiento de Google Drive:

📊 Usado: 12.5 GB de 15 GB (83%)
📁 En Drive: 10.2 GB
🗑️ En papelera: 2.3 GB
✨ Disponible: 2.5 GB

💡 Tip: Vaciando la papelera recuperarías 2.3 GB.
¿Quieres que te muestre los archivos más grandes?"
```

### Caso 3.9: Información detallada de archivo
```
Usuario: "¿Quién tiene acceso al documento del proyecto?"
Usuario: "Información del archivo de presupuesto"

Nexora: [busca archivo] + [usa get_file_info]
→ "📄 Proyecto Alpha - Especificaciones

📋 Detalles:
- Tipo: Google Doc
- Creado: 5 enero 2026
- Modificado: 14 enero 2026
- Tamaño: 2.3 MB

👥 Permisos:
- Tu (Propietario)
- maria@empresa.com (Editor)
- carlos@empresa.com (Lector)
- juan@cliente.com (Lector)

🔗 [Abrir documento](link)

¿Necesitas modificar los permisos?"
```

### Caso 3.10: Búsqueda filtrada por tipo
```
Usuario: "Busca presentaciones sobre ventas"

Nexora: [usa search_drive_files con query="ventas" y fileType="presentation"]
→ "Encontré 2 presentaciones sobre ventas:

1. 📑 Estrategia de Ventas 2026
   Modificado: 10 enero

2. 📑 Review Ventas Q4 2025
   Modificado: 20 diciembre

¿Cuál necesitas?"
```

### Caso 3.11: Buscar carpetas
```
Usuario: "¿Dónde está la carpeta del proyecto?"
Usuario: "Busca la carpeta de clientes"

Nexora: [usa search_drive_files con query="clientes" o list_drive_files_by_type con "folder"]
→ "Encontré estas carpetas:

📁 Clientes 2026
📁 Clientes Importantes
📁 Propuestas a Clientes
📁 Archivos Cliente ABC

¿Cuál buscas?"
```

---

## Flujos Combinados

### Flujo A: Preparar reunión con cliente
```
Usuario: "Ayúdame a preparar la reunión con TechCorp de mañana"

Nexora:
1. [search_contacts: "TechCorp"] → Identifica contactos relevantes
2. [get_upcoming_events] → Confirma detalles de la reunión
3. [search_drive_files: "TechCorp"] → Busca documentos relacionados
4. [search_emails: "from:techcorp.com"] → Revisa comunicaciones recientes

→ "Para tu reunión con TechCorp mañana a las 10am:

👥 Asistirán:
- Laura Gómez (Directora Comercial)
- Miguel Torres (Técnico)

📄 Documentos relevantes:
- Propuesta Comercial TechCorp (actualizado hace 3 días)
- Contrato borrador (compartido por Laura)

📧 Últimos correos:
- Laura preguntó sobre los tiempos de entrega (ayer)
- Confirmación de reunión (hace 2 días)

¿Quieres que cree una tarea para revisar los documentos?"
```

### Flujo B: Enviar archivo a contacto
```
Usuario: "Envía a María el presupuesto del proyecto"

Nexora:
1. [search_contacts: "María"] → maria.garcia@empresa.com
2. [search_drive_files: "presupuesto proyecto"] → Encuentra archivo
3. [send_email con link al archivo]

→ "📧 Preview del correo:
**Para:** maria.garcia@empresa.com
**Asunto:** Presupuesto del proyecto
**Mensaje:**
Hola María,

Te comparto el presupuesto del proyecto:
🔗 [Presupuesto Proyecto Alpha](link)

Cualquier duda me comentas.

Saludos

---
¿Lo envío?"
```

### Flujo C: Resumen semanal completo
```
Usuario: "Dame un resumen de mi semana"

Nexora:
1. [get_tasks con status=COMPLETED] → Tareas completadas
2. [get_tasks] → Tareas pendientes
3. [list_recent_files] → Archivos trabajados
4. [search_emails: "newer_than:7d"] → Actividad de correo

→ "📊 Resumen de tu semana:

✅ Completaste 8 tareas:
- Enviar propuesta cliente XYZ
- Revisar contratos
- (y 6 más...)

📋 Pendientes: 5 tareas
- 2 HIGH (urgentes)
- 2 MEDIUM
- 1 LOW

📁 Archivos más trabajados:
- Presupuesto 2026 (15 ediciones)
- Informe Mensual (8 ediciones)

📧 Correos: 45 recibidos, 23 enviados

¿Planificamos la próxima semana?"
```

---

## Prompts de prueba rápida

### Google Tasks
```
"¿Qué tareas tengo?"
"Crea una tarea urgente: llamar al cliente"
"Ya terminé la tarea del presupuesto"
"Dame mi briefing del día"
```

### People API (Contacts)
```
"¿Cuál es el correo de [nombre]?"
"Busca contactos de [empresa]"
"¿Tengo el teléfono de [nombre]?"
"Muéstrame mis contactos"
```

### Google Drive
```
"Busca el documento de [tema]"
"Mis archivos recientes"
"Muéstrame mis hojas de cálculo"
"¿Cuánto espacio tengo en Drive?"
"¿Qué archivos me han compartido?"
```

---

**Última actualización**: 2026-01-15
