let sessionsData = [];
let profileData = null; // Сюда сохраняем данные из profile.json
let currentView = null;  // Хранит текущее состояние экрана: 'profile' или индекс сессии (0, 1, 2...)

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
        // 1. Параллельно загружаем профиль пользователя (только один раз при инициализации)
        if (!profileData) {
            const profileRes = await fetch(`/api/user/profile?token=${token}`);
            if (profileRes.ok) {
                profileData = await profileRes.json();
            } else {
                console.error('Не удалось загрузить данные профиля');
            }
        }

        // 2. Загружаем список сессий
        const res = await fetch(`/api/user/sessions-list?token=${token}`);
        sessionsData = await res.json();
        
        renderSidebar();
        
<<<<<<< HEAD
        // 3. Определяем, что выводить на экран (только при первом заходе)
        if (currentView === null) {
            const urlParams = new URLSearchParams(window.location.search);
            const targetSessionId = urlParams.get('sessionId');
            
            if (targetSessionId) {
                const targetIndex = sessionsData.findIndex(s => s.timestamp == targetSessionId);
                if (targetIndex !== -1) {
                    showSession(targetIndex);
                } else if (sessionsData.length > 0) {
                    showSession(0);
                } else {
                    showProfileForm();
                }
            } else {
                // По умолчанию открываем форму редактирования профиля
                showProfileForm();
            }
        } else {
            // Если это фоновое автообновление (poll), обновляем только открытую сессию
            if (typeof currentView === 'number') {
                showSession(currentView, true); // true передаем, чтобы не скроллить и не сбивать фокус
            }
        }
        
        // Если есть сессии, которые еще "не готовы", запускаем цикл опроса
        const hasUnfinished = sessionsData.some(s => s.status !== 'done' && s.status !== 'error');
=======
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
>>>>>>> 070bc9ad0fa55aaa1e1d959d4b7f4040fe0143f6
        if (hasUnfinished) {
            setTimeout(loadProfile, 3000); 
        }
    } catch (e) {
        console.error('Ошибка загрузки:', e);
    }
}

function renderSidebar() {
    const sidebar = document.getElementById('sessionsSidebar');
    if (!sidebar) return;

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
<<<<<<< HEAD

        // Добавляем класс active, если эта вкладка сейчас выбрана
        const isActive = (currentView === index) ? 'active' : '';

        return `
            <div class="session-tab ${isActive}" onclick="showSession(${index})">
=======

        return `
            <div class="session-tab" onclick="showSession(${index})">
>>>>>>> 070bc9ad0fa55aaa1e1d959d4b7f4040fe0143f6
                <div class="tab-date">${dateObj.toLocaleDateString()} <span class="status-badge ${statusClass}">${statusText}</span></div>
                <div class="tab-time">${dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                <div class="tab-task">Задача ${taskNum}</div>
            </div>
        `;
    }).join('');
}

// Отображение формы редактирования личных данных
function showProfileForm() {
    currentView = 'profile';
    const content = document.getElementById('sessionDetail');
    const profileTab = document.getElementById('profileTab');

    // Управляем подсветкой активных элементов навигации
    if (profileTab) profileTab.classList.add('active');
    document.querySelectorAll('#sessionsSidebar .session-tab').forEach(t => t.classList.remove('active'));

    if (!profileData) {
        content.innerHTML = `
            <div class="detail-card">
                <p style="opacity:0.5">Ошибка загрузки профиля или файл отсутствует...</p>
            </div>`;
        return;
    }

    content.innerHTML = `
        <div class="detail-card">
            <div class="detail-header">
                <h2>Личные данные аккаунта</h2>
                <p style="color: #666; margin-top: 5px;">Здесь вы можете изменить существующие или заполнить пустые данные профиля</p>
            </div>
            <form id="profileEditForm" onsubmit="saveProfileData(event)">
                <div class="form-group">
                    <label>Ваш Никнейм (ID)</label>
                    <input type="text" class="form-control" value="${profileData.nickname || ''}" disabled style="background: #f5f5f5; color: #888;">
                </div>
                <div class="form-group">
                    <label>ФИО / Отображаемое имя</label>
                    <input type="text" id="inputName" class="form-control" value="${profileData.name || ''}" required placeholder="Введите ваше имя">
                </div>
                <div class="form-group">
                    <label>Профессия <span style="color: #999; font-size: 0.85em;">(необязательно)</span></label>
                    <input type="text" id="inputProfession" class="form-control" value="${profileData.profession || ''}" placeholder="Например: Фронтенд-разработчик, Студент">
                </div>
                <div class="form-group">
                    <label>Email (Почта)</label>
                    <input type="email" id="inputEmail" class="form-control" value="${profileData.email || ''}" placeholder="example@mail.com">
                </div>
                <div class="form-group">
                    <label>Номер телефона</label>
                    <input type="text" id="inputPhone" class="form-control" value="${profileData.phone || ''}" placeholder="+7 (999) 999-99-99">
                </div>
                <div class="form-group">
                    <label>Дата рождения</label>
                    <input type="date" id="inputBirth" class="form-control" value="${profileData.birth_date || ''}">
                </div>
                <button type="submit" class="btn-save-profile" id="btnSaveProfile">Сохранить изменения</button>
            </form>
        </div>
    `;
}

// Отправка измененного профиля на бэкенд
async function saveProfileData(event) {
    event.preventDefault();
    const token = localStorage.getItem('authToken');
    const btn = document.getElementById('btnSaveProfile');
    
    if (btn) { btn.disabled = true; btn.textContent = "Сохранение..."; }

    const updatedData = {
        token: token,
        name: document.getElementById('inputName').value.trim(),
        profession: document.getElementById('inputProfession').value.trim(),
        email: document.getElementById('inputEmail').value.trim(),
        phone: document.getElementById('inputPhone').value.trim(),
        birth_date: document.getElementById('inputBirth').value
    };

    try {
        const res = await fetch('/api/user/profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedData)
        });
        const data = await res.json();

        if (data.success) {
            alert("Данные профиля успешно обновлены!");
            profileData = { ...profileData, ...updatedData }; // Обновляем локальный кэш
        } else {
            alert("Ошибка сохранения: " + (data.error || "Неизвестная ошибка"));
        }
    } catch (e) {
        console.error(e);
        alert("Ошибка связи с сервером.");
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = "Сохранить изменения"; }
    }
}

function showSession(index, isPoll = false) {
    currentView = index;
    const s = sessionsData[index];
    const content = document.getElementById('sessionDetail');
    const profileTab = document.getElementById('profileTab');
    
    if (profileTab) profileTab.classList.remove('active');

    // Если это штатный клик пользователя, подсвечиваем нужный таб вручную
    if (!isPoll) {
        document.querySelectorAll('.session-tab').forEach((t, i) => {
            t.classList.toggle('active', i === index);
        });
    }

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
<<<<<<< HEAD
                        analysisBoxStyle = 'background: #fff8e1;';
                        analysisBorderColor = 'border: 1px solid #ffecb3;';
                        break;
                    case 'processing':
                        analysisBoxStyle = 'background: #e3f2fd;';
                        analysisBorderColor = 'border: 1px solid #bbdefb;';
                        break;
                    case 'done':
                        analysisBoxStyle = 'background: #e8f5e9;';
                        analysisBorderColor = 'border: 1px solid #c8e6c9;';
                        break;
                    case 'error':
                        analysisBoxStyle = 'background: #ffebee;';
                        analysisBorderColor = 'border: 1px solid #ffcdd2;';
                        break;
                    default:
                        analysisBoxStyle = 'background: #f9f9f9;';
=======
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
>>>>>>> 070bc9ad0fa55aaa1e1d959d4b7f4040fe0143f6
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

<<<<<<< HEAD
// Инициализация при загрузке документа
document.addEventListener('DOMContentLoaded', () => {
    loadProfile();
    
    // Навешиваем событие клика на кнопку «Личные данные» в сайдбаре
    const profileTab = document.getElementById('profileTab');
    if (profileTab) {
        profileTab.onclick = showProfileForm;
    }
});
=======
document.addEventListener('DOMContentLoaded', loadProfile);
>>>>>>> 070bc9ad0fa55aaa1e1d959d4b7f4040fe0143f6

// Функция для повторной постановки сессии в очередь
async function retrySession(sessionId) {
    const token = localStorage.getItem('authToken');
    if (!token) { alert('Вы не авторизованы.'); return; }

    if (!confirm('Вы уверены, что хотите запустить анализ этой сессии снова?')) {
<<<<<<< HEAD
        return;
=======
        return; // Отмена действия
>>>>>>> 070bc9ad0fa55aaa1e1d959d4b7f4040fe0143f6
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
<<<<<<< HEAD
            loadProfile(); 
=======
            loadProfile(); // Перезагружаем профиль, чтобы обновить статус
>>>>>>> 070bc9ad0fa55aaa1e1d959d4b7f4040fe0143f6
        } else {
            alert('Ошибка при повторной постановке в очередь: ' + (data.error || 'Неизвестная ошибка'));
        }
    } catch (e) {
        console.error('Ошибка retrySession:', e);
        alert('Ошибка связи с сервером при попытке повторного запуска.');
    }
}

<<<<<<< HEAD
// Привязываем функции к глобальному контексту window для корректной работы инлайн-атрибутов onclick
window.retrySession = retrySession;
window.showSession = showSession;
window.showProfileForm = showProfileForm;
window.saveProfileData = saveProfileData;
window.logout = logout;
=======
// Глобально делаем функцию доступной для HTML
window.retrySession = retrySession;
>>>>>>> 070bc9ad0fa55aaa1e1d959d4b7f4040fe0143f6
