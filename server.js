const express = require('express');
const session = require('express-session');
const path = require('path');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Simple admin user (optional, via env)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';

function buildOrderPdf({ orderTime, customerName, businessName, email, phone, items, notes }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Sunshine Wholesale - Order', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#555').text(`Order placed at (UTC): ${orderTime}`);
    doc.moveDown(1);

    doc.fillColor('#000').fontSize(12).text('Customer', { underline: true });
    doc.moveDown(0.3);
    doc.fontSize(10);
    doc.text(`Name: ${customerName || '-'}`);
    doc.text(`Business: ${businessName || '-'}`);
    doc.text(`Email: ${email || '-'}`);
    doc.text(`Phone: ${phone || '-'}`);

    doc.moveDown(1);
    doc.fontSize(12).text('Items', { underline: true });
    doc.moveDown(0.3);

    items.forEach((item, index) => {
      const line = `${index + 1}. ${item.code || ''} - ${item.name || ''} x ${item.quantity || 1}`;
      doc.fontSize(10).text(line);
    });

    if (notes) {
      doc.moveDown(1);
      doc.fontSize(12).text('Notes', { underline: true });
      doc.moveDown(0.3);
      doc.fontSize(10).text(notes);
    }

    doc.end();
  });
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(
  session({
    secret: 'change-this-secret',
    resave: false,
    saveUninitialized: false,
  })
);

function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  return res.redirect('/login.html');
}

app.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    req.session.user = { email, isAdmin: true };
    return res.redirect('/dashboard.html');
  }

  return res.redirect('/login.html?error=1');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

app.get('/dashboard.html', requireAuth, (req, res, next) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.post('/api/order', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Please log in to place an order.' });
  }

  const { customer, items, notes } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Cart is empty.' });
  }

  const sessionUser = req.session.user || {};

  const customerName = customer?.name || '';
  const businessName = customer?.businessName || '';
  const email = customer?.email || sessionUser.email || '';
  const phone = customer?.phone || '';
  const orderTime = new Date().toISOString();

  const lines = [
    'New wholesale order request:',
    `Order placed at (UTC): ${orderTime}`,
    '',
    `Customer name: ${customerName}`,
    `Business name: ${businessName}`,
    `Email: ${email}`,
    `Phone: ${phone}`,
    '',
    'Items:',
    ...items.map(
      (item, index) =>
        `${index + 1}. ${item.code || ''} - ${item.name || ''} x ${item.quantity || 1}`
    ),
    '',
    `Notes: ${notes || ''}`,
  ];

  const textBody = lines.join('\n');
  let pdfBuffer = null;

  try {
    pdfBuffer = await buildOrderPdf({
      orderTime,
      customerName,
      businessName,
      email,
      phone,
      items,
      notes,
    });
  } catch (e) {
    console.error('Failed to generate order PDF', e);
  }

  try {
    if (
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      process.env.WHOLESALE_EMAIL
    ) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: process.env.WHOLESALE_EMAIL,
        subject: `New wholesale order - ${businessName || customerName || 'Sunshine Wholesale'}`,
        text: textBody,
        attachments: pdfBuffer
          ? [
              {
                filename: `order-${orderTime}.pdf`,
                content: pdfBuffer,
              },
            ]
          : [],
      });
    } else {
      console.log('New wholesale order (email not configured):\n', textBody);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error('Failed to send order email', err);
    return res.status(500).json({ error: 'Failed to send order. Please try again later.' });
  }
});

app.listen(PORT, () => {
  console.log(`Business site running at http://localhost:${PORT}`);
});

