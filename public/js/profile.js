let sessionsData = [];

async function loadProfile() {
    const token = localStorage.getItem('authToken');
    if (!token) { window.location.href = 'login.html'; return; }

    try {
        const res = await fetch(`/api/user/sessions-list?token=${token}`);
        sessionsData = await res.json();
        
        console.log("Данные от сервера:", sessionsData); // ОТКРОЙ КОНСОЛЬ (F12), чтобы увидеть структуру!

        const sidebar = document.getElementById('sessionsSidebar');
        const content = document.getElementById('sessionDetail');
        
        if (!sessionsData || sessionsData.length === 0) {
            sidebar.innerHTML = '<p style="padding:20px; opacity:0.5;">Сессий не найдено</p>';
            return;
        }

        // Рендерим вкладки с проверкой имен полей
        sidebar.innerHTML = sessionsData.map((s, index) => {
            // Если сервер прислал время в s.date вместо s.timestamp, используем его
            const rawDate = s.timestamp || s.date || Date.now();
            const dateObj = new Date(rawDate);
            
            // Если taskId нет, пишем "Без номера"
            const taskNum = s.taskId || s.id || "б/н";

            return `
                <div class="session-tab" onclick="showSession(${index})">
                    <div class="tab-date">${isNaN(dateObj) ? 'Дата не указана' : dateObj.toLocaleDateString()}</div>
                    <div class="tab-time">${isNaN(dateObj) ? '' : dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    <div class="tab-task">Задача #${taskNum}</div>
                </div>
            `;
        }).join('');

        showSession(0);

    } catch (e) {
        console.error('Критическая ошибка:', e);
    }
}

function showSession(index) {
    const s = sessionsData[index];
    const content = document.getElementById('sessionDetail');
    
    document.querySelectorAll('.session-tab').forEach((t, i) => {
        t.classList.toggle('active', i === index);
    });

    // Тут тоже добавляем проверки: пробуем разные варианты имен полей (answerText, text, content)
    const textResult = s.answerText || s.text || s.content || "Текстовый ответ не найден в данных сессии.";
    const taskNum = s.taskId || s.id || "б/н";

    content.innerHTML = `
        <div class="detail-card">
            <div class="detail-header">
                <h2>Результаты сессии</h2>
                <span class="detail-task-id">Задача #${taskNum}</span>
            </div>
            
            <div class="detail-section">
                <h3>Ваш ответ:</h3>
                <div class="text-answer-box">${textResult}</div>
            </div>

            <div class="detail-section">
                <h3>Файлы:</h3>
                <div class="files-list">
                    ${(s.files && s.files.length > 0) ? s.files.map(f => `
                        <div class="file-row">🎙 ${f.name || 'Аудио'} — ${f.isTranscribed ? 'Готово' : 'В обработке'}</div>
                    `).join('') : '<p style="opacity:0.5">Файлов нет</p>'}
                </div>
            </div>
        </div>
    `;
}

function logout() {
    localStorage.removeItem('authToken');
    window.location.href = 'index.html';
}

document.addEventListener('DOMContentLoaded', loadProfile);