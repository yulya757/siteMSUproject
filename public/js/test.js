(() => {
    const API_GET_TASKS = '/api/tasks';
    const API_SAVE_SESSION = '/api/save-session';
    const API_SESSIONS_LIST = '/api/user/sessions-list'; // Эндпоинт для проверки статуса

    const taskIdBtn = document.getElementById('taskIdBtn');
    const taskTitle = document.getElementById('taskTitle');
    const taskText = document.getElementById('taskText');
    const taskAuthor = document.getElementById('taskAuthor');
    const answerArea = document.getElementById('answerArea');
    const recList = document.getElementById('recordingsList');
    const startRecBtn = document.getElementById('startRec');
    const stopRecBtn = document.getElementById('stopRec');
    const submitBtn = document.getElementById('submitAnswer');
    const taskCard = document.getElementById('taskCard');

    let tasks = [];
    let currentTask = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let voiceBlobs = [];

    // Создаем красивый overlay-лоадер динамически, чтобы не править HTML
    const loaderOverlay = document.createElement('div');
    loaderOverlay.id = 'analysisLoader';
    loaderOverlay.style = `
        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
        background: rgba(0, 0, 0, 0.85); color: #fff; display: none;
        flex-direction: column; align-items: center; justify-content: center;
        z-index: 9999; font-family: sans-serif; transition: all 0.3s ease;
    `;
    loaderOverlay.innerHTML = `
        <div class="spinner" style="width: 50px; height: 50px; border: 5px solid #333; border-top: 5px solid #00fff2; border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 20px;"></div>
        <h2 id="loaderTitle" style="margin: 0 0 10px 0; font-weight: 600; color: #00fff2;">Обработка сессии...</h2>
        <p id="loaderStatus" style="margin: 0; color: #ccc; font-size: 1.1rem;">Инициализация воркера...</p>
        <style> @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } } </style>
    `;
    document.body.appendChild(loaderOverlay);

    async function loadTasks() {
        try {
            const response = await fetch(API_GET_TASKS);
            if (!response.ok) throw new Error(`Ошибка сервера: ${response.status}`);
            tasks = await response.json();
            if (tasks.length > 0) pickRandomTask();
            else if (taskText) taskText.textContent = "Список задач пуст.";
        } catch (e) {
            console.error("Не удалось загрузить задачи:", e);
            if (taskText) taskText.textContent = "Ошибка загрузки задач.";
        }
    }

    function pickRandomTask() {
        if (!tasks.length) return;
        const randomIndex = Math.floor(Math.random() * tasks.length);
        renderTask(tasks[randomIndex]);
    }

    function renderTask(task) {
        currentTask = task;
        if (taskIdBtn) taskIdBtn.textContent = `Задача №${task.id || '?'}`;
        if (taskTitle) taskTitle.textContent = task['Название'] || 'Без названия';
        if (taskText) taskText.textContent = task['Текст задачи'] || '';
        if (taskAuthor) taskAuthor.textContent = 'Автор: ' + (task['Автор'] || 'Неизвестен');
        if (taskCard) taskCard.classList.add('show');
    }

    if (startRecBtn && stopRecBtn) {
        startRecBtn.onclick = async () => {
            if (voiceBlobs.length >= 5) return alert("Максимум 5 записей");
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                mediaRecorder.ondataavailable = e => { if (e.data.size > 0) audioChunks.push(e.data); };
                mediaRecorder.onstop = () => {
                    const blob = new Blob(audioChunks, { type: 'audio/wav' });
                    voiceBlobs.push(blob);
                    renderRecordings();
                    stream.getTracks().forEach(track => track.stop());
                };
                mediaRecorder.start();
                startRecBtn.style.display = 'none';
                stopRecBtn.style.display = 'inline-block';
            } catch (err) { alert("Микрофон не доступен."); }
        };
        stopRecBtn.onclick = () => {
            if (mediaRecorder && mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
                startRecBtn.style.display = 'inline-block';
                stopRecBtn.style.display = 'none';
            }
        };
    }

    function renderRecordings() {
        if (!recList) return;
        recList.innerHTML = voiceBlobs.map((blob, i) => {
            const url = URL.createObjectURL(blob);
            return `
            <div class="rec-item" style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; background: #eee; padding: 5px; border-radius: 8px;">
                <span style="font-size:0.8rem;">#${i+1}</span>
                <audio controls src="${url}" style="height:30px; flex:1;"></audio>
                <button onclick="window.deleteRec(${i})" style="border:none; background:transparent; cursor:pointer;">❌</button>
            </div>`;
        }).join('');
    }

    window.deleteRec = (index) => { voiceBlobs.splice(index, 1); renderRecordings(); };

    // Функция поллинга (дёргаем статус анализа с сервера)
    function startPollingStatus(token, targetTimestamp) {
        const statusElement = document.getElementById('loaderStatus');
        
        const intervalId = setInterval(async () => {
            try {
                // Запрашиваем список сессий текущего юзера
                const res = await fetch(`${API_SESSIONS_LIST}?token=${encodeURIComponent(token)}`);
                if (!res.ok) return;
                
                const sessions = await res.json();
                // Находим нашу текущую отправленную сессию по её timestamp
                const currentSession = sessions.find(s => s.timestamp === targetTimestamp);
                
                if (!currentSession) {
                    statusElement.textContent = "Поиск сессии в очереди...";
                    return;
                }

                // Логика изменения текста статуса в зависимости от прогресса Python-скрипта
                if (currentSession.analysis) {
                    // Анализ готов!
                    statusElement.innerHTML = "<span style='color: #00fff2;'>Анализ завершен! Перенаправление...</span>";
                    clearInterval(intervalId);
                    setTimeout(() => {
                        window.location.href = '/profile';
                    }, 1500);
                } else {
                    // Анализ еще не записан, смотрим на аудиофайлы
                    const totalFiles = currentSession.files.length;
                    const transcribedFiles = currentSession.files.filter(f => f.isTranscribed).length;

                    if (totalFiles > 0 && transcribedFiles < totalFiles) {
                        statusElement.textContent = `Транскрибация аудио: расшифровано ${transcribedFiles} из ${totalFiles}...`;
                    } else {
                        statusElement.textContent = "Аудио готово. Нейросеть генерирует анализ креативности...";
                    }
                }
            } catch (err) {
                console.error("Ошибка при опросе статуса:", err);
            }
        }, 3000); // Опрос каждые 3 секунды, чтобы не перегружать Node.js
    }

    if (submitBtn) {
        submitBtn.onclick = async () => {
            const token = localStorage.getItem('authToken');
            if (!token) return alert("Войдите в аккаунт, чтобы сохранить решение!");

            const textAnswer = answerArea ? answerArea.value.trim() : '';
            if (!textAnswer && voiceBlobs.length === 0) return alert("Пустое решение!");

            submitBtn.disabled = true;
            submitBtn.textContent = "Сохранение...";

            const formData = new FormData();
            formData.append('token', token);
            formData.append('taskId', currentTask?.id || 'unknown');
            formData.append('answer', textAnswer);
            
            voiceBlobs.forEach((blob, i) => {
                formData.append('voice_records', blob, `voice_${i+1}.wav`);
            });

            try {
                const res = await fetch(API_SAVE_SESSION, { method: 'POST', body: formData });
                const data = await res.json();
                
                if (data.success && data.sessionId) {
                    // Включаем лоадер вместо мгновенного редиректа
                    loaderOverlay.style.display = 'flex';
                    document.getElementById('loaderStatus').textContent = "Сессия поставлена в очередь сервера...";
                    
                    // Запускаем бесконечную проверку статуса конкретно для этой сессии
                    startPollingStatus(token, data.sessionId);
                } else {
                    alert("Ошибка: " + data.error);
                    submitBtn.disabled = false;
                    submitBtn.textContent = "Отправить решение";
                }
            } catch (e) { 
                alert("Ошибка связи с сервером."); 
                submitBtn.disabled = false; 
                submitBtn.textContent = "Отправить решение"; 
            }
        };
    }

    document.addEventListener('DOMContentLoaded', loadTasks);
})();