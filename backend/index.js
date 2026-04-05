const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcrypt');
const dns = require('dns');
const admin = require('firebase-admin'); // Firebase Admin SDK
const fs = require('fs');
const path = require('path');

// Force Node.js to use IPv4 first (fixes Render ENETUNREACH IPv6 issue)
dns.setDefaultResultOrder('ipv4first');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Initialize Firebase Admin (Assuming serviceAccountKey.json is in the backend root)
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
let firestore;

if (fs.existsSync(serviceAccountPath)) {
  try {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firestore = admin.firestore();
    console.log('Firebase Admin SDK & Firestore Initialized Successfully.');
  } catch (err) {
    console.error('Failed to parse serviceAccountKey.json:', err);
  }
} else {
  console.warn('WARNING: serviceAccountKey.json not found. Firebase Admin features (like Pilot creation) will be disabled.');
}

// Email Transporter (Using Gmail via App Password)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD?.trim(),
  },
  tls: {
    rejectUnauthorized: false
  }
});

app.use(cors());
app.use(express.json());

// Auth Endpoint (Verify Google Token)
app.post('/api/auth/google', async (req, res) => {
  const { token } = req.body;
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    res.json({ success: true, user: payload });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid Google Token' });
  }
});

const PORT = process.env.PORT || 5000;

// In-memory driver storage for real-time (ephemeral, which is fine for current session tracking)
let onlineProviders = {}; // { providerId: { socketId, location, vehicleData } }
let activeRides = {}; // maps rideId to providerId to enforce single assignment

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  // Provider goes online
  socket.on('provider_online', (data) => {
    onlineProviders[data.providerId] = {
      socketId: socket.id,
      location: data.location,
      vehicle: data.vehicle,
      status: 'available'
    };
    console.log(`Provider ${data.providerId} is online`);
    io.emit('fleet_update', onlineProviders);
  });

  // Location update from Provider
  socket.on('update_location', (data) => {
    if (onlineProviders[data.providerId]) {
      onlineProviders[data.providerId].location = data.location;
      onlineProviders[data.providerId].vehicle = data.vehicle; 
      
      if (data.rideId) {
        socket.to(data.rideId).emit('driver_location', data.location);
      }
      
      io.emit('fleet_update', onlineProviders);
    }
  });

  // User requests a ride
  socket.on('request_ride', (rideData) => {
    console.log('New ride request:', rideData.id);
    activeRides[rideData.id] = null; 
    socket.join(rideData.id); 
    io.emit('new_ride_request', rideData);
  });

  // Provider accepts ride
  socket.on('accept_ride', (data) => {
    const { rideId, providerId } = data;
    if (activeRides[rideId] !== null && activeRides[rideId] !== undefined) {
      socket.emit('ride_already_accepted');
      return; 
    }
    activeRides[rideId] = providerId;
    if (onlineProviders[providerId]) {
      onlineProviders[providerId].status = 'busy';
      socket.join(rideId);
      io.to(rideId).emit('ride_accepted', { 
        providerId, 
        vehicle: { 
            ...onlineProviders[providerId].vehicle, 
            location: onlineProviders[providerId].location 
        } 
      });
      io.emit('fleet_update', onlineProviders);
    }
  });

  // Ride status updates
  socket.on('update_ride_status', (data) => {
    const { rideId, status } = data;
    io.to(rideId).emit('status_change', { status });
    
    if (status === 'completed' || status === 'cancelled') {
        const pId = Object.keys(onlineProviders).find(id => onlineProviders[id].socketId === socket.id);
        if (pId) onlineProviders[pId].status = 'available';
        io.emit('fleet_update', onlineProviders);
    }
  });

  // Chat Messages
  socket.on('send_message', (data) => {
    const { rideId, message, sender } = data;
    socket.to(rideId).emit('receive_message', { message, sender, timestamp: new Date() });
  });

  socket.on('disconnect', () => {
    const pId = Object.keys(onlineProviders).find(id => onlineProviders[id].socketId === socket.id);
    if (pId) {
      delete onlineProviders[pId];
      io.emit('fleet_update', onlineProviders);
    }
    console.log('Client disconnected');
  });
});

// Ride Completion & Email Receipt (Now saves to Firestore)
app.post('/api/rides/complete', async (req, res) => {
  const { rideId, userEmail, pickup, drop, fare, driverName } = req.body;
  
  try {
    const rideRef = firestore.collection('rides').doc(rideId);
    await rideRef.set({
        userEmail,
        pickup,
        drop,
        fare,
        driverName,
        status: 'completed',
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    const mailOptions = {
      from: process.env.MAIL_DEFAULT_SENDER,
      to: userEmail,
      subject: `Your SmileSphere EV Trip Receipt - ${rideId}`,
      html: `Trip details for ${rideId} at ₹${fare}.`, // Simplified
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Receipt sent and ride recorded' });
  } catch (error) {
    console.error('Ride Completion Error:', error);
    res.status(500).json({ error: 'Failed to record ride completion' });
  }
});

// Vehicle asset storage (Simulated DB - Can also move to Firestore if needed)
let registeredVehicles = [
    { id: 'EV-101', plate: 'OD-02-KIIT-01', model: 'Tata Nexon EV', status: 'active', battery: 92 },
    { id: 'EV-102', plate: 'OD-02-KIIT-02', model: 'Ather 450X', status: 'standby', battery: 84 },
];

app.post('/api/vehicles', (req, res) => {
    const newVehicle = { ...req.body, status: 'standby', battery: 100 };
    registeredVehicles.push(newVehicle);
    res.json({ success: true, vehicle: newVehicle });
});

app.get('/api/vehicles', (req, res) => {
    res.json(registeredVehicles);
});

app.delete('/api/vehicles', (req, res) => {
    const { plate } = req.body;
    const initialCount = registeredVehicles.length;
    registeredVehicles = registeredVehicles.filter(v => v.plate !== plate);
    if (registeredVehicles.length < initialCount) {
        res.json({ success: true, message: 'Asset purged' });
    } else {
        res.status(404).json({ success: false, error: 'Asset not found' });
    }
});

// Admin Pilot Creation API (Uses Firestore)
app.post('/api/admin/create-pilot', async (req, res) => {
    const { name, email, password, vehicleType, vehicleNumber } = req.body;
    
    if (!firestore) return res.status(500).json({ success: false, error: 'Firestore Admin not initialized.' });

    try {
        const userRef = firestore.collection('users').where('email', '==', email);
        const snapshot = await userRef.get();
        if (!snapshot.empty) return res.status(400).json({ success: false, error: 'Email already registered.' });

        const fUser = await admin.auth().createUser({ email, password, displayName: name });
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);

        const newUser = {
            uid: fUser.uid,
            name, email, password: hashedPassword, role: 'provider', vehicleType, vehicleNumber, blocked: false
        };
        
        await firestore.collection('users').doc(fUser.uid).set(newUser);
        res.json({ success: true, user: { uid: fUser.uid, name, role: 'provider' } });
    } catch (err) {
        console.error('Admin Pilot Creation Error:', err);
        res.status(500).json({ success: false, error: 'Internal Grid Error' });
    }
});

app.get('/api/admin/pilots', async (req, res) => {
    if (!firestore) return res.json([]);
    try {
        const pilotsSnapshot = await firestore.collection('users').where('role', '==', 'provider').get();
        const pilots = pilotsSnapshot.docs.map(doc => ({
            uid: doc.id, ...doc.data()
        }));
        res.json(pilots);
    } catch { res.json([]); }
});

app.post('/api/admin/toggle-block-pilot', async (req, res) => {
    const { uid } = req.body;
    if (!firestore) return res.status(500).json({ success: false });
    try {
        const userRef = firestore.collection('users').doc(uid);
        const user = await userRef.get();
        if (!user.exists) return res.status(404).json({ success: false });
        const newStatus = !user.data().blocked;
        await userRef.update({ blocked: newStatus });
        res.json({ success: true, blocked: newStatus });
    } catch { res.status(500).json({ success: false }); }
});

// Auth Register (Uses Firestore)
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role, vehicleType, vehicleNumber, uid } = req.body;
    if (!firestore) return res.status(500).json({ success: false });

    try {
        const userRef = firestore.collection('users').doc(uid);
        const existing = await userRef.get();
        if (existing.exists) return res.status(400).json({ success: false, error: 'Identity already locked.' });
        
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(password, salt);
        
        const newUser = {
            uid, name, email, password: hashedPassword, role, vehicleType: role === 'provider' ? vehicleType : null, vehicleNumber: role === 'provider' ? vehicleNumber : null, blocked: false
        };
        
        await userRef.set(newUser);
        res.json({ success: true, user: newUser });
    } catch { res.status(500).json({ success: false }); }
});

// Login Endpoint (Firestore Sync)
app.post('/api/auth/login', async (req, res) => {
    const { email, password, requestedRole, uid } = req.body;
    if (!firestore) return res.status(500).json({ success: false });

    try {
        let user;
        if (uid) {
            const userRef = firestore.collection('users').doc(uid);
            const doc = await userRef.get();
            if (doc.exists) user = doc.data();
        }

        if (!user) {
            const snapshot = await firestore.collection('users').where('email', '==', email).get();
            if (!snapshot.empty) user = snapshot.docs[0].data();
        }

        if (!user) return res.status(400).json({ success: false, error: 'Entity not found.' });

        if (uid && user.uid !== uid) {
            await firestore.collection('users').doc(uid).set({ ...user, uid });
            await firestore.collection('users').doc(user.uid).delete();
            user.uid = uid;
            console.log(`Grid UID Sync: ${email} Identity mapped.`);
        }

        if (user.blocked) return res.status(403).json({ success: false, error: 'Suspended.' });
        if (requestedRole && user.role !== requestedRole && user.role !== 'admin') {
            return res.status(400).json({ success: false, error: `Unauthorized role.` });
        }

        res.json({ success: true, user });
    } catch { res.status(500).json({ success: false }); }
});

app.post('/api/auth/delete', async (req, res) => {
    const { email } = req.body;
    if (!firestore) return res.status(500).json({ success: false });
    try {
        const snapshot = await firestore.collection('users').where('email', '==', email).get();
        if (snapshot.empty) return res.status(404).json({ success: false });
        const uid = snapshot.docs[0].id;
        try { await admin.auth().deleteUser(uid); } catch(e) {}
        await firestore.collection('users').doc(uid).delete();
        res.json({ success: true, message: 'Purged.' });
    } catch { res.status(500).json({ success: false }); }
});

app.get('/', (req, res) => {
  res.send('EV Ride Share Backend (Firestore Mode) is Running');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
