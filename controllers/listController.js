const pool = require('../config/database');
const csv = require('csv-parser');
const fs = require('fs');

// Email validation regex
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

exports.uploadList = async (req, res) => {
  try {
    const { name, description } = req.body;
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Create list entry
    const listResult = await pool.query(
      `INSERT INTO email_lists (name, description, uploaded_by, status) 
       VALUES ($1, $2, $3, 'processing') 
       RETURNING id`,
      [name, description, req.user.id]
    );
    
    const listId = listResult.rows[0].id;
    
    // Process file asynchronously (CSV or TXT)
    processFile(file.path, file.originalname, listId);
    
    res.status(201).json({ 
      message: 'List upload started',
      listId,
      status: 'processing'
    });
    
  } catch (error) {
    console.error('Upload list error:', error);
    res.status(500).json({ error: 'Failed to upload list' });
  }
};

async function processFile(filePath, fileName, listId) {
  const contacts = [];
  let validCount = 0;
  let invalidCount = 0;
  
  // Check if file is CSV or TXT
  const isCSV = fileName.toLowerCase().endsWith('.csv');
  
  return new Promise((resolve, reject) => {
    if (isCSV) {
      // Process CSV file
      fs.createReadStream(filePath)
        .pipe(csv())
        .on('data', (row) => {
          const email = row.email || row.Email || row.EMAIL;
          const name = row.name || row.Name || row.NAME || '';
          
          if (email && emailRegex.test(email.trim())) {
            contacts.push({
              email: email.trim().toLowerCase(),
              name: name.trim(),
              is_valid: true
            });
            validCount++;
          } else {
            invalidCount++;
          }
        })
        .on('end', () => processContacts())
        .on('error', (error) => {
          console.error('CSV read error:', error);
          handleError(error);
        });
    } else {
      // Process TXT file (one email per line)
      const readline = require('readline');
      const rl = readline.createInterface({
        input: fs.createReadStream(filePath),
        crlfDelay: Infinity
      });
      
      rl.on('line', (line) => {
        const trimmedLine = line.trim();
        // Skip empty lines
        if (!trimmedLine) return;
        
        // Try to extract email from the line
        // Could be just email, or "name,email" format, or "email,name" format
        let email = trimmedLine;
        let name = '';
        
        // Check if line contains comma (could be CSV-like format)
        if (trimmedLine.includes(',')) {
          const parts = trimmedLine.split(',').map(p => p.trim());
          // Try both orders: email,name or name,email
          if (emailRegex.test(parts[0])) {
            email = parts[0];
            name = parts[1] || '';
          } else if (emailRegex.test(parts[1])) {
            email = parts[1];
            name = parts[0] || '';
          }
        }
        
        if (email && emailRegex.test(email)) {
          contacts.push({
            email: email.toLowerCase(),
            name: name,
            is_valid: true
          });
          validCount++;
        } else {
          invalidCount++;
        }
      });
      
      rl.on('close', () => processContacts());
      rl.on('error', (error) => {
        console.error('TXT read error:', error);
        handleError(error);
      });
    }
    
    async function processContacts() {
      try {
        // Bulk insert contacts in batches to avoid size limits
        const batchSize = 500;
        for (let i = 0; i < contacts.length; i += batchSize) {
          const batch = contacts.slice(i, i + batchSize);
          
          // Build values array for bulk insert
          const values = [];
          const params = [];
          let paramIndex = 1;
          
          for (const contact of batch) {
            values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, true)`);
            params.push(listId, contact.email, contact.name || '');
            paramIndex += 3;
          }
          
          // Execute bulk insert
          await pool.query(
            `INSERT INTO list_contacts (list_id, email, name, is_valid) 
             VALUES ${values.join(', ')}`,
            params
          );
        }
        
        // Update list stats
        await pool.query(
          `UPDATE email_lists 
           SET total_count = $1, valid_count = $2, invalid_count = $3, 
               status = 'completed', updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [contacts.length + invalidCount, validCount, invalidCount, listId]
        );
        
        // Delete uploaded file
        fs.unlinkSync(filePath);
        
        resolve();
      } catch (error) {
        console.error('File processing error:', error);
        handleError(error);
      }
    }
    
    async function handleError(error) {
      try {
        await pool.query(
          'UPDATE email_lists SET status = $1 WHERE id = $2',
          ['failed', listId]
        );
      } catch (updateError) {
        console.error('Failed to update list status:', updateError);
      }
      reject(error);
    }
  });
}

exports.getLists = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, u.full_name as uploaded_by_name
       FROM email_lists l
       LEFT JOIN users u ON l.uploaded_by = u.id
       ORDER BY l.created_at DESC`
    );
    
    res.json({ lists: result.rows });
  } catch (error) {
    console.error('Get lists error:', error);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
};

exports.getListDetails = async (req, res) => {
  try {
    const { id } = req.params;
    
    const listResult = await pool.query(
      'SELECT * FROM email_lists WHERE id = $1',
      [id]
    );
    
    if (listResult.rows.length === 0) {
      return res.status(404).json({ error: 'List not found' });
    }
    
    const contactsResult = await pool.query(
      'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_valid = true) as valid FROM list_contacts WHERE list_id = $1',
      [id]
    );
    
    res.json({ 
      list: listResult.rows[0],
      stats: contactsResult.rows[0]
    });
  } catch (error) {
    console.error('Get list details error:', error);
    res.status(500).json({ error: 'Failed to fetch list details' });
  }
};

exports.getListContacts = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    
    const contactsResult = await pool.query(
      `SELECT id, email, name, is_valid, created_at 
       FROM list_contacts 
       WHERE list_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );
    
    const countResult = await pool.query(
      'SELECT COUNT(*) as total FROM list_contacts WHERE list_id = $1',
      [id]
    );
    
    res.json({
      contacts: contactsResult.rows,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.rows[0].total),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    });
  } catch (error) {
    console.error('Get list contacts error:', error);
    res.status(500).json({ error: 'Failed to fetch list contacts' });
  }
};

exports.deleteList = async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query('DELETE FROM email_lists WHERE id = $1', [id]);
    
    res.json({ message: 'List deleted successfully' });
  } catch (error) {
    console.error('Delete list error:', error);
    res.status(500).json({ error: 'Failed to delete list' });
  }
};

