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

const pb = new PocketBase(process.env.POCKETBASE_URL || 'http://localhost:8090');

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

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS 
  ? process.env.ALLOWED_ORIGINS.split(',') 
  : ['http://localhost:4321', 'http://localhost:3000'];

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

app.use(express.static('public'));
app.use(express.static('frontend/dist'));

// Almacén en memoria para caché de imágenes
const imageCache = new Map();

// Helper function to clear cache entries for a specific prefix
const clearCacheByPrefix = (prefix) => {
  for (const key of imageCache.keys()) {
    if (key.startsWith(prefix)) {
      imageCache.delete(key);
    }
  }
};

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

// Middleware para administrar el endpoint /api/users/:userId
// Verifica que el usuario autenticado tenga permisos sobre el userId especificado
const authorizeUserAccess = async (req, res, next) => {
  try {
    const { userId } = req.params;
    
    // Verificar que el userId sea válido
    if (!userId) {
      return res.status(400).json({ error: 'ID de usuario requerido' });
    }

    // Verificar que el usuario autenticado sea el mismo que el userId o sea admin
    if (req.user.id !== userId && !(req.user.admin === true)) {
      return res.status(403).json({ error: 'No tienes permisos para acceder a este recurso' });
    }

    next();
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar permisos' });
  }
};

// Endpoint para registro de usuario
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, passwordConfirm, name } = req.body;

    if (!email || !password || !passwordConfirm || !name) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }

    if (password !== passwordConfirm) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }

    const user = await pb.collection('users').create({
      email,
      password,
      passwordConfirm,
      name,
      emailVisibility: true
    });

    res.status(201).json({
      success: true,
      message: 'Usuario registrado exitosamente',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('Error en registro:', error);
    res.status(400).json({ 
      error: 'Error al registrar usuario',
      details: error.data || error.message
    });
  }
});

// Endpoint para login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña son requeridos' });
    }

    const authData = await pb.collection('users').authWithPassword(email, password);

    res.json({
      success: true,
      message: 'Login exitoso',
      token: authData.token,
      user: {
        id: authData.record.id,
        name: authData.record.name,
        email: authData.record.email,
        avatar: authData.record.avatar,
        admin: authData.record.admin || false
      }
    });
  } catch (error) {
    console.error('Error en login:', error);
    res.status(401).json({ 
      error: 'Credenciales inválidas'
    });
  }
});

// Endpoint para logout
app.post('/api/auth/logout', authenticateToken, (req, res) => {
  // Token invalidation is handled by the client removing the token
  // PocketBase tokens are stateless JWTs, so we don't need to invalidate server-side
  res.json({
    success: true,
    message: 'Logout exitoso'
  });
});

// Endpoint para verificar token
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        admin: req.user.admin || false,
        avatarUrl: req.user.avatar 
          ? `/api/users/${req.user.id}/avatar`
          : null
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener información del usuario' });
  }
});

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

    const baseUrl = process.env.POCKETBASE_URL || 'http://localhost:8090';
    const imageUrl = `${baseUrl}/api/files/${user.collectionId}/${user.id}/${user.avatar}`;
    
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

// Endpoint para obtener lista de todos los usuarios (protegido)
app.get('/api/users', authenticateToken, async (req, res) => {
  try {
    const baseUrl = process.env.PUBLIC_API_URL || `http://localhost:${port}`;
    const users = await pb.collection('users').getFullList({
      fields: 'id,name,email,created,avatar'
    });

    const usersWithAvatarUrls = users.map(user => ({
      ...user,
      avatarUrl: user.avatar 
        ? `${baseUrl}/api/users/${user.id}/avatar`
        : null
    }));

    res.json({
      success: true,
      users: usersWithAvatarUrls
    });
  } catch (error) {
    console.error('Error obteniendo usuarios:', error);
    res.status(500).json({ error: 'Error al obtener lista de usuarios' });
  }
});

// Endpoint para obtener información del usuario
app.get('/api/users/:userId', authenticateToken, authorizeUserAccess, async (req, res) => {
  try {
    const { userId } = req.params;
    const baseUrl = process.env.PUBLIC_API_URL || `http://localhost:${port}`;
    
    const user = await pb.collection('users').getOne(userId, {
      fields: 'id,name,email,created,updated,avatar'
    });

    const avatarUrl = user.avatar 
      ? `${baseUrl}/api/users/${userId}/avatar`
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

    clearCacheByPrefix(userId);

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

// =====================================
// ADMIN-ONLY IMAGES CRUD ENDPOINTS
// =====================================

// Middleware to check admin role
const requireAdmin = async (req, res, next) => {
  try {
    // Check if user exists and has admin privileges
    // Handle both boolean true and truthy string values
    const isAdmin = req.user && (req.user.admin === true || req.user.admin === 'true');
    if (!isAdmin) {
      return res.status(403).json({ error: 'Acceso denegado. Se requiere rol de administrador.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Error al verificar permisos de administrador' });
  }
};

// Create image (POST /api/admin/images)
app.post('/api/admin/images', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { alias } = req.body;

    if (!alias) {
      return res.status(400).json({ error: 'El campo alias es requerido' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No se proporcionó ninguna imagen' });
    }

    // Optimize and convert to WEBP
    const optimizedImage = await sharp(req.file.buffer)
      .resize(800, 800, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ 
        quality: 80,
        effort: 6
      })
      .toBuffer();

    const formData = new FormData();
    formData.append('alias', alias);
    formData.append('creator_id', req.user.id);
    const blob = new Blob([optimizedImage], { type: 'image/webp' });
    formData.append('image', blob, `image-${Date.now()}.webp`);

    const image = await pb.collection('images').create(formData);

    res.status(201).json({
      success: true,
      message: 'Imagen creada exitosamente',
      image: {
        id: image.id,
        alias: image.alias,
        image: image.image,
        creator_id: image.creator_id,
        created: image.created
      }
    });
  } catch (error) {
    console.error('Error creando imagen:', error);
    res.status(500).json({ 
      error: 'Error al crear imagen',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Get all images (GET /api/admin/images)
app.get('/api/admin/images', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { page = 1, perPage = 20 } = req.query;
    const baseUrl = process.env.PUBLIC_API_URL || `http://localhost:${port}`;
    
    const images = await pb.collection('images').getList(parseInt(page), parseInt(perPage), {
      sort: '-created'
    });

    const imagesWithUrls = images.items.map(image => ({
      id: image.id,
      alias: image.alias,
      image: image.image,
      creator_id: image.creator_id,
      created: image.created,
      updated: image.updated,
      imageUrl: image.image 
        ? `${baseUrl}/api/admin/images/${image.id}/file`
        : null
    }));

    res.json({
      success: true,
      images: imagesWithUrls,
      page: images.page,
      perPage: images.perPage,
      totalPages: images.totalPages,
      totalItems: images.totalItems
    });
  } catch (error) {
    console.error('Error obteniendo imágenes:', error);
    res.status(500).json({ error: 'Error al obtener imágenes' });
  }
});

// Get single image (GET /api/admin/images/:imageId)
app.get('/api/admin/images/:imageId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { imageId } = req.params;
    const baseUrl = process.env.PUBLIC_API_URL || `http://localhost:${port}`;
    
    const image = await pb.collection('images').getOne(imageId);

    res.json({
      success: true,
      image: {
        id: image.id,
        alias: image.alias,
        image: image.image,
        creator_id: image.creator_id,
        created: image.created,
        updated: image.updated,
        imageUrl: image.image 
          ? `${baseUrl}/api/admin/images/${image.id}/file`
          : null
      }
    });
  } catch (error) {
    console.error('Error obteniendo imagen:', error);
    if (error.status === 404) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }
    res.status(500).json({ error: 'Error al obtener imagen' });
  }
});

// Get image file (GET /api/admin/images/:imageId/file)
// Note: This endpoint is public to allow images to be displayed via <img> tags
// The image IDs are unique and hard to guess, providing security through obscurity
// This is consistent with the avatar endpoint pattern
app.get('/api/admin/images/:imageId/file', async (req, res) => {
  try {
    const { imageId } = req.params;
    const { size = 'medium' } = req.query;

    const cacheKey = `image-${imageId}-${size}`;
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

    const image = await pb.collection('images').getOne(imageId, {
      fields: 'id,image,collectionId'
    });

    if (!image.image) {
      return res.status(404).json({ error: 'Archivo de imagen no encontrado' });
    }

    const baseUrl = process.env.POCKETBASE_URL || 'http://localhost:8090';
    const imageUrl = `${baseUrl}/api/files/${image.collectionId}/${image.id}/${image.image}`;
    
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
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ quality: 80 })
        .toBuffer();
    }

    imageCache.set(cacheKey, processedImage);

    res.set({
      'Content-Type': 'image/webp',
      'Content-Length': processedImage.length,
      'Cache-Control': 'public, max-age=86400',
      'X-Cache': 'MISS'
    });
    res.send(processedImage);

  } catch (error) {
    console.error('Error obteniendo archivo de imagen:', error);
    
    if (error.status === 404) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update image (PUT /api/admin/images/:imageId)
app.put('/api/admin/images/:imageId', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const { imageId } = req.params;
    const { alias } = req.body;

    // Verify image exists (throws 404 if not found)
    await pb.collection('images').getOne(imageId);

    const formData = new FormData();
    
    if (alias) {
      formData.append('alias', alias);
    }

    if (req.file) {
      // Optimize and convert to WEBP
      const optimizedImage = await sharp(req.file.buffer)
        .resize(800, 800, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .webp({ 
          quality: 80,
          effort: 6
        })
        .toBuffer();

      const blob = new Blob([optimizedImage], { type: 'image/webp' });
      formData.append('image', blob, `image-${Date.now()}.webp`);
      
      // Clear cache for this image
      clearCacheByPrefix(`image-${imageId}`);
    }

    const updatedImage = await pb.collection('images').update(imageId, formData);

    res.json({
      success: true,
      message: 'Imagen actualizada exitosamente',
      image: {
        id: updatedImage.id,
        alias: updatedImage.alias,
        image: updatedImage.image,
        creator_id: updatedImage.creator_id,
        updated: updatedImage.updated
      }
    });
  } catch (error) {
    console.error('Error actualizando imagen:', error);
    if (error.status === 404) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }
    res.status(500).json({ 
      error: 'Error al actualizar imagen',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete image (DELETE /api/admin/images/:imageId)
app.delete('/api/admin/images/:imageId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { imageId } = req.params;

    // Delete from PocketBase (will throw 404 if not found)
    await pb.collection('images').delete(imageId);

    // Clear cache for this image
    clearCacheByPrefix(`image-${imageId}`);

    res.json({
      success: true,
      message: 'Imagen eliminada exitosamente'
    });
  } catch (error) {
    console.error('Error eliminando imagen:', error);
    if (error.status === 404) {
      return res.status(404).json({ error: 'Imagen no encontrada' });
    }
    res.status(500).json({ error: 'Error al eliminar imagen' });
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
