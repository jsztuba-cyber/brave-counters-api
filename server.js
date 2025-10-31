import express from 'express';
import cron from 'node-cron';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Persistent storage path
const DATA_DIR = process.env.DATA_DIR || join(__dirname, 'data');
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = join(DATA_DIR, 'db.json');
const adapter = new JSONFile(DB_PATH);
const db = new Low(adapter, {});

// ========== KONFIGURACJA KURSÓW ==========
const COURSES_CONFIG = {
  ai_marketers: {
    name: 'AI_marketers',
    apiKey: process.env.ML_API_KEY_AI_MARKETERS || ''
  },
  ai_managers: {
    name: 'AI_managers',
    apiKey: process.env.ML_API_KEY_AI_MANAGERS || ''
  },
  ai_ready_hr: {
    name: 'AI Ready HR',
    apiKey: process.env.ML_API_KEY_AI_READY_HR || ''
  },
  excel_ai: {
    name: 'Excel AI',
    apiKey: process.env.ML_API_KEY_EXCEL_AI || ''
  },
  '10xdevs': {
    name: '10xDevs',
    apiKey: process.env.ML_API_KEY_10XDEVS || ''
  },
  ai_product_heroes: {
    name: 'AI Product Heroes',
    apiKey: process.env.ML_API_KEY_AI_PRODUCT_HEROES || ''
  }
};

// Inicjalizacja bazy
await db.read();
db.data = db.data || { courses: {}, groups: [], widgets: {} };
if (!db.data.courses) db.data.courses = {};
if (!db.data.groups) db.data.groups = [];
if (!db.data.widgets) db.data.widgets = {};
await db.write();

console.log(`📁 Baza danych: ${DB_PATH}`);

// Funkcja pobierająca dane z MailerLite
async function fetchMailerLiteData() {
  console.log('🔄 Rozpoczynam aktualizację danych...');
  
  if (db.data.groups.length === 0) {
    console.log('⚠️  Brak skonfigurowanych grup');
    return;
  }
  
  for (const group of db.data.groups) {
    try {
      const course = COURSES_CONFIG[group.courseKey];
      
      if (!course || !course.apiKey) {
        console.error(`✗ Brak API key dla kursu: ${group.courseKey}`);
        continue;
      }
      
      const response = await fetch(
        `https://api.mailerlite.com/api/v2/groups/${group.groupId}`,
        {
          headers: {
            'X-MailerLite-ApiKey': course.apiKey
          }
        }
      );
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const data = await response.json();
      
      db.data.courses[group.id] = {
        courseName: course.name,
        groupName: group.groupName,
        count: data.active || 0,
        lastUpdate: new Date().toISOString()
      };
      
      console.log(`✓ ${course.name} / ${group.groupName}: ${data.active}`);
    } catch (error) {
      console.error(`✗ Błąd dla ${group.groupName}:`, error.message);
    }
  }

  await db.write();
  console.log('✅ Aktualizacja zakończona');
}

// Cron job - aktualizacja CO GODZINĘ o pełnej godzinie (0 minut)
cron.schedule('0 * * * *', () => {
  console.log('⏰ Automatyczna aktualizacja o pełnej godzinie');
  fetchMailerLiteData();
});

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, PUT');
  next();
});

// ========== WIDGET JS SNIPPET ==========
app.get('/counter.js', (req, res) => {
  const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  const js = `
(function() {
  const API_URL = '${baseUrl}/api';
  
  // Funkcja do odmiany polskiej
  function getPolishForm(number) {
    if (number === 1) return 'osoba';
    const lastDigit = number % 10;
    const lastTwoDigits = number % 100;
    
    if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'osób';
    if (lastDigit >= 2 && lastDigit <= 4) return 'osoby';
    return 'osób';
  }
  
  async function updateCounters() {
    try {
      const [countersRes, widgetsRes] = await Promise.all([
        fetch(API_URL + '/counters'),
        fetch(API_URL + '/widgets')
      ]);
      
      const counters = await countersRes.json();
      const widgets = await widgetsRes.json();
      
      document.querySelectorAll('[data-counter]').forEach(element => {
        const counterId = element.getAttribute('data-counter');
        const counter = counters[counterId];
        
        if (!counter) {
          console.warn('Nie znaleziono licznika:', counterId);
          return;
        }
        
        const count = counter.count;
        const widget = widgets[counterId] || {};
        
        // Pobierz konfigurację z atrybutów lub użyj domyślnych z widżetu
        const template = element.getAttribute('data-template') || widget.template || 'custom';
        const customText = element.getAttribute('data-text') || widget.customText || '';
        const animate = element.getAttribute('data-animate') !== 'false' && (widget.animate !== false);
        
        let displayText = '';
        const form = getPolishForm(count);
        
        if (template === 'enrolled') {
          displayText = 'Już {count} ' + form + ' ' + (count === 1 ? 'zapisana' : form === 'osoby' ? 'zapisane' : 'zapisanych') + '!';
        } else if (template === 'waitlist') {
          displayText = '{count} ' + form + ' na liście oczekujących!';
        } else if (customText) {
          displayText = customText;
        } else {
          displayText = '{count}';
        }
        
        // Zamień {count} na <strong>liczba</strong>
        displayText = displayText.replace('{count}', '<strong>' + count + '</strong>');
        
        if (animate && !element.hasAttribute('data-animated')) {
          element.setAttribute('data-animated', 'true');
          animateCounter(element, count, displayText);
        } else {
          element.innerHTML = displayText;
        }
      });
    } catch (error) {
      console.error('Błąd pobierania liczników:', error);
    }
  }
  
  function animateCounter(element, targetCount, finalText) {
    const duration = 1000;
    let currentCount = 0;
    const increment = targetCount / (duration / 16);
    
    const timer = setInterval(() => {
      currentCount += increment;
      if (currentCount >= targetCount) {
        element.innerHTML = finalText;
        clearInterval(timer);
      } else {
        const tempCount = Math.floor(currentCount);
        const tempText = finalText.replace('<strong>' + targetCount + '</strong>', '<strong>' + tempCount + '</strong>');
        element.innerHTML = tempText;
      }
    }, 16);
  }
  
  // Ładuj natychmiast, bez czekania na DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateCounters);
  } else {
    updateCounters();
  }
  
  // Auto-refresh co godzinę (synchronizacja z serwerem)
  setInterval(updateCounters, 3600000); // 3600000ms = 1 godzina
})();
  `;
  
  res.setHeader('Content-Type', 'application/javascript');
  res.send(js);
});

// ========== PANEL ADMINISTRACYJNY ==========

app.get('/admin', (req, res) => {
  const coursesForSelect = Object.entries(COURSES_CONFIG).map(([key, course]) => ({
    key,
    name: course.name,
    hasApiKey: !!course.apiKey
  }));
  
  const baseUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${process.env.PORT || 3000}`;
  
  const html = `
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BRAVE Counters - Panel Admin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
            background: #0a0a0a;
            color: #e0e0e0;
            padding: 20px;
            line-height: 1.6;
        }
        .header {
            max-width: 1200px;
            margin: 0 auto 40px;
            text-align: center;
        }
        .logo {
            max-width: 180px;
            height: auto;
            margin-bottom: 30px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        h1 {
            color: #ffffff;
            margin-bottom: 10px;
            font-size: 32px;
            font-weight: 700;
        }
        .subtitle {
            color: #999;
            margin-bottom: 30px;
            font-size: 16px;
        }
        .section {
            background: #1a1a1a;
            border-radius: 12px;
            padding: 28px;
            margin-bottom: 24px;
            border: 1px solid #2a2a2a;
        }
        h2 {
            color: #ffffff;
            margin-bottom: 20px;
            font-size: 20px;
            font-weight: 600;
        }
        h3 {
            color: #ffffff;
            font-size: 18px;
            font-weight: 600;
        }
        h4 {
            color: #cccccc;
            font-size: 14px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 8px;
            color: #ccc;
            font-size: 14px;
            font-weight: 500;
        }
        input, select, textarea {
            width: 100%;
            padding: 12px 16px;
            border: 1px solid #333;
            border-radius: 8px;
            font-size: 14px;
            font-family: inherit;
            background: #0f0f0f;
            color: #e0e0e0;
            transition: border-color 0.2s;
        }
        textarea {
            min-height: 100px;
            resize: vertical;
        }
        select {
            cursor: pointer;
        }
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: #4A90E2;
        }
        input[readonly] {
            background: #151515;
            color: #888;
        }
        .btn {
            padding: 12px 24px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            display: inline-block;
        }
        .btn-primary {
            background: #4A90E2;
            color: white;
        }
        .btn-primary:hover {
            background: #357ABD;
            transform: translateY(-1px);
        }
        .btn-primary:disabled {
            background: #333;
            cursor: not-allowed;
            transform: none;
        }
        .btn-secondary {
            background: #2a2a2a;
            color: #e0e0e0;
            font-size: 13px;
            padding: 8px 16px;
        }
        .btn-secondary:hover {
            background: #333;
        }
        .btn-danger {
            background: #E74C3C;
            color: white;
            padding: 8px 16px;
            font-size: 13px;
        }
        .btn-danger:hover {
            background: #C0392B;
        }
        .btn-refresh {
            background: #27AE60;
            color: white;
            margin-right: 12px;
        }
        .btn-refresh:hover {
            background: #229954;
        }
        .group-list {
            list-style: none;
        }
        .group-item {
            border: 1px solid #2a2a2a;
            border-radius: 12px;
            margin-bottom: 16px;
            background: #151515;
            overflow: hidden;
            transition: border-color 0.2s;
        }
        .group-item:hover {
            border-color: #333;
        }
        .group-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 20px;
            cursor: pointer;
            user-select: none;
        }
        .group-header:hover {
            background: #1a1a1a;
        }
        .group-info {
            flex: 1;
        }
        .course-badge {
            display: inline-block;
            background: #4A90E2;
            color: white;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 11px;
            font-weight: 700;
            margin-right: 10px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .group-name {
            font-weight: 600;
            color: #ffffff;
            margin-bottom: 6px;
            font-size: 16px;
        }
        .group-details {
            font-size: 13px;
            color: #888;
        }
        .group-count {
            font-size: 32px;
            font-weight: 700;
            color: #4A90E2;
            margin-right: 24px;
        }
        .group-actions {
            display: flex;
            gap: 10px;
        }
        .widget-section {
            padding: 24px;
            background: #0f0f0f;
            border-top: 1px solid #2a2a2a;
            display: none;
        }
        .widget-section.active {
            display: block;
        }
        .widget-preview {
            background: #1a1a1a;
            border: 2px dashed #333;
            border-radius: 8px;
            padding: 24px;
            margin: 20px 0;
            text-align: center;
            min-height: 70px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            color: #e0e0e0;
        }
        .widget-preview strong {
            font-weight: 700;
            color: #4A90E2;
        }
        .code-box {
            background: #0a0a0a;
            color: #e0e0e0;
            padding: 20px;
            border-radius: 8px;
            font-family: 'Monaco', 'Courier New', monospace;
            font-size: 13px;
            overflow-x: auto;
            position: relative;
            margin-top: 16px;
            border: 1px solid #2a2a2a;
        }
        .code-box pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-all;
        }
        .copy-btn {
            position: absolute;
            top: 12px;
            right: 12px;
            background: #4A90E2;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 12px;
            font-weight: 600;
        }
        .copy-btn:hover {
            background: #357ABD;
        }
        .empty-state {
            text-align: center;
            padding: 60px 20px;
            color: #666;
            font-size: 16px;
        }
        .help-text {
            font-size: 13px;
            color: #888;
            margin-top: 8px;
            line-height: 1.5;
        }
        .status {
            display: inline-block;
            padding: 6px 14px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
        }
        .status-success {
            background: rgba(39, 174, 96, 0.2);
            color: #27AE60;
        }
        code {
            background: #2a2a2a;
            padding: 3px 8px;
            border-radius: 4px;
            font-size: 13px;
            color: #4A90E2;
            font-family: 'Monaco', 'Courier New', monospace;
        }
        .info-box {
            background: rgba(74, 144, 226, 0.1);
            border-left: 4px solid #4A90E2;
            padding: 16px;
            margin-bottom: 20px;
            border-radius: 6px;
            color: #e0e0e0;
        }
        .info-box strong {
            color: #4A90E2;
        }
        .warning-box {
            background: rgba(255, 152, 0, 0.1);
            border-left: 4px solid #FF9800;
            padding: 16px;
            margin-bottom: 20px;
            border-radius: 6px;
            color: #e0e0e0;
        }
        .warning-box strong {
            color: #FF9800;
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 10px;
            margin-top: 16px;
        }
        .checkbox-group input[type="checkbox"] {
            width: auto;
            margin: 0;
            accent-color: #4A90E2;
        }
        .checkbox-group label {
            margin: 0;
            cursor: pointer;
        }
        .widget-controls {
            margin-bottom: 20px;
        }
        .stats-badge {
            display: inline-block;
            background: rgba(74, 144, 226, 0.2);
            color: #4A90E2;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 13px;
            font-weight: 600;
            margin-left: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="https://cdn.prod.website-files.com/63fca02de79380e5c3306a3f/63fcc9cffd37e885e6b9c275_brave-logo-p-500.png" alt="BRAVE" class="logo">
        <h1>Counters API</h1>
        <p class="subtitle">Panel zarządzania licznikami kursów i webinarów</p>
    </div>

    <div class="container">
        <div class="section">
            <h2>📜 Instalacja w Webflow</h2>
            <div class="info-box">
                <strong>Krok 1:</strong> Dodaj ten kod do <strong>Project Settings → Custom Code → Footer Code</strong>
            </div>
            <div class="code-box">
                <button class="copy-btn" onclick="copyInstallCode()">📋 Kopiuj</button>
                <pre id="installCode">&lt;script src="${baseUrl}/counter.js"&gt;&lt;/script&gt;</pre>
            </div>
            <p class="help-text">⚠️ To wystarczy zrobić <strong>raz na cały projekt</strong> - potem możesz dodawać dowolną ilość liczników</p>
        </div>

        <div class="section">
            <h2>🔄 Aktualizacja liczników</h2>
            <button class="btn btn-refresh" onclick="refreshCounters()">Odśwież liczniki teraz</button>
            <span id="refreshStatus"></span>
            <p class="help-text" style="margin-top: 12px;">💡 Liczniki automatycznie aktualizują się <strong>co godzinę o pełnej godzinie</strong></p>
        </div>

        <div class="section">
            <h2>➕ Dodaj nową grupę</h2>
            
            <form id="addGroupForm">
                <div class="form-group">
                    <label>Wybierz kurs</label>
                    <select id="courseSelect" required>
                        <option value="">-- Wybierz kurs --</option>
                        ${coursesForSelect.map(course => `
                            <option value="${course.key}" ${!course.hasApiKey ? 'disabled' : ''}>
                                ${course.name} ${!course.hasApiKey ? '(brak API key)' : ''}
                            </option>
                        `).join('')}
                    </select>
                </div>
                
                <div class="form-group">
                    <label>Nazwa grupy</label>
                    <input type="text" id="groupName" required placeholder="Kohorta luty 2026">
                </div>
                
                <div class="form-group">
                    <label>ID grupy dla URL (automatycznie generowane)</label>
                    <input type="text" id="groupId" required readonly>
                </div>
                
                <div class="form-group">
                    <label>MailerLite Group ID</label>
                    <input type="text" id="mlGroupId" required placeholder="123456789">
                    <p class="help-text">Znajdziesz w URL grupy w MailerLite: /groups/<strong>123456789</strong></p>
                </div>
                
                <button type="submit" class="btn btn-primary" id="submitBtn">Dodaj grupę</button>
            </form>
        </div>

        <div class="section">
            <h2>📊 Skonfigurowane grupy i widżety</h2>
            <ul class="group-list" id="groupList">
                <li class="empty-state">Ładowanie...</li>
            </ul>
        </div>
    </div>

    <script>
        const BASE_URL = '${baseUrl}';
        const COURSES = ${JSON.stringify(coursesForSelect)};
        
        const courseSelect = document.getElementById('courseSelect');
        const groupNameInput = document.getElementById('groupName');
        const groupIdInput = document.getElementById('groupId');
        
        function generateGroupId() {
            const courseKey = courseSelect.value;
            const groupName = groupNameInput.value;
            
            if (courseKey && groupName) {
                const slug = groupName
                    .toLowerCase()
                    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_+|_+$/g, '');
                
                groupIdInput.value = courseKey + '_' + slug;
            }
        }
        
        courseSelect.addEventListener('change', generateGroupId);
        groupNameInput.addEventListener('input', generateGroupId);

        function copyInstallCode() {
            const code = document.getElementById('installCode').textContent;
            navigator.clipboard.writeText(code).then(() => {
                alert('✅ Skopiowano! Wklej kod w Webflow → Project Settings → Custom Code → Footer');
            });
        }

        function toggleWidget(groupId) {
            const widget = document.getElementById('widget-' + groupId);
            widget.classList.toggle('active');
        }

        function getPolishForm(number) {
            if (number === 1) return 'osoba';
            const lastDigit = number % 10;
            const lastTwoDigits = number % 100;
            
            if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return 'osób';
            if (lastDigit >= 2 && lastDigit <= 4) return 'osoby';
            return 'osób';
        }

        function updateWidgetPreview(groupId, count) {
            const template = document.getElementById('template-' + groupId).value;
            const customText = document.getElementById('customText-' + groupId).value;
            const animate = document.getElementById('animate-' + groupId).checked;
            const preview = document.getElementById('preview-' + groupId);
            const codeBox = document.getElementById('code-' + groupId);
            const codeStep2 = document.getElementById('codeStep2-' + groupId);
            
            let displayText = '';
            const form = getPolishForm(count);
            
            if (template === 'enrolled') {
                displayText = 'Już <strong>' + count + '</strong> ' + form + ' ' + (count === 1 ? 'zapisana' : form === 'osoby' ? 'zapisane' : 'zapisanych') + '!';
            } else if (template === 'waitlist') {
                displayText = '<strong>' + count + '</strong> ' + form + ' na liście oczekujących!';
            } else if (customText) {
                displayText = customText.replace('{count}', '<strong>' + count + '</strong>');
            } else {
                displayText = '<strong>' + count + '</strong>';
            }
            
            preview.innerHTML = displayText;
            
            // Generuj kod HTML
            let attributes = 'data-counter="' + groupId + '"';
            if (template !== 'custom' || !customText) {
                attributes += ' data-template="' + template + '"';
            }
            if (customText && template === 'custom') {
                attributes += ' data-text="' + customText.replace(/"/g, '&quot;') + '"';
            }
            if (!animate) {
                attributes += ' data-animate="false"';
            }
            
            const embedCode = attributes;
            codeBox.querySelector('pre').textContent = embedCode;
            
            // Krok 2 - zapisz konfigurację
            codeStep2.style.display = 'block';
        }

        function copyCode(groupId) {
            const codeBox = document.getElementById('code-' + groupId);
            const code = codeBox.querySelector('pre').textContent;
            
            navigator.clipboard.writeText(code).then(() => {
                const btn = codeBox.querySelector('.copy-btn');
                const originalText = btn.textContent;
                btn.textContent = '✅ Skopiowano!';
                setTimeout(() => {
                    btn.textContent = originalText;
                }, 2000);
            });
        }

        async function saveWidget(groupId) {
            const template = document.getElementById('template-' + groupId).value;
            const customText = document.getElementById('customText-' + groupId).value;
            const animate = document.getElementById('animate-' + groupId).checked;
            
            try {
                const res = await fetch('/api/widgets/' + groupId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ template, customText, animate })
                });
                
                if (res.ok) {
                    alert('✅ Konfiguracja zapisana!');
                    document.getElementById('codeStep2-' + groupId).style.display = 'none';
                }
            } catch (error) {
                alert('❌ Błąd zapisu: ' + error.message);
            }
        }

        async function loadGroups() {
            try {
                const [groupsRes, countersRes, widgetsRes] = await Promise.all([
                    fetch('/api/groups'),
                    fetch('/api/counters'),
                    fetch('/api/widgets')
                ]);
                
                const groups = await groupsRes.json();
                const counters = await countersRes.json();
                const widgets = await widgetsRes.json();
                
                const list = document.getElementById('groupList');
                
                if (groups.length === 0) {
                    list.innerHTML = '<li class="empty-state">Brak skonfigurowanych grup. Dodaj pierwszą powyżej! 👆</li>';
                    return;
                }
                
                list.innerHTML = groups.map(group => {
                    const counter = counters[group.id];
                    const widget = widgets[group.id] || { template: 'custom', customText: '', animate: true };
                    const count = counter ? counter.count : 0;
                    const courseName = counter ? counter.courseName : 'Nieznany';
                    const lastUpdate = counter ? new Date(counter.lastUpdate).toLocaleString('pl-PL') : 'Nigdy';
                    
                    return '<li class="group-item"><div class="group-header" onclick="toggleWidget(\\'' + group.id + '\\')"><div class="group-info"><div class="group-name"><span class="course-badge">' + courseName + '</span>' + group.groupName + '</div><div class="group-details">ID: <code>' + group.id + '</code> | ML Group: <code>' + group.groupId + '</code> | Ostatnia aktualizacja: ' + lastUpdate + '</div></div><div class="group-count">' + count.toLocaleString('pl-PL') + '</div><div class="group-actions" onclick="event.stopPropagation()"><button class="btn btn-secondary" onclick="toggleWidget(\\'' + group.id + '\\')">🎨 Widżet</button><button class="btn btn-danger" onclick="deleteGroup(\\'' + group.id + '\\')">Usuń</button></div></div><div class="widget-section" id="widget-' + group.id + '"><h3 style="margin-bottom: 20px;">Generator widżetu dla Webflow</h3><div class="info-box"><strong>Krok 1:</strong> Skonfiguruj wygląd licznika poniżej</div><div class="widget-controls"><div class="form-group"><label>Szablon tekstu</label><select id="template-' + group.id + '" onchange="updateWidgetPreview(\\'' + group.id + '\\', ' + count + ')"><option value="enrolled" ' + (widget.template === 'enrolled' ? 'selected' : '') + '>Już X osób zapisanych!</option><option value="waitlist" ' + (widget.template === 'waitlist' ? 'selected' : '') + '>X osób na liście oczekujących!</option><option value="custom" ' + (widget.template === 'custom' ? 'selected' : '') + '>Własny tekst</option></select></div><div class="form-group"><label>Własny tekst (użyj {count} dla liczby)</label><textarea id="customText-' + group.id + '" placeholder="Np: Dołącz do {count} uczestników!" onchange="updateWidgetPreview(\\'' + group.id + '\\', ' + count + ')">' + (widget.customText || '') + '</textarea><p class="help-text">Liczba będzie automatycznie pogrubiona</p></div><div class="checkbox-group"><input type="checkbox" id="animate-' + group.id + '" ' + (widget.animate !== false ? 'checked' : '') + ' onchange="updateWidgetPreview(\\'' + group.id + '\\', ' + count + ')"><label for="animate-' + group.id + '">Animuj licznik</label></div></div><h4 style="margin: 20px 0 12px 0;">Podgląd:</h4><div class="widget-preview" id="preview-' + group.id + '">Ładowanie...</div><div class="warning-box" id="codeStep2-' + group.id + '" style="display:none;"><strong>Krok 2:</strong> Zapisz konfigurację (żeby działała automatycznie po odświeżeniu)<br><button class="btn btn-primary" style="margin-top: 12px;" onclick="saveWidget(\\'' + group.id + '\\')">💾 Zapisz konfigurację</button></div><div class="info-box"><strong>Krok 3:</strong> W Webflow dodaj element (Div/Paragraph), kliknij Settings (⚙️), przewiń do <strong>Custom Attributes</strong> i dla każdego atrybutu z kodu poniżej dodaj osobny wiersz</div><div class="code-box" id="code-' + group.id + '"><button class="copy-btn" onclick="copyCode(\\'' + group.id + '\\')">📋 Kopiuj</button><pre></pre></div><p class="help-text" style="margin-top: 12px;">💡 Możesz stylować tekst normalnie w Webflow - liczba będzie pogrubiona</p></div></li>';
                }).join('');
                
                // Inicjalizuj podglądy
                groups.forEach(group => {
                    const counter = counters[group.id];
                    const count = counter ? counter.count : 0;
                    updateWidgetPreview(group.id, count);
                });
            } catch (error) {
                console.error('Błąd ładowania grup:', error);
            }
        }

        document.getElementById('addGroupForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const group = {
                courseKey: document.getElementById('courseSelect').value,
                groupName: document.getElementById('groupName').value,
                id: document.getElementById('groupId').value,
                groupId: document.getElementById('mlGroupId').value
            };
            
            const submitBtn = document.getElementById('submitBtn');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Dodawanie...';
            
            try {
                const res = await fetch('/api/groups', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(group)
                });
                
                if (res.ok) {
                    alert('✅ Grupa dodana!');
                    e.target.reset();
                    loadGroups();
                } else {
                    const error = await res.json();
                    alert('❌ Błąd: ' + error.error);
                }
            } catch (error) {
                alert('❌ Błąd: ' + error.message);
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Dodaj grupę';
            }
        });

        async function deleteGroup(id) {
            if (!confirm('Czy na pewno usunąć grupę "' + id + '"?')) return;
            
            try {
                const res = await fetch('/api/groups/' + id, { method: 'DELETE' });
                if (res.ok) {
                    alert('✅ Grupa usunięta!');
                    loadGroups();
                }
            } catch (error) {
                alert('❌ Błąd: ' + error.message);
            }
        }

        async function refreshCounters() {
            const status = document.getElementById('refreshStatus');
            status.innerHTML = '<span class="status status-success">⏳ Odświeżam...</span>';
            
            try {
                await fetch('/api/refresh');
                status.innerHTML = '<span class="status status-success">✅ Odświeżono!</span>';
                setTimeout(() => {
                    loadGroups();
                    status.innerHTML = '';
                }, 2000);
            } catch (error) {
                status.innerHTML = '<span style="color: #E74C3C;">❌ Błąd</span>';
            }
        }

        loadGroups();
        setInterval(loadGroups, 30000);
    </script>
</body>
</html>
  `;
  
  res.send(html);
});

// ========== API ENDPOINTS ==========

app.get('/api/groups', (req, res) => {
  res.json(db.data.groups);
});

app.get('/api/widgets', (req, res) => {
  res.json(db.data.widgets);
});

app.put('/api/widgets/:id', async (req, res) => {
  const { id } = req.params;
  const { template, customText, animate } = req.body;
  
  db.data.widgets[id] = { template, customText, animate };
  await db.write();
  
  res.json({ success: true });
});

app.post('/api/groups', async (req, res) => {
  const { courseKey, groupName, id, groupId } = req.body;
  
  if (!courseKey || !groupName || !id || !groupId) {
    return res.status(400).json({ error: 'Brak wymaganych pól' });
  }
  
  if (!COURSES_CONFIG[courseKey]) {
    return res.status(400).json({ error: 'Nieznany kurs' });
  }
  
  if (!COURSES_CONFIG[courseKey].apiKey) {
    return res.status(400).json({ error: 'Brak API key dla tego kursu' });
  }
  
  if (db.data.groups.find(g => g.id === id)) {
    return res.status(400).json({ error: 'Grupa o tym ID już istnieje' });
  }
  
  db.data.groups.push({ courseKey, groupName, id, groupId });
  await db.write();
  
  await fetchMailerLiteData();
  
  res.json({ success: true });
});

app.delete('/api/groups/:id', async (req, res) => {
  db.data.groups = db.data.groups.filter(g => g.id !== req.params.id);
  delete db.data.courses[req.params.id];
  delete db.data.widgets[req.params.id];
  await db.write();
  res.json({ success: true });
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'BRAVE Courses Counters API',
    totalGroups: db.data.groups.length,
    adminPanel: '/admin'
  });
});

app.get('/api/counters', (req, res) => {
  res.json(db.data.courses);
});

app.get('/api/counter/:courseId', (req, res) => {
  const data = db.data.courses[req.params.courseId];
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ error: 'Kurs nie znaleziony' });
  }
});

app.get('/api/refresh', async (req, res) => {
  await fetchMailerLiteData();
  res.json({ status: 'refreshed', data: db.data.courses });
});

await fetchMailerLiteData();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serwer działa na porcie ${PORT}`);
  console.log(`📊 Panel admin: http://localhost:${PORT}/admin`);
  console.log(`⏰ Auto-refresh: co godzinę o pełnej godzinie`);
});
