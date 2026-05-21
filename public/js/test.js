(() => {
    const API_GET_TASKS = '/api/tasks';
    const API_SAVE_SESSION = '/api/save-session';

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

    if (submitBtn) {
        submitBtn.onclick = async () => {
            const token = localStorage.getItem('authToken'); // Проверяем токен
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
                formData.append('voice_records', blob, `voice_${i}.wav`);
            });

            try {
                const res = await fetch(API_SAVE_SESSION, { method: 'POST', body: formData });
                const data = await res.json();
                if (data.success) {
                    alert("Решение сохранено в ваш профиль!");
                    window.location.href = '/profile'; // Уходим в профиль
                } else {
                    alert("Ошибка: " + data.error);
                }
            } catch (e) { alert("Ошибка связи с сервером."); }
            finally { submitBtn.disabled = false; submitBtn.textContent = "Отправить решение"; }
        };
    }

    document.addEventListener('DOMContentLoaded', loadTasks);
})();