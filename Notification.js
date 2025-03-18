const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const amqp = require('amqplib');
const nodemailer = require('nodemailer');
const app = express();
const PORT = 3003;
const MONGO_URI = 'mongodb://localhost:27017';
const DB_NAME = 'livre';

// Middleware pour analyser le JSON
app.use(express.json());

let db;
let channel;
const QUEUE_NAME = 'notifications';

// Configuration pour nodemailer (service de mail)
const transporter = nodemailer.createTransport({
  service: 'gmail',  // Remplacer par votre service de mail
  auth: {
    user: 'your-email@gmail.com',  // Remplacer par votre email
    pass: 'your-password'  // Remplacer par votre mot de passe
  }
});

// Connexion à MongoDB
MongoClient.connect(MONGO_URI, { useUnifiedTopology: true })
  .then(client => {
    db = client.db(DB_NAME);
    console.log('Connexion à MongoDB réussie');
  })
  .catch(err => console.error('Erreur de connexion MongoDB :', err.message));

// Connexion à RabbitMQ et configuration de la queue
async function setupRabbitMQ() {
  try {
    const connection = await amqp.connect('amqp://localhost');
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    console.log('Connexion à RabbitMQ réussie');
    
    // Consommation des messages de la queue
    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg !== null) {
        const notification = JSON.parse(msg.content.toString());
        console.log(`Traitement de la notification: ${notification.type}`);
        
        try {
          // Enregistrement de la notification dans la base de données
          await db.collection('notifications').insertOne({
            ...notification,
            status: 'pending',
            createdAt: new Date()
          });
          
          // Envoi de la notification
          await sendNotification(notification);
          
          // Confirmation de traitement
          channel.ack(msg);
        } catch (error) {
          console.error('Erreur lors du traitement de la notification:', error);
          // Remise en queue en cas d'échec
          channel.nack(msg);
        }
      }
    });
  } catch (error) {
    console.error('Erreur de connexion à RabbitMQ:', error);
    setTimeout(setupRabbitMQ, 5000); // Retenter la connexion après 5 secondes
  }
}

// Fonction pour envoyer une notification par email
async function sendNotification(notification) {
  try {
    // Récupération des informations du client
    const client = await db.collection('client').findOne({ _id: new ObjectId(notification.clientId) });
    
    if (!client || !client.email) {
      throw new Error('Client introuvable ou pas d\'email disponible');
    }
    
    // Construction du message selon le type de notification
    let subject = '';
    let text = '';
    
    switch (notification.type) {
      case 'NEW_BOOK':
        subject = 'Nouveau livre disponible!';
        text = `Bonjour ${client.nom}, le livre "${notification.bookTitle}" est maintenant disponible dans notre bibliothèque.`;
        break;
      case 'BOOK_RETURNED':
        subject = 'Livre retourné disponible';
        text = `Bonjour ${client.nom}, le livre "${notification.bookTitle}" que vous aviez demandé est maintenant disponible.`;
        break;
      case 'BORROW_REMINDER':
        subject = 'Rappel: Retour de livre';
        text = `Bonjour ${client.nom}, nous vous rappelons que le livre "${notification.bookTitle}" doit être retourné d'ici ${notification.dueDate}.`;
        break;
      default:
        subject = 'Notification de la bibliothèque';
        text = `Bonjour ${client.nom}, ${notification.message}`;
    }
    
    // Envoi de l'email
    const mailOptions = {
      from: 'bibliotheque@example.com',
      to: client.email,
      subject: subject,
      text: text
    };
    
    await transporter.sendMail(mailOptions);
    
    // Mise à jour du statut dans la base de données
    await db.collection('notifications').updateOne(
      { _id: notification._id },
      { $set: { status: 'sent', sentAt: new Date() } }
    );
    
    console.log(`Notification envoyée à ${client.email}`);
  } catch (error) {
    console.error('Erreur lors de l\'envoi de la notification:', error);
    throw error;
  }
}

// Route pour poster une notification manuellement (pour tests)
app.post('/notification', async (req, res) => {
  try {
    const notification = req.body;
    
    // Vérification des champs requis
    if (!notification.type || !notification.clientId) {
      return res.status(400).json({ error: 'Les champs type et clientId sont obligatoires' });
    }
    
    // Ajout à la queue
    channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(notification)), { persistent: true });
    
    res.status(202).json({ message: 'Notification mise en queue avec succès' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de l\'envoi de la notification: ' + error.message });
  }
});

// Route pour récupérer l'historique des notifications d'un client
app.get('/notification/client/:clientId', async (req, res) => {
  try {
    const { clientId } = req.params;
    
    const notifications = await db.collection('notifications')
      .find({ clientId: clientId })
      .sort({ createdAt: -1 })
      .toArray();
    
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Erreur lors de la récupération des notifications: ' + error.message });
  }
});

// Démarrer la connexion à RabbitMQ
setupRabbitMQ();

// Démarrer le serveur
app.listen(PORT, () => console.log(`Service notification en cours d'exécution sur le port ${PORT}`));