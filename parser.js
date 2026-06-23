/**
 * parser.js — 5-sinf va 6-sinf savollar faylini JSON ga o'giradi
 */

const fs = require('fs');
const path = require('path');

const OLIMPIADA_DIR = 'E:\\olimpiada';
const OUTPUT_DIR = path.join(__dirname, 'data');

// ─── Javoblar faylini parse qilish ──────────────────────────────────────────
function parseAnswersFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const answers = [];
  for (const line of content.split('\n')) {
    const match = line.match(/\|\s*\d+[–\-—]+\d+\s*\|\s*([A-D\s]+)\s*\|/);
    if (match) {
      const letters = match[1].trim().split(/\s+/).filter(l => /^[A-D]$/.test(l));
      answers.push(...letters);
    }
  }
  return answers;
}

// ─── Bir qatordagi A) B) C) D) variantlarni ajratish ────────────────────────
// "56 sm B) 54 sm C) 32 sm D) 64 sm" → {A:'56 sm', B:'54 sm', C:'32 sm', D:'64 sm'}
function splitInlineOptions(aText) {
  // aText = "56 sm B) 54 sm C) 32 sm D) 64 sm" (A) dan keyingi qism)
  const result = { A: '' };
  const parts = aText.split(/\s+(?=[B-D]\))/);
  result.A = parts[0].trim();
  for (let i = 1; i < parts.length; i++) {
    const letterMatch = parts[i].match(/^([B-D])\)\s*(.*)/s);
    if (letterMatch) result[letterMatch[1]] = letterMatch[2].trim();
  }
  return result;
}

// ─── Bir blokdan variantlarni topish ────────────────────────────────────────
function extractOptions(blockText) {
  const options = {};

  // 1-usul: Alohida qatorda "A) matn" va keyingi variant boshlanishidan oldin
  // Avval barcha variant boshlanish pozitsiyalarini topamiz
  const lines = blockText.split('\n');
  let currentLetter = null;
  let currentText = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Qator faqat bitta variant bilan boshlanganmi?
    const soloMatch = trimmed.match(/^([A-D])\)\s+(.+)$/);
    // Qatorda bir nechta variant bormi? (inline)
    const inlineCheck = trimmed.match(/^([A-D])\)\s+(.+?)\s+[B-D]\)\s/);

    if (soloMatch && inlineCheck) {
      // Inline format: "A) 27500 B) 15700 C) 12500 D) 17500"
      // butun qatorni inline parse qilamiz
      const allInline = splitInlineOptions(soloMatch[1] === 'A' ? soloMatch[2] : trimmed.replace(/^[A-D]\)\s*/, ''));
      // A dan boshlaymiz
      if (soloMatch[1] === 'A') {
        Object.assign(options, allInline);
      }
      currentLetter = null;
      currentText = [];
    } else if (soloMatch) {
      if (currentLetter) options[currentLetter] = currentText.join(' ').trim();
      currentLetter = soloMatch[1];
      currentText = [soloMatch[2]];
    } else if (currentLetter && trimmed && !trimmed.match(/^---/)) {
      currentText.push(trimmed);
    }
  }
  if (currentLetter) options[currentLetter] = currentText.join(' ').trim();

  // 2-usul: Agar hali ham topilmagan bo'lsa — regex bilan qidirish
  if (Object.keys(options).length === 0) {
    // Butun matndan inline variantlarni qidirish
    const inlineMatch = blockText.match(/A\)\s+(.+?)(?=\n|$)/m);
    if (inlineMatch) {
      const parsed = splitInlineOptions(inlineMatch[1]);
      Object.assign(options, parsed);
    }
  }

  // Matnlarni tozalash
  for (const k of Object.keys(options)) {
    options[k] = options[k]
      .replace(/\*\*/g, '')
      .replace(/\\+[\(\)]/g, '')
      .replace(/\\\[|\\\]/g, '')
      .replace(/^\\+/, '')
      .trim();
  }

  return options;
}

// ─── Raqamni ajratib olish ───────────────────────────────────────────────────
function extractNumber(text) {
  if (!text) return null;
  const clean = text
    .replace(/\\cdot/g, '*').replace(/\\dfrac\{([^}]+)\}\{([^}]+)\}/g, '$1/$2')
    .replace(/\\text\{[^}]*\}/g, '').replace(/\\/g, '')
    .replace(/\{|\}/g, '').replace(/\^/g, '').trim();

  // Raqam + birlik formatidagi sonlar: "56 sm", "343 sm³", "19,2 ga"
  const numMatch = clean.match(/^(-?\d[\d\s]*[.,]?\d*)/);
  if (numMatch) return numMatch[1].replace(',', '.').replace(/\s/g, '').trim();

  // Oddiy raqamlar
  const nums = clean.match(/-?\d+[.,]?\d*/g);
  if (nums) return nums[0].replace(',', '.');

  return clean.slice(0, 30).toLowerCase();
}

// ─── Fayl topish (bir nechta nom variantlari) ────────────────────────────────
function findFile(dir, names) {
  for (const name of names) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) { console.log(`   ✓ Topildi: ${name}`); return p; }
  }
  console.log(`   ✗ Topilmadi. Qidirilgan: ${names.join(', ')}`);
  return null;
}

// ─── Asosiy parse ────────────────────────────────────────────────────────────
function parseQuestionsFile(filePath, answers) {
  const content = fs.readFileSync(filePath, 'utf8').replace(/\r/g, '');
  const blocks = [];
  let currentNum = null, currentLines = [];

  for (const line of content.split('\n')) {
    const m = line.match(/^(\d+)\.\s/);
    if (m) {
      if (currentNum !== null) blocks.push({ num: currentNum, lines: currentLines });
      currentNum = parseInt(m[1]);
      currentLines = [line];
    } else if (currentNum !== null) {
      currentLines.push(line);
    }
  }
  if (currentNum !== null) blocks.push({ num: currentNum, lines: currentLines });

  const questions = [];
  for (const block of blocks) {
    const { num, lines } = block;
    if (num < 1 || num > 150) continue;

    const blockText = lines.join('\n');
    const answerLetter = (answers[num - 1] || 'A').toUpperCase();

    const options = extractOptions(blockText);

    // Savol matni
    let questionText = blockText
      .replace(/^\d+\.\s*\*?\*?/, '')
      .replace(/\*\*/g, '')
      .replace(/^[ \t]*[A-D]\).*$/gm, '')
      .replace(/---+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // To'g'ri javob raqami
    const correctAnswerText = extractNumber(options[answerLetter]);

    questions.push({
      id: num,
      text: questionText,
      options: ['A','B','C','D'].map(l => ({ letter: l, text: options[l] || '' })).filter(o => o.text),
      answer: answerLetter,
      correctAnswerText,
      type: 'mcq'
    });
  }
  return questions;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function main() {
  console.log('📚 Savollar fayllarini parse qilish...\n');

  const FILES = {
    '5': {
      questions: ['5-sinf savollar 150 ta.mmd'],
      answers:   ['5-sinf 1-150 javoblar.mmd', '5-sinf javoblar.mmd']
    },
    '6': {
      questions: ['6-sinf savollar 150 ta.mmd'],
      answers:   ['6-sinf 1-150 savollar javobi.mmd', '6-sinf 1-150 javoblar.mmd']
    }
  };

  for (const sinf of ['5', '6']) {
    console.log(`📖 ${sinf}-sinf:`);
    const qFile = findFile(OLIMPIADA_DIR, FILES[sinf].questions);
    const aFile = findFile(OLIMPIADA_DIR, FILES[sinf].answers);

    if (!qFile || !aFile) { console.log(`   ⛔ O'tkazib yuborildi\n`); continue; }

    const answers   = parseAnswersFile(aFile);
    const questions = parseQuestionsFile(qFile, answers);
    const withOpts  = questions.filter(q => q.options.length >= 2).length;

    console.log(`   Javoblar: ${answers.length} | Savollar: ${questions.length} | Variantli: ${withOpts}`);

    fs.writeFileSync(path.join(OUTPUT_DIR, `questions-${sinf}.json`), JSON.stringify(questions, null, 2));
    fs.writeFileSync(path.join(OUTPUT_DIR, `answers-${sinf}.json`),   JSON.stringify(answers, null, 2));
    console.log(`   ✅ Saqlandi\n`);

    // Namunalar
    const q1  = questions[0];
    const q21 = questions.find(q => q.id === 21);
    if (q1)  console.log(`   1-savol variantlari: ${q1.options.map(o=>`${o.letter})${o.text.slice(0,12)}`).join(' | ')}`);
    if (q21) console.log(`   21-savol to'g'ri javob raqami: "${q21.correctAnswerText}" (harf: ${q21.answer})`);
    console.log('');
  }

  // Yordamchi fayllar
  const sp = path.join(OUTPUT_DIR, 'settings.json');
  const rp = path.join(OUTPUT_DIR, 'results.json');
  const ep = path.join(OUTPUT_DIR, 'sessions.json');
  if (!fs.existsSync(sp)) fs.writeFileSync(sp, JSON.stringify({testStartTime:null,testEndTime:null,isActive:false},null,2));
  if (!fs.existsSync(rp)) fs.writeFileSync(rp, JSON.stringify([],null,2));
  if (!fs.existsSync(ep)) fs.writeFileSync(ep, JSON.stringify({},null,2));

  console.log('✨ Parse jarayoni yakunlandi!');
}

main();
