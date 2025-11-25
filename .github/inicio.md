Sistema de Gestión de Avatares con Node.js y PocketBase

📋 Descripción del Proyecto

Sistema backend para gestión de usuarios con avatares que incluye:

· Subida y conversión automática a WEBP
· Servicio de imágenes con múltiples tamaños
· Autenticación segura con PocketBase
· Contenedores Docker para fácil despliegue

🚀 Configuración Rápida

Prerrequisitos

· Docker y Docker Compose instalados
· 1GB de RAM mínimo
· 10GB de espacio en disco

Estructura del Proyecto

```
avatar-system/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── server.js
├── pb_data/ (creado automáticamente)
└── uploads/ (creado automáticamente)
```

🐳 Configuración Docker

docker-compose.yml

```yaml
version: '3.8'
services:
  pocketbase:
    image: ghcr.io/muchobien/pocketbase:latest
    ports:
      - "8090:8090"
    volumes:
      - ./pb_data:/pb_data
      - ./pb_public:/pb_public
    environment:
      - POCKETBASE_URL=http://localhost:8090
    restart: unless-stopped

  node_app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./uploads:/app/uploads
    depends_on:
      - pocketbase
    environment:
      - POCKETBASE_URL=http://pocketbase:8090
      - NODE_ENV=production
    restart: unless-stopped
```

Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
```

📦 Dependencias Node.js

package.json

```json
{
  "name": "avatar-api",
  "type": "module",
  "dependencies": {
    "express": "^4.18.2",
    "pocketbase": "^0.15.0",
    "multer": "^1.4.5",
    "sharp": "^0.32.0"
  },
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  }
}
```

🔧 Implementación del Servidor

server.js

```javascript
import express from 'express';
import PocketBase from 'pocketbase';
import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Configuración de PocketBase
const pb = new PocketBase('http://pocketbase:8090');

// Configuración de Multer para almacenamiento en memoria
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos de imagen'), false);
    }
  }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Almacén en memoria para caché de imágenes
const imageCache = new Map();

// Middleware de autenticación
const authenticateToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido' });
    }

    pb.authStore.save(token, null);
    await pb.collection('users').authRefresh();
    
    req.user = pb.authStore.model;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
};

// Endpoint para subir avatar
app.post('/api/users/:userId/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.id !== userId && !req.user.admin) {
      return res.status(403).json({ error: 'No tienes permisos para modificar este avatar' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
    }

    // Optimizar y convertir a WEBP
    const optimizedImage = await sharp(req.file.buffer)
      .resize(400, 400, {
        fit: 'cover',
        position: 'center'
      })
      .webp({ 
        quality: 80,
        effort: 6
      })
      .toBuffer();

    const formData = new FormData();
    const blob = new Blob([optimizedImage], { type: 'image/webp' });
    formData.append('avatar', blob, `avatar-${userId}-${Date.now()}.webp`);

    const updatedUser = await pb.collection('users').update(userId, formData);

    imageCache.delete(userId);

    res.json({
      success: true,
      message: 'Avatar actualizado exitosamente',
      user: {
        id: updatedUser.id,
        avatar: updatedUser.avatar
      }
    });

  } catch (error) {
    console.error('Error subiendo avatar:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor al procesar la imagen',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Endpoint para obtener avatar WEBP
app.get('/api/users/:userId/avatar', async (req, res) => {
  try {
    const { userId } = req.params;
    const { size = 'medium', download = false } = req.query;

    const cacheKey = `${userId}-${size}`;
    if (imageCache.has(cacheKey)) {
      const cached = imageCache.get(cacheKey);
      res.set({
        'Content-Type': 'image/webp',
        'Content-Length': cached.length,
        'Cache-Control': 'public, max-age=86400',
        'X-Cache': 'HIT'
      });
      return res.send(cached);
    }

    const user = await pb.collection('users').getOne(userId, {
      fields: 'id,avatar,collectionId'
    });

    if (!user.avatar) {
      return res.status(404).json({ error: 'Avatar no encontrado' });
    }

    const imageUrl = `http://pocketbase:8090/api/files/${user.collectionId}/${user.id}/${user.avatar}`;
    
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error('No se pudo obtener la imagen de PocketBase');
    }

    const imageBuffer = await response.arrayBuffer();
    let processedImage = Buffer.from(imageBuffer);

    const sizes = {
      small: 100,
      medium: 300,
      large: 600,
      original: null
    };

    const targetSize = sizes[size] || sizes.medium;

    if (targetSize) {
      const sharpInstance = sharp(processedImage);
      processedImage = await sharpInstance
        .resize(targetSize, targetSize, {
          fit: 'cover',
          withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toBuffer();
    }

    imageCache.set(cacheKey, processedImage);

    const headers = {
      'Content-Type': 'image/webp',
      'Content-Length': processedImage.length,
      'Cache-Control': 'public, max-age=86400',
      'X-Cache': 'MISS',
      'X-Image-Id': userId
    };

    if (download === 'true') {
      headers['Content-Disposition'] = `attachment; filename="avatar-${userId}.webp"`;
    }

    res.set(headers);
    res.send(processedImage);

  } catch (error) {
    console.error('Error obteniendo avatar:', error);
    
    if (error.status === 404) {
      return res.status(404).json({ error: 'Usuario o avatar no encontrado' });
    }
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Endpoint para obtener información del usuario
app.get('/api/users/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const user = await pb.collection('users').getOne(userId, {
      fields: 'id,username,email,created,avatar'
    });

    const avatarUrl = user.avatar 
      ? `http://localhost:3000/api/users/${userId}/avatar`
      : null;

    res.json({
      ...user,
      avatarUrl
    });

  } catch (error) {
    res.status(404).json({ error: 'Usuario no encontrado' });
  }
});

// Endpoint para eliminar avatar
app.delete('/api/users/:userId/avatar', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;

    if (req.user.id !== userId && !req.user.admin) {
      return res.status(403).json({ error: 'No tienes permisos para eliminar este avatar' });
    }

    const updatedUser = await pb.collection('users').update(userId, {
      'avatar': null
    });

    imageCache.forEach((value, key) => {
      if (key.startsWith(userId)) {
        imageCache.delete(key);
      }
    });

    res.json({
      success: true,
      message: 'Avatar eliminado exitosamente',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error eliminando avatar:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// Endpoint de salud
app.get('/health', async (req, res) => {
  try {
    await pb.health.check();
    res.json({ 
      status: 'OK', 
      timestamp: new Date().toISOString(),
      service: 'avatar-api'
    });
  } catch (error) {
    res.status(503).json({ 
      status: 'ERROR', 
      service: 'pocketbase',
      error: error.message 
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 Servidor ejecutándose en http://localhost:${port}`);
});
```

🛠️ Comandos de Implementación

1. Crear estructura de directorios

```bash
mkdir avatar-system && cd avatar-system
```

2. Crear archivos de configuración

Crea cada uno de los archivos mencionados anteriormente en el directorio.

3. Instalar y ejecutar

```bash
# Construir y levantar contenedores
docker-compose up -d --build

# Ver logs
docker-compose logs -f

# Ver estado
docker-compose ps
```

4. Configurar PocketBase

1. Accede a http://localhost:8090/_/
2. Crea una cuenta de administrador
3. Ve a "Collections" → "Users"
4. Añade un campo "avatar" de tipo "File"
5. Configura las reglas de acceso según necesidades

📡 API Endpoints

Autenticación

Todos los endpoints (excepto obtener avatar) requieren header:

```
Authorization: Bearer <pocketbase_token>
```

1. Subir Avatar

```http
POST /api/users/:userId/avatar
Content-Type: multipart/form-data

Body: avatar (file)
```

2. Obtener Avatar

```http
GET /api/users/:userId/avatar?size=small|medium|large&download=true|false
```

3. Obtener Información de Usuario

```http
GET /api/users/:userId
```

4. Eliminar Avatar

```http
DELETE /api/users/:userId/avatar
```

5. Health Check

```http
GET /health
```

🔍 Ejemplos de Uso

Subir avatar con cURL

```bash
curl -X POST http://localhost:3000/api/users/USER_ID/avatar \
  -H "Authorization: Bearer USER_TOKEN" \
  -F "avatar=@foto.jpg"
```

Usar en HTML

```html
<img src="http://localhost:3000/api/users/USER_ID/avatar?size=small" alt="Avatar pequeño">
<img src="http://localhost:3000/api/users/USER_ID/avatar?size=medium" alt="Avatar mediano">
<img src="http://localhost:3000/api/users/USER_ID/avatar?size=large" alt="Avatar grande">
```

Obtener información del usuario

```bash
curl -X GET http://localhost:3000/api/users/USER_ID \
  -H "Authorization: Bearer USER_TOKEN"
```

🔒 Configuración de Seguridad

Variables de Entorno

```bash
# En docker-compose.yml o .env file
POCKETBASE_URL=http://pocketbase:8090
NODE_ENV=production
JWT_SECRET=tu_jwt_secret_muy_seguro
```

Configuración de PocketBase

1. Habilita autenticación por email
2. Configura políticas de contraseñas seguras
3. Establece reglas de acceso en colecciones
4. Configura CORS apropiadamente

🚨 Solución de Problemas

Verificar servicios

```bash
docker-compose ps
docker-compose logs node_app
docker-compose logs pocketbase
```

Problemas comunes

1. CORS errors: Verificar configuración CORS en PocketBase
2. Token inválido: Verificar que el token esté vigente
3. Imagen no se muestra: Verificar permisos del campo "avatar"
4. Error de memoria: Aumentar memoria Docker si procesa imágenes grandes

Comandos útiles

```bash
# Reiniciar servicios
docker-compose restart

# Reconstruir imágenes
docker-compose build --no-cache

# Limpiar recursos
docker-compose down -v
```

📊 Monitoreo y Métricas

Los endpoints incluyen headers útiles:

· X-Cache: HIT/MISS para seguimiento de caché
· X-Image-Id: ID de usuario para debugging
· Cache-Control: Directivas de caché

🔄 Mantenimiento

Limpieza de caché

El caché de imágenes se almacena en memoria. Para producción considera:

· Implementar Redis como almacén de caché
· Establecer políticas TTL automáticas
· Monitorear uso de memoria

Backup de datos

```bash
# Backup de PocketBase
docker-compose exec pocketbase tar -czf /tmp/backup.tar.gz /pb_data

# Backup de imágenes
tar -czf uploads_backup.tar.gz uploads/
```

---

📝 Nota: Este sistema está diseñado para entornos de desarrollo. Para producción, considera:

· Configurar un proxy reverso (nginx)
· Implementar rate limiting
· Configurar SSL/TLS
· Usar base de datos externa para PocketBase
· Implementar logging estructurado

✅ Estado: Listo para implementación inmediata
