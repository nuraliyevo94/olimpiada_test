require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const Student = mongoose.model('Student', new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: String,
  password: { type: String, default: '123' },
  name: String,
  sinf: String,
  xp: { type: Number, default: 0 },
  badges: [String]
}));

const Result = mongoose.model('Result', new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  sessionId: String,
  studentId: String,
  name: String,
  sinf: String,
  score: Number,
  timeSpent: Number,
  submittedAt: String,
  attemptNum: Number,
  countsForLeaderboard: Boolean
}));

const Session = mongoose.model('Session', new mongoose.Schema({
  sessionId: String,
  sinf: String,
  questions: Object,
  startTime: Number
}));

const Setting = mongoose.model('Setting', new mongoose.Schema({
  testStartTime: String,
  testEndTime: String,
  isActive: Boolean
}));

function readJSON(filename) {
  try {
    const p = path.join(__dirname, 'data', filename);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
    return null;
  } catch (e) { return null; }
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("Xatolik: MONGODB_URI berilmagan (.env faylini tekshiring)");
    process.exit(1);
  }

  try {
    console.log("MongoDB ga ulanilmoqda...");
    await mongoose.connect(uri);
    console.log("MongoDB ga muvaffaqiyatli ulandi!");

    console.log("Ma'lumotlar tozalanmoqda...");
    await Student.deleteMany({});
    await Result.deleteMany({});
    await Session.deleteMany({});
    await Setting.deleteMany({});

    console.log("Fayllar o'qilmoqda...");
    const students = readJSON('students.json') || [];
    const results = readJSON('results.json') || [];
    const sessions = readJSON('sessions.json') || [];
    const settings = readJSON('settings.json') || { testStartTime: null, testEndTime: null, isActive: false };

    console.log("O'quvchilar saqlanmoqda...");
    if (students.length > 0) await Student.insertMany(students);

    console.log("Natijalar saqlanmoqda...");
    if (results.length > 0) await Result.insertMany(results);

    console.log("Seanslar saqlanmoqda...");
    if (sessions.length > 0) await Session.insertMany(sessions);

    console.log("Sozlamalar saqlanmoqda...");
    await Setting.create(settings);

    console.log("✅ Barcha ma'lumotlar muvaffaqiyatli MongoDB ga o'tkazildi!");
  } catch (err) {
    console.error("Xatolik yuz berdi:", err);
  } finally {
    mongoose.disconnect();
  }
}

run();
