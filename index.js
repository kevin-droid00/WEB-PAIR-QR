import express from 'express';
import bodyParser from 'body-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

import qrRouter from './qr.js';
import pairRouter from './pair.js';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 8000;

// Set max listeners to prevent memory leaks
import('events').then(events => {
    events.EventEmitter.defaultMaxListeners = 500;
}).catch(err => {
    console.error('Error setting event listeners:', err);
});

// Middleware
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(__dirname));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'Server is running', timestamp: new Date() });
});

// API Routes
app.use('/qr', qrRouter);
app.use('/code', pairRouter);

// HTML Pages
app.get('/pair', (req, res) => {
    const pairPath = path.join(__dirname, 'pair.html');
    if (fs.existsSync(pairPath)) {
        res.sendFile(pairPath);
    } else {
        res.status(404).send('<h1>404 - pair.html not found</h1>');
    }
});

app.get('/qrpage', (req, res) => {
    const qrPath = path.join(__dirname, 'qr.html');
    if (fs.existsSync(qrPath)) {
        res.sendFile(qrPath);
    } else {
        res.status(404).send('<h1>404 - qr.html not found</h1>');
    }
});

app.get('/', (req, res) => {
    const mainPath = path.join(__dirname, 'main.html');
    if (fs.existsSync(mainPath)) {
        res.sendFile(mainPath);
    } else {
        res.status(404).send('<h1>404 - main.html not found</h1>');
    }
});

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).json({ error: 'Route not found', path: req.path });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║   🤖 SHAN BOT SERVER RUNNING 🤖       ║
╠════════════════════════════════════════╣
║ Server: http://localhost:${PORT}
║ Status: ✅ Active
║ Time: ${new Date().toLocaleString()}
╚════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
        process.exit(0);
    });
});

export default app;
