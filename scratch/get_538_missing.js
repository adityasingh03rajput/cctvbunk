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
    
    // The user wants the 538 students from the list.
    // Let's find their info in the DB.
    const missingStudents = [];
    
    for (const en of filledEnrollments) {
      const dbStudent = students.find(s => s.enrollmentNo && s.enrollmentNo.trim().toUpperCase() === en);
      if (dbStudent) {
        missingStudents.push(dbStudent);
      } else {
        missingStudents.push({ enrollmentNo: en, name: 'Unknown (Not in DB)', branch: 'Unknown' });
      }
    }
    
    let mdContent = `# 538 Students Missing Feedback\n\n`;
    mdContent += `| Enrollment Number | Student Name | Branch |\n`;
    mdContent += `|---|---|---|\n`;
    
    missingStudents.forEach(s => {
      mdContent += `| ${s.enrollmentNo} | ${s.name || 'Unknown'} | ${s.branch || 'Unknown'} |\n`;
    });
    
    const artifactPath = path.join('C:', 'Users', 'Victus', '.gemini', 'antigravity', 'brain', '8440e829-ca02-4c6d-9806-da5e9e9f6190', 'all_538_missing_students.md');
    fs.writeFileSync(artifactPath, mdContent, 'utf-8');
    console.log(`Written 538 students to artifact.`);
    
  } catch (error) {
    console.error(error);
  } finally {
    process.exit(0);
  }
}

findMissing();
