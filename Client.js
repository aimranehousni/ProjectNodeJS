const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const app = express();
const PORT = 3002;
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'livre';

// Middleware pour analyser le JSON
app.use(express.json());

let db;

// Connexion à MongoDB
MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(DB_NAME);
    console.log('Connexion à MongoDB réussie');
  })
  .catch(err => console.error('Erreur de connexion MongoDB :', err.message));

// 1. Créer un client (POST)
app.post('/client', (req, res) => {
  const newClient = req.body;
  
  // Vérification des champs requis
  if (!newClient.nom || !newClient.prenom || !newClient.cni) {
    return res.status(400).json({ error: 'Les champs nom, prenom et cni sont obligatoires' });
  }
  
  db.collection('client').insertOne(newClient)
    .then(result => res.status(201).json({ _id: result.insertedId, ...newClient }))
    .catch(err => res.status(500).json({ error: 'Impossible de créer le client: ' + err.message }));
});

// 2. Lire tous les clients (GET)
app.get('/client', (req, res) => {
  db.collection('client').find().toArray()
    .then(clients => res.json(clients))
    .catch(err => res.status(500).json({ error: 'Impossible de récupérer les clients' }));
});

// 3. Lire un client par ID (GET)
app.get('/client/:id', (req, res) => {
  const { id } = req.params;
  
  db.collection('client').findOne({ _id: new ObjectId(id) })
    .then(client => {
      if (!client) return res.status(404).json({ error: 'Client non trouvé' });
      res.json(client);
    })
    .catch(err => res.status(500).json({ error: 'Erreur lors de la récupération du client' }));
});

// 4. Mettre à jour un client (PUT)
app.put('/client/:id', async (req, res) => {
  const { id } = req.params;
  const updatedClient = req.body;
  
  await db.collection('client').updateOne({ _id: new ObjectId(id) }, { $set: updatedClient })
    .then(result => {
      if (result.matchedCount === 0) return res.status(404).json({ error: 'Client non trouvé' });
      res.json({ message: 'Client mis à jour avec succès' });
    })
    .catch(err => {
      console.log(err.message);
      res.status(500).json({ error: err.message });
    });
});

// 5. Supprimer un client (DELETE)
app.delete('/client/:id', (req, res) => {
  const { id } = req.params;
  
  db.collection('client').deleteOne({ _id: new ObjectId(id) })
    .then(result => {
      if (result.deletedCount === 0) return res.status(404).json({ error: 'Client non trouvé' });
      res.json({ message: 'Client supprimé avec succès' });
    })
    .catch(err => res.status(500).json({ error: 'Erreur lors de la suppression du client' }));
});

// 6. Recherche de clients par CNI (GET)
app.get('/client/search/cni/:cni', (req, res) => {
  const { cni } = req.params;
  
  db.collection('client').findOne({ cni })
    .then(client => {
      if (!client) return res.status(404).json({ error: 'Client non trouvé' });
      res.json(client);
    })
    .catch(err => res.status(500).json({ error: 'Erreur lors de la recherche du client' }));
});

// Démarrer le serveur
app.listen(PORT, () => console.log(`Service client en cours d'exécution sur le port ${PORT}`));