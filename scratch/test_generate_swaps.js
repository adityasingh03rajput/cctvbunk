require('dotenv').config();
const mongoose = require('mongoose');

// Import schemas/models if possible, or define inline
const Schema = mongoose.Schema;
const Teacher = mongoose.model('Teacher', new Schema({ name: String, employeeId: String, email: String }));
const Timetable = mongoose.model('Timetable', new Schema({ branch: String, semester: String, timetable: Object, lastUpdated: Date }));
const LeaveRequest = mongoose.model('LeaveRequest', new Schema({ teacherId: Schema.Types.ObjectId, teacherName: String, startDate: Date, endDate: Date, status: String }));
const Student = mongoose.model('Student', new Schema({ branch: String, course: String, semester: String }));

async function test() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const leave = await LeaveRequest.findOne({ teacherName: 'Aditya Sir', status: 'approved' });
  if (!leave) {
    console.log('No approved leave request found for Aditya Sir');
    process.exit(0);
  }

  console.log('Testing generateSwapsForLeave simulation for leave:', leave);

  const start = new Date(leave.startDate);
  const end = new Date(leave.endDate);
  const originalTeacherId = leave.teacherId;
  const originalTeacherName = leave.teacherName;

  const diffTime = Math.abs(end - start);
  const numDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  console.log(`numDays: ${numDays}`);

  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  for (let d = 0; d < numDays; d++) {
    const currentDate = new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
    const currentDayIndex = currentDate.getDay();
    const currentDayName = daysOfWeek[currentDayIndex];
    console.log(`\n--- Day ${d}: ${currentDate.toDateString()} (${currentDayName}) ---`);

    const timetables = await Timetable.find({}).lean();
    console.log(`Total timetables: ${timetables.length}`);

    const scheduledPeriods = [];
    for (const tt of timetables) {
      const daySchedule = tt.timetable?.[currentDayName] || [];
      console.log(`Timetable branch: ${tt.branch}, sem: ${tt.semester}, slots for ${currentDayName}: ${daySchedule.length}`);
      
      for (let i = 0; i < daySchedule.length; i++) {
        const slot = daySchedule[i];
        if (slot && !slot.isBreak && slot.subject) {
          const matchesTeacher = 
              (slot.teacher && slot.teacher.toString() === originalTeacherId.toString()) ||
              (slot.teacherName && slot.teacherName.toLowerCase() === originalTeacherName.toLowerCase()) ||
              (slot.teacher && slot.teacher.toLowerCase() === originalTeacherName.toLowerCase());
          
          if (matchesTeacher) {
            console.log(`  MATCH: Period ${slot.period || (i + 1)} | Subject: ${slot.subject} | Teacher: ${slot.teacherName || slot.teacher}`);
            scheduledPeriods.push({
                semester: tt.semester,
                branch: tt.branch,
                periodNum: slot.period || (i + 1),
                subject: slot.subject,
                room: slot.room || 'Room 201'
            });
          }
        }
      }
    }

    console.log(`Scheduled periods count: ${scheduledPeriods.length}`);
  }

  process.exit(0);
}
test().catch(console.error);
