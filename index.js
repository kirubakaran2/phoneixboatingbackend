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
    name: { type: String, required: true },
    date: { type: Date, required: true },
    timeSlot: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const emailSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true },
    message: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

const subscriptionSchema = new mongoose.Schema({
    endpoint: { type: String, required: true, unique: true },
    keys: {
        auth: { type: String, required: true },
        p256dh: { type: String, required: true }
    },
    userAgent: String,
    createdAt: { type: Date, default: Date.now }
});

const notificationLogSchema = new mongoose.Schema({
    type: { type: String, required: true }, // 'booking' or 'email'
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    createdAt: { type: Date, default: Date.now, expires: 86400 }
});

// Create models
const Booking = mongoose.model('Booking', bookingSchema);
const Email = mongoose.model('Email', emailSchema);
const Subscription = mongoose.model('Subscription', subscriptionSchema);
const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);
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
    return jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '24h' });
};

async function sendNotification(type, title, body, referenceId) {
    try {
        // Check for duplicate notification
        const existingLog = await NotificationLog.findOne({ type, referenceId });
        if (existingLog) {
            console.log('Duplicate notification prevented');
            return;
        }

        const subscriptions = await Subscription.find();
        const payload = JSON.stringify({
            title,
            body,
            timestamp: Date.now(),
            type,
            referenceId: referenceId.toString()
        });

        // Send to all valid subscriptions
        const sendPromises = subscriptions.map(async subscription => {
            try {
                await webPush.sendNotification(subscription, payload);
            } catch (error) {
                if (error.statusCode === 410 || error.statusCode === 404) {
                    // Remove invalid subscription
                    await Subscription.deleteOne({ _id: subscription._id });
                }
                console.error(`Notification error: ${error.message}`);
            }
        });

        await Promise.all(sendPromises);

        // Log successful notification
        await new NotificationLog({ type, referenceId }).save();
        
    } catch (error) {
        console.error('Notification error:', error);
    }
}

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
app.post('/api/subscribe', async (req, res) => {
    try {
        const subscription = req.body;
        const userAgent = req.headers['user-agent'];

        await Subscription.findOneAndUpdate(
            { endpoint: subscription.endpoint },
            { ...subscription, userAgent },
            { upsert: true, new: true }
        );

        res.status(201).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
        const booking = new Booking(req.body);
        await booking.save();

        await sendNotification(
            'booking',
            'New Booking Received',
            `${booking.name} booked for ${new Date(booking.date).toLocaleDateString()} at ${booking.timeSlot}`,
            booking._id
        );

        res.status(201).json({ success: true, booking });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});
app.get('/api/bookings', verifyToken, async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ date: 1 });
        res.json({ success: true, bookings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Update booking endpoint (requires authentication)
app.put('/api/bookings/:id', verifyToken, async (req, res) => {
    try {
        const { name, date, timeSlot, phoneNumber } = req.body;
        
        const booking = await Booking.findByIdAndUpdate(
            req.params.id,
            { name, date, timeSlot, phoneNumber },
            { new: true } // Return updated document
        );

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Booking updated successfully',
            booking
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error updating booking',
            error: error.message
        });
    }
});
app.delete('/api/bookings/:id', verifyToken, async (req, res) => {
    try {
        await Booking.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Email Routes
app.post('/api/email', async (req, res) => {
    try {
        const email = new Email(req.body);
        await email.save();

        await sendNotification(
            'email',
            'New Message Received',
            `New message from ${email.name} (${email.email})`,
            email._id
        );

        res.status(201).json({ success: true, email });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/emails', verifyToken, async (req, res) => {
    try {
        const emails = await Email.find().sort({ createdAt: -1 });
        res.json({ success: true, emails });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/emails/:id', verifyToken, async (req, res) => {
    try {
        await Email.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Server startup
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
