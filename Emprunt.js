const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const axios = require('axios');
const app = express();
const PORT = 3001;

// Middleware pour parser les données JSON
app.use(express.json());

// URL de connexion à MongoDB et nom de la base de données
const url = 'mongodb://localhost:27017';
const dbName = 'livre';
let db;

// Services URLs
const LIVRE_SERVICE_URL = 'http://localhost:3000/livre';
const CLIENT_SERVICE_URL = 'http://localhost:3002/client';
const NOTIFICATION_SERVICE_URL = 'http://localhost:3003/notification';

// Connexion à MongoDB
MongoClient.connect(url, { useNewUrlParser: true, useUnifiedTopology: true })
  .then((client) => {
    console.log('Connecté à MongoDB');
    db = client.db(dbName);
  })
  .catch((error) => console.error('Erreur de connexion à MongoDB:', error));

// Créer un nouvel emprunt
app.post('/emprunt/:livreId', async (req, res) => {
  const livreId = req.params.livreId;
  try {
    // Vérification de la disponibilité du livre
    const livreResponse = await axios.get(`${LIVRE_SERVICE_URL}/${livreId}`);
    const livre = livreResponse.data;
    
    if (!livre || livre.quantite < 1) {
      return res.status(400).json({ message: 'Aucun livre disponible.' });
    }
    
    // Vérification que le client existe
    const { clientId, dateRetourPrevue } = req.body;
    
    if (!clientId) {
      return res.status(400).json({ message: 'Le champ clientId est obligatoire.' });
    }
    
    try {
      await axios.get(`${CLIENT_SERVICE_URL}/${clientId}`);
    } catch (error) {
      return res.status(404).json({ message: 'Client non trouvé.' });
    }
    
    // Mise à jour de la quantité du livre
    await axios.put(`${LIVRE_SERVICE_URL}/${livreId}`, { quantite: livre.quantite - 1 });
    
    // Création de l'emprunt dans la base de données
    const dateEmprunt = new Date();
    const dateRetour = dateRetourPrevue ? new Date(dateRetourPrevue) : new Date(dateEmprunt.getTime() + 14 * 24 * 60 * 60 * 1000); // Par défaut 14 jours
    
    const nouvelEmprunt = {
      livreId,
      clientId,
      livre: {
        titre: livre.titre,
        auteur: livre.auteur,
        isbn: livre.isbn
      },
      dateEmprunt,
      dateRetourPrevue: dateRetour,
      dateRetourEffective: null,
      statut: 'emprunté'
    };
    
    const result = await db.collection('emprunts').insertOne(nouvelEmprunt);
    
    res.status(201).json({
      message: 'Emprunt créé avec succès.',
      empruntId: result.insertedId,
      emprunt: nouvelEmprunt
    });
  } catch (error) {
    console.error('Erreur lors du traitement :', error.message);
    res.status(500).json({ message: 'Erreur serveur.', error: error.message });
  }
});

// Retourner un livre
app.put('/emprunt/retour/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Récupération de l'emprunt
    const emprunt = await db.collection('emprunts').findOne({ _id: new ObjectId(id) });
    
    if (!emprunt) {
      return res.status(404).json({ message: 'Emprunt non trouvé.' });
    }
    
    if (emprunt.statut === 'retourné') {
      return res.status(400).json({ message: 'Ce livre a déjà été retourné.' });
    }
    
    // Mise à jour de la quantité du livre
    try {
      const livreResponse = await axios.get(`${LIVRE_SERVICE_URL}/${emprunt.livreId}`);
      const livre = livreResponse.data;
      
      await axios.put(`${LIVRE_SERVICE_URL}/${emprunt.livreId}`, { 
        quantite: livre.quantite + 1 
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la quantité du livre:', error.message);
      // On continue malgré l'erreur pour mettre à jour l'emprunt
    }
    
    // Mise à jour de l'emprunt
    const dateRetourEffective = new Date();
    await db.collection('emprunts').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: {
          dateRetourEffective,
          statut: 'retourné'
        }
      }
    );
    
    // Envoi d'une notification pour les clients qui attendaient ce livre
    try {
      // Chercher les clients qui ont fait une demande pour ce livre
      const demandesLivre = await db.collection('demandesLivre').find({ 
        livreId: emprunt.livreId,
        statut: 'en attente'
      }).toArray();
      
      // Envoyer une notification à chaque client
      if (demandesLivre.length > 0) {
        for (const demande of demandesLivre) {
          await axios.post(NOTIFICATION_SERVICE_URL, {
            type: 'BOOK_RETURNED',
            clientId: demande.clientId,
            bookTitle: emprunt.livre.titre,
            message: `Le livre "${emprunt.livre.titre}" que vous avez demandé est maintenant disponible.`
          });
          
          // Mettre à jour le statut de la demande
          await db.collection('demandesLivre').updateOne(
            { _id: demande._id },
            { $set: { statut: 'notifié', dateNotification: new Date() } }
          );
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'envoi des notifications:', error.message);
      // On continue malgré l'erreur pour renvoyer une réponse positive
    }
    
    res.status(200).json({ 
      message: 'Livre retourné avec succès.',
      empruntId: id,
      dateRetour: dateRetourEffective
    });
  } catch (error) {
    console.error('Erreur lors du retour du livre:', error.message);
    res.status(500).json({ message: 'Erreur serveur.', error: error.message });
  }
});

// Récupérer tous les emprunts
app.get('/emprunts', async (req, res) => {
  try {
    const emprunts = await db.collection('emprunts').find().toArray();
    res.status(200).json({ message: 'Liste des emprunts récupérée.', data: emprunts });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur.', error: error.message });
  }
});

// Récupérer les emprunts d'un client
app.get('/emprunts/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    const emprunts = await db.collection('emprunts')
      .find({ clientId })
      .sort({ dateEmprunt: -1 })
      .toArray();
    
    res.status(200).json({ 
      message: 'Liste des emprunts du client récupérée.',
      clientId,
      data: emprunts 
    });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur.', error: error.message });
  }
});

// Supprimer un emprunt (annulation avant que le livre ne soit emprunté)
app.delete('/emprunt/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Récupération de l'emprunt pour mettre à jour le stock du livre
    const emprunt = await db.collection('emprunts').findOne({ _id: new ObjectId(id) });
    
    if (!emprunt) {
      return res.status(404).json({ message: 'Emprunt non trouvé.' });
    }
    
    // Si le livre n'a pas encore été retourné, mettre à jour la quantité
    if (emprunt.statut === 'emprunté') {
      try {
        const livreResponse = await axios.get(`${LIVRE_SERVICE_URL}/${emprunt.livreId}`);
        const livre = livreResponse.data;
        
        await axios.put(`${LIVRE_SERVICE_URL}/${emprunt.livreId}`, { 
          quantite: livre.quantite + 1 
        });
      } catch (error) {
        console.error('Erreur lors de la mise à jour de la quantité du livre:', error.message);
        // On continue malgré l'erreur pour supprimer l'emprunt
      }
    }
    
    // Suppression de l'emprunt
    const result = await db.collection('emprunts').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ message: 'Emprunt non trouvé.' });
    }
    
    res.status(200).json({ message: `Emprunt avec l'ID ${id} supprimé avec succès.` });
  } catch (error) {
    res.status(500).json({ message: 'Erreur serveur.', error: error.message });
  }
});

// Demander un livre non disponible
app.post('/demande-livre/:livreId', async (req, res) => {
  try {
    const { livreId } = req.params;
    const { clientId } = req.body;
    
    if (!clientId) {
      return res.status(400).json({ message: 'Le champ clientId est obligatoire.' });
    }
    
    // Vérification que le livre existe
    try {
      await axios.get(`${LIVRE_SERVICE_URL}/${livreId}`);
    } catch (error) {
      return res.status(404).json({ message: 'Livre non trouvé.' });
    }
    
    // Vérification que le client existe
    try {
      await axios.get(`${CLIENT_SERVICE_URL}/${clientId}`);
    } catch (error) {
      return res.status(404).json({ message: 'Client non trouvé.' });
    }
    
    // Vérification si la demande existe déjà
    const demandeExistante = await db.collection('demandesLivre').findOne({
      livreId,
      clientId,
      statut: 'en attente'
    });
    
    if (demandeExistante) {
      return res.status(400).json({ message: 'Une demande pour ce livre existe déjà.' });
    }
    
    // Création de la demande
    const nouvelleDemande = {
      livreId,
      clientId,
      dateCreation: new Date(),
      statut: 'en attente'
    };
    
    const result = await db.collection('demandesLivre').insertOne(nouvelleDemande);
    
    res.status(201).json({
      message: 'Demande de livre créée avec succès.',
      demandeId: result.insertedId,
      demande: nouvelleDemande
    });
  } catch (error) {
    console.error('Erreur lors de la création de la demande:', error.message);
    res.status(500).json({ message: 'Erreur serveur.', error: error.message });
  }
});

// Lancer le serveur
app.listen(PORT, () => {
  console.log(`Serveur d'emprunt en cours d'exécution sur http://localhost:${PORT}`);
});