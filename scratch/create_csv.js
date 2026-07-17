require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

async function createCSV() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;

    // Fetch all students from DB
    const students = await db.collection('studentmanagements').find({}).toArray();
    
    // Read student_check.txt
    const txtPath = path.join(__dirname, '..', 'student_check.txt');
    const txtContent = fs.readFileSync(txtPath, 'utf-8');
    
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
    
    const missingStudents = [];
    
    for (const en of filledEnrollments) {
      const dbStudent = students.find(s => s.enrollmentNo && s.enrollmentNo.trim().toUpperCase() === en);
      if (dbStudent) {
        missingStudents.push(dbStudent);
      } else {
        missingStudents.push({ enrollmentNo: en, name: 'Unknown (Not in DB)', branch: 'Unknown' });
      }
    }
    
    let csvContent = `Enrollment Number,Student Name,Branch\n`;
    
    missingStudents.forEach(s => {
      const name = s.name ? s.name.replace(/,/g, '') : 'Unknown';
      const branch = s.branch || 'Unknown';
      csvContent += `${s.enrollmentNo},${name},${branch}\n`;
    });
    
    const csvPath = path.join(__dirname, 'missing_students.csv');
    fs.writeFileSync(csvPath, csvContent, 'utf-8');
    console.log(`Created CSV at ${csvPath}`);
    
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
}

createCSV();
