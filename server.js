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
