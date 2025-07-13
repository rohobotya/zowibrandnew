const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const path = require('path');

const app = express();
const db = new sqlite3.Database('./db/users.db');

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(session({
  secret: 'zowiSecretKey', // Change to a strong secret!
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // set to true if HTTPS
}));

app.use(express.static(path.join(__dirname, 'public')));

// Nodemailer setup (use your real email credentials for production!)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'yaikobrohobot@gmail.com',
    pass: 'YOUR_APP_PASSWORD'  // Use an "App Password" for Gmail, not your real password
  }
});

// Create users table if not exists
db.run(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT,
  email TEXT,
  password TEXT,
  status TEXT DEFAULT 'pending', -- 'pending' or 'active'
  referral_passkey TEXT
)`);

// Registration endpoint
app.post('/register', async (req, res) => {
  const { phone, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  // Generate a referral passkey (could be more complex)
  const passkey = crypto.randomBytes(4).toString('hex');
  db.run(`INSERT INTO users (phone, email, password, referral_passkey) VALUES (?, ?, ?, ?)`, [phone, email, hash, passkey], function(err) {
    if (err) return res.status(400).json({ error: 'User exists or error.' });
    // Save user ID for payment step
    req.session.pendingUserId = this.lastID;
    // Send payment instructions (simulate payment page)
    res.json({
      success: true,
      message: "Registration successful. Please pay 100 Birr to activate your account.",
      payment_url: "/pay" // In production, redirect to real payment provider
    });
  });
});

// Simulated payment page (replace with real payment gateway redirect)
app.get('/pay', (req, res) => {
  if (!req.session.pendingUserId) return res.redirect('/register.html');
  res.send(`<h2>Pay 100 Birr to activate your account:</h2>
  <form method="POST" action="/pay">
    <button type="submit">I have paid (simulate)</button>
  </form>
  `);
});

// Handle payment confirmation (simulate payment success)
app.post('/pay', (req, res) => {
  const userId = req.session.pendingUserId;
  if (!userId) return res.redirect('/register.html');
  // Mark user as active
  db.run(`UPDATE users SET status='active' WHERE id=?`, [userId], function(err) {
    if (err) return res.status(500).send("Error updating user.");
    // Fetch user info for notification
    db.get(`SELECT * FROM users WHERE id=?`, [userId], async (err, user) => {
      if (user) {
        // Notify admin
        await transporter.sendMail({
          from: '"Zowi Branding" <yaikobrohobot@gmail.com>',
          to: 'yaikobrohobot@gmail.com',
          subject: 'New Zowi Registration',
          text: `New user registered: Phone: ${user.phone}, Email: ${user.email}`
        });
        // Optional: send passkey to user
        await transporter.sendMail({
          from: '"Zowi Branding" <yaikobrohobot@gmail.com>',
          to: user.email,
          subject: 'Your Zowi Referral Passkey',
          text: `Welcome! Your referral passkey: ${user.referral_passkey}`
        });
      }
      res.send(`<h2>Payment received! Your account is now active.</h2>
      <p>Your referral passkey: <b>${user.referral_passkey}</b></p>
      <a href="/login.html">Go to Login</a>`);
      req.session.pendingUserId = null;
    });
  });
});

// Login endpoint (only for active users)
app.post('/login', (req, res) => {
  const { phone, password } = req.body;
  db.get(`SELECT * FROM users WHERE phone = ?`, [phone], async (err, user) => {
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (user.status !== 'active') return res.status(403).json({ error: 'Account not active. Please pay the registration fee.' });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId = user.id;
    res.json({ success: true });
  });
});

// Auth check endpoint
app.get('/auth-check', (req, res) => {
  if (req.session.userId) return res.json({ loggedIn: true });
  res.json({ loggedIn: false });
});

// Logout
app.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});