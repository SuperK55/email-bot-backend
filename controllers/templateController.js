const pool = require('../config/database');

exports.createTemplate = async (req, res) => {
  try {
    const { name, subject, html_content, text_content, variables } = req.body;
    
    const result = await pool.query(
      `INSERT INTO templates (name, subject, html_content, text_content, variables, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [name, subject, html_content, text_content, JSON.stringify(variables || []), req.user.id]
    );
    
    res.status(201).json({ template: result.rows[0] });
  } catch (error) {
    console.error('Create template error:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
};

exports.getTemplates = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT t.*, u.full_name as created_by_name
       FROM templates t
       LEFT JOIN users u ON t.created_by = u.id
       ORDER BY t.created_at DESC`
    );
    
    res.json({ templates: result.rows });
  } catch (error) {
    console.error('Get templates error:', error);
    res.status(500).json({ error: 'Failed to fetch templates' });
  }
};

exports.getTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM templates WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ template: result.rows[0] });
  } catch (error) {
    console.error('Get template error:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
};

exports.updateTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, subject, html_content, text_content, variables } = req.body;
    
    const result = await pool.query(
      `UPDATE templates 
       SET name = $1, subject = $2, html_content = $3, text_content = $4, 
           variables = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [name, subject, html_content, text_content, JSON.stringify(variables || []), id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ template: result.rows[0] });
  } catch (error) {
    console.error('Update template error:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
};

exports.deleteTemplate = async (req, res) => {
  try {
    const { id } = req.params;
    
    await pool.query('DELETE FROM templates WHERE id = $1', [id]);
    
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Delete template error:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
};

