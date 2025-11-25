const bcrypt = require('bcryptjs');
const pool = require('../config/database');
require('dotenv').config();

async function createAdmin() {
  try {
    const email = process.env.ADMIN_EMAIL || 'admin@kochconstrutora.com.br';
    const password = process.env.ADMIN_PASSWORD || 'Admin123!';
    
    // Check if admin exists
    const existing = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    
    if (existing.rows.length > 0) {
      console.log('Admin user already exists');
      process.exit(0);
    }
    
    // Hash password
    const password_hash = await bcrypt.hash(password, 10);
    
    // Create admin
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, full_name, role) 
       VALUES ($1, $2, $3, $4) 
       RETURNING id, email, role`,
      [email, password_hash, 'Administrator', 'admin']
    );
    
    console.log('✅ Admin user created:', result.rows[0]);
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${password}`);
    console.log('\n⚠️  Change the password after first login!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Failed to create admin:', error);
    process.exit(1);
  }
}

createAdmin();

