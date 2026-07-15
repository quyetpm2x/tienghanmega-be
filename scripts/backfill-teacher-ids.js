require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const connectDB = require('../src/config/database');

const Teacher = require('../src/models/Teacher');
const Class = require('../src/models/Class');
const StudentAttendance = require('../src/models/StudentAttendance');

// One-time backfill: resolve Class.teacher (name string) and
// StudentAttendance.className -> Class.teacher into teacherId ObjectId refs.
// Safe to re-run — only touches docs where teacherId is still null.
async function run() {
  await connectDB();
  console.log('Connected to MongoDB');

  const teachers = await Teacher.find().select('_id name');
  const nameToId = new Map(teachers.map(t => [t.name, t._id]));

  const classes = await Class.find({ teacherId: null });
  let classMatched = 0, classUnmatched = 0;
  for (const cls of classes) {
    const teacherId = nameToId.get(cls.teacher);
    if (teacherId) {
      cls.teacherId = teacherId;
      await cls.save();
      classMatched++;
    } else {
      classUnmatched++;
      console.log(`  [Class] no match for teacher name "${cls.teacher}" (class "${cls.name}")`);
    }
  }
  console.log(`Class: ${classMatched} matched, ${classUnmatched} unmatched`);

  // className -> teacherId lookup (post class-backfill, includes docs already matched above)
  const classNameToTeacherId = new Map(
    (await Class.find().select('name teacherId')).map(c => [c.name, c.teacherId])
  );

  const sessions = await StudentAttendance.find({ teacherId: null });
  let sessionMatched = 0, sessionUnmatched = 0;
  for (const sess of sessions) {
    const teacherId = classNameToTeacherId.get(sess.className);
    if (teacherId) {
      sess.teacherId = teacherId;
      await sess.save();
      sessionMatched++;
    } else {
      sessionUnmatched++;
      console.log(`  [StudentAttendance] no matched class for className "${sess.className}" (session ${sess._id})`);
    }
  }
  console.log(`StudentAttendance: ${sessionMatched} matched, ${sessionUnmatched} unmatched`);

  await mongoose.disconnect();
  console.log('Done.');
}

run().catch(err => { console.error(err); process.exit(1); });
