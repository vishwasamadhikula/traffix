const { Pool } = require('pg');

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'trafix_db',
    password: process.env.DB_PASSWORD,
    port: 5432,
});

// Test the connection
pool.connect()
    .then(() => console.log('🗄️ Successfully connected to PostgreSQL database!'))
    .catch(err => console.error('❌ Database connection error', err.stack));

module.exports = pool;