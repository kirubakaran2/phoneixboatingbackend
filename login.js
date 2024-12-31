    exports.login = async (req, res) => {
        const { email, password } = req.body;

        // Check if email and password match the required credentials
        if ((email === 'Newphoenixboatingadventures@gmail.com' && 
            password === 'Newphoenixboatingadventures@1') ||
            (email === 'kirubakaran003k2@gmail.com' &&
            password === 'kirubakaran003k2')) {
            
            return res.status(200).json({
                success: true,
                message: 'Login successful'
            });
        }

        // If credentials don't match, return error
        return res.status(401).json({
            success: false,
            message: 'Invalid email or password'
        });
    };
