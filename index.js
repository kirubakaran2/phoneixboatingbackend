require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const webPush = require('web-push');

const app = express();

// Middleware to parse JSON and enable CORS
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173', 'https://newphoenixboating.vercel.app', 'https://newphoenixboating.in', 'https://www.newphoenixboating.in'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Connect to MongoDB
mongoose.connect('mongodb+srv://kiruba:kirubakaran23@creeper.fg9oh.mongodb.net/', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.log('MongoDB connection error:', err));

// Define schemas
const bookingSchema = new mongoose.Schema({
    name: String,
    date: Date,
    timeSlot: String,
    phoneNumber: String
});

const emailSchema = new mongoose.Schema({
    name: String,
    email: String,
    message: String
});

const subscriptionSchema = new mongoose.Schema({
    endpoint: String,
    keys: {
        auth: String,
        p256dh: String
    }
});

// Create models
const Booking = mongoose.model('Booking', bookingSchema);
const Email = mongoose.model('Email', emailSchema);
const Subscription = mongoose.model('Subscription', subscriptionSchema);

// VAPID keys
const vapidKeys = {
    publicKey: 'BJSGv5raHxSFIvnQB493vrLqXCtGnpLfm1Yzw4nS9X67d4nh6pktfHewpyzajnAR0VjHg8G6qrKPeldQUqf13s0',
    privateKey: 'ddpS5YH5KbzryZcj5_h3tPyF05u-Q-FzGnTuSOjssd0'
};

// Set VAPID details
webPush.setVapidDetails(
    'mailto:kirubakaran003k2@gmail.com', // Your email
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

// Generate JWT Token
const generateToken = (email) => {
    const secretKey = process.env.JWT_SECRET; // Fetch secret key from .env file

    if (!secretKey) {
        throw new Error('JWT_SECRET is not defined in .env file');
    }

    return jwt.sign({ email }, secretKey, { expiresIn: '1h' });
};

// Login endpoint to authenticate and generate token
app.post('/api/signin', async (req, res) => {
    const { email, password } = req.body;

    if ((email === 'Newphoenixboatingadventures@gmail.com' && 
         password === 'Newphoenixboatingadventures@1') ||
        (email === 'kirubakaran003k2@gmail.com' &&
         password === 'kirubakaran003k2')) {

        const token = generateToken(email);
        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token
        });
    }

    return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
    });
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];

    if (!token) {
        return res.status(403).json({ success: false, message: 'Token is required' });
    }

    try {
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

// Subscription endpoint
// Subscription endpoint
app.post('/api/subscribe', async (req, res) => {
    const subscription = req.body;
  
    try {
      const newSubscription = new Subscription(subscription);
      await newSubscription.save();
      res.status(201).json({ success: true, message: 'Subscription saved successfully' });
    } catch (error) {
      res.status(500).json({ success: false, message: 'Error saving subscription', error: error.message });
    }
  });

// Email endpoints
app.post('/api/email', async (req, res) => {
    try {
        const { name, email, message } = req.body;

        const emailEntry = new Email({
            name,
            email,
            message
        });

        await emailEntry.save();

        // Send push notification
        const subscriptions = await Subscription.find();
        const payload = JSON.stringify({ title: 'New Email', body: `You have a new message from ${name}` });

        subscriptions.forEach(subscription => {
            webPush.sendNotification(subscription, payload).catch(err => console.error('Error sending notification:', err));
        });

        res.status(201).json({
            success: true,
            message: 'Email entry created successfully',
            emailEntry
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating email entry',
            error: error.message
        });
    }
});

// Booking endpoints
app.post('/api/bookings', async (req, res) => {
    try {
        const { name, date, timeSlot, phoneNumber } = req.body;

        const booking = new Booking({
            name,
            date,
            timeSlot,
            phoneNumber
        });

        await booking.save();

        // Send push notification
        const subscriptions = await Subscription.find();
        const payload = JSON.stringify({ title: 'New Booking', body: `New booking for ${name} on ${date}` });

        subscriptions.forEach(subscription => {
            webPush.sendNotification(subscription, payload).catch(err => console.error('Error sending notification:', err));
        });

        res.status(201).json({
            success: true,
            message: 'Booking created successfully',
            booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error creating booking',
            error: error.message
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
