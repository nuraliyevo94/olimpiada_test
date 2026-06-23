require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const ADMIN_LOGIN = 'Otabek';
const ADMIN_PASSWORD = 'test2026';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── MongoDB Ulanish ─────────────────────────────────────────────────────────

if (!process.env.MONGODB_URI) {
  console.error("XATOLIK: MONGODB_URI berilmagan! (.env faylini tekshiring)");
  process.exit(1);
}

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log('✅ MongoDB ga muvaffaqiyatli ulandi!');
    
    // AVTOMATIK MIGRATSIYA
    try {
      const studentCount = await mongoose.models.Student.countDocuments();
      if (studentCount === 0) {
        console.log("MongoDB bo'sh. JSON fayllardan ma'lumotlar avtomatik ko'chirilmoqda...");
        
        const students = readJSON('students.json') || [];
        const results = readJSON('results.json') || [];
        const sessions = readJSON('sessions.json') || [];
        const settings = readJSON('settings.json') || { testStartTime: null, testEndTime: null, isActive: false };

        if (students.length > 0) await mongoose.models.Student.insertMany(students);
        if (results.length > 0) await mongoose.models.Result.insertMany(results);
        if (sessions.length > 0) await mongoose.models.Session.insertMany(sessions);
        await mongoose.models.Setting.create(settings);
        
        console.log("✅ Avtomatik ko'chirish tugadi!");
      }
    } catch(err) {
      console.log("Avtomatik ko'chirishda xatolik:", err);
    }
  })
  .catch(err => console.error('❌ MongoDB ulanishda xatolik:', err));

// ─── MongoDB Sxemalari ───────────────────────────────────────────────────────

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
  maxScore: Number,
  percent: Number,
  timeSpent: Number,
  submittedAt: String,
  attemptNum: Number,
  countsForLeaderboard: Boolean,
  breakdown: Array
}));

const Session = mongoose.model('Session', new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  sinf: String,
  easy: Array,
  medium: Array,
  hard: Array,
  testEndTime: String,
  createdAt: String
}));

const Setting = mongoose.model('Setting', new mongoose.Schema({
  testStartTime: String,
  testEndTime: String,
  isActive: Boolean
}));

// Yordamchi funksiyalar (savollar bazasini o'qish uchun)
function readJSON(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── API: Test sozlamalari ───────────────────────────────────────────────────

app.get('/api/settings', async (req, res) => {
  let settings = await Setting.findOne();
  if (!settings) {
    settings = { testStartTime: null, testEndTime: null, isActive: false };
  }
  const now = new Date();
  let testOpen = false;
  if (settings.testStartTime && settings.testEndTime) {
    testOpen = now >= new Date(settings.testStartTime) && now <= new Date(settings.testEndTime);
  }
  res.json({ testStartTime: settings.testStartTime, testEndTime: settings.testEndTime, isActive: settings.isActive, testOpen, serverTime: now.toISOString() });
});

// ─── API: Login va Profil ────────────────────────────────────────────────────

app.get('/api/students/list/:sinf', async (req, res) => {
  const sinf = req.params.sinf;
  const students = await Student.find({ sinf }).sort({ name: 1 });
  const list = students.map(s => ({ id: s.id, name: formatName(s.name) }));
  res.json(list);
});

app.post('/api/login', async (req, res) => {
  const { id, password } = req.body;
  const student = await Student.findOne({ id, password });
  
  if (student) {
    const studentData = { id: student.id, name: formatName(student.name), sinf: student.sinf, xp: student.xp, badges: student.badges };
    res.json({ success: true, student: studentData });
  } else {
    res.status(401).json({ error: "Parol noto'g'ri" });
  }
});

app.get('/api/profile/:studentId', async (req, res) => {
  const student = await Student.findOne({ id: req.params.studentId });
  if (!student) return res.status(404).json({ error: "O'quvchi topilmadi" });
  
  const history = await Result.find({ studentId: student.id }).sort({ id: -1 });
  
  const isDefaultPassword = student.password === '123';
  const studentData = { id: student.id, name: student.name, sinf: student.sinf, xp: student.xp, badges: student.badges };
  
  res.json({ student: studentData, isDefaultPassword, history });
});

app.post('/api/profile/change-password', async (req, res) => {
  const { studentId, oldPassword, newPassword } = req.body;
  if (!studentId || !oldPassword || !newPassword) return res.status(400).json({ error: "Ma'lumotlar to'liq emas" });

  const student = await Student.findOne({ id: studentId });
  if (student) {
    if (student.password === oldPassword) {
      student.password = newPassword;
      await student.save();
      res.json({ success: true });
    } else {
      res.status(401).json({ error: "Joriy parol noto'g'ri" });
    }
  } else {
    res.status(404).json({ error: "O'quvchi topilmadi" });
  }
});

// ─── API: 30 ta random savol berish ─────────────────────────────────────────

app.get('/api/questions/:sinf', async (req, res) => {
  const { sinf } = req.params;
  if (!['5', '6'].includes(sinf)) return res.status(400).json({ error: "Noto'g'ri sinf" });

  let settings = await Setting.findOne();
  if (!settings) settings = {};
  const now = new Date();
  let testOpen = false;
  if (settings.testStartTime && settings.testEndTime) {
    testOpen = now >= new Date(settings.testStartTime) && now <= new Date(settings.testEndTime);
  }
  if (!testOpen) return res.status(403).json({ error: 'Test hozir faol emas', testOpen: false });

  const { easy, medium, hard } = getRandomQuestions(sinf);
  if (easy.length === 0) return res.status(500).json({ error: 'Savollar topilmadi' });

  const easyForClient = easy.map(q => ({ ...q, answer: undefined, correctAnswerText: undefined, type: 'mcq' }));
  const mediumForClient = medium.map(q => ({ ...q, answer: undefined, correctAnswerText: undefined, type: 'mcq' }));
  const hardForClient = hard.map(q => ({ ...q, answer: undefined, correctAnswerText: undefined, options: [], type: 'open' }));

  const sessionId = Date.now().toString(36) + Math.random().toString(36).substr(2);
  
  await Session.create({
    sessionId,
    sinf,
    easy,
    medium,
    hard,
    testEndTime: settings.testEndTime,
    createdAt: new Date().toISOString()
  });

  res.json({
    sessionId,
    questions: {
      easy: easyForClient,
      medium: mediumForClient,
      hard: hardForClient
    },
    testEndTime: settings.testEndTime,
    serverTime: now.toISOString()
  });
});

// ─── API: Javob yuborish ─────────────────────────────────────────────────────

app.post('/api/submit', async (req, res) => {
  const { sessionId, studentId, name, sinf, answers: userAnswers, timeSpent } = req.body;

  if (!sessionId || !studentId || !name || !sinf || !userAnswers) {
    return res.status(400).json({ error: "Ma'lumotlar to'liq emas" });
  }

  let settings = await Setting.findOne();
  const now = new Date();
  if (settings && settings.testEndTime && now > new Date(settings.testEndTime)) {
    return res.status(403).json({ error: 'Test vaqti tugadi!' });
  }

  const session = await Session.findOne({ sessionId });
  if (!session) return res.status(400).json({ error: 'Sessiya topilmadi (ehtimol allaqachon topshirilgan)' });

  const prevAttempts = await Result.find({ studentId, sinf });
  if (prevAttempts.length >= 3) {
    return res.status(403).json({ error: 'Maksimal urinishlar soni (3) tugadi!' });
  }
  const attemptNum = prevAttempts.length + 1;

  let totalScore = 0;
  const breakdown = [];

  session.easy.forEach((q, i) => {
    const key = `easy_${i}`;
    const userAns = (userAnswers[key] || '').trim().toUpperCase();
    const correct = userAns === q.answer.toUpperCase();
    if (correct) totalScore += 2;
    breakdown.push({ qid: q.id, section: 'easy', userAnswer: userAns, correctAnswer: q.answer, correct, points: correct ? 2 : 0 });
  });

  session.medium.forEach((q, i) => {
    const key = `medium_${i}`;
    const userAns = (userAnswers[key] || '').trim().toUpperCase();
    const correct = userAns === q.answer.toUpperCase();
    if (correct) totalScore += 3;
    breakdown.push({ qid: q.id, section: 'medium', userAnswer: userAns, correctAnswer: q.answer, correct, points: correct ? 3 : 0 });
  });

  session.hard.forEach((q, i) => {
    const key = `hard_${i}`;
    const userRaw = (userAnswers[key] || '').trim();
    let correct = false;

    if (q.correctAnswerText !== null && q.correctAnswerText !== undefined) {
      const userNum = parseFloat(userRaw.replace(',', '.'));
      const correctNum = parseFloat(String(q.correctAnswerText).replace(',', '.'));
      if (!isNaN(userNum) && !isNaN(correctNum)) {
        correct = Math.abs(userNum - correctNum) < 0.001;
      } else {
        correct = userRaw.toLowerCase() === String(q.correctAnswerText).toLowerCase();
      }
    }

    if (correct) totalScore += 5;
    breakdown.push({
      qid: q.id, section: 'hard',
      userAnswer: userRaw,
      correctAnswer: q.correctAnswerText || q.answer,
      correct,
      points: correct ? 5 : 0
    });
  });

  const result = new Result({
    id: Date.now(),
    studentId,
    name: name.trim(),
    sinf,
    attemptNum,
    score: totalScore,
    maxScore: 100,
    percent: Math.round(totalScore),
    timeSpent: timeSpent || 7200,
    breakdown,
    submittedAt: now.toISOString(),
    countsForLeaderboard: attemptNum === 1
  });

  await result.save();

  const student = await Student.findOne({ id: studentId });
  const newBadges = [];
  
  if (student) {
    student.xp = (student.xp || 0) + totalScore;
    
    if (totalScore === 100 && !student.badges.includes('Mukammal natija')) {
      student.badges.push('Mukammal natija');
      newBadges.push('Mukammal natija');
    }
    if (attemptNum === 1 && !student.badges.includes('Birinchi qadam')) {
      student.badges.push('Birinchi qadam');
      newBadges.push('Birinchi qadam');
    }
    if (timeSpent < 3600 && totalScore >= 90 && !student.badges.includes('Vaqt ustasi')) {
      student.badges.push('Vaqt ustasi');
      newBadges.push('Vaqt ustasi');
    }
    
    await student.save();
  }

  await Session.deleteOne({ sessionId });

  res.json({ success: true, result, newBadges });
});

// ─── API: Peshqadamlar jadvali ───────────────────────────────────────────────

app.get('/api/leaderboard/:sinf', async (req, res) => {
  try {
    let results = await Result.find({ 
      sinf: req.params.sinf,
      countsForLeaderboard: true 
    }).sort({ score: -1, timeSpent: 1 });
    
    results = results.map(r => ({ ...r.toObject(), name: formatName(r.name) }));
    res.json(results);
  } catch(e) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

// ─── API: Admin panel ────────────────────────────────────────────────────────

app.post('/api/admin/login', (req, res) => {
  const { login, password } = req.body;
  if (login === ADMIN_LOGIN && password === ADMIN_PASSWORD) {
    res.json({ success: true, token: Buffer.from(`${ADMIN_LOGIN}:${ADMIN_PASSWORD}`).toString('base64') });
  } else {
    res.status(401).json({ error: "Login yoki parol noto'g'ri" });
  }
});

function adminAuth(req, res, next) {
  const auth = req.headers['x-admin-token'];
  if (auth !== Buffer.from(`${ADMIN_LOGIN}:${ADMIN_PASSWORD}`).toString('base64')) {
    return res.status(401).json({ error: "Ruxsat yo'q" });
  }
  next();
}

app.post('/api/admin/settings', adminAuth, async (req, res) => {
  const { testStartTime, testEndTime, isActive } = req.body;
  let settings = await Setting.findOne();
  if (!settings) settings = new Setting();
  
  settings.testStartTime = testStartTime;
  settings.testEndTime = testEndTime;
  settings.isActive = isActive;
  
  await settings.save();
  res.json({ success: true, settings });
});

app.get('/api/admin/results', adminAuth, async (req, res) => {
  try {
    let results = await Result.find().sort({ submittedAt: -1 });
    results = results.map(r => ({ ...r.toObject(), name: formatName(r.name) }));
    res.json(results);
  } catch(e) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

app.delete('/api/admin/results', adminAuth, async (req, res) => {
  await Result.deleteMany({});
  await Session.deleteMany({});
  res.json({ success: true });
});

// Admin API: O'quvchilarni boshqarish
app.get('/api/admin/students', adminAuth, async (req, res) => {
  try {
    let students = await Student.find().sort({ sinf: 1, name: 1 });
    students = students.map(s => ({ ...s.toObject(), name: formatName(s.name) }));
    res.json(students);
  } catch(e) {
    res.status(500).json({ error: 'Server xatosi' });
  }
});

app.post('/api/admin/students', adminAuth, async (req, res) => {
  const newStudent = new Student({ id: 'stu_' + Date.now(), xp: 0, badges: [], ...req.body });
  await newStudent.save();
  res.json({ success: true, student: newStudent });
});

app.delete('/api/admin/students/:id', adminAuth, async (req, res) => {
  await Student.deleteOne({ id: req.params.id });
  res.json({ success: true });
});

// ─── Sahifalar ───────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'public', 'profile.html')));
app.get('/test', (req, res) => res.sendFile(path.join(__dirname, 'public', 'test.html')));
app.get('/result', (req, res) => res.sendFile(path.join(__dirname, 'public', 'result.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));

// ─── Server ishga tushirish ──────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🌟 Olimpiada Test Serveri ishga tushdi! (Port: ${PORT})`);
  console.log(`🌐 Sayt: http://localhost:${PORT}`);
  console.log(`🔧 Admin: http://localhost:${PORT}/admin\n`);
});
