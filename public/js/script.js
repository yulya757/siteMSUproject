(() => {
    const $ = (s, ctx = document) => (ctx || document).querySelector(s);
    const $$ = (s, ctx = document) => Array.from((ctx || document).querySelectorAll(s));
  
    let timerId = null;
    let timeLeft = 120;
    let timerStarted = false;
    let currentSlide = 0;
  
    document.addEventListener('DOMContentLoaded', () => {
      initGlobalNavigation();
      initMobileMenu();
      initScrollAnimations();
      initStatsObserver();
      initAuthCheck();
      
      if ($('#ideaInput')) initExampleTest();
      if ($('#newsFeed')) initNewsSlider();
      if ($('#adminLoginModal')) initAdminModal();
      if ($('#year')) $('#year').textContent = new Date().getFullYear();
    });
  
    function initGlobalNavigation() {
      const testBtns = [$('#heroStart'), $('#finalStart'), $('#startTestBtn')];
      testBtns.forEach(btn => {
        if (btn) btn.onclick = () => window.location.href = '/test.html';
      });
  
      const loginBtn = $('#regLogBtn');
      if (loginBtn) loginBtn.onclick = () => window.location.href = '/login.html';
  
      const regBtn = $('#regRegBtn');
      if (regBtn) regBtn.onclick = () => window.location.href = '/reg.html';
  
      $$('[data-scroll]').forEach(btn => {
        btn.addEventListener('click', () => {
          const sel = btn.getAttribute('data-scroll');
          const target = $(sel);
          if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
      });
    }
  
    function initMobileMenu() {
      const toggle = $('.mobile-toggle');
      const nav = $('.nav-links');
      if (toggle && nav) {
        toggle.addEventListener('click', () => {
          const expanded = toggle.getAttribute('aria-expanded') === 'true';
          toggle.setAttribute('aria-expanded', String(!expanded));
          nav.style.display = expanded ? '' : 'flex'; 
        });
      }
    }
  
    function initExampleTest() {
      const input = $('#ideaInput');
      const checkBtn = $('#checkIdeasBtn');
      const resetBtn = $('#resetIdeas');
      
      input.addEventListener('focus', () => {
        if (!timerStarted) {
          timerStarted = true;
          startTimer(120);
        }
      });
      input.addEventListener('input', () => {
        input.style.height = 'auto';
        input.style.height = (input.scrollHeight + 2) + 'px';
      });
  
      if (checkBtn) checkBtn.addEventListener('click', handleCheckIdeas);
      if (resetBtn) resetBtn.addEventListener('click', resetExample);
  
      const modal = $('#resultModal');
      const closeBtns = [$('#modalClose'), $('#closeAndContinue')];
      
      closeBtns.forEach(btn => {
        if(btn) btn.addEventListener('click', () => closeModal(modal));
      });
      
      if ($('#downloadReport')) {
        $('#downloadReport').addEventListener('click', () => downloadCurrentReport(modal));
      }
  
      if (modal) {
        modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(modal); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(modal); });
      }
    }
  
    function startTimer(seconds) {
      timeLeft = seconds;
      updateTimerDisplay();
      if (timerId) clearInterval(timerId);
      timerId = setInterval(() => {
        timeLeft--;
        updateTimerDisplay();
        if (timeLeft <= 0) {
          clearInterval(timerId);
          alert('Время вышло!');
        }
      }, 1000);
    }
  
    function updateTimerDisplay() {
      const display = $('#timerDisplay');
      if (!display) return;
      const mm = Math.floor(timeLeft / 60).toString().padStart(2, '0');
      const ss = (timeLeft % 60).toString().padStart(2, '0');
      display.textContent = `${mm}:${ss}`;
    }
  
    function resetExample() {
      clearInterval(timerId);
      timerId = null;
      timerStarted = false;
      timeLeft = 120;
      updateTimerDisplay();
      const input = $('#ideaInput');
      if (input) {
        input.value = '';
        input.style.height = 'auto';
      }
    }
  
    function handleCheckIdeas() {
      const input = $('#ideaInput');
      const raw = input?.value || '';
      const ideas = raw.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean);
      if (ideas.length === 0) return alert('Напишите идеи.');
      
      clearInterval(timerId);
      const fluency = ideas.length;
      const uniqueWords = new Set(ideas.join(' ').toLowerCase().split(/\W+/).filter(Boolean)).size;
      const originality = Math.min(10, (uniqueWords / fluency) * 5).toFixed(1);
  
      renderResultModal({ ideas, metrics: { fluency, uniqueWords, originalityScore: originality, level: originality > 7 ? 'Высокий' : 'Средний' } });
    }
  
    function renderResultModal(report) {
      const modal = $('#resultModal');
      const body = $('#resultBody');
      if (!modal || !body) return;
      const m = report.metrics;
      body.innerHTML = `
        <div class="result-grid">
          <div class="result-item"><strong>Беглость:</strong> ${m.fluency}</div>
          <div class="result-item highlight"><strong>Оценка:</strong> ${m.originalityScore}</div>
        </div>
        <ul style="text-align: left; margin-top: 15px;">${report.ideas.map(i => `<li>${i}</li>`).join('')}</ul>
      `;
      modal.dataset.report = JSON.stringify(report);
      modal.style.display = 'flex';
    }
  
    function closeModal(modal) { if (modal) modal.style.display = 'none'; }
  
    async function initNewsSlider() {
      const track = $('#newsFeed');
      if (!track) return;
      try {
        const res = await fetch('/api/news');
        const news = await res.json();
        if (news.length === 0) { track.innerHTML = "<p>Новостей нет.</p>"; return; }
        track.innerHTML = news.map(post => `
            <article class="news-banner">
              ${post.image ? `<img src="${post.image}" class="news-banner-img">` : `<div class="news-banner-img" style="background:#8B5FBF"></div>`}
              <div class="news-banner-content">
                <h3>${post.title}</h3>
                <p>${post.content}</p>
              </div>
            </article>
        `).join('');
        setupSliderControls(news.length);
      } catch (e) { console.error(e); }
    }
  
    function setupSliderControls(count) {
      const track = $('#newsFeed');
      const prev = $('#prevNews');
      const next = $('#nextNews');
      if (!prev || !next) return;
      const update = () => {
        const itemW = track.firstElementChild ? track.firstElementChild.offsetWidth + 30 : 0;
        track.style.transform = `translateX(-${currentSlide * itemW}px)`;
      };
      prev.onclick = () => { if(currentSlide > 0) { currentSlide--; update(); } };
      next.onclick = () => { if(currentSlide < count - 1) { currentSlide++; update(); } };
    }
  
    async function initAuthCheck() {
      const token = localStorage.getItem('authToken');
      const nav = $('.nav-links');
      if (!token || !nav) return;
      try {
        const res = await fetch('/api/check-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        const data = await res.json();
        if (data.authorized) {
          if ($('#regLogBtn')) $('#regLogBtn').remove();
          if ($('#regRegBtn')) $('#regRegBtn').remove();
          const div = document.createElement('div');
          div.innerHTML = `<div class="user-avatar" onclick="window.location.href='/profile.html'" style="cursor:pointer; width:35px; height:35px; background:#06D6A0; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold;">${data.name[0]}</div>`;
          nav.appendChild(div.firstChild);
        }
      } catch (e) { console.error(e); }
    }
  
    function initAdminModal() {
      const modal = $('#adminLoginModal');
      const form = $('#adminLoginForm');
      document.addEventListener('keydown', (e) => {
        if (e.shiftKey && e.code === 'KeyL') {
          modal.style.display = 'flex';
        }
      });
      if (form) {
        form.onsubmit = (e) => {
          e.preventDefault();
          if ($('#adminUser').value === 'admin' && $('#adminPass').value === '1234') {
            window.location.href = '/admin.html';
          }
        };
      }
    }
  
    function initScrollAnimations() {
       const obs = new IntersectionObserver(entries => {
         entries.forEach(e => {
           if (e.isIntersecting) {
             e.target.style.opacity = '1';
             e.target.style.transform = 'none';
           }
         });
       });
       $$('.feature-card, .audience-item').forEach(el => {
           el.style.opacity = '0';
           el.style.transform = 'translateY(20px)';
           el.style.transition = '0.6s';
           obs.observe(el);
       });
    }

    function initStatsObserver() {
      const stats = $$('.stat-number');
      if (!stats.length) return;
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          stats.forEach(el => {
             const target = +el.getAttribute('data-target');
             let curr = 0;
             const t = setInterval(() => {
                 curr += Math.ceil(target/20);
                 if (curr >= target) { curr = target; clearInterval(t); }
                 el.textContent = curr + '+';
             }, 50);
          });
          obs.disconnect();
        }
      });
      obs.observe(stats[0]);
    }
})();