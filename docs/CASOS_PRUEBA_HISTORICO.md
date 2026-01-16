# Casos de Prueba - Sistema de Histórico de Conversaciones

Este documento contiene los casos de prueba para validar las nuevas funcionalidades del sistema de histórico implementadas en FASE 1-5.

---

## FASE 1: Conversación Única por Usuario

### Pruebas Básicas

```
# Verificar que al iniciar sesión se carga la conversación existente
1. Login al sistema
2. Ir a /chat
3. Verificar que se carga la conversación anterior (si existe)
4. Verificar que NO hay botón "Nueva conversación"
5. Verificar que NO hay lista de conversaciones en el sidebar
```

```
# Verificar que los mensajes se acumulan en la misma conversación
1. Enviar mensaje: "Hola Nexora"
2. Verificar respuesta
3. Cerrar sesión
4. Login nuevamente
5. Ir a /chat
6. Verificar que el mensaje anterior aparece en el historial
```

```
# Verificar que no se puede eliminar la conversación principal
1. Intentar llamar API DELETE /api/v1/agent/conversations/:id
2. Verificar que retorna error "No se puede eliminar la conversación principal"
```

---

## FASE 2: Límite de Contexto

### Verificar Límite de Mensajes

```
# El contexto solo incluye últimos 50 mensajes de los últimos 7 días
1. Tener una conversación con muchos mensajes
2. Revisar logs del backend al enviar mensaje
3. Buscar log: "Built message history: X messages (max 50, last 7 days)"
4. Verificar que X <= 50
```

```
# Mensajes archivados no se incluyen en el contexto
1. Archivar mensajes manualmente (cambiar archived=true en DB)
2. Enviar nuevo mensaje
3. Verificar en logs que los mensajes archivados no se incluyen
```

---

## FASE 3: Sistema de Archivado

### Prueba Manual de Archivado

```sql
-- En la base de datos, simular mensajes antiguos
UPDATE messages
SET "createdAt" = NOW() - INTERVAL '35 days'
WHERE "conversationId" = 'tu-conversation-id'
LIMIT 20;
```

```
# Ejecutar archivado manual
1. Llamar endpoint (si existe) o ejecutar en código:
   await archiveService.archiveOldMessages('user-id')
2. Verificar en tabla conversation_history que se creó entrada
3. Verificar que mensajes fueron marcados como archived=true
4. Verificar que se generó summary
5. Verificar que se extrajeron topics y entities
```

### Verificar CRON Job

```
# El CRON se ejecuta a las 3 AM
1. Verificar en logs del servidor que ArchiveJob se registró
2. Buscar log: "Starting daily archive job..."
3. O ejecutar manualmente: archiveJob.runManually()
```

---

## FASE 4: Búsqueda en Histórico (search_history)

### Casos de Prueba con IA

```
# Búsqueda básica en histórico
Usuario: "¿Qué hablamos del presupuesto hace 2 meses?"
Esperado: Nexora usa search_history con query "presupuesto"
Resultado: Muestra resumen y snippets relevantes del período archivado
```

```
# Búsqueda con fechas específicas
Usuario: "Busca conversaciones de enero sobre el proyecto Alpha"
Esperado: Nexora usa search_history con query "proyecto Alpha" y dateFrom/dateTo de enero
Resultado: Muestra resultados filtrados por fecha
```

```
# Búsqueda que no encuentra resultados
Usuario: "¿Qué hablamos sobre viajes a Marte?"
Esperado: Nexora usa search_history
Resultado: "No encontré nada relacionado con 'viajes a Marte' en tu historial"
```

```
# Usuario pregunta por algo reciente (NO debe usar search_history)
Usuario: "¿Qué me dijiste hace 5 minutos?"
Esperado: Nexora NO usa search_history (está en contexto reciente)
Resultado: Responde usando el contexto actual de la conversación
```

### Palabras Clave que Activan search_history

```
# Prueba cada palabra clave
"hace tiempo" → debe usar search_history
"hace meses" → debe usar search_history
"el año pasado" → debe usar search_history
"en enero" → debe usar search_history
"¿te acuerdas...?" → debe usar search_history
"la última vez que hablamos de..." → debe usar search_history
```

---

## FASE 5: Extracción a Memory

### Verificar Extracción Automática

Después de ejecutar archivado manual:

```sql
-- Verificar memorias extraídas
SELECT * FROM user_memories
WHERE "userId" = 'tu-user-id'
AND metadata->>'source' = 'conversation'
ORDER BY "createdAt" DESC;
```

### Casos Esperados de Extracción

```
# Contactos mencionados en conversación
- "Juan Pérez de TechCorp" → Debe crear memoria tipo CONTACT
- Verificar que aparece en: recall "Juan Pérez"
```

```
# Proyectos mencionados
- "Proyecto Alpha con deadline en febrero" → Debe crear memoria tipo PROJECT
- Verificar que aparece en: recall "Proyecto Alpha"
```

```
# Decisiones importantes
- "Decidimos usar React para el frontend" → Debe crear memoria tipo DECISION
- Verificar que aparece en: get_memories con filtro type=decision
```

---

## PRUEBAS DE INTEGRACIÓN

### Flujo Completo de Usuario

```
1. Usuario tiene conversación activa por 2 meses
2. Sistema archiva mensajes > 30 días automáticamente (CRON)
3. Usuario pregunta: "¿Qué presupuesto le envié a María en diciembre?"
4. Nexora:
   a. Detecta que es pregunta sobre el pasado
   b. Usa search_history con query "presupuesto María diciembre"
   c. Encuentra período archivado relevante
   d. Muestra resumen y snippets: "En diciembre enviaste un presupuesto de $5,000 a María García para el proyecto de diseño web"
5. Usuario puede seguir preguntando: "¿Quedó algo pendiente de ese proyecto?"
6. Nexora busca más contexto en el histórico
```

### Combinación con Memory

```
Usuario: "¿Cuál era el email del cliente que mencioné hace 3 meses?"

Flujo esperado:
1. Nexora primero intenta recall "cliente email"
2. Si Memory no tiene la info, usa search_history "cliente email"
3. Si encuentra en histórico, extrae email y lo guarda en Memory
4. Responde con el email encontrado
```

---

## CHECKLIST DE FUNCIONALIDADES

### FASE 1 - Conversación Única
- [ ] Una sola conversación por usuario
- [ ] Sin botón "Nueva conversación"
- [ ] Sin lista de conversaciones
- [ ] Carga automática de conversación al entrar
- [ ] No se puede eliminar conversación principal

### FASE 2 - Límite de Contexto
- [ ] Máximo 50 mensajes en contexto
- [ ] Máximo 7 días de mensajes
- [ ] Mensajes archivados excluidos

### FASE 3 - Archivado Automático
- [ ] Tabla conversation_history creada
- [ ] Mensajes > 30 días se archivan
- [ ] Resumen generado por IA
- [ ] Topics y entities extraídos
- [ ] CRON job ejecuta a las 3 AM
- [ ] Mensajes marcados como archived

### FASE 4 - Búsqueda en Histórico
- [ ] Tool search_history disponible
- [ ] Búsqueda por texto funciona
- [ ] Filtro por fechas funciona
- [ ] Snippets relevantes mostrados
- [ ] System prompt actualizado

### FASE 5 - Extracción a Memory
- [ ] Contactos extraídos automáticamente
- [ ] Proyectos extraídos automáticamente
- [ ] Decisiones extraídas automáticamente
- [ ] Metadata source='conversation' agregada

---

## NOTAS IMPORTANTES

1. **Primer archivado**: El sistema necesita mensajes con más de 30 días de antigüedad para archivar. Para pruebas, actualizar fechas manualmente en DB.

2. **Mínimo de mensajes**: No archiva si hay menos de 10 mensajes en el período.

3. **Búsqueda ILIKE**: La búsqueda usa ILIKE de PostgreSQL, no full-text search. Es case-insensitive y busca patrones.

4. **CRON en desarrollo**: El CRON job solo se ejecuta si el servidor está corriendo a las 3 AM. Para pruebas, usar `archiveJob.runManually()`.

5. **Extracción a Memory**: La extracción depende de la calidad del análisis de IA. Puede no extraer todo correctamente.

---

**Última actualización**: 2026-01-16
**Autor**: Claude + Usuario
