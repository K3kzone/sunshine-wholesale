const express = require('express');
const session = require('express-session');
const path = require('path');
const nodemailer = require('nodemailer');
const { Resend } = require('resend');
const PDFDocument = require('pdfkit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const fs = require('fs');

// Default products (used when data/products.json is missing)
const DEFAULT_PRODUCTS = [
  { name: 'Sparkling Orange Soda', code: 'SW-101', category: 'beverages', subcategory: 'sodas', units_per_case: 24, case_price: 18.5 },
  { name: 'Cola Classic', code: 'SW-102', category: 'beverages', subcategory: 'sodas', units_per_case: 24, case_price: 19 },
  { name: 'Lemon-Lime Soda', code: 'SW-103', category: 'beverages', subcategory: 'sodas', units_per_case: 24, case_price: 18 },
  { name: 'Orange Juice', code: 'SW-111', category: 'beverages', subcategory: 'juices', units_per_case: 12, case_price: 24 },
  { name: 'Apple Juice', code: 'SW-112', category: 'beverages', subcategory: 'juices', units_per_case: 12, case_price: 22 },
  { name: 'Iced Tea Mix', code: 'SW-118', category: 'beverages', subcategory: 'tea-coffee', units_per_case: 6, case_price: 21.9 },
  { name: 'Coffee Pods', code: 'SW-119', category: 'beverages', subcategory: 'tea-coffee', units_per_case: 24, case_price: 28 },
  { name: 'Classic Potato Chips', code: 'SW-205', category: 'snacks', subcategory: 'chips', units_per_case: 48, case_price: 32 },
  { name: 'Corn Chips', code: 'SW-206', category: 'snacks', subcategory: 'chips', units_per_case: 36, case_price: 27 },
  { name: 'Mixed Nuts', code: 'SW-211', category: 'snacks', subcategory: 'nuts', units_per_case: 24, case_price: 36 },
  { name: 'Peanuts', code: 'SW-212', category: 'snacks', subcategory: 'nuts', units_per_case: 24, case_price: 20 },
  { name: 'Gummy Bears', code: 'SW-221', category: 'snacks', subcategory: 'candy', units_per_case: 24, case_price: 18 },
  { name: 'Chocolate Bars', code: 'SW-222', category: 'snacks', subcategory: 'candy', units_per_case: 36, case_price: 28 },
  { name: 'Lemon Dish Soap', code: 'SW-310', category: 'household', subcategory: 'cleaning', units_per_case: 12, case_price: 27.5 },
  { name: 'All-Purpose Cleaner', code: 'SW-311', category: 'household', subcategory: 'cleaning', units_per_case: 12, case_price: 22 },
  { name: 'Paper Towels', code: 'SW-320', category: 'household', subcategory: 'paper', units_per_case: 8, case_price: 24 },
  { name: 'Napkins', code: 'SW-321', category: 'household', subcategory: 'paper', units_per_case: 12, case_price: 15 },
];

function getProducts() {
  const dataPath = path.join(__dirname, 'data', 'products.json');
  try {
    if (fs.existsSync(dataPath)) {
      const raw = fs.readFileSync(dataPath, 'utf8');
      const data = JSON.parse(raw);
      return Array.isArray(data) ? data : DEFAULT_PRODUCTS;
    }
  } catch (e) {
    console.warn('Could not read data/products.json, using defaults:', e.message);
  }
  return DEFAULT_PRODUCTS;
}

// Simple admin user (optional, via env)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@example.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'password123';

function formatOrderTime(isoDateStr) {
  const d = new Date(isoDateStr);
  return d.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    dateStyle: 'long',
    timeStyle: 'short',
    hour12: true,
  });
}

function buildOrderPdf({ orderTimeFormatted, customerName, businessName, email, phone, items, notes }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(20).text('Sunshine Wholesale - Order', { align: 'left' });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#555').text(`Order placed: ${orderTimeFormatted}`);
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

app.get('/api/products', (req, res) => {
  res.json(getProducts());
});

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
  const orderTimeIso = new Date().toISOString();
  const orderTimeFormatted = formatOrderTime(orderTimeIso);

  const lines = [
    'New wholesale order request:',
    `Order placed: ${orderTimeFormatted}`,
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
      orderTimeFormatted,
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

  const confirmationLines = [
    'Thank you for your order with Sunshine Wholesale!',
    '',
    `We received your order on ${orderTimeFormatted}.`,
    '',
    'Order summary:',
    ...items.map(
      (item, index) =>
        `${index + 1}. ${item.code || ''} - ${item.name || ''} x ${item.quantity || 1}`
    ),
    '',
    'We will prepare your order and contact you if we have any questions.',
    '',
    '— Sunshine Wholesale',
    '11835 Wilcrest Dr, Houston, TX 77031',
    '(832) 328-0999',
  ];
  const confirmationBody = confirmationLines.join('\n');

  try {
    const toEmail = process.env.WHOLESALE_EMAIL;
    const subject = `New wholesale order - ${businessName || customerName || 'Sunshine Wholesale'}`;

    // Resend (works on Render free tier – no SMTP ports needed)
    if (process.env.RESEND_API_KEY && toEmail) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const from = process.env.RESEND_FROM || 'Sunshine Wholesale <onboarding@resend.dev>';
      await resend.emails.send({
        from,
        to: [toEmail],
        subject,
        text: textBody,
        attachments: pdfBuffer
          ? [{ filename: `order-${orderTimeIso.replace(/[:.]/g, '-')}.pdf`, content: pdfBuffer }]
          : undefined,
      });
      if (email && email !== toEmail) {
        await resend.emails.send({
          from,
          to: [email],
          subject: 'Order received – Sunshine Wholesale',
          text: confirmationBody,
        });
      }
    }
    // Gmail SMTP (works locally or on paid Render)
    else if (
      process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS &&
      toEmail
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
        to: toEmail,
        subject,
        text: textBody,
        attachments: pdfBuffer
          ? [{ filename: `order-${orderTimeIso.replace(/[:.]/g, '-')}.pdf`, content: pdfBuffer }]
          : [],
      });
      if (email) {
        await transporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: email,
          subject: 'Order received – Sunshine Wholesale',
          text: confirmationBody,
        });
      }
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

