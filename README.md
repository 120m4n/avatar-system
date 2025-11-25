# 🎨 Avatar System - Sistema de Gestión de Avatares

Sistema completo de gestión de avatares con backend Node.js/Express, frontend Astro.js y almacenamiento PocketBase. Incluye captura de cámara, subida de archivos, autenticación de usuarios y optimización automática de imágenes.

## ✨ Características

### Backend
- 🔐 Autenticación completa (registro, login, logout)
- 📸 Subida y conversión automática a WEBP
- 🎯 Servicio de imágenes con múltiples tamaños (small, medium, large)
- 🚀 Caché de imágenes en memoria
- 🔒 Autenticación segura con PocketBase
- ⚡ Optimización automática con Sharp
- 🐳 Contenedores Docker para fácil despliegue

### Frontend
- 🎨 Interfaz moderna y responsive en Astro.js
- 📸 Captura de foto desde cámara web
- 📁 Subida de archivos de imagen
- 👤 Vista previa de avatar en tiempo real
- 🔑 Sistema de login y registro
- 🎯 Dashboard de usuario interactivo

## 🚀 Inicio Rápido

### Prerrequisitos
- Docker y Docker Compose instalados
- Node.js 18+ (para desarrollo local)
- 1GB de RAM mínimo
- 10GB de espacio en disco

### Instalación con Docker (Recomendado)

1. **Clonar el repositorio**
```bash
git clone <repository-url>
cd avatar-system
```

2. **Configurar variables de entorno (opcional)**
```bash
cp .env.example .env
# Edita .env según tus necesidades
```

3. **Construir el frontend**
```bash
npm run build:frontend
```

3. **Iniciar servicios con Docker**
```bash
docker-compose up -d --build
```

4. **Configurar PocketBase**
- Accede a http://localhost:8090/_/
- Crea una cuenta de administrador
- Ve a "Collections" → "Users"
- Verifica que el campo "avatar" existe (tipo "File")
- Configura las reglas de acceso según necesidades

5. **Acceder a la aplicación**
- Frontend: http://localhost:3000
- PocketBase Admin: http://localhost:8090/_/
- API: http://localhost:3000/api

### Instalación Manual (Desarrollo)

1. **Instalar dependencias del backend**
```bash
npm install
```

2. **Instalar y construir el frontend**
```bash
cd frontend
npm install
npm run build
cd ..
```

3. **Iniciar PocketBase** (en una terminal separada)
```bash
docker run -p 8090:8090 -v $(pwd)/pb_data:/pb_data ghcr.io/muchobien/pocketbase:latest
```

4. **Iniciar el servidor**
```bash
npm start
```

## 📁 Estructura del Proyecto

```
avatar-system/
├── frontend/                 # Aplicación Astro.js
│   ├── src/
│   │   ├── layouts/         # Layouts de Astro
│   │   ├── pages/           # Páginas (index, register, dashboard)
│   │   └── components/      # Componentes reutilizables
│   ├── astro.config.mjs     # Configuración de Astro
│   └── package.json
├── server.js                 # Servidor Express API
├── docker-compose.yml        # Configuración Docker
├── Dockerfile                # Imagen Docker para el servidor
├── package.json              # Dependencias del backend
└── README.md                 # Este archivo
```

## 📡 API Endpoints

### Autenticación

#### Registro de Usuario
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "usuario123",
  "email": "usuario@email.com",
  "password": "contraseña123",
  "passwordConfirm": "contraseña123"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "usuario@email.com",
  "password": "contraseña123"
}

Response:
{
  "success": true,
  "message": "Login exitoso",
  "token": "jwt_token_here",
  "user": {
    "id": "user_id",
    "username": "usuario123",
    "email": "usuario@email.com",
    "avatar": "avatar_filename.webp"
  }
}
```

#### Obtener Usuario Actual
```http
GET /api/auth/me
Authorization: Bearer <token>
```

#### Logout
```http
POST /api/auth/logout
```

### Gestión de Avatares

#### Subir Avatar
```http
POST /api/users/:userId/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data

Body: avatar (file)
```

#### Obtener Avatar
```http
GET /api/users/:userId/avatar?size=small|medium|large&download=true|false
```
Tamaños disponibles:
- `small`: 100x100px
- `medium`: 300x300px (default)
- `large`: 600x600px
- `original`: tamaño original

#### Obtener Información de Usuario
```http
GET /api/users/:userId
Authorization: Bearer <token>
```

#### Eliminar Avatar
```http
DELETE /api/users/:userId/avatar
Authorization: Bearer <token>
```

#### Health Check
```http
GET /health
```

## 🎨 Uso de la Interfaz Web

### 1. Registro
- Accede a http://localhost:3000/register
- Completa el formulario con:
  - Nombre de usuario
  - Email
  - Contraseña (mínimo 8 caracteres)
  - Confirmación de contraseña
- Click en "Registrarse"

### 2. Login
- Accede a http://localhost:3000
- Ingresa tu email y contraseña
- Click en "Iniciar Sesión"

### 3. Gestionar Avatar
En el dashboard (http://localhost:3000/dashboard):

**Opción 1: Tomar Foto**
1. Click en "📸 Abrir Cámara"
2. Permite el acceso a la cámara cuando el navegador lo solicite
3. Posiciona tu rostro en el encuadre
4. Click en "✓ Capturar"
5. La imagen se subirá automáticamente

**Opción 2: Subir Archivo**
1. Click en "Seleccionar archivo" en la sección "O Subir Archivo"
2. Elige una imagen de tu dispositivo
3. Click en "📤 Subir Imagen"

**Eliminar Avatar**
- Click en el botón "Eliminar Avatar" (botón rojo debajo del avatar)
- Confirma la eliminación

## 🔧 Ejemplos de Uso con cURL

### Registro
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "password123",
    "passwordConfirm": "password123"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Subir Avatar
```bash
curl -X POST http://localhost:3000/api/users/USER_ID/avatar \
  -H "Authorization: Bearer USER_TOKEN" \
  -F "avatar=@foto.jpg"
```

### Obtener Avatar
```bash
# Avatar mediano
curl http://localhost:3000/api/users/USER_ID/avatar?size=medium -o avatar.webp

# Avatar pequeño
curl http://localhost:3000/api/users/USER_ID/avatar?size=small -o avatar-small.webp
```

## 🐳 Comandos Docker Útiles

```bash
# Ver logs
docker-compose logs -f

# Ver estado de servicios
docker-compose ps

# Reiniciar servicios
docker-compose restart

# Detener servicios
docker-compose down

# Reconstruir imágenes
docker-compose build --no-cache

# Limpiar recursos
docker-compose down -v
```

## 🔒 Configuración de Seguridad

### Variables de Entorno
Crea un archivo `.env` basado en `.env.example`:
```bash
# Server Configuration
NODE_ENV=production
PORT=3000

# PocketBase Configuration
POCKETBASE_URL=http://pocketbase:8090

# CORS Configuration
# Comma-separated list of allowed origins
ALLOWED_ORIGINS=http://localhost:4321,http://localhost:3000,https://tu-dominio.com

# Frontend Build Configuration (for building)
PUBLIC_API_URL=http://localhost:3000
```

**Producción**: Asegúrate de configurar `ALLOWED_ORIGINS` con solo los dominios permitidos y `PUBLIC_API_URL` con tu URL de API real.

### Configuración de PocketBase
1. **Habilita autenticación por email**
2. **Configura políticas de contraseñas seguras**
3. **Establece reglas de acceso en colecciones**:
   - View rule: `@request.auth.id != ""`
   - Create rule: `@request.auth.id = id`
   - Update rule: `@request.auth.id = id`
   - Delete rule: `@request.auth.id = id`
4. **Configura CORS apropiadamente**

## 🚨 Solución de Problemas

### El frontend no se conecta al backend
- Verifica que el servidor backend esté corriendo en http://localhost:3000
- Revisa la consola del navegador para errores CORS
- Asegúrate de que PocketBase esté ejecutándose en http://localhost:8090

### Error de cámara
- Verifica que tu navegador tenga permisos para acceder a la cámara
- Usa HTTPS en producción (la cámara requiere conexión segura)
- Algunos navegadores bloquean la cámara en localhost sin HTTPS

### Token inválido o expirado
- Cierra sesión y vuelve a iniciar sesión
- Verifica que PocketBase esté corriendo correctamente
- Revisa los logs del servidor con `docker-compose logs node_app`

### Imagen no se muestra
- Verifica que el campo "avatar" existe en la colección "users" de PocketBase
- Revisa los permisos del campo "avatar" en PocketBase
- Comprueba los logs del servidor para errores

### Error de memoria al procesar imágenes grandes
- Aumenta la memoria asignada a Docker
- Reduce el tamaño de las imágenes antes de subirlas
- Ajusta el límite `fileSize` en `server.js` (actualmente 5MB)

## 🛠️ Desarrollo

### Ejecutar en modo desarrollo
```bash
# Backend con hot reload
npm run dev

# Frontend con hot reload
cd frontend
npm run dev
```

### Construir frontend para producción
```bash
npm run build:frontend
```

### Estructura de código
- **Backend**: Express.js con PocketBase SDK
- **Frontend**: Astro.js (static site generation)
- **Base de datos**: PocketBase (SQLite)
- **Procesamiento de imágenes**: Sharp
- **Contenedores**: Docker + Docker Compose

## 📊 Características Técnicas

### Optimización de Imágenes
- Conversión automática a formato WEBP
- Compresión con calidad del 80%
- Redimensionamiento a 400x400px para almacenamiento
- Múltiples tamaños para servir (100px, 300px, 600px)

### Caché
- Caché en memoria de imágenes procesadas
- Headers de caché HTTP (max-age: 86400s / 24h)
- Invalidación automática al actualizar/eliminar avatar

### Seguridad
- Autenticación JWT vía PocketBase
- Validación de permisos por usuario
- Límite de tamaño de archivo (5MB)
- Validación de tipo MIME de imágenes
- CORS configurado

## 📝 Mejoras Realizadas al server.js

1. **Añadido CORS con control de orígenes**: Permite configurar orígenes permitidos vía variable de entorno `ALLOWED_ORIGINS`
2. **Endpoints de autenticación**: `/api/auth/register`, `/api/auth/login`, `/api/auth/logout`, `/api/auth/me`
3. **Actualización de multer**: Versión 2.0.2 (corrige CVE-2022-24434)
4. **Servir frontend estático**: El servidor ahora sirve la aplicación Astro construida
5. **Mejor manejo de errores**: Respuestas de error más descriptivas
6. **Logout mejorado**: No afecta el authStore global, usa invalidación de token en el cliente
7. **Variables de entorno**: Soporte completo para configuración vía variables de entorno

## 🌐 Producción

Para producción, considera:
- ✅ Configurar un proxy reverso (nginx)
- ✅ **Implementar rate limiting** (especialmente en endpoints de autenticación para prevenir ataques de fuerza bruta)
- ✅ Configurar SSL/TLS (Let's Encrypt)
- ✅ Usar base de datos externa para PocketBase
- ✅ Implementar logging estructurado
- ✅ Configurar backups automáticos
- ✅ Usar CDN para servir avatares
- ✅ Implementar monitoreo y alertas

### Rate Limiting Recomendado

Para proteger los endpoints de autenticación, considera usar `express-rate-limit`:

```bash
npm install express-rate-limit
```

```javascript
import rateLimit from 'express-rate-limit';

// Rate limiter para autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // límite de 5 intentos por ventana
  message: 'Demasiados intentos de login, intenta de nuevo más tarde'
});

// Aplicar a endpoints de autenticación
app.post('/api/auth/login', authLimiter, async (req, res) => {
  // ... código existente
});

app.post('/api/auth/register', authLimiter, async (req, res) => {
  // ... código existente
});
```

## 📄 Licencia

Este proyecto está bajo la licencia que especifique el repositorio.

## 🤝 Contribuir

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

**Estado**: ✅ Completamente funcional y listo para usar

**Desarrollado con**: Node.js, Express, Astro.js, PocketBase, Sharp, Docker
