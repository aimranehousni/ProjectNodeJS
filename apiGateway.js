const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuration des routes pour les différents services
const routes = [
  {
    url: '/api/livre',
    target: 'http://localhost:3000',
    pathRewrite: {'^/api/livre': '/livre'}
  },
  {
    url: '/api/emprunt',
    target: 'http://localhost:3001',
    pathRewrite: {'^/api/emprunt': '/emprunt'}
  },
  {
    url: '/api/emprunts',
    target: 'http://localhost:3001',
    pathRewrite: {'^/api/emprunts': '/emprunts'}
  },
  {
    url: '/api/client',
    target: 'http://localhost:3002',
    pathRewrite: {'^/api/client': '/client'}
  },
  {
    url: '/api/notification',
    target: 'http://localhost:3003',
    pathRewrite: {'^/api/notification': '/notification'}
  }
];

// Configuration des proxies pour chaque route
routes.forEach(route => {
  app.use(
    route.url,
    createProxyMiddleware({
      target: route.target,
      changeOrigin: true,
      pathRewrite: route.pathRewrite,
      logLevel: 'debug'
    })
  );
});

// Route de base pour vérifier que l'API Gateway fonctionne
app.get('/', (req, res) => {
  res.json({
    message: 'API Gateway - Système de Gestion de Bibliothèque',
    version: '1.0.0',
    services: [
      { name: 'Service Livre', url: '/api/livre' },
      { name: 'Service Emprunt', url: '/api/emprunt' },
      { name: 'Service Client', url: '/api/client' },
      { name: 'Service Notification', url: '/api/notification' }
    ]
  });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error('Erreur dans l\'API Gateway:', err);
  res.status(500).json({ message: 'Erreur interne du serveur' });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`API Gateway en cours d'exécution sur http://localhost:${PORT}`);
});