require('dotenv').config();
const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const Teacher = mongoose.model('Teacher', new Schema({ name: String, employeeId: String, email: String, loadDistributionQuotas: Object }));
const Timetable = mongoose.model('Timetable', new Schema({ branch: String, semester: String, timetable: Object, lastUpdated: Date }));
const LeaveRequest = mongoose.model('LeaveRequest', new Schema({ teacherId: Schema.Types.ObjectId, teacherName: String, startDate: Date, endDate: Date, status: String }));
const Student = mongoose.model('Student', new Schema({ branch: String, course: String, semester: String }));
const TeacherBusy = mongoose.model('TeacherBusy', new Schema({ teacherId: Schema.Types.ObjectId, date: Date, period: String, isBusy: Boolean }));
const ScheduleSwap = mongoose.model('ScheduleSwap', new Schema({ date: Date, semester: String, branch: String, period: String, subject: String, originalTeacherId: Schema.Types.ObjectId, originalTeacher: String, substituteTeacherId: Schema.Types.ObjectId, substituteTeacher: String }));

function getISTMidnight(dateObj = new Date()) {
    const offset = 5.5 * 60 * 60 * 1000;
    const utcTime = dateObj.getTime();
    const istTime = new Date(utcTime + offset);
    istTime.setUTCHours(0, 0, 0, 0);
    return new Date(istTime.getTime() - offset);
}

async function simulate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  const leave = await LeaveRequest.findOne({ teacherName: 'Aditya Sir', status: 'approved' });
  if (!leave) {
    console.log('No approved leave for Aditya Sir');
    process.exit(0);
  }

  const start = new Date(leave.startDate);
  const end = new Date(leave.endDate);
  const originalTeacherId = leave.teacherId;
  const originalTeacherName = leave.teacherName;

  const diffTime = Math.abs(end - start);
  const numDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  const simulatedSwaps = [];

  for (let d = 0; d < numDays; d++) {
    const currentDate = new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
    const currentDayIndex = currentDate.getDay();
    const currentDayName = daysOfWeek[currentDayIndex];
    console.log(`\n--- Day ${d}: ${currentDate.toDateString()} (${currentDayName}) ---`);

    const timetables = await Timetable.find({}).lean();
    const scheduledPeriods = [];

    for (const tt of timetables) {
      const daySchedule = tt.timetable?.[currentDayName] || [];
      for (let i = 0; i < daySchedule.length; i++) {
        const slot = daySchedule[i];
        if (slot && !slot.isBreak && slot.subject) {
          const matchesTeacher = 
              (slot.teacher && slot.teacher.toString() === originalTeacherId.toString()) ||
              (slot.teacherName && slot.teacherName.toLowerCase() === originalTeacherName.toLowerCase()) ||
              (slot.teacher && slot.teacher.toLowerCase() === originalTeacherName.toLowerCase());
          
          if (matchesTeacher) {
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

    console.log(`Found ${scheduledPeriods.length} periods to swap.`);

    for (const sp of scheduledPeriods) {
      const periodNum = sp.periodNum;
      const subject = sp.subject;
      const semester = sp.semester;
      const branch = sp.branch;

      console.log(`\n  >> Period: P${periodNum} | Subject: ${subject} | Branch: ${branch} Sem ${semester}`);

      const allTeachers = await Teacher.find({ _id: { $ne: originalTeacherId } }).lean();
      const candidates = [];

      for (const candidate of allTeachers) {
        // 1. Check leave
        const startOfDay = getISTMidnight(currentDate);
        const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
        const candidateLeave = await LeaveRequest.findOne({
            teacherId: candidate._id,
            status: 'approved',
            startDate: { $lte: endOfDay },
            endDate: { $gte: startOfDay }
        });
        if (candidateLeave) {
            console.log(`     - Excluded ${candidate.name}: on leave`);
            continue;
        }

        // 2. Check admin busy
        const adminBusy = await TeacherBusy.findOne({
            teacherId: candidate._id,
            date: startOfDay,
            period: `P${periodNum}`,
            isBusy: true
        });
        if (adminBusy) {
            console.log(`     - Excluded ${candidate.name}: admin busy`);
            continue;
        }

        // 3. Check if scheduled at this period
        let isBusy = false;
        for (const tt of timetables) {
            const daySchedule = tt.timetable?.[currentDayName] || [];
            const slot = daySchedule[periodNum - 1];
            if (slot && !slot.isBreak && slot.subject) {
                const matchesCand = 
                    (slot.teacher && slot.teacher.toString() === candidate._id.toString()) ||
                    (slot.teacherName && slot.teacherName.toLowerCase() === candidate.name.toLowerCase()) ||
                    (slot.teacher && slot.teacher.toLowerCase() === candidate.name.toLowerCase());
                if (matchesCand) {
                    let studentCount = 0;
                    const totalStudents = await Student.countDocuments({});
                    if (totalStudents > 0) {
                        studentCount = await Student.countDocuments({
                            $or: [
                                { branch: tt.branch },
                                { course: tt.branch }
                            ],
                            semester: tt.semester.toString()
                        });
                    } else {
                        studentCount = 1;
                    }
                    if (studentCount > 0) {
                        isBusy = true;
                        break;
                    }
                }
            }
        }
        if (isBusy) {
            console.log(`     - Excluded ${candidate.name}: busy teaching another class`);
            continue;
        }

        // 4. Already swapped
        const alreadySwapped = simulatedSwaps.some(s => 
            s.date.getTime() === startOfDay.getTime() &&
            s.period === `P${periodNum}` &&
            s.substituteTeacherId.toString() === candidate._id.toString()
        );
        if (alreadySwapped) {
            console.log(`     - Excluded ${candidate.name}: already swapped for this period`);
            continue;
        }

        // 5. Consecutive lectures check
        const candidatePeriods = new Set();
        for (const tt of timetables) {
            const daySchedule = tt.timetable?.[currentDayName] || [];
            for (let i = 0; i < daySchedule.length; i++) {
                const slot = daySchedule[i];
                if (slot && !slot.isBreak && slot.subject) {
                    const matchesCand = 
                        (slot.teacher && slot.teacher.toString() === candidate._id.toString()) ||
                        (slot.teacherName && slot.teacherName.toLowerCase() === candidate.name.toLowerCase()) ||
                        (slot.teacher && slot.teacher.toLowerCase() === candidate.name.toLowerCase());
                    if (matchesCand) {
                        let studentCount = 0;
                        const totalStudents = await Student.countDocuments({});
                        if (totalStudents > 0) {
                            studentCount = await Student.countDocuments({
                                $or: [
                                    { branch: tt.branch },
                                    { course: tt.branch }
                                ],
                                semester: tt.semester.toString()
                            });
                        } else {
                            studentCount = 1;
                        }
                        if (studentCount > 0) {
                            candidatePeriods.add(slot.period || (i + 1));
                        }
                    }
                }
            }
        }

        // From previous simulated swaps for this candidate today
        const swapsForCandidate = simulatedSwaps.filter(s =>
            s.date.getTime() === startOfDay.getTime() &&
            s.substituteTeacherId.toString() === candidate._id.toString()
        );
        for (const sw of swapsForCandidate) {
            const match = sw.period.match(/\d+/);
            if (match) {
                candidatePeriods.add(parseInt(match[0]));
            }
        }

        const testPeriods = Array.from(candidatePeriods);
        testPeriods.push(periodNum);
        testPeriods.sort((a, b) => a - b);

        let hasThreeConsecutive = false;
        for (let i = 0; i < testPeriods.length - 2; i++) {
            if (testPeriods[i+1] === testPeriods[i] + 1 && testPeriods[i+2] === testPeriods[i] + 2) {
                hasThreeConsecutive = true;
                break;
            }
        }

        if (hasThreeConsecutive) {
            console.log(`     - Excluded ${candidate.name}: 3 consecutive lectures check (${testPeriods.join(', ')})`);
            continue;
        }

        const weekQuota = candidate.loadDistributionQuotas?.week?.lectureQuota || 0;
        candidates.push({ teacher: candidate, quota: weekQuota });
      }

      candidates.sort((a, b) => b.quota - a.quota);

      if (candidates.length > 0) {
        const chosen = candidates[0].teacher;
        console.log(`     ✅ CHOSEN: ${chosen.name} (week quota: ${candidates[0].quota})`);
        
        simulatedSwaps.push({
            date: getISTMidnight(currentDate),
            semester,
            branch,
            period: `P${periodNum}`,
            subject,
            originalTeacherId,
            originalTeacher: originalTeacherName,
            substituteTeacherId: chosen._id,
            substituteTeacher: chosen.name
        });
      } else {
        console.log(`     ⚠️ NO ELIGIBLE CANDIDATE FOUND!`);
      }
    }
  }

  process.exit(0);
}
simulate().catch(console.error);
