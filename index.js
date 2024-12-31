require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const app = express();

// Middleware to parse JSON and enable CORS
app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173', 'https://newphoenixboating.vercel.app'], 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Connect to MongoDB
mongoose.connect('mongodb+srv://newphoenixboatingadventures:JjnfYLh186XhVekw@cluster0.as3mi.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected successfully'))
.catch(err => console.log('MongoDB connection error:', err));
const bookingSchema = new mongoose.Schema({
    name: String,
    date: Date,
    timeSlot: String,
    phoneNumber: String
});

const Booking = mongoose.model('Booking', bookingSchema);

// Generate JWT Token
const generateToken = (email) => {
    const secretKey = process.env.JWT_SECRET; // Fetch secret key from .env file

    if (!secretKey) {
        throw new Error('JWT_SECRET is not defined in .env file');
    }

    // Sign the JWT token
    return jwt.sign({ email }, secretKey, { expiresIn: '1h' });
};

// Login endpoint to authenticate and generate token
app.post('/api/signin', async (req, res) => {
    const { email, password } = req.body;

    // Basic user authentication (can be replaced with database authentication)
    if ((email === 'Newphoenixboatingadventures@gmail.com' && 
         password === 'Newphoenixboatingadventures@1') ||
        (email === 'kirubakaran003k2@gmail.com' &&
         password === 'kirubakaran003k2')) {

        // Generate JWT token after successful login
        const token = generateToken(email);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            token  // Send the token in the response
        });
    }

    return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
    });
});

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];  // Extract token from Authorization header

    if (!token) {
        return res.status(403).json({ success: false, message: 'Token is required' });
    }

    try {
        // Verify the JWT token using the secret key
        jwt.verify(token, process.env.JWT_SECRET);
        next();
    } catch (error) {
        return res.status(401).json({ success: false, message: 'Invalid or expired token' });
    }
};

// Create booking endpoint (requires authentication)
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

// Get bookings endpoint (requires authentication)
app.get('/api/bookings', verifyToken, async (req, res) => {
    try {
        const bookings = await Booking.find();
        res.status(200).json({
            success: true,
            bookings
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error fetching bookings',
            error: error.message
        });
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

// Delete booking endpoint (requires authentication)
app.delete('/api/bookings/:id', verifyToken, async (req, res) => {
    try {
        const booking = await Booking.findByIdAndDelete(req.params.id);
        
        if (!booking) {
            return res.status(404).json({
                success: false,
                message: 'Booking not found'
            });
        }

        res.status(200).json({
            success: true,
            message: 'Booking deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error deleting booking',
            error: error.message
        });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
