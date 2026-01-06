# Guía de Contribución - Nexora

## Flujo de Trabajo con Ramas (Git Branching)

Para mantener el código organizado y facilitar la revisión, cada módulo o feature debe trabajarse en una rama separada.

### Convención de Nombres de Ramas

```
feature/<modulo>-<descripcion>
fix/<modulo>-<descripcion>
hotfix/<descripcion>
```

**Ejemplos:**
- `feature/tasks-crud` - Módulo de tareas con CRUD completo
- `feature/emails-integration` - Integración con correos
- `feature/calendar-sync` - Sincronización de calendario
- `feature/chat-nexora` - Chat con asistente Nexora
- `fix/auth-token-refresh` - Corrección en refresh de tokens
- `hotfix/login-validation` - Corrección urgente en validación de login

### Flujo de Trabajo

#### 1. Crear una nueva rama
```bash
# Asegúrate de estar en main actualizado
git checkout main
git pull origin main

# Crear nueva rama para el módulo
git checkout -b feature/tasks-crud
```

#### 2. Trabajar en la rama
```bash
# Hacer commits frecuentes y descriptivos
git add .
git commit -m "feat(tasks): add task list component"

git add .
git commit -m "feat(tasks): add create task form"

git add .
git commit -m "feat(tasks): add edit and delete functionality"
```

#### 3. Subir la rama a GitHub
```bash
git push -u origin feature/tasks-crud
```

#### 4. Crear Pull Request
- Ir a GitHub y crear un Pull Request desde `feature/tasks-crud` hacia `main`
- Describir los cambios realizados
- Esperar revisión manual

#### 5. Merge (después de revisión)
```bash
# Una vez aprobado, hacer merge desde GitHub o localmente:
git checkout main
git pull origin main
git merge feature/tasks-crud
git push origin main

# Eliminar rama local
git branch -d feature/tasks-crud

# Eliminar rama remota
git push origin --delete feature/tasks-crud
```

### Módulos Pendientes

| Módulo | Rama Sugerida | Estado |
|--------|---------------|--------|
| Tareas | `feature/tasks-crud` | Pendiente |
| Correos | `feature/emails-module` | Pendiente |
| Calendario | `feature/calendar-module` | Pendiente |
| Chat Nexora | `feature/chat-nexora` | Pendiente |
| Configuración | `feature/settings-module` | Pendiente |

### Convención de Commits

Usar [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: nueva funcionalidad
fix: corrección de bug
docs: cambios en documentación
style: formato, sin cambios de lógica
refactor: refactorización de código
test: agregar o modificar tests
chore: tareas de mantenimiento
```

**Ejemplos:**
```
feat(tasks): add priority filter to task list
fix(auth): resolve token expiration issue
docs(readme): update installation instructions
refactor(api): simplify error handling
```

### Estructura de Carpetas por Módulo

```
src/
├── pages/
│   └── app/
│       ├── Dashboard.tsx      # Vista principal
│       ├── tasks/             # Módulo de tareas
│       │   ├── TaskList.tsx
│       │   ├── TaskForm.tsx
│       │   └── index.ts
│       ├── emails/            # Módulo de correos
│       ├── calendar/          # Módulo de calendario
│       └── chat/              # Chat con Nexora
├── services/
│   ├── api.ts                 # API de waitlist
│   ├── auth.ts                # API de autenticación
│   ├── tasks.ts               # API de tareas (crear)
│   ├── emails.ts              # API de correos (crear)
│   └── calendar.ts            # API de calendario (crear)
└── components/
    └── modules/
        ├── tasks/             # Componentes de tareas
        ├── emails/            # Componentes de correos
        └── calendar/          # Componentes de calendario
```

## Backend (NestJS)

El mismo flujo aplica para el backend:

```bash
# Ejemplo para módulo de tareas
git checkout -b feature/tasks-api
# ... trabajar en el módulo
git push -u origin feature/tasks-api
# Crear PR en GitHub
```

### Módulos Backend Existentes

- `auth` - Autenticación y usuarios
- `email` - Envío de correos
- `waitlist` - Lista de espera
- `tasks` - Tareas (estructura base)
- `communications` - Comunicaciones
- `calendar` - Calendario
- `agent` - Agente IA
