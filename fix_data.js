const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');

function fixQuestions(filename) {
  const filePath = path.join(dataDir, filename);
  if (!fs.existsSync(filePath)) return;

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let fixedCount = 0;

  for (const q of data) {
    if (q.type === 'mcq' && q.options && q.options.length > 0) {
      // Ba'zi hollarda hamma variantlar A ni ichiga kirib qolgan:
      // "27500 B) 15700 C) 12500 D) 17500"
      // Yoki question text ichiga kirib qolgan

      const combinedText = q.options.map(o => o.letter + ') ' + o.text).join(' ');
      
      // Matn ichidan A) B) C) D) ni qidirib qayta ajratamiz
      const parts = [...combinedText.matchAll(/([A-D])\)\s*(.*?)(?=(?:[A-D]\)|$))/g)];
      
      if (parts.length >= 2) {
        const newOptions = parts.map(p => ({
          letter: p[1],
          text: p[2].trim()
        }));

        // Faqat o'zgarish bo'lsa yangilaymiz
        if (JSON.stringify(q.options) !== JSON.stringify(newOptions)) {
          q.options = newOptions;
          fixedCount++;
        }
      }
    }

    // Matn ichida qolib ketgan "A)" larni tozalash
    if (q.text) {
      q.text = q.text.replace(/\s*[A-D]\)\s*$/, '').trim();
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`✅ ${filename} faylida ${fixedCount} ta savol variantlari to'g'rilandi.`);
}

console.log('🔧 Savollardagi xatoliklarni tozalash boshlandi...');
fixQuestions('questions-5.json');
fixQuestions('questions-6.json');
console.log('🎉 Tozalash yakunlandi! Endi barcha variantlar alohida-alohida ajratilgan.');
