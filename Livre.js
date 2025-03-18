const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const app = express();
const PORT = 3000;
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
// 1. Créer (POST)
app.post('/livre', (req, rep) => {
const newItem = req.body;
console.log(newItem);
db.collection('livre').insertOne(newItem)
.then(result => rep.status(200).json({ _id: result.insertedId, ...newItem }))
.catch(err => rep.status(500).json({ error: 'Impossible de créer l\'élément '+err.message}));
});
// 2. Lire tous les éléments (GET)
app.get('/livre', (req, res) => {
db.collection('livre').find().toArray()
.then(equipes => {res.json(equipes)})
.catch(err => res.status(500).json({ error: 'Impossible de récupérer les éléments' }));
});
// 3. Lire un élément par ID (GET)
app.get('/livre/:id', (req, res) => {
const { id } = req.params;
db.collection('livre').findOne({ _id: new ObjectId(id) })
.then(item => {
if (!item) return res.status(404).json({ error: 'Élément non trouvé' });
res.json(item);
})
.catch(err => res.status(500).json({ error: 'Erreur lors de la récupération de l\'élément' }));
});
// 4. Mettre à jour un élément (PUT)
app.put('/livre/:id', async (req, res) => {
const { id } = req.params;
const updatedItem = req.body;
await db.collection('livre').updateOne({ _id: new ObjectId(id) }, { $set: updatedItem })
.then(result => {
if (result.matchedCount === 0) return res.status(404).json({ error: 'Élément non trouvé' });
res.json({ message: 'Élément mis à jour avec succès' });
})
.catch(err => {
console.log(err.message);
res.status(500).json(err.message);
});
});
// 5. Supprimer un élément (DELETE)
app.delete('/livre/:id', (req, res) => {
const { id } = req.params;
db.collection('livre').deleteOne({ _id: new ObjectId(id) })
.then(result => {
if (result.deletedCount === 0) return res.status(404).json({ error: 'Élément non trouvé' });
res.json({ message: 'Élément supprimé avec succès' });
})
.catch(err => res.status(500).json({ error: 'Erreur lors de la suppression de l\'élément' }));
});
// Démarrer le serveur
app.listen(PORT, () => console.log(`Serveur en cours d'exécution sur le port ${PORT}`))