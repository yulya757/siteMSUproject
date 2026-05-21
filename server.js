const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { spawn } = require('child_process');
const multer = require('multer');

const app = express();
const PORT = 3000;

const DATA_DIR = path.join(__dirname, 'data');
const USERS_DIR = path.join(DATA_DIR, 'users');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

// Инициализация папок
[DATA_DIR, USERS_DIR, './uploads/news'].forEach(dir => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Настройка Multer
const newsStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/news'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const uploadNews = multer({ storage: newsStorage });
const uploadSession = multer({ storage: multer.memoryStorage() });

// Хелпер для управления сессиями
function saveSessionToken(token, nickname, name) {
    let sessions = {};
    if (fs.existsSync(SESSIONS_FILE)) {
        try { sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')); } catch (e) { sessions = {}; }
    }
    sessions[token] = { usernameDir: nickname.toLowerCase(), name: name, created: Date.now() };
    fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

// Хелпер для получения инфы о юзере по токену (ЗАМЕНА decodeToken)
function getSessionInfo(token) {
    if (!token || !fs.existsSync(SESSIONS_FILE)) return null;
    try {
        const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
        return sessions[token] || null;
    } catch (e) { return null; }
}

// --- API Роуты ---

app.get('/api/tasks', (req, res) => {
    if (!fs.existsSync(TASKS_FILE)) return res.status(404).json({ error: "Файл задач не найден" });
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf-8'));
    res.json(tasks);
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, nickname, pass, email, phone, birth } = req.body;
        const safeNick = nickname.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
        const userDir = path.join(USERS_DIR, safeNick);

        if (fs.existsSync(userDir)) return res.status(400).json({ success: false, error: 'Никнейм занят' });

        const hashedPassword = await bcrypt.hash(pass, 10);
        fs.mkdirSync(path.join(userDir, 'sessions'), { recursive: true });

        const userData = { nickname, name, password: hashedPassword, email, phone, birth_date: birth };
        fs.writeFileSync(path.join(userDir, 'profile.json'), JSON.stringify(userData, null, 2));
        
        const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
        saveSessionToken(token, safeNick, name);
        res.json({ success: true, token });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { login, pass } = req.body;
        const safeNick = login.toLowerCase().replace(/[^a-zA-Z0-9_]/g, '');
        const userDir = path.join(USERS_DIR, safeNick);
        const profilePath = path.join(userDir, 'profile.json');

        if (fs.existsSync(profilePath)) {
            const user = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
            if (await bcrypt.compare(pass, user.password)) {
                const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
                saveSessionToken(token, safeNick, user.name);
                return res.json({ success: true, token });
            }
        }
        res.status(401).json({ success: false, error: 'Неверные данные' });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.post('/api/save-session', uploadSession.array('voice_records'), (req, res) => {
    try {
        const { answer, taskId, token } = req.body;
        const sessionInfo = getSessionInfo(token);

        if (!sessionInfo) return res.status(401).json({ error: "Требуется авторизация" });

        const safeNick = sessionInfo.usernameDir;
        const timestamp = Date.now();
        const sessionDir = path.join(USERS_DIR, safeNick, 'sessions', `s_${timestamp}_task${taskId}`);
        
        fs.mkdirSync(sessionDir, { recursive: true });
        fs.writeFileSync(path.join(sessionDir, 'answer.txt'), answer || '');

        if (req.files) {
            req.files.forEach((file, i) => {
                fs.writeFileSync(path.join(sessionDir, `voice_${i+1}.wav`), file.buffer);
            });
        }
        res.json({ success: true, sessionId: timestamp });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ПОЛНОСТЬЮ РАБОЧИЙ СПИСОК СЕССИЙ
app.get('/api/user/sessions-list', (req, res) => {
    try {
        const token = req.query.token;
        const sessionInfo = getSessionInfo(token);

        if (!sessionInfo) return res.status(401).json({ error: "Не авторизован" });

        const username = sessionInfo.usernameDir;
        const userSessionsDir = path.join(USERS_DIR, username, 'sessions');

        if (!fs.existsSync(userSessionsDir)) return res.json([]);

        const sessionFolders = fs.readdirSync(userSessionsDir);
        
        const allSessions = sessionFolders.map(folder => {
            const folderPath = path.join(userSessionsDir, folder);
            if (!fs.lstatSync(folderPath).isDirectory()) return null;

            const txtPath = path.join(folderPath, 'answer.txt');
            const textContent = fs.existsSync(txtPath) ? fs.readFileSync(txtPath, 'utf8') : "Текст отсутствует";

            const parts = folder.split('_');
            const timestamp = parts[1] ? parseInt(parts[1]) : Date.now();
            const taskId = parts[2] || "unknown";

            // Ищем аудио файлы в папке
            const files = fs.readdirSync(folderPath)
                .filter(f => f.endsWith('.wav'))
                .map(f => ({ name: f, isTranscribed: fs.existsSync(path.join(folderPath, f + '.txt')) }));

            return {
                taskId: taskId,
                timestamp: timestamp,
                answerText: textContent,
                files: files
            };
        }).filter(Boolean);

        res.json(allSessions);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

app.post('/api/check-auth', (req, res) => {
    const session = getSessionInfo(req.body.token);
    res.json(session ? { authorized: true, name: session.name } : { authorized: false });
});

// Новости (оставил без изменений, они рабочие)
app.get('/api/news', (req, res) => {
    try {
        const news = fs.existsSync(NEWS_FILE) ? JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8')) : [];
        res.json(news);
    } catch (e) { res.status(500).json({ error: "Ошибка новостей" }); }
});

app.post('/api/news', uploadNews.single('image'), (req, res) => {
    try {
        const { title, content } = req.body;
        let news = fs.existsSync(NEWS_FILE) ? JSON.parse(fs.readFileSync(NEWS_FILE, 'utf-8')) : [];
        news.unshift({
            id: Date.now(),
            date: new Date().toLocaleDateString('ru-RU'),
            title, content,
            image: req.file ? `/uploads/news/${req.file.filename}` : null
        });
        fs.writeFileSync(NEWS_FILE, JSON.stringify(news, null, 2));
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.get('/:page', (req, res, next) => {
    const filePath = path.join(__dirname, 'public', `${req.params.page}.html`);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else next();
});

app.listen(PORT, () => {
    console.log(`>>> Сервер CreativityLab запущен: http://localhost:${PORT}`);
    const pythonPath = path.join(__dirname, 'venv', 'Scripts', 'python.exe');
    if (fs.existsSync(pythonPath)) {
        spawn('cmd.exe', ['/c', 'start', pythonPath, 'worker.py'], { detached: true, stdio: 'ignore', cwd: __dirname }).unref();
    }
});