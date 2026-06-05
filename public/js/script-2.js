const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const dbFile = './problems.db';
const jsonFile = './tasks.json';

const db = new sqlite3.Database(dbFile, sqlite3.OPEN_READONLY, (err) => {
  if (err) return console.error('Ошибка при открытии базы:', err.message);
  console.log('База открыта:', dbFile);
});

db.all('SELECT * FROM tasks', [], (err, rows) => {
  if (err) {
    console.error('Ошибка при чтении таблицы:', err.message);
    return;
  }

  fs.writeFileSync(jsonFile, JSON.stringify(rows, null, 2), 'utf-8');
  console.log(`Экспортировано ${rows.length} задач в ${jsonFile}`);

  db.close();
});
