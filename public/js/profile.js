let sessionsData = [];

// Вспомогательная функция для получения текстового описания статуса
function statusTextForDetail(status) {
    switch (status) {
        case 'queued': return 'В очереди';
        case 'processing': return 'В обработке';
        case 'done': return 'Готово';
        case 'error': return 'Ошибка';
        default: return 'Неизвестно';
    }
}


async function loadProfile() {
    const token = localStorage.getItem('authToken');
    if (!token) { window.location.href = 'login.html'; return; }

    try {
        const res = await fetch(`/api/user/sessions-list?token=${token}`);
        sessionsData = await res.json();
        
        renderSidebar();
        
        const urlParams = new URLSearchParams(window.location.search);
        const targetSessionId = urlParams.get('sessionId');
        if (targetSessionId) {
            const targetIndex = sessionsData.findIndex(s => s.timestamp == targetSessionId);
            if (targetIndex !== -1) {
                showSession(targetIndex);
            } else {
                console.warn(`Сессия с ID ${targetSessionId} не найдена.`);
                if (sessionsData.length > 0) {
                    showSession(0); // Показываем первую сессию, если указанная не найдена
                }
            }
        } else if (sessionsData.length > 0) {
            showSession(0); // Показываем первую сессию по умолчанию
        }
        

        // Если есть сессии, которые еще "не готовы" (isDone false или analysis null), 
        // запускаем цикл опроса
        const hasUnfinished = sessionsData.some(s => s.status !== 'done' && s.status !== 'error');;
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
        let statusText = '';
        let statusClass = '';
        switch(s.status) {
            case 'queued':
                statusText = 'В очереди';
                statusClass = 'status-queued';
                break;
            case 'processing':
                statusText = 'В обработке';
                statusClass = 'status-processing';
                break;
            case 'done':
                statusText = 'Готово';
                statusClass = 'status-done';
                break;  
            case 'error':
                statusText = 'Ошибка';
                statusClass = 'status-error';
                break;
            default:
                statusText = s.isDone ? 'Готово' : 'Неизвестно';
                statusClass = s.isDone ? 'status-done' : '';
        }

        return `
            <div class="session-tab" onclick="showSession(${index})">
                <div class="tab-date">${dateObj.toLocaleDateString()} <span class="status-badge ${statusClass}">${statusText}</span></div>
                <div class="tab-time">${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                <div class="tab-task">Задача ${taskNum}</div>
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
                <span class="detail-task-id">Задача ${taskNum}</span>
            </div>
            
            <div class="detail-section" style="margin-top: 20px;">
                <h3>Статус обработки: <span class="status-badge status-${s.status}">${statusTextForDetail(s.status)}</span></h3>
                ${s.lastError ? `
                    <div class="error-block">
                        <p><strong>⚠️ Ошибка при обработке:</strong></p>
                        <p>${s.lastError}</p>
                        <button class="retry-button" onclick="retrySession(${s.timestamp})">Запустить снова</button>
                    </div>
                ` : ''}
                ${s.status === 'queued' ? `<p style="margin-top:10px; color:#666;">Сессия ожидает обработки в очереди.</p>` : ''}
                ${s.status === 'processing' ? `<p style="margin-top:10px; color:#666;">Сессия сейчас обрабатывается. Обновится автоматически.</p>` : ''}
            </div>

            <div class="detail-section" >
                <h3>Текстовый ответ:</h3>
                <div class="text-answer-box">${s.answerText || 'Нет данных'}</div>
            </div>
            ${(() => {
                let analysisBoxStyle = "";
                let analysisBorderColor = "";

                switch (s.status) {
                    case 'queued':
                        analysisBoxStyle = 'background: #fff8e1;'; // Светло-желтый
                        analysisBorderColor = 'border: 1px solid #ffecb3;';
                        break;
                    case 'processing':
                        analysisBoxStyle = 'background: #e3f2fd;'; // Светло-голубой
                        analysisBorderColor = 'border: 1px solid #bbdefb;';
                        break;
                    case 'done':
                        analysisBoxStyle = 'background: #e8f5e9;'; // Светло-зеленый
                        analysisBorderColor = 'border: 1px solid #c8e6c9;';
                        break;
                    case 'error':
                        analysisBoxStyle = 'background: #ffebee;'; // Светло-красный (как блок ошибки)
                        analysisBorderColor = 'border: 1px solid #ffcdd2;';
                        break;
                    default:
                        analysisBoxStyle = 'background: #f9f9f9;'; // Дефолтный
                        analysisBorderColor = 'border: 1px solid #eee;';
                }

                return `
            <div class="detail-section">
                <h3>Анализ нейросети:</h3>
                <div class="text-answer-box" style="${analysisBoxStyle} ${analysisBorderColor}">
                    ${analysis}
                </div>
            </div>`;
            })()}

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

// Функция для повторной постановки сессии в очередь
async function retrySession(sessionId) {
    const token = localStorage.getItem('authToken');
    if (!token) { alert('Вы не авторизованы.'); return; }

    if (!confirm('Вы уверены, что хотите запустить анализ этой сессии снова?')) {
        return; // Отмена действия
    }

    try {
        const res = await fetch('/api/retry-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: sessionId, token: token })
        });
        const data = await res.json();

        if (data.success) {
            alert('Сессия успешно поставлена в очередь на повторный анализ!');
            loadProfile(); // Перезагружаем профиль, чтобы обновить статус
        } else {
            alert('Ошибка при повторной постановке в очередь: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (e) {
        console.error('Ошибка retrySession:', e);
        alert('Ошибка связи с сервером при попытке повторного запуска.');
    }
}

// Глобально делаем функцию доступной для HTML
window.retrySession = retrySession;
