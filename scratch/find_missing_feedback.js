require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

async function findMissing() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Fetch all students from DB
    const students = await db.collection('studentmanagements').find({}).toArray();
    
    // Read student_check.txt
    const txtPath = path.join(__dirname, '..', 'student_check.txt');
    const txtContent = fs.readFileSync(txtPath, 'utf-8');
    
    // Extract the "Enrollment Number" section at the bottom
    const lines = txtContent.split('\n');
    let isEnrollmentSection = false;
    const filledEnrollments = new Set();
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === 'Enrollment Number') {
        isEnrollmentSection = true;
        continue;
      }
      if (isEnrollmentSection && trimmed !== '') {
        filledEnrollments.add(trimmed.toUpperCase());
      }
    }
    
    // Find missing
    // Filter out dummy test accounts starting with '00' or 'admin'
    const missing = students.filter(s => {
      const en = (s.enrollmentNo || '').trim().toUpperCase();
      if (!en || en.startsWith('00') || en.startsWith('ADMIN')) return false;
      return !filledEnrollments.has(en);
    });
    
    let out = `Total students in DB (excluding dummy accounts): ${students.filter(s => {
      const en = (s.enrollmentNo || '').trim().toUpperCase();
      return en && !en.startsWith('00') && !en.startsWith('ADMIN');
    }).length}\n`;
    out += `Total filled in TXT: ${filledEnrollments.size}\n`;
    out += `Missing feedback: ${missing.length}\n\n`;
    out += `--- Missing Students ---\n`;
    missing.forEach(s => {
      out += `${s.enrollmentNo} - ${s.name || 'Unknown'} - ${s.branch || ''}\n`;
    });
    
    fs.writeFileSync(path.join(__dirname, 'missing_feedback_list_utf8.txt'), out, 'utf-8');
    console.log('Written to missing_feedback_list_utf8.txt');
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
}

findMissing();
