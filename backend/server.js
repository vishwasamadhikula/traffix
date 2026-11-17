const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const pool = require('./db'); // Import our database connection

const app = express();
const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// --- ESP32 HARDWARE SYNC STATE ---
// This holds the current traffic light phase in memory so the ESP32 can fetch it
let currentPhase = "MF_LEAD"; 

// --- AUTOMATIC TABLE CREATION ---
// This runs once when the server starts to ensure your tables exist
const initializeTables = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS vehicle_logs (
                log_id VARCHAR(50) PRIMARY KEY,
                intersection_id VARCHAR(50),
                speed NUMERIC,
                license_plate VARCHAR(50),
                image_path TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS fines (
                fine_id VARCHAR(50) PRIMARY KEY,
                log_id VARCHAR(50) REFERENCES vehicle_logs(log_id),
                violation_type VARCHAR(50),
                amount NUMERIC,
                status VARCHAR(20)
            );
        `);
        console.log('✅ Database tables verified.');
    } catch (err) {
        console.error('❌ Error creating tables:', err);
    }
};
initializeTables();

// --- REST APIs ---

// 1. Existing Capture Route
app.post('/api/v1/traffic/capture', async (req, res) => {
    const { intersectionId, speed, licensePlate, imagePath } = req.body;
    const logId = `LOG-${Date.now()}`;
    const timestamp = new Date().toISOString();

    try {
        // Insert into vehicle_logs table
        await pool.query(
            `INSERT INTO vehicle_logs (log_id, intersection_id, speed, license_plate, image_path, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [logId, intersectionId || 'Junc-01', speed || 0, licensePlate || 'UNKNOWN', imagePath || '/mock-images/car1.jpg', timestamp]
        );
        console.log(`[🚗 New Vehicle Saved] Plate: ${licensePlate}, Speed: ${speed} km/h`);

        // Check for Speeding and insert into fines table
        const SPEED_LIMIT = 60;
        
        if (speed > SPEED_LIMIT) {
            const fineId = `FINE-${Date.now()}`;
            await pool.query(
                `INSERT INTO fines (fine_id, log_id, violation_type, amount, status) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [fineId, logId, 'Speeding', 1500, 'Pending']
            );
            console.log(`[🚨 VIOLATION LOGGED] Fine issued to ${licensePlate}`);
        }

        // Fetch updated stats to broadcast to React
        const totalLogsRes = await pool.query('SELECT COUNT(*) FROM vehicle_logs');
        const activeFinesRes = await pool.query('SELECT COUNT(*) FROM fines');
        const recentLogsRes = await pool.query('SELECT * FROM vehicle_logs ORDER BY timestamp DESC LIMIT 5');
        
        // Fetch full violation history
        const allViolationsRes = await pool.query(`
            SELECT v.log_id, v.license_plate, v.speed, v.timestamp, f.amount, f.status
            FROM fines f
            JOIN vehicle_logs v ON f.log_id = v.log_id
            ORDER BY v.timestamp DESC
        `);

        io.emit('trafficUpdate', {
            intersectionId: 'Junc-01',
            trafficDensity: parseInt(totalLogsRes.rows[0].count) > 5 ? 'High' : 'Normal',
            activeAlerts: parseInt(activeFinesRes.rows[0].count),
            totalLogs: parseInt(totalLogsRes.rows[0].count),
            recentLogs: recentLogsRes.rows.map(row => ({
                logId: row.log_id,
                licensePlate: row.license_plate,
                speed: row.speed,
                timestamp: row.timestamp
            })),
            recentViolations: allViolationsRes.rows.map(row => ({
                logId: row.log_id,
                licensePlate: row.license_plate,
                speed: row.speed,
                timestamp: row.timestamp,
                amount: row.amount,
                status: row.status
            }))
        });

        res.status(201).json({ message: 'Data logged to Database' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// 2. ESP32 & Python Telemetry Route
app.post('/api/v1/intersections/:id/telemetry', async (req, res) => {
    const intersectionId = req.params.id;
    const { lane, vehicleCount, speed } = req.body;
    
    // Generate a mock license plate for the hardware test since the basic ESP32 doesn't do OCR
    const mockLicensePlate = `HW-TEST-${Math.floor(Math.random() * 9999)}`;
    const logId = `LOG-${Date.now()}`;
    const timestamp = new Date().toISOString();

    console.log(`📡 Telemetry received from ${intersectionId} (${lane}): ${vehicleCount} vehicles, Speed: ${speed} km/h`);

    try {
        // Insert into vehicle_logs table
        await pool.query(
            `INSERT INTO vehicle_logs (log_id, intersection_id, speed, license_plate, image_path, timestamp) 
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [logId, intersectionId, speed || 0, mockLicensePlate, '/mock-images/esp32.jpg', timestamp]
        );

        // Check for Speeding
        const SPEED_LIMIT = 60;
        if (speed > SPEED_LIMIT) {
            const fineId = `FINE-${Date.now()}`;
            await pool.query(
                `INSERT INTO fines (fine_id, log_id, violation_type, amount, status) 
                 VALUES ($1, $2, $3, $4, $5)`,
                [fineId, logId, 'Speeding', 1500, 'Pending']
            );
            console.log(`[🚨 HARDWARE VIOLATION] Fine issued to ${mockLicensePlate} at ${speed} km/h`);
        }

        // Fetch updated stats to broadcast to React Dashboard
        const totalLogsRes = await pool.query('SELECT COUNT(*) FROM vehicle_logs');
        const activeFinesRes = await pool.query('SELECT COUNT(*) FROM fines');
        const recentLogsRes = await pool.query('SELECT * FROM vehicle_logs ORDER BY timestamp DESC LIMIT 5');

        // Fetch full violation history
        const allViolationsRes = await pool.query(`
            SELECT v.log_id, v.license_plate, v.speed, v.timestamp, f.amount, f.status
            FROM fines f
            JOIN vehicle_logs v ON f.log_id = v.log_id
            ORDER BY v.timestamp DESC
        `);

        // --- UPDATED WEBSOCKET EMISSION ---
        io.emit('trafficUpdate', {
            intersectionId: intersectionId,
            
            // Newly added properties to sync the live AI camera panel
            lane: lane,                     
            liveVehicleCount: vehicleCount, 
            liveSpeed: speed,               
            
            trafficDensity: vehicleCount > 15 ? 'High' : 'Normal', 
            activeAlerts: parseInt(activeFinesRes.rows[0].count),
            totalLogs: parseInt(totalLogsRes.rows[0].count),
            recentLogs: recentLogsRes.rows.map(row => ({
                logId: row.log_id,
                licensePlate: row.license_plate,
                speed: row.speed,
                timestamp: row.timestamp
            })),
            recentViolations: allViolationsRes.rows.map(row => ({
                logId: row.log_id,
                licensePlate: row.license_plate,
                speed: row.speed,
                timestamp: row.timestamp,
                amount: row.amount,
                status: row.status
            }))
        });

        // Send Success 200 Code back to the Edge Node
        res.status(200).json({ 
            message: 'Telemetry processed and logged to Database successfully', 
            status: 'success' 
        });
    } catch (err) {
        console.error('❌ Telemetry DB Error:', err);
        res.status(500).json({ error: 'Database error processing telemetry' });
    }
});

// 3. Dashboard Status Route
app.get('/api/v1/intersections/:id/status', async (req, res) => {
    try {
        const totalLogsRes = await pool.query('SELECT COUNT(*) FROM vehicle_logs');
        const activeFinesRes = await pool.query('SELECT COUNT(*) FROM fines');
        const recentLogsRes = await pool.query('SELECT * FROM vehicle_logs ORDER BY timestamp DESC LIMIT 5');

        // Fetch full violation history
        const allViolationsRes = await pool.query(`
            SELECT v.log_id, v.license_plate, v.speed, v.timestamp, f.amount, f.status
            FROM fines f
            JOIN vehicle_logs v ON f.log_id = v.log_id
            ORDER BY v.timestamp DESC
        `);

        res.json({
            intersectionId: req.params.id,
            trafficDensity: parseInt(totalLogsRes.rows[0].count) > 5 ? 'High' : 'Normal',
            activeAlerts: parseInt(activeFinesRes.rows[0].count),
            totalLogs: parseInt(totalLogsRes.rows[0].count),
            recentLogs: recentLogsRes.rows.map(row => ({
                logId: row.log_id,
                licensePlate: row.license_plate,
                speed: row.speed,
                timestamp: row.timestamp
            })),
            recentViolations: allViolationsRes.rows.map(row => ({
                logId: row.log_id,
                licensePlate: row.license_plate,
                speed: row.speed,
                timestamp: row.timestamp,
                amount: row.amount,
                status: row.status
            }))
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Database error' });
    }
});

// ==============================================================
// ⚡ NEW: REACT TO ESP32 HARDWARE BRIDGE APIs ⚡
// ==============================================================

// 4. Update Phase from React Dashboard (React sends POST here)
app.post('/api/v1/intersections/:id/phase', (req, res) => {
    if (req.body.phase) {
        currentPhase = req.body.phase;
    }
    res.status(200).json({ success: true, phase: currentPhase });
});

// 5. ESP32 Polling Route (ESP32 sends GET here 2x every second)
app.get('/api/v1/intersections/:id/phase', (req, res) => {
    res.status(200).json({ phase: currentPhase });
});

// ==============================================================

// --- WEBSOCKET CONNECTION ---
io.on('connection', (socket) => {
    console.log('💻 Admin Dashboard connected to real-time feed');
});

server.listen(PORT, () => {
    console.log(`🚥 TrafiX Backend is running on http://localhost:${PORT}`);
});