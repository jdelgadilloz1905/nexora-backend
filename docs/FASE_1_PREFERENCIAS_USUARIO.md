# FASE 1: Sistema de Preferencias de Usuario

**Fecha de implementación:** 16 de enero de 2026
**Rama:** `feature/fase-1-user-preferences`
**Estado:** Completado, pendiente de merge a main

---

## Objetivo

Implementar el "Modelo Mamá" - el agente debe saber dónde guardar las cosas (tareas, eventos, reuniones, correos) sin preguntar al usuario cada vez. El usuario configura sus preferencias una vez y el agente las usa automáticamente.

---

## Archivos Modificados/Creados

### Backend (nexora-backend)

#### 1. `src/modules/auth/dto/auth.dto.ts`
**Cambios:** Agregados nuevos DTOs para preferencias

```typescript
// Nuevos tipos agregados:
export type Platform = 'google' | 'microsoft' | 'notion' | 'nexora';

export class PlatformPreferenceDto {
  primary: Platform;      // Plataforma principal
  fallback?: Platform;    // Plataforma de respaldo
}

export class UserPreferencesDto {
  tasks?: PlatformPreferenceDto;      // Dónde crear tareas
  events?: PlatformPreferenceDto;     // Dónde crear eventos
  meetings?: PlatformPreferenceDto;   // Dónde agendar reuniones
  emails?: PlatformPreferenceDto;     // Desde dónde enviar correos
  notes?: PlatformPreferenceDto;      // Dónde guardar notas
  language?: string;                   // Idioma preferido
  timezone?: string;                   // Zona horaria
  enableLearning?: boolean;           // Habilitar aprendizaje AI
}

export class UpdatePreferencesDto extends UserPreferencesDto {}

export class PreferencesResponseDto {
  preferences: UserPreferencesDto;
  connectedPlatforms: Record<Platform, boolean>;
}
```

#### 2. `src/modules/auth/auth.controller.ts`
**Cambios:** Agregados 2 nuevos endpoints

```typescript
// GET /api/v1/auth/preferences
// Obtiene las preferencias del usuario y el estado de plataformas conectadas
@Get('preferences')
@UseGuards(JwtAuthGuard)
async getPreferences(@Req() req): Promise<PreferencesResponseDto>

// PUT /api/v1/auth/preferences
// Actualiza las preferencias del usuario
@Put('preferences')
@UseGuards(JwtAuthGuard)
async updatePreferences(@Req() req, @Body() dto: UpdatePreferencesDto): Promise<PreferencesResponseDto>
```

#### 3. `src/modules/auth/auth.service.ts`
**Cambios:** Agregados métodos para gestionar preferencias

```typescript
// Preferencias por defecto para usuarios nuevos
const DEFAULT_PREFERENCES: UserPreferencesDto = {
  tasks: { primary: 'nexora', fallback: 'nexora' },
  events: { primary: 'google', fallback: 'nexora' },
  meetings: { primary: 'google', fallback: 'nexora' },
  emails: { primary: 'google' },
  notes: { primary: 'nexora' },
  language: 'es',
  timezone: 'America/Bogota',
  enableLearning: true,
};

// Métodos agregados:
async getPreferences(userId: string): Promise<PreferencesResponseDto>
async updatePreferences(userId: string, dto: UpdatePreferencesDto): Promise<PreferencesResponseDto>
private async getConnectedPlatforms(userId: string): Promise<Record<Platform, boolean>>
private validatePreferences(preferences, connectedPlatforms): void
```

**Inyección de dependencia agregada:**
```typescript
constructor(
  // ... existentes
  private readonly googleService: GoogleService,  // NUEVO
) {}
```

#### 4. `src/modules/auth/auth.module.ts`
**Cambios:** Importado IntegrationsModule

```typescript
imports: [
  // ... existentes
  forwardRef(() => IntegrationsModule),  // NUEVO - para acceder a GoogleService
],
```

#### 5. `src/modules/agent/agent.service.ts`
**Cambios:** Inyección de preferencias en el prompt del agente

```typescript
// Nueva inyección en constructor:
@InjectRepository(User)
private readonly userRepository: Repository<User>,

// Nuevo método para formatear preferencias:
private formatPreferencesForPrompt(preferences: UserPreferencesDto): string {
  // Genera texto para el prompt indicando las preferencias del usuario
  // Ejemplo de salida:
  // ## PREFERENCIAS DEL USUARIO
  // - **Tareas**: Crear en Google (respaldo: Nexora local)
  // - **Eventos de calendario**: Crear en Google (respaldo: Nexora local)
  // ...
}

// Método actualizado:
private async getSystemPromptWithMemory(userId: string, currentMessage: string): Promise<string> {
  // Ahora también obtiene y agrega las preferencias del usuario al prompt
}
```

**Imports agregados:**
```typescript
import { User } from '@/modules/auth/entities/user.entity';
import { UserPreferencesDto, Platform } from '@/modules/auth/dto/auth.dto';
```

---

### Frontend (nexora-web)

#### 1. `src/services/auth.ts`
**Cambios:** Agregados tipos y métodos para preferencias

```typescript
// Nuevos tipos:
export type Platform = 'google' | 'microsoft' | 'notion' | 'nexora';

export interface PlatformPreference {
  primary: Platform;
  fallback?: Platform;
}

export interface UserPreferences {
  tasks?: PlatformPreference;
  events?: PlatformPreference;
  meetings?: PlatformPreference;
  emails?: PlatformPreference;
  notes?: PlatformPreference;
  language?: string;
  timezone?: string;
  enableLearning?: boolean;
}

export interface PreferencesResponse {
  preferences: UserPreferences;
  connectedPlatforms: Record<Platform, boolean>;
}

// Nuevos métodos en authApi:
async getPreferences(): Promise<PreferencesResponse>
async updatePreferences(preferences: Partial<UserPreferences>): Promise<PreferencesResponse>
```

#### 2. `src/pages/app/settings/SettingsPage.tsx`
**Cambios:** Nueva sección de Preferencias del Asistente

**Estados agregados:**
```typescript
const [preferences, setPreferences] = useState<UserPreferences | null>(null);
const [connectedPlatforms, setConnectedPlatforms] = useState<Record<Platform, boolean>>({...});
const [preferencesLoading, setPreferencesLoading] = useState(true);
const [preferencesSaving, setPreferencesSaving] = useState(false);
const [preferencesSuccess, setPreferencesSuccess] = useState('');
const [preferencesError, setPreferencesError] = useState('');
```

**Funciones agregadas:**
```typescript
const loadPreferences = async () => {...}
const handlePreferenceChange = async (category, field, value) => {...}
const savePreferences = async () => {...}
```

**Componente helper agregado:**
```typescript
function PreferenceRow({
  label,
  description,
  value,
  fallback,
  connectedPlatforms,
  onChange,
  onFallbackChange,
  hideFallback = false,
}) {...}
```

**UI agregada:**
- Card "Preferencias del Asistente" con ícono Settings
- Indicadores de plataformas conectadas (badges verdes/grises)
- Filas de preferencias para: Tareas, Eventos, Reuniones, Correos
- Cada fila tiene selector de plataforma principal y respaldo
- Toggle para "Aprendizaje del asistente"
- Botón "Guardar preferencias"

---

## Flujo de Datos

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND                                 │
├─────────────────────────────────────────────────────────────────┤
│  SettingsPage                                                    │
│  └── loadPreferences() ────────────────────────────────────────┐│
│  └── savePreferences() ────────────────────────────────────────┐│
│                                                                 ││
│  authApi                                                        ││
│  └── getPreferences() ─────► GET /auth/preferences ────────────┘│
│  └── updatePreferences() ──► PUT /auth/preferences              │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                         BACKEND                                  │
├─────────────────────────────────────────────────────────────────┤
│  AuthController                                                  │
│  └── getPreferences()                                           │
│  └── updatePreferences()                                        │
│            │                                                     │
│            ▼                                                     │
│  AuthService                                                     │
│  └── getPreferences()                                           │
│      └── userRepository.findOne()                               │
│      └── getConnectedPlatforms() ──► googleService.getIntegration()│
│  └── updatePreferences()                                        │
│      └── validatePreferences()                                  │
│      └── userRepository.save()                                  │
└─────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    INTEGRACIÓN CON AGENTE                        │
├─────────────────────────────────────────────────────────────────┤
│  AgentService                                                    │
│  └── getSystemPromptWithMemory()                                │
│      └── userRepository.findOne() ─► obtiene user.preferences   │
│      └── formatPreferencesForPrompt() ─► genera texto para AI   │
│      └── memoryService.getRelevantMemories()                    │
│            │                                                     │
│            ▼                                                     │
│      System Prompt + Preferencias + Memorias                    │
│            │                                                     │
│            ▼                                                     │
│      AI Provider (Gemini/Claude/OpenAI)                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## Casos de Prueba

### Backend

#### CP-01: Obtener preferencias (usuario nuevo)
```bash
curl -X GET http://localhost:3000/api/v1/auth/preferences \
  -H "Authorization: Bearer {token}"
```
**Esperado:**
- Status: 200
- Body contiene preferencias por defecto
- `connectedPlatforms` refleja estado real de integraciones

#### CP-02: Obtener preferencias (usuario existente)
```bash
# Mismo endpoint que CP-01
```
**Esperado:**
- Status: 200
- Body contiene preferencias guardadas del usuario

#### CP-03: Actualizar preferencias
```bash
curl -X PUT http://localhost:3000/api/v1/auth/preferences \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": { "primary": "google", "fallback": "nexora" },
    "enableLearning": false
  }'
```
**Esperado:**
- Status: 200
- Preferencias actualizadas en respuesta
- Persistido en base de datos

#### CP-04: Preferencias con plataforma no conectada
```bash
curl -X PUT http://localhost:3000/api/v1/auth/preferences \
  -H "Authorization: Bearer {token}" \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": { "primary": "notion", "fallback": "nexora" }
  }'
```
**Esperado:**
- Status: 200 (no bloquea)
- Console.warn en servidor indicando que Notion no está conectado
- Preferencia guardada de todas formas

#### CP-05: Sin token de autorización
```bash
curl -X GET http://localhost:3000/api/v1/auth/preferences
```
**Esperado:**
- Status: 401 Unauthorized

### Frontend

#### CP-06: Cargar página de configuración
1. Ir a `/app/settings`
2. Scroll hasta "Preferencias del Asistente"

**Esperado:**
- Spinner mientras carga
- Indicadores de plataformas (Google verde si conectado, resto gris)
- Dropdowns con valores actuales

#### CP-07: Cambiar preferencia y guardar
1. Cambiar "Tareas" de Nexora a Google
2. Click "Guardar preferencias"

**Esperado:**
- Botón muestra "Guardando..."
- Mensaje verde "Preferencias guardadas correctamente"
- Al recargar, cambio persiste

#### CP-08: Toggle de aprendizaje
1. Click en toggle "Aprendizaje del asistente"
2. Guardar preferencias

**Esperado:**
- Toggle cambia de estado visualmente
- Valor guardado correctamente

### Integración con Agente

#### CP-09: Agente usa preferencias al crear tarea
**Configuración previa:**
- tasks.primary = "google"
- Google conectado

**Acción:** En chat escribir "Crea una tarea para revisar el informe"

**Esperado:**
- Tarea creada en Google Tasks
- Respuesta del agente confirma dónde se creó

#### CP-10: Agente usa respaldo
**Configuración previa:**
- tasks.primary = "notion" (NO conectado)
- tasks.fallback = "nexora"

**Acción:** "Crea una tarea para llamar a Juan"

**Esperado:**
- Tarea creada en Nexora local
- Agente informa: "Lo guardé en Nexora porque Notion no está conectado"

---

## Modelo de Datos

### User Entity (existente, campo `preferences`)
```typescript
@Column({ type: 'jsonb', nullable: true })
preferences?: Record<string, unknown>;
```

**Estructura del JSON guardado:**
```json
{
  "tasks": { "primary": "nexora", "fallback": "nexora" },
  "events": { "primary": "google", "fallback": "nexora" },
  "meetings": { "primary": "google", "fallback": "nexora" },
  "emails": { "primary": "google" },
  "notes": { "primary": "nexora" },
  "language": "es",
  "timezone": "America/Bogota",
  "enableLearning": true
}
```

---

## Notas de Implementación

1. **No se requiere migración de base de datos** - El campo `preferences` ya existía como JSONB en la entidad User.

2. **Dependencia circular evitada** - Se usa `forwardRef()` al importar IntegrationsModule en AuthModule.

3. **Validación no bloqueante** - Si el usuario selecciona una plataforma no conectada, se guarda de todas formas. El agente manejará el fallback en runtime.

4. **Preferencias inyectadas en prompt** - El agente recibe las preferencias como parte del system prompt, permitiendo que cualquier proveedor de AI (Gemini, Claude, OpenAI) las use.

5. **Plataformas soportadas actualmente:**
   - Google: ✅ Implementado
   - Microsoft: ⏳ TODO
   - Notion: ⏳ TODO
   - Nexora (local): ✅ Siempre disponible

---

## Próximos Pasos (FASE 2+)

1. **Búsqueda Unificada** - Buscar en todas las plataformas conectadas
2. **Aprendizaje de Patrones** - Tracking de acciones del usuario
3. **Microsoft Integration** - Agregar soporte para Microsoft 365
4. **Notion Integration** - Agregar soporte para Notion

---

## Comandos Git

```bash
# Ver cambios
git log --oneline feature/fase-1-user-preferences

# Commits realizados:
# d023d63 feat(auth): implement User Preferences System (FASE 1) [backend]
# bec8c2d feat(settings): add User Preferences UI (FASE 1) [frontend]

# Para mergear a main (después de validar):
git checkout main
git merge feature/fase-1-user-preferences
git push origin main
```
