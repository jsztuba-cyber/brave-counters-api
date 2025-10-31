import express from 'express';
import cron from 'node-cron';
import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const adapter = new JSONFile('db.json');
const db = new Low(adapter, {});

// ========== KONFIGURACJA KURSÓW ==========
// Tu definiujesz wszystkie kursy z ich API keys
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
db.data ||= { 
  courses: {},
  groups: []
};

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

// Cron job - aktualizacja co 10 minut
cron.schedule('*/10 * * * *', () => {
  fetchMailerLiteData();
});

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  next();
});

// ========== PANEL ADMINISTRACYJNY ==========

app.get('/admin', (req, res) => {
  const coursesForSelect = Object.entries(COURSES_CONFIG).map(([key, course]) => ({
    key,
    name: course.name,
    hasApiKey: !!course.apiKey
  }));
  
  res.send(`
<!DOCTYPE html>
<html lang="pl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BRAVE Counters - Panel Admin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #f5f5f5;
            padding: 20px;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .subtitle {
            color: #666;
            margin-bottom: 30px;
        }
        .section {
            background: white;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 20px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        h2 {
            color: #333;
            margin-bottom: 16px;
            font-size: 18px;
        }
        .form-group {
            margin-bottom: 16px;
        }
        label {
            display: block;
            margin-bottom: 6px;
            color: #555;
            font-size: 14px;
            font-weight: 500;
        }
        input, select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
        }
        select {
            cursor: pointer;
            background: white;
        }
        input:focus, select:focus {
            outline: none;
            border-color: #4A90E2;
        }
        .btn {
            padding: 10px 20px;
            border: none;
            border-radius: 6px;
            font-size: 14px;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
        }
        .btn-primary {
            background: #4A90E2;
            color: white;
        }
        .btn-primary:hover {
            background: #357ABD;
        }
        .btn-primary:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .btn-danger {
            background: #E74C3C;
            color: white;
            padding: 6px 12px;
            font-size: 12px;
        }
        .btn-danger:hover {
            background: #C0392B;
        }
        .btn-refresh {
            background: #27AE60;
            color: white;
            margin-bottom: 20px;
        }
        .btn-refresh:hover {
            background: #229954;
        }
        .group-list {
            list-style: none;
        }
        .group-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            margin-bottom: 10px;
            background: #fafafa;
        }
        .group-info {
            flex: 1;
        }
        .course-badge {
            display: inline-block;
            background: #4A90E2;
            color: white;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 600;
            margin-right: 8px;
        }
        .group-name {
            font-weight: 600;
            color: #333;
            margin-bottom: 4px;
        }
        .group-details {
            font-size: 13px;
            color: #777;
        }
        .group-count {
            font-size: 24px;
            font-weight: 700;
            color: #4A90E2;
            margin-right: 20px;
        }
        .empty-state {
            text-align: center;
            padding: 40px;
            color: #999;
        }
        .help-text {
            font-size: 13px;
            color: #777;
            margin-top: 6px;
        }
        .status {
            display: inline-block;
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }
        .status-success {
            background: #D5F4E6;
            color: #27AE60;
        }
        code {
            background: #f0f0f0;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 12px;
        }
        .info-box {
            background: #E3F2FD;
            border-left: 4px solid #2196F3;
            padding: 12px;
            margin-bottom: 16px;
            border-radius: 4px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🎓 BRAVE Counters</h1>
        <p class="subtitle">Panel zarządzania licznikami kursów i webinarów</p>

        <div class="section">
            <button class="btn btn-refresh" onclick="refreshCounters()">
                🔄 Odśwież liczniki teraz
            </button>
            <span id="refreshStatus"></span>
        </div>

        <div class="section">
            <h2>➕ Dodaj nową grupę (webinar, kohortę, listę oczekujących)</h2>
            
            <div class="info-box">
                <strong>💡 Jak to działa:</strong> Wybierasz kurs z listy (API key jest już skonfigurowany), 
                podajesz nazwę grupy i Group ID z MailerLite - i gotowe!
            </div>
            
            <form id="addGroupForm">
                <div class="form-group">
                    <label>Wybierz kurs</label>
                    <select id="courseSelect" required>
                        <option value="">-- Wybierz kurs --</option>
                        ${coursesForSelect.map(course => `
                            <option value="${course.key}" ${!course.hasApiKey ? 'disabled' : ''}>
                                ${course.name} ${!course.hasApiKey ? '(brak API key - skonfiguruj w Render)' : ''}
                            </option>
                        `).join('')}
                    </select>
                    <p class="help-text">Każdy kurs ma swoje osobne konto MailerLite</p>
                </div>
                
                <div class="form-group">
                    <label>Nazwa grupy (np. "Kohorta luty 2026", "Webinar 15.03", "Lista oczekujących")</label>
                    <input type="text" id="groupName" required placeholder="Kohorta luty 2026">
                </div>
                
                <div class="form-group">
                    <label>ID grupy dla URL (automatycznie generowane)</label>
                    <input type="text" id="groupId" required placeholder="ai_marketers_kohorta_luty_2026" readonly style="background: #f9f9f9;">
                    <p class="help-text">Małe litery, podkreślniki, bez spacji - używane w URL API</p>
                </div>
                
                <div class="form-group">
                    <label>MailerLite Group ID (liczba z URL grupy w MailerLite)</label>
                    <input type="text" id="mlGroupId" required placeholder="123456789">
                    <p class="help-text">
                        Zaloguj się do <strong>konta MailerLite tego kursu</strong> → 
                        Subscribers → Groups → kliknij grupę → skopiuj liczbę z URL: /groups/<strong>123456789</strong>
                    </p>
                </div>
                
                <button type="submit" class="btn btn-primary" id="submitBtn">Dodaj grupę</button>
            </form>
        </div>

        <div class="section">
            <h2>📊 Skonfigurowane grupy</h2>
            <ul class="group-list" id="groupList">
                <li class="empty-state">Ładowanie...</li>
            </ul>
        </div>
    </div>

    <script>
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
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]+/g, '_')
                    .replace(/^_+|_+$/g, '');
                
                groupIdInput.value = courseKey + '_' + slug;
            }
        }
        
        courseSelect.addEventListener('change', generateGroupId);
        groupNameInput.addEventListener('input', generateGroupId);

        async function loadGroups() {
            try {
                const [groupsRes, countersRes] = await Promise.all([
                    fetch('/api/groups'),
                    fetch('/api/counters')
                ]);
                
                const groups = await groupsRes.json();
                const counters = await countersRes.json();
                
                const list = document.getElementById('groupList');
                
                if (groups.length === 0) {
                    list.innerHTML = '<li class="empty-state">Brak skonfigurowanych grup. Dodaj pierwszą powyżej! 👆</li>';
                    return;
                }
                
                list.innerHTML = groups.map(group => {
                    const counter = counters[group.id];
                    const count = counter ? counter.count : '—';
                    const courseName = counter ? counter.courseName : 'Nieznany';
                    const lastUpdate = counter ? new Date(counter.lastUpdate).toLocaleString('pl-PL') : 'Nigdy';
                    
                    return \`
                        <li class="group-item">
                            <div class="group-info">
                                <div class="group-name">
                                    <span class="course-badge">\${courseName}</span>
                                    \${group.groupName}
                                </div>
                                <div class="group-details">
                                    ID: <code>\${group.id}</code> | 
                                    ML Group: <code>\${group.groupId}</code> |
                                    Ostatnia aktualizacja: \${lastUpdate}
                                </div>
                            </div>
                            <div class="group-count">\${typeof count === 'number' ? count.toLocaleString('pl-PL') : count}</div>
                            <button class="btn btn-danger" onclick="deleteGroup('\${group.id}')">Usuń</button>
                        </li>
                    \`;
                }).join('');
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
                    alert('✅ Grupa dodana i licznik zaktualizowany!');
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
            if (!confirm(\`Czy na pewno usunąć grupę "\${id}"?\`)) return;
            
            try {
                const res = await fetch(\`/api/groups/\${id}\`, { method: 'DELETE' });
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
                status.innerHTML = '<span class="status" style="background:#FFE5E5;color:#E74C3C">❌ Błąd</span>';
            }
        }

        loadGroups();
        setInterval(loadGroups, 30000);
    </script>
</body>
</html>
  `);
});

// ========== API ENDPOINTS ==========

app.get('/api/groups', (req, res) => {
  res.json(db.data.groups);
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
    return res.status(400).json({ error: 'Brak API key dla tego kursu - skonfiguruj w Render' });
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
});
```

**Zapisz plik.**

---

## 1.4 Utwórz plik `.gitignore`

Utwórz plik **`.gitignore`** i wklej:
```
node_modules/
db.json
.env
