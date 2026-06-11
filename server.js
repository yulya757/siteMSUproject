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

// Хелпер для получения инфы о юзере по токену
function getSessionInfo(token) {
    if (!token || !fs.existsSync(SESSIONS_FILE)) return null;
    try {
        const sessions = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8'));
        return sessions[token] || null;
    } catch (e) { return null; }
}

// ==========================================
// СИСТЕМА ОЧЕРЕДИ ДЛЯ PYTHON-ВОРКЕРА
// ==========================================

// Хелперы для работы с метаданными анализа
function getAnalysisMetaPath(sessionDir) {
    return path.join(sessionDir, 'analysis_meta.json');
}

function saveAnalysisMeta(sessionDir, meta) {
    const metaPath = getAnalysisMetaPath(sessionDir);
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
}

function loadAnalysisMeta(sessionDir) {
    const metaPath = getAnalysisMetaPath(sessionDir);
    if (fs.existsSync(metaPath)) {
        try {
            return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        } catch (e) {
            console.error(`[!] Ошибка чтения analysis_meta.json для ${sessionDir}:`, e);
            return null;
        }
    }
    return null;
}

const analyzeQueue = [];
let isProcessing = false;

function processNextInQueue() {
    if (analyzeQueue.length === 0) {
        isProcessing = false;
        console.log("[ОЧЕРЕДЬ] Все сессии успешно обработаны.");
        return;
    }

    isProcessing = true;
    const sessionPath = analyzeQueue.shift();

    console.log(`[ОЧЕРЕДЬ] Запуск Python-скрипта для: ${sessionPath}`);

    const pythonPath = path.join(__dirname, 'venv', 'Scripts', 'python.exe');
    const scriptPath = path.join(__dirname, 'worker.py');
    
    const useVenv = fs.existsSync(pythonPath);
    const pyCmd = useVenv ? pythonPath : 'python';

    console.log(`[ПРЯМОЙ ЗАПУСК PYTHON]: ${pyCmd}`);

    // Прямой запуск без cmd.exe и PowerShell
    const workerProcess = spawn(pyCmd, [scriptPath, sessionPath], {
        stdio: 'inherit' // Логи Питона пойдут прямо в консоль Node.js
    });

    workerProcess.on('close', (code) => {
        console.log(`[ОЧЕРЕДЬ] Python-скрипт завершил работу (код ${code}). Переходим к следующей.`);
        processNextInQueue();
    });

    workerProcess.on('error', (err) => {
        console.error(`[ОЧЕРЕДЬ КРИТИЧЕСКАЯ ОШИБКА]:`, err);
        processNextInQueue(); // Переходим дальше, чтобы очередь не застопорилась
    });
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

// ОБНОВЛЕННЫЙ РОУТ СОХРАНЕНИЯ СЕССИИ
app.post('/api/save-session', uploadSession.array('voice_records'), (req, res) => {
    try {
        // Добавили приём taskText из тела запроса (FormData)
        const { answer, taskId, token, taskText } = req.body; 
        const sessionInfo = getSessionInfo(token);

        if (!sessionInfo) return res.status(401).json({ error: "Требуется авторизация" });

        const safeNick = sessionInfo.usernameDir;
        const timestamp = Date.now();
        const sessionDir = path.join(USERS_DIR, safeNick, 'sessions', `s_${timestamp}_task${taskId}`);
        
        fs.mkdirSync(sessionDir, { recursive: true });
        fs.writeFileSync(path.join(sessionDir, 'answer.txt'), answer || '');
        
        // СОХРАНЯЕМ ТЕКСТ ЗАДАЧИ В СЕССИЮ
        fs.writeFileSync(path.join(sessionDir, 'task_text.txt'), taskText || ''); 

        const initialMeta = {
            status: 'queued',
            queuedAt: timestamp,
            lastAttemptAt: null,
            retryCount: 0,
            lastError: null
        };
        saveAnalysisMeta(sessionDir, initialMeta);
        console.log(`[МЕТАДАННЫЕ] Создан initialMeta.json для сессии: ${sessionDir}`);

        if (req.files) {
            req.files.forEach((file, i) => {
                fs.writeFileSync(path.join(sessionDir, `voice_${i+1}.wav`), file.buffer);
            });
        }

        // Запуск Python-скрипта через очередь
        analyzeQueue.push(sessionDir);
        console.log(`[ДОБАВЛЕНО] Сессия ${timestamp} встала в очередь. Всего в очереди: ${analyzeQueue.length}`);
        
        if (!isProcessing) {
            processNextInQueue();
        }

        res.json({ success: true, sessionId: timestamp, status: initialMeta.status });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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

            const files = fs.readdirSync(folderPath)
                .filter(f => f.endsWith('.wav'))
                .map(f => ({ name: f, isTranscribed: fs.existsSync(path.join(folderPath, f + '.txt')) }));

            const analysisPath = path.join(folderPath, 'ai_analysis.json');
            let analysisData = null;
            
            if (fs.existsSync(analysisPath)) {
                try { analysisData = JSON.parse(fs.readFileSync(analysisPath, 'utf-8')); } catch(e) {}
            }

            const metaData = loadAnalysisMeta(folderPath);

            return {
                taskId: taskId,
                timestamp: timestamp,
                answerText: textContent,
                files: files,
                analysis: analysisData ? analysisData.analysis : null,
                isDone: !!analysisData, 
                status: metaData ? metaData.status : (
                    analysisData ?  "done" : "unknow"
                ),
                lastError: metaData ? metaData.lastError : null,
                queuedAt: metaData ? metaData.queuedAt : null,
                lastAttemptAt: metaData ? metaData.lastAttemptAt : null,
                retryCount: metaData ? metaData.retryCount : 0
            };
        }).filter(Boolean);

        res.json(allSessions);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: "Ошибка сервера" });
    }
});

app.post('/api/retry_session', (req, res) => {
    try {
        const { sessionId, token } = req.body;
        const sessionInfo = getSessionInfo(token);

        if (!sessionInfo) return res.status(401).json({ error: "Не авторизован" });

        const username = sessionInfo.usernameDir;
        const userSessionsDir = path.join(USERS_DIR, username, 'sessions');
        if (!fs.existsSync(userSessionsDir)) return res.status(404).json({ error: "Папка пользователя не найдена" });

        let targetSessionDir = null;
        const sessionFolders = fs.readdirSync(userSessionsDir);
        for (const folder of sessionFolders) {
            if (folder.includes(`s_${sessionId}_`)) {
                targetSessionDir = path.join(userSessionsDir, folder);
                break;
            }
        }

        if (!targetSessionDir) return res.status(404).json({ error: "Сессия не найдена" });

        const meta = loadAnalysisMeta(targetSessionDir);
        if (!meta) return res.status(404).json({ error: "Метаданные сессии не найдены" });

        meta.status = 'queued';
        meta.lastError = null;
        meta.queuedAt = Date.now();
        meta.retryCount = (meta.retryCount || 0) + 1;
        saveAnalysisMeta(targetSessionDir, meta);

        analyzeQueue.push(targetSessionDir);
        console.log(`[ПОВТОР] Сессия ${sessionId} добавлена в очередь на повторную обработку. Всего в очереди: ${analyzeQueue.length}`);
        if (!isProcessing) {
            processNextInQueue();
        }
        res.json({ success: true });

    } catch (e) {
        console.error("[!] Ошибка при повторной постановке сессии в очередь:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/check-auth', (req, res) => {
    const session = getSessionInfo(req.body.token);
    res.json(session ? { authorized: true, name: session.name } : { authorized: false });
});

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

// Получение данных профиля пользователя
app.get('/api/user/profile', (req, res) => {
    try {
        const token = req.query.token;
        const sessionInfo = getSessionInfo(token);

        if (!sessionInfo) return res.status(401).json({ error: "Не авторизован" });

        const safeNick = sessionInfo.usernameDir;
        const profilePath = path.join(USERS_DIR, safeNick, 'profile.json');

        if (!fs.existsSync(profilePath)) return res.status(404).json({ error: "Профиль не найден" });

        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));
        // Пароль наружу не отдаем в целях безопасности
        delete profile.password; 

        res.json(profile);
    } catch (e) {
        res.status(500).json({ error: "Ошибка сервера при получении профиля" });
    }
});

// Обновление/сохранение измененных данных профиля
app.post('/api/user/profile', (req, res) => {
    try {
        const { token, name, email, phone, birth_date } = req.body;
        const sessionInfo = getSessionInfo(token);

        if (!sessionInfo) return res.status(401).json({ error: "Не авторизован" });

        const safeNick = sessionInfo.usernameDir;
        const profilePath = path.join(USERS_DIR, safeNick, 'profile.json');

        if (!fs.existsSync(profilePath)) return res.status(404).json({ error: "Профиль не найден" });

        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf-8'));

        // Обновляем поля, если они переданы
        if (name !== undefined) profile.name = name;
        if (email !== undefined) profile.email = email;
        if (phone !== undefined) profile.phone = phone;
        if (birth_date !== undefined) profile.birth_date = birth_date;

        fs.writeFileSync(profilePath, JSON.stringify(profile, null, 2));
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Ошибка сервера при сохранении профиля" });
    }
});

app.get('/:page', (req, res, next) => {
    const filePath = path.join(__dirname, 'public', `${req.params.page}.html`);
    if (fs.existsSync(filePath)) res.sendFile(filePath);
    else next();
});

app.listen(PORT, () => {
    console.log(`>>> Сервер CreativityLab запущен: http://localhost:${PORT}`);
});