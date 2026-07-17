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

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  // 1. Clear existing swaps
  const clearRes = await ScheduleSwap.deleteMany({});
  console.log(`Cleared ${clearRes.deletedCount} old schedule swaps.`);

  // 2. Fetch approved leaves
  const leaves = await LeaveRequest.find({ status: 'approved' });
  console.log(`Found ${leaves.length} approved leave requests to process.`);

  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  for (const leaveRequest of leaves) {
    const start = new Date(leaveRequest.startDate);
    const end = new Date(leaveRequest.endDate);
    const originalTeacherId = leaveRequest.teacherId;
    const originalTeacherName = leaveRequest.teacherName;

    const diffTime = Math.abs(end - start);
    const numDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    console.log(`\nGenerating swaps for ${originalTeacherName} for ${numDays} days (${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]})`);

    for (let d = 0; d < numDays; d++) {
        const currentDate = new Date(start.getTime() + d * 24 * 60 * 60 * 1000);
        // Correct timezone day index extraction
        const offset = 5.5 * 60 * 60 * 1000;
        const istDate = new Date(currentDate.getTime() + offset);
        const currentDayIndex = istDate.getUTCDay();
        const currentDayName = daysOfWeek[currentDayIndex];

        console.log(`  Processing Day ${d}: ${istDate.toISOString().split('T')[0]} (${currentDayName})`);

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

        console.log(`  Found ${scheduledPeriods.length} periods for this day.`);

        for (const sp of scheduledPeriods) {
            const periodNum = sp.periodNum;
            const subject = sp.subject;
            const semester = sp.semester;
            const branch = sp.branch;

            const allTeachers = await Teacher.find({ _id: { $ne: originalTeacherId } }).lean();
            const candidates = [];

            for (const candidate of allTeachers) {
                // 1. Leave check
                const startOfDay = getISTMidnight(currentDate);
                const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
                const candidateLeave = await LeaveRequest.findOne({
                    teacherId: candidate._id,
                    status: 'approved',
                    startDate: { $lte: endOfDay },
                    endDate: { $gte: startOfDay }
                });
                if (candidateLeave) continue;

                // 2. Admin busy check
                const adminBusy = await TeacherBusy.findOne({
                    teacherId: candidate._id,
                    date: startOfDay,
                    period: `P${periodNum}`,
                    isBusy: true
                });
                if (adminBusy) continue;

                // 3. Timetable check
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
                if (isBusy) continue;

                // 4. Swap check
                const existingSwaps = await ScheduleSwap.find({
                    date: getISTMidnight(currentDate),
                    period: `P${periodNum}`
                }).lean();
                const alreadySwapped = existingSwaps.some(s => s.substituteTeacherId.toString() === candidate._id.toString());
                if (alreadySwapped) continue;

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

                const swapsForCandidate = await ScheduleSwap.find({
                    date: getISTMidnight(currentDate),
                    substituteTeacherId: candidate._id
                }).lean();
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
                if (hasThreeConsecutive) continue;

                const weekQuota = candidate.loadDistributionQuotas?.week?.lectureQuota || 0;
                candidates.push({ teacher: candidate, quota: weekQuota });
            }

            candidates.sort((a, b) => b.quota - a.quota);

            if (candidates.length > 0) {
                const chosen = candidates[0].teacher;
                console.log(`    ✅ Swap created for Period ${periodNum}: Substitute chosen is ${chosen.name}`);
                
                const swap = new ScheduleSwap({
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
                await swap.save();
            } else {
                console.log(`    ⚠️ No eligible substitute found for Period ${periodNum}`);
            }
        }
    }
  }

  console.log('\nAll swaps successfully regenerated!');
  process.exit(0);
}
run().catch(console.error);
