require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const admin = require('firebase-admin');
const fs = require('fs');
const fetch = require('node-fetch');

// Initialize Firebase
const initializeFirebase = async () => {
    try {
        // Read and validate service account
        const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
        const serviceAccount = JSON.parse(serviceAccountRaw);

        // Validate required fields
        const requiredFields = ['project_id', 'private_key', 'client_email'];
        for (const field of requiredFields) {
            if (!serviceAccount[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Clean private key formatting
        const privateKey = serviceAccount.private_key.replace(/\\n/g, '\n');

        // Initialize Firebase Admin SDK
        if (admin.apps.length) {
            await admin.app().delete();
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: serviceAccount.project_id,
                clientEmail: serviceAccount.client_email,
                privateKey: privateKey
            })
        });

        console.log('Firebase Admin SDK initialized successfully');
        return admin.messaging();
    } catch (error) {
        console.error('Firebase initialization failed:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
};

const messaging = initializeFirebase();

const app = express();

// Enhanced CORS configuration with error handling
app.use(cors({
    origin: ['http://localhost:5173', 'https://newphoenixboating.vercel.app', 'https://newphoenixboating.in', 'https://www.newphoenixboating.in'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400 // CORS preflight cache time
}));

app.use(express.json());

const checkServerTime = async () => {
    try {
        const response = await fetch('https://worldtimeapi.org/api/ip');
        const { unixtime } = await response.json();
        const localTime = Math.floor(Date.now() / 1000);
        const timeDiff = Math.abs(unixtime - localTime);
        
        if (timeDiff > 300) { // 5 minutes threshold
            console.error(`Server time is out of sync. Difference: ${timeDiff} seconds`);
            return false;
        }
        return true;
    } catch (error) {
        console.error('Failed to check server time:', error);
        return true; // Continue anyway if check fails
    }
};

// Enhanced Firebase initialization
const initializeFirebase = async () => {
    try {
        const isTimeSync = await checkServerTime();
        if (!isTimeSync) {
            console.warn('Server time sync issue detected - this may cause authentication problems');
        }

        // Read and validate service account
        const serviceAccountRaw = fs.readFileSync('./firebase-service-account.json', 'utf8');
        const serviceAccount = JSON.parse(serviceAccountRaw);
        
        // Validate required fields
        const requiredFields = ['project_id', 'private_key', 'client_email'];
        for (const field of requiredFields) {
            if (!serviceAccount[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }

        // Clean private key formatting
        const privateKey = serviceAccount.private_key
            .replace(/\\n/g, '\n')
            .replace(/""/g, '"');

        // Initialize with explicit error handling
        if (admin.apps.length) {
            await admin.app().delete();
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: serviceAccount.project_id,
                clientEmail: serviceAccount.client_email,
                privateKey: privateKey
            })
        });

        // Verify initialization
        try {
            await admin.app().getToken();
            console.log('Firebase Admin SDK initialized and authenticated successfully');
        } catch (error) {
            throw new Error(`Authentication verification failed: ${error.message}`);
        }

        return admin.messaging();
    } catch (error) {
        console.error('Firebase initialization failed:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        throw error;
    }
};

// Export the initialization function and messaging
module.exports = {
    initializeFirebase,
    getMessaging: () => admin.messaging()
};

// MongoDB connection with retry logic
const connectDB = async (retries = 5) => {
    while (retries) {
        try {
            await mongoose.connect('mongodb+srv://kiruba:kirubakaran23@creeper.fg9oh.mongodb.net/', {
                useNewUrlParser: true,
                useUnifiedTopology: true
            });
            console.log('MongoDB connected successfully');
            break;
        } catch (err) {
            console.error('MongoDB connection error:', err);
            retries -= 1;
            if (!retries) process.exit(1);
            console.log(`Retrying connection... ${retries} attempts remaining`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};

connectDB();

// Enhanced schemas with timestamps and indexes
const bookingSchema = new mongoose.Schema({
    name: { type: String, required: true, index: true },
    date: { type: Date, required: true, index: true },
    timeSlot: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['pending', 'confirmed', 'cancelled'],
        default: 'pending'
    }
}, { timestamps: true });

const emailSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, index: true },
    message: { type: String, required: true },
    status: { 
        type: String, 
        enum: ['unread', 'read'],
        default: 'unread'
    }
}, { timestamps: true });

const deviceTokenSchema = new mongoose.Schema({
    token: { 
        type: String, 
        required: true, 
        unique: true,
        index: true 
    },
    userAgent: String,
    lastActive: { type: Date, default: Date.now },
    isValid: { type: Boolean, default: true }
}, { timestamps: true });

const notificationLogSchema = new mongoose.Schema({
    type: { type: String, required: true },
    referenceId: { type: mongoose.Schema.Types.ObjectId, required: true },
    title: String,
    body: String,
    status: { 
        type: String,
        enum: ['pending', 'sent', 'failed'],
        default: 'pending'
    },
    error: String,
    retryCount: { type: Number, default: 0 }
}, { 
    timestamps: true,
    expires: 86400 // TTL index
});

const Booking = mongoose.model('Booking', bookingSchema);
const Email = mongoose.model('Email', emailSchema);
const DeviceToken = mongoose.model('DeviceToken', deviceTokenSchema);
const NotificationLog = mongoose.model('NotificationLog', notificationLogSchema);

// Enhanced notification service with retry logic and batch processing
class NotificationService {
    static async sendNotification(type, title, body, referenceId, retryCount = 3) {
        try {
            // Check for duplicate notifications within a time window
            const recentNotification = await NotificationLog.findOne({
                type,
                referenceId,
                createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }
            });

            if (recentNotification) {
                console.log('Duplicate notification prevented');
                return;
            }

            // Create notification log
            const notificationLog = await NotificationLog.create({
                type,
                referenceId,
                title,
                body,
                status: 'pending'
            });

            // Get valid device tokens
            const devices = await DeviceToken.find({ isValid: true });
            if (!devices.length) {
                console.log('No valid devices found');
                return;
            }

            // Validate tokens before sending
            const tokens = devices.map(device => device.token).filter(token => {
                // Basic token validation
                if (!token || token.length < 100) {
                    console.log('Invalid token format:', token);
                    return false;
                }
                return true;
            });

            console.log(`Attempting to send notifications to ${tokens.length} devices`);

            // Process tokens in batches of 500
            for (let i = 0; i < tokens.length; i += 500) {
                const batch = tokens.slice(i, i + 500);
                
                // Create message objects for each token
                const messages = batch.map(token => {
                    console.log('Preparing message for token:', token);
                    return {
                        token,
                        notification: { 
                            title, 
                            body 
                        },
                        data: {
                            type,
                            referenceId: referenceId.toString(),
                            timestamp: Date.now().toString()
                        },
                        android: {
                            priority: 'high',
                            notification: {
                                clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                            }
                        },
                        apns: {
                            headers: {
                                'apns-priority': '10'
                            },
                            payload: {
                                aps: {
                                    contentAvailable: true,
                                    alert: {
                                        title,
                                        body
                                    }
                                }
                            }
                        }
                    };
                });

                try {
                    console.log(`Sending batch of ${messages.length} messages...`);
                    const response = await messaging.sendEach(messages);

                    // Detailed response logging
                    console.log('Batch response:', {
                        successCount: response.successCount,
                        failureCount: response.failureCount
                    });

                    // Handle failed tokens
                    if (response.failureCount > 0) {
                        const failedTokens = [];
                        response.responses.forEach((resp, idx) => {
                            if (!resp.success) {
                                const failedToken = batch[idx];
                                failedTokens.push(failedToken);
                                console.log('Failure details:', {
                                    token: failedToken,
                                    error: resp.error
                                });

                                if (resp.error.code === 'messaging/invalid-registration-token' ||
                                    resp.error.code === 'messaging/registration-token-not-registered') {
                                    console.log('Invalidating token:', failedToken);
                                    DeviceToken.findOneAndUpdate(
                                        { token: failedToken },
                                        { isValid: false },
                                        { new: true }
                                    ).exec().then(result => {
                                        console.log('Token invalidation result:', result);
                                    });
                                }
                            }
                        });
                        console.log('Failed tokens:', failedTokens);
                    }

                    console.log(`Successfully sent ${response.successCount} messages in batch`);
                } catch (error) {
                    console.error('Batch send error:', {
                        code: error.code,
                        message: error.message,
                        stack: error.stack,
                        details: error.errorInfo
                    });
                }
            }

            // Update notification log
            await notificationLog.updateOne({
                status: 'sent',
                $set: { updatedAt: new Date() }
            });

        } catch (error) {
            console.error('Notification service error:', {
                code: error.code,
                message: error.message,
                stack: error.stack,
                details: error.errorInfo
            });
            
            const notificationLog = await NotificationLog.findOne({ type, referenceId });
            if (notificationLog && notificationLog.retryCount < retryCount) {
                const delay = Math.pow(2, notificationLog.retryCount) * 1000;
                setTimeout(() => {
                    NotificationService.sendNotification(type, title, body, referenceId, retryCount);
                }, delay);
                
                await notificationLog.updateOne({
                    $inc: { retryCount: 1 },
                    $set: { error: error.message }
                });
            }
        }
    }
}
const generateToken = (email) => {
    return jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '24h' });
};
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

// Token registration endpoint with validation
app.post('/api/register-device', async (req, res) => {
    try {
        const { token } = req.body;
        const userAgent = req.headers['user-agent'];

        if (!token) {
            return res.status(400).json({ success: false, message: 'Token is required' });
        }

        await DeviceToken.findOneAndUpdate(
            { token },
            { 
                token,
                userAgent,
                lastActive: new Date(),
                isValid: true
            },
            { upsert: true, new: true }
        );

        res.status(201).json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Enhanced booking endpoint with notification
app.post('/api/bookings', async (req, res) => {
    try {
        const booking = new Booking(req.body);
        await booking.save();

        // Send notification asynchronously
        NotificationService.sendNotification(
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
app.get('/api/bookings', verifyToken, async (req, res) => {
    try {
        const bookings = await Booking.find().sort({ date: 1 });
        res.json({ success: true, bookings });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
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
app.get('/api/email', verifyToken, async (req, res) => {
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

// Enhanced email endpoint with notification
app.post('/api/email', async (req, res) => {
    try {
        const { name, email, message } = req.body;
        const emailEntry = new Email({ name, email, message });
        await emailEntry.save();

        NotificationService.sendNotification(
            'email',
            'New Email Received',
            `New message from ${name}`,
            emailEntry._id
        );

        res.status(201).json({ success: true, emailEntry });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Keep existing routes...
// [Previous routes remain unchanged]

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('Received SIGTERM. Performing graceful shutdown...');
    await mongoose.connection.close();
    process.exit(0);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
