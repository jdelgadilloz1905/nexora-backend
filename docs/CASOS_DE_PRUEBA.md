# Casos de Prueba - Nexora

Copia y pega estos prompts directamente en el chat de Nexora para probar cada funcionalidad.

**Requisito**: Asegúrate de haber reconectado Google para tener todos los permisos.

---

## PRUEBAS INDIVIDUALES

### 1. Google Calendar

```
¿Qué tengo para hoy?
```

```
¿Qué reuniones tengo esta semana?
```

```
Crea una reunión mañana a las 10am llamada "Prueba Nexora" de 30 minutos
```

```
¿Estoy libre mañana a las 3pm?
```

```
Mueve la reunión de prueba a las 11am
```

```
Cancela la reunión de prueba
```

---

### 2. Gmail

```
¿Tengo correos sin leer?
```

```
¿Cuántos emails nuevos tengo?
```

```
Busca correos de esta semana
```

```
Lee el primer correo
```

```
Envía un correo a tu-email@ejemplo.com con asunto "Prueba Nexora" diciendo "Este es un correo de prueba desde Nexora"
```
*(Cambia el email por uno tuyo para probar)*

```
Archiva el último correo
```

---

### 3. Google Tasks

```
¿Qué tareas tengo pendientes?
```

```
¿Qué tengo urgente?
```

```
Crea una tarea: Probar Nexora con prioridad alta
```

```
Crea una tarea medium: Revisar documentación
```

```
Dame mi briefing del día
```

```
Completa la tarea de probar Nexora
```

```
¿Qué tareas completé?
```

---

### 4. People API (Contacts)

```
Muéstrame mis contactos
```

```
Busca contactos que tengan Gmail
```

```
¿Tengo algún contacto de Google?
```

*(Adapta con nombres reales de tus contactos)*

---

### 5. Google Drive

```
¿Cuáles son mis archivos más recientes?
```

```
Muéstrame mis documentos
```

```
Muéstrame mis hojas de cálculo
```

```
Muéstrame mis presentaciones
```

```
¿Qué archivos me han compartido?
```

```
Mis archivos destacados
```

```
¿Cuánto espacio tengo en Drive?
```

```
Busca archivos que contengan "proyecto"
```

---

### 6. Memory System

```
Recuerda que prefiero las reuniones por la mañana
```

```
Recuerda que el proyecto Alpha tiene deadline el 30 de enero
```

```
Recuerda que Juan Pérez es mi contacto en TechCorp, su email es juan@techcorp.com
```

```
¿Qué sabes sobre mis preferencias?
```

```
¿Qué recuerdas del proyecto Alpha?
```

```
¿Cuál es el email de Juan?
```

```
Muéstrame todo lo que recuerdas de mí
```

```
Olvida mi preferencia de reuniones
```

---

## PRUEBAS COMBINADAS

### Combo 1: Briefing Completo
*Prueba: Tasks + Calendar + Gmail*

```
Buenos días, dame un resumen completo de mi día
```

**Esperado**: Nexora debe mostrar tareas pendientes, reuniones de hoy, y correos sin leer.

---

### Combo 2: Buscar Contacto + Enviar Correo
*Prueba: Contacts + Gmail + Memory*

```
Recuerda que María García trabaja en Innovatech y su email es maria@innovatech.com
```

Luego:

```
Envía un correo a María García preguntando cómo va el proyecto
```

**Esperado**: Nexora busca primero en contactos de Google, si no encuentra usa la memoria.

---

### Combo 3: Preparar Reunión
*Prueba: Calendar + Drive + Contacts*

```
¿Qué reuniones tengo mañana y qué documentos tengo relacionados?
```

**Esperado**: Nexora muestra reuniones y busca archivos relacionados con los temas/participantes.

---

### Combo 4: Crear Tarea desde Correo
*Prueba: Gmail + Tasks*

```
Revisa mis correos no leídos y crea tareas para los que necesiten seguimiento
```

**Esperado**: Nexora revisa emails y sugiere/crea tareas relevantes.

---

### Combo 5: Buscar Archivo + Info de Contacto
*Prueba: Drive + Contacts*

```
Busca el documento de presupuesto y dime quién tiene acceso
```

**Esperado**: Nexora busca archivo en Drive y muestra permisos.

---

### Combo 6: Contexto de Memoria
*Prueba: Memory + cualquier API*

Primero guarda:
```
Recuerda que estoy trabajando en el proyecto Beta con fecha límite 15 de febrero
```

Luego pregunta:
```
¿Qué archivos tengo del proyecto en el que estoy trabajando?
```

**Esperado**: Nexora usa la memoria para saber que es "proyecto Beta" y busca en Drive.

---

### Combo 7: Workflow de Seguimiento
*Prueba: Gmail + Memory + Tasks*

```
Busca el último correo de alguien importante, crea una tarea para responderle, y recuerda que debo hacer seguimiento
```

**Esperado**: Nexora ejecuta las 3 acciones secuencialmente.

---

### Combo 8: Planificación Semanal
*Prueba: Calendar + Tasks + Drive*

```
Ayúdame a planificar mi semana: muéstrame mis reuniones, tareas pendientes y documentos recientes
```

**Esperado**: Resumen ejecutivo completo de la semana.

---

### Combo 9: Buscar y Enviar Archivo
*Prueba: Drive + Contacts + Gmail*

```
Busca mi documento más reciente y envíaselo a mi primer contacto
```

**Esperado**: Nexora busca archivo, busca contacto, y prepara email con link.

---

### Combo 10: Completar Día
*Prueba: Tasks + Memory*

```
Completé todas mis tareas de hoy. Márcalas como terminadas y recuerda que hoy fue un día productivo
```

**Esperado**: Completa tareas y guarda memoria del logro.

---

## PRUEBAS DE EDGE CASES

### Error Handling

```
Busca el contacto de AlguienQueNoExiste12345
```
**Esperado**: Mensaje amigable de "no encontrado"

```
Busca archivos de un proyecto que no tengo
```
**Esperado**: Mensaje de "no se encontraron resultados"

```
Envía un correo a email-invalido
```
**Esperado**: Validación o error claro

---

### Ambigüedad

```
Correo de Juan
```
**Esperado**: Nexora debe preguntar si quiere buscar correos DE Juan o la dirección de email de Juan

```
Agenda algo mañana
```
**Esperado**: Nexora pide más detalles (hora, título, duración)

---

### Contexto Implícito

Primero:
```
¿Qué reuniones tengo hoy?
```

Luego:
```
Mueve la primera a las 5pm
```
**Esperado**: Nexora recuerda el contexto y mueve la reunión mencionada

---

### Preview de Correos

```
Escribe un correo a test@test.com diciendo hola
```
**Esperado**:
1. Nexora muestra preview
2. Pregunta "¿Lo envío?"
3. Solo envía si confirmas

---

## CHECKLIST DE FUNCIONALIDADES

### Google Calendar
- [ ] Ver eventos de hoy
- [ ] Ver eventos de la semana
- [ ] Crear evento
- [ ] Modificar evento
- [ ] Eliminar evento
- [ ] Verificar disponibilidad

### Gmail
- [ ] Ver correos
- [ ] Ver no leídos
- [ ] Buscar correos
- [ ] Leer correo completo
- [ ] Enviar correo (con preview)
- [ ] Responder correo
- [ ] Archivar correo

### Google Tasks
- [ ] Ver tareas
- [ ] Filtrar por prioridad
- [ ] Crear tarea
- [ ] Completar tarea
- [ ] Ver briefing

### People API
- [ ] Ver contactos
- [ ] Buscar contacto

### Google Drive
- [ ] Ver archivos recientes
- [ ] Buscar archivos
- [ ] Filtrar por tipo
- [ ] Ver compartidos
- [ ] Ver destacados
- [ ] Ver espacio
- [ ] Info de archivo

### Memory
- [ ] Guardar preferencia
- [ ] Guardar contacto
- [ ] Guardar proyecto
- [ ] Buscar en memoria
- [ ] Ver todas las memorias
- [ ] Eliminar memoria

---

## NOTAS DE PRUEBA

1. **Antes de probar**: Reconecta Google para tener todos los scopes
2. **Correos**: Usa tu propio email para pruebas de envío
3. **Contactos**: Adapta los nombres a contactos reales que tengas
4. **Drive**: Los resultados dependen de tus archivos reales
5. **Memory**: Prueba guardar y luego recuperar información

---

**Última actualización**: 2026-01-15
