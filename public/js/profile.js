let sessionsData = [];

async function loadProfile() {
    const token = localStorage.getItem('authToken');
    if (!token) { window.location.href = 'login.html'; return; }

    try {
        const res = await fetch(`/api/user/sessions-list?token=${token}`);
        sessionsData = await res.json();
        
        renderSidebar();
        
        // Если есть сессии, которые еще "не готовы" (isDone false или analysis null), 
        // запускаем цикл опроса
        const hasUnfinished = sessionsData.some(s => !s.isDone);
        if (hasUnfinished) {
            setTimeout(loadProfile, 3000); 
        }
    } catch (e) {
        console.error('Ошибка загрузки:', e);
    }
}

function renderSidebar() {
    const sidebar = document.getElementById('sessionsSidebar');
    if (!sessionsData || sessionsData.length === 0) {
        sidebar.innerHTML = '<p style="padding:20px; opacity:0.5;">Сессий не найдено</p>';
        return;
    }

    sidebar.innerHTML = sessionsData.map((s, index) => {
        const dateObj = new Date(s.timestamp || Date.now());
        const taskNum = s.taskId || "б/н";
        const status = s.isDone ? "✅" : "⏳";

        return `
            <div class="session-tab" onclick="showSession(${index})">
                <div class="tab-date">${dateObj.toLocaleDateString()} ${status}</div>
                <div class="tab-time">${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                <div class="tab-task">Задача #${taskNum}</div>
            </div>
        `;
    }).join('');
}

function showSession(index) {
    const s = sessionsData[index];
    const content = document.getElementById('sessionDetail');
    
    document.querySelectorAll('.session-tab').forEach((t, i) => {
        t.classList.toggle('active', i === index);
    });

    const analysis = s.analysis || "Анализ еще в обработке или не найден...";
    const taskNum = s.taskId || "б/н";

    content.innerHTML = `
        <div class="detail-card">
            <div class="detail-header">
                <h2>Результаты сессии</h2>
                <span class="detail-task-id">Задача #${taskNum}</span>
            </div>
            
            <div class="detail-section">
                <h3>Текстовый ответ:</h3>
                <div class="text-answer-box">${s.answerText || 'Нет данных'}</div>
            </div>

            <div class="detail-section">
                <h3>Анализ нейросети:</h3>
                <div class="text-answer-box" style="background: #f0f7ff; border: 1px solid #cce5ff;">
                    ${analysis}
                </div>
            </div>

            <div class="detail-section">
                <h3>Файлы:</h3>
                <div class="files-list">
                    ${(s.files && s.files.length > 0) ? s.files.map(f => `
                        <div class="file-row">🎙 ${f.name} — ${f.isTranscribed ? 'Транскрибировано' : '...'}</div>
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