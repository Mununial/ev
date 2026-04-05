const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
const bcrypt = require('bcrypt');

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Email Transporter (Using Gmail via App Password)
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_PASSWORD?.trim(),
  },
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

// Firebase Admin Setup (User needs to add serviceAccountKey.json)
// admin.initializeApp({
//   credential: admin.credential.cert(require("./serviceAccountKey.json")),
//   databaseURL: "YOUR_FIREBASE_DB_URL"
// });

const PORT = process.env.PORT || 5000;

// In-memory driver storage for real-time (can sync with Firestore)
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
      onlineProviders[data.providerId].vehicle = data.vehicle; // Update battery/health
      
      // Update specific ride user if busy
      if (data.rideId) {
        socket.to(data.rideId).emit('driver_location', data.location);
      }
      
      io.emit('fleet_update', onlineProviders);
    }
  });

  // User requests a ride
  socket.on('request_ride', (rideData) => {
    console.log('New ride request:', rideData.id);
    activeRides[rideData.id] = null; // Mark ride as unassigned
    // Broadcast to all nearby (simplified: all) online providers
    socket.join(rideData.id); // User joins ride room
    io.emit('new_ride_request', rideData);
  });

  // Provider accepts ride
  socket.on('accept_ride', (data) => {
    const { rideId, providerId } = data;
    
    // Check if ride was already assigned!
    if (activeRides[rideId] !== null && activeRides[rideId] !== undefined) {
      socket.emit('ride_already_accepted');
      return; 
    }
    
    // Secure the ride for this provider
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
        // Free the provider
        const pId = Object.keys(onlineProviders).find(id => onlineProviders[id].socketId === socket.id);
        if (pId) onlineProviders[pId].status = 'available';
        io.emit('fleet_update', onlineProviders);
    }
  });

  // Chat Messages
  socket.on('send_message', (data) => {
    const { rideId, message, sender } = data;
    // Broadcast to others in the room
    socket.to(rideId).emit('receive_message', { message, sender, timestamp: new Date() });
  });

  socket.on('disconnect', () => {
    // Find and remove provider if they were online
    const pId = Object.keys(onlineProviders).find(id => onlineProviders[id].socketId === socket.id);
    if (pId) {
      delete onlineProviders[pId];
      io.emit('fleet_update', onlineProviders);
    }
    console.log('Client disconnected');
  });
});

// Ride Completion & Email Receipt
app.post('/api/rides/complete', async (req, res) => {
  const { rideId, userEmail, pickup, drop, fare, driverName } = req.body;
  
  try {
    const mailOptions = {
      from: process.env.MAIL_DEFAULT_SENDER,
      to: userEmail,
      subject: `Your SmileSphere EV Trip Receipt - ${rideId}`,
      html: `
        <div style="font-family: sans-serif; background: #0f172a; color: #f8fafc; padding: 40px; border-radius: 24px; max-width: 600px; margin: auto;">
            <div style="background: #22c55e; width: 60px; height: 60px; border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 24px;">
                <img src="https://img.icons8.com/ios-filled/50/ffffff/checked-checkbox.png" width="30"/>
            </div>
            <h1 style="font-size: 24px; font-weight: 800; margin-bottom: 8px;">Thanks for riding green, Michael!</h1>
            <p style="color: #94a3b8; font-size: 16px; margin-bottom: 32px;">You saved <strong>0.8kg</strong> of CO2 on this trip.</p>
            
            <div style="background: rgba(255,255,255,0.05); padding: 24px; border-radius: 16px; margin-bottom: 32px;">
                <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
                    <span style="color: #64748b;">Total Fare</span>
                    <span style="font-weight: 800; font-size: 20px;">₹${fare || '15.50'}</span>
                </div>
                <div style="border-top: 1px solid rgba(255,255,255,0.1); padding-top: 16px;">
                    <p style="font-size: 14px; margin: 4px 0;"><span style="color: #22c55e;">●</span> <strong>Pickup:</strong> ${pickup}</p>
                    <p style="font-size: 14px; margin: 4px 0;"><span style="color: #ef4444;">●</span> <strong>Drop:</strong> ${drop}</p>
                </div>
            </div>

            <div style="display: flex; align-items: center; gap: 12px;">
                <div style="background: #1e293b; width: 40px; height: 40px; border-radius: 50%; text-align: center; line-height: 40px;">🚗</div>
                <div>
                   <p style="margin: 0; font-weight: bold; font-size: 14px;">Driver: ${driverName || 'Alex Johnson'}</p>
                   <p style="margin: 0; color: #64748b; font-size: 12px;">Tesla Model 3 • EV401</p>
                </div>
            </div>
            
            <p style="font-size: 12px; color: #475569; margin-top: 40px; text-align: center;">Powered by SmileSphere EV Mobility Systems</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`Receipt sent to ${userEmail} for ride ${rideId}`);
    res.json({ success: true, message: 'Receipt sent' });
  } catch (error) {
    console.error('Email error:', error);
    res.status(500).json({ error: 'Failed to send receipt' });
  }
});

// Vehicle asset storage (Simulated DB)
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
        res.json({ success: true, message: 'Asset purged from Grid Inventory' });
    } else {
        res.status(404).json({ success: false, error: 'Asset not found' });
    }
});

// Database Simulation
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, 'db.json');

let db = { users: [], uniquePasswords: [] };
if (fs.existsSync(dbPath)) {
    db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
} else {
    fs.writeFileSync(dbPath, JSON.stringify(db));
}

const saveDB = () => fs.writeFileSync(dbPath, JSON.stringify(db, null, 2));

const otpStore = {};

// Auth Endpoint (Send OTP only for verification if needed)
app.post('/api/auth/send-otp', async (req, res) => {
    const { email, name } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expires: Date.now() + 600000, name }; 

    try {
        await transporter.sendMail({
            from: process.env.MAIL_DEFAULT_SENDER,
            to: email,
            subject: `SmileSphere Verification Code - ${otp}`,
            text: `Your Verification Code is ${otp}`
        });
        res.json({ success: true, message: 'OTP sent' });
    } catch (e) {
        console.error('SMTP OTP Error:', e);
        res.status(500).json({ error: 'Failed to send OTP' });
    }
});

// Admin Pilot Creation API
app.post('/api/admin/create-pilot', (req, res) => {
    const { name, email, password, vehicleType, vehicleNumber } = req.body;
    
    const existingUser = db.users.find(u => u.email === email);
    if (existingUser) return res.status(400).json({ success: false, error: 'Email already exists' });
    
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    
    const newUser = {
        uid: 'PILOT_' + Math.random().toString(36).substr(2, 9),
        name, email, password: hashedPassword, role: 'provider', vehicleType, vehicleNumber
    };
    
    db.users.push(newUser);
    db.uniquePasswords.push(hashedPassword);
    saveDB();
    
    res.json({ success: true, user: newUser });
});

app.get('/api/admin/pilots', (req, res) => {
    const pilots = db.users.filter(u => u.role === 'provider').map(p => ({
        uid: p.uid, name: p.name, email: p.email, vehicleType: p.vehicleType, vehicleNumber: p.vehicleNumber, blocked: !!p.blocked
    }));
    res.json(pilots);
});

app.post('/api/admin/toggle-block-pilot', (req, res) => {
    const { uid } = req.body;
    const user = db.users.find(u => u.uid === uid);
    if (!user) return res.status(404).json({ success: false, error: 'Pilot not found' });
    user.blocked = !user.blocked;
    saveDB();
    res.json({ success: true, blocked: user.blocked });
});

// Verify OTP Endpoint
app.post('/api/auth/verify-otp', (req, res) => {
    const { email, otp } = req.body;
    const stored = otpStore[email];
    
    if (stored && stored.otp === otp && Date.now() < stored.expires) {
        // We delete it during reset-password, but for register it just verifies.
        // If we delete it here, register won't know it's verified securely if we rely on it, but register currently doesn't check otpStore.
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }
});

// Auth Register and Login combined into a unified controller for security rules
app.post('/api/auth/register', (req, res) => {
    const { name, email, password, role, vehicleType, vehicleNumber } = req.body;
    
    // Check if email already used for any role
    const existingUser = db.users.find(u => u.email === email);
    if (existingUser) {
        return res.status(400).json({ success: false, error: 'Email already registered. Please login.' });
    }
    
    // Check global password reuse securely
    let isReused = false;
    for (const hash of db.uniquePasswords) {
        if (bcrypt.compareSync(password, String(hash).substring(0, 60))) { isReused = true; break; }
    }
    if (isReused) {
        return res.status(400).json({ success: false, error: 'Password is too common or already in use by another account.' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    
    const newUser = {
        uid: 'USER_' + Math.random().toString(36).substr(2, 9),
        name, email, password: hashedPassword, role, vehicleType: role === 'provider' ? vehicleType : null, vehicleNumber: role === 'provider' ? vehicleNumber : null
    };
    
    db.users.push(newUser);
    db.uniquePasswords.push(hashedPassword);
    saveDB();
    
    res.json({ success: true, user: { uid: newUser.uid, displayName: name, email, role, vehicleType, vehicleNumber } });
});

app.post('/api/auth/login', (req, res) => {
    const { email, password, requestedRole } = req.body;
    const user = db.users.find(u => u.email === email);
    
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(400).json({ success: false, error: 'Invalid credentials' });
    }
    
    if (user.blocked) {
        return res.status(403).json({ success: false, error: 'Access Denied: Your account has been suspended by the Admin.' });
    }
    
    if (requestedRole && user.role !== requestedRole && user.role !== 'admin') {
        return res.status(400).json({ success: false, error: `This account is not registered as a ${requestedRole.toUpperCase()}` });
    }
    
    res.json({ success: true, user: { uid: user.uid, displayName: user.name, email: user.email, role: user.role, vehicleType: user.vehicleType, vehicleNumber: user.vehicleNumber } });
});

// Forgot Password
app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    const user = db.users.find(u => u.email === email);
    if (!user) return res.status(400).json({ success: false, error: 'User not found' });
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = { otp, expires: Date.now() + 600000 };
    
    try {
        await transporter.sendMail({
            from: process.env.MAIL_DEFAULT_SENDER,
            to: email,
            subject: `SmileSphere Password Reset Code - ${otp}`,
            text: `Your OTP is ${otp}`
        });
        res.json({ success: true, message: 'OTP sent' });
    } catch (e) {
        console.error('SMTP Forgot Password Error:', e);
        res.status(500).json({ success: false, error: 'Failed to send email' });
    }
});

// Reset Password
app.post('/api/auth/reset-password', (req, res) => {
    const { email, otp, newPassword } = req.body;
    const stored = otpStore[email];
    if (!stored || stored.otp !== otp || Date.now() > stored.expires) {
        return res.status(400).json({ success: false, error: 'Invalid or expired OTP' });
    }
    
    const user = db.users.find(u => u.email === email);
    if (!user) return res.status(400).json({ success: false, error: 'User not found' });
    
    let isReused = false;
    for (const hash of db.uniquePasswords) {
        if (bcrypt.compareSync(newPassword, String(hash).substring(0, 60))) { isReused = true; break; }
    }
    if (isReused) {
        return res.status(400).json({ success: false, error: 'Password is too common or used by another user.' });
    }
    
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(newPassword, salt);
    
    user.password = hashedPassword;
    db.uniquePasswords.push(hashedPassword);
    delete otpStore[email];
    saveDB();
    res.json({ success: true, error: null });
});

app.post('/api/auth/delete', (req, res) => {
    const { email } = req.body;
    const userToDel = db.users.find(u => u.email === email);
    if (!userToDel) return res.status(404).json({ success: false, error: 'User not found' });
    
    // Purge user's hash from the unique credential check pool
    db.uniquePasswords = db.uniquePasswords.filter(h => h !== userToDel.password);
    
    // Purge user data document
    db.users = db.users.filter(u => u.email !== email);
    saveDB();
    
    res.json({ success: true, message: 'Account and associated credential hashes purged securely' });
});

app.get('/', (req, res) => {
  res.send('EV Ride Share Backend is Running');
});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
