// 全域資料
let appData = { topics: [] };
let currentTopicId = null;
const myApi = window.api;
const DEFAULT_TARGET_DAYS = 365;
const DEFAULT_CLIPBOARD_IMAGE_FORMAT = 'png';
const DEFAULT_THEME_MODE = 'dark';

let filteredRecords = [];
let currentPage = 1;
const itemsPerPage = 30;

// DOM 元素 - 視圖
const views = {
    dashboard: document.getElementById('view-dashboard'),
    detail: document.getElementById('view-topic-detail'),
    settings: document.getElementById('view-settings')
};
const topicsList = document.getElementById('topics-list');
const modalAddTopic = document.getElementById('modal-add-topic');

// DOM 元素 - 表單與介面
const inputDate = document.getElementById('input-date');
const reasonGroup = document.getElementById('reason-group');
const formRecord = document.getElementById('form-record');
const recordsContainer = document.getElementById('records-container');
const calendarGrid = document.getElementById('calendar-grid');

// DOM 元素 - Tabs & Steps
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const step1Type = document.getElementById('step-1-type');
const fileUploadGroup = document.getElementById('file-upload-group');
const btnBackStep1 = document.getElementById('btn-back-step1');
const stepTitle = document.getElementById('step-title');

// DOM 元素 - 搜尋與分頁
const searchInputs = {
    title: document.getElementById('search-title'),
    ext: document.getElementById('search-ext'),
    start: document.getElementById('search-date-start'),
    end: document.getElementById('search-date-end')
};
const pageInfo = document.getElementById('page-info');

// 狀態變數
let currentCalDate = new Date();
let selectedDir = null;
let selectedFile = null;

// 初始化
async function init() {
    if (!myApi) {
        document.body.innerHTML = `
            <div style="color:white; text-align:center; padding:100px 20px;">
                <h2 style="color:var(--x-color); margin-bottom:20px;">環境錯誤</h2>
                <p>您目前是直接透過瀏覽器開啟這個檔案，這會導致程式無法存取本機資料夾與檔案系統。</p>
                <br>
                <p>請關閉瀏覽器，開啟您的終端機 (Terminal / cmd / PowerShell)，</p>
                <p>切換到此資料夾後，輸入: <b>npm start</b> 即可正常啟動本應用程式！</p>
            </div>
        `;
        return;
    }

    const data = await myApi.readData('topics.json');
    if (data) {
        if (!data.settings) data.settings = { difficulty: 'hard', clipboardImageFormat: DEFAULT_CLIPBOARD_IMAGE_FORMAT, themeMode: DEFAULT_THEME_MODE };
        if (!data.topics) data.topics = [];
        appData = data;
    } else {
        appData = { settings: { difficulty: 'hard', clipboardImageFormat: DEFAULT_CLIPBOARD_IMAGE_FORMAT, themeMode: DEFAULT_THEME_MODE }, topics: [] };
    }

    if (ensureSettingsShape(appData.settings)) {
        await saveData();
    }

    if (ensureTopicsTargetDays(appData.topics)) {
        await saveData();
    }

    // 預設今天為上傳最大日期
    const todayStr = getLocalDateString(new Date());
    inputDate.value = todayStr;
    inputDate.max = todayStr;
    applyTheme(appData.settings.themeMode);

    renderDashboard();
    setupEventListeners();
}

function getLocalDateString(date) {
    const d = new Date(date);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
}

async function saveData() {
    await myApi.writeData('topics.json', appData);
}

function ensureSettingsShape(settings) {
    if (!settings || typeof settings !== 'object') return false;

    let changed = false;
    if (!['hard', 'easy'].includes(settings.difficulty)) {
        settings.difficulty = 'hard';
        changed = true;
    }
    if (!['png', 'jpg'].includes(settings.clipboardImageFormat)) {
        settings.clipboardImageFormat = DEFAULT_CLIPBOARD_IMAGE_FORMAT;
        changed = true;
    }
    if (!['dark', 'light'].includes(settings.themeMode)) {
        settings.themeMode = DEFAULT_THEME_MODE;
        changed = true;
    }

    return changed;
}

function applyTheme(themeMode) {
    const normalizedTheme = ['dark', 'light'].includes(themeMode) ? themeMode : DEFAULT_THEME_MODE;
    document.body.dataset.theme = normalizedTheme;

    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
        toggle.checked = normalizedTheme === 'dark';
    }
}

async function saveTopicSnapshot(topic) {
    if (!topic || !topic.folder) return true;
    ensureTopicShape(topic);
    const result = await myApi.writeTopicSnapshot(topic);
    if (!result || !result.success) {
        showToast(`自動備份失敗：${result?.error || '未知錯誤'}`, true);
        return false;
    }
    return true;
}

async function saveAllTopicSnapshots(topics = appData.topics) {
    for (const topic of topics) {
        await saveTopicSnapshot(topic);
    }
}

function normalizeTargetDays(value) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_TARGET_DAYS;
    return n;
}

function ensureTopicShape(topic) {
    if (!topic || typeof topic !== 'object') return false;
    const normalized = normalizeTargetDays(topic.targetDays);
    const changed = topic.targetDays !== normalized;
    topic.targetDays = normalized;
    return changed;
}

function ensureTopicsTargetDays(topics) {
    if (!Array.isArray(topics)) return false;
    let changed = false;
    topics.forEach(topic => {
        if (ensureTopicShape(topic)) changed = true;
    });
    return changed;
}

function getTopicRemaining(topic) {
    const targetDays = normalizeTargetDays(topic.targetDays);
    return Math.max(0, targetDays - topic.records.length);
}

function updateExportTopicOptions() {
    const select = document.getElementById('export-topic-select');
    if (!select) return;
    select.innerHTML = '';
    appData.topics.forEach(t => {
        const op = document.createElement('option');
        op.value = t.id;
        op.innerText = t.name;
        select.appendChild(op);
    });
}

function updateTopicHeader(topic = getCurrentTopic()) {
    if (!topic) return;
    ensureTopicShape(topic);
    const streak = calculateStreak(topic.records);
    const remaining = getTopicRemaining(topic);
    document.getElementById('detail-topic-title').innerHTML = `${topic.name} <span style="font-size:16px; font-weight:normal; color:var(--text-muted); margin-left:15px; display:inline-flex; align-items:center;">🔥連續: <b style="font-size:28px; color:var(--primary); margin:0 6px;">${streak}</b>次 | 🎯剩餘: <b style="font-size:28px; color:var(--o-color); margin:0 6px;">${remaining}</b>次</span>`;
}

function setTopicEditMode(editing) {
    const editArea = document.getElementById('topic-edit-inline');
    const editBtn = document.getElementById('btn-edit-topic');
    if (!editArea || !editBtn) return;

    editArea.style.display = editing ? 'flex' : 'none';
    editBtn.style.display = editing ? 'none' : 'inline-flex';

    if (editing) {
        const topic = getCurrentTopic();
        if (!topic) return;
        document.getElementById('input-edit-topic-name').value = topic.name;
        document.getElementById('input-edit-topic-days').value = normalizeTargetDays(topic.targetDays);
    }
}

// 將 Windows / macOS 本機路徑轉為可用的 local:// URL
function toLocalUrl(savedPath) {
    // 把所有反斜線换為正斜線
    const normalized = savedPath.replace(/\\/g, '/');
    // 不能用 encodeURIComponent，那會把断路徑中的符號也編碼掉
    // 改用逐段編碼：只編碼各層路徑筆節
    const parts = normalized.split('/');
    const encoded = parts.map(p => encodeURIComponent(p)).join('/');
    return `local://${encoded}`;
}

function switchView(viewName) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[viewName].classList.add('active');
}

function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    toast.innerText = msg;
    toast.style.background = isError ? 'var(--x-color)' : 'var(--o-color)';
    toast.style.boxShadow = `0 10px 30px ${isError ? 'rgba(231, 76, 60, 0.4)' : 'rgba(46, 204, 113, 0.4)'}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// ---------------- 動態重新排序並改名 ----------------
async function reindexRecords(topic) {
    // 依日期升冪排序 (舊到新)
    topic.records.sort((a, b) => a.date.localeCompare(b.date));
    let updated = false;

    for (let i = 0; i < topic.records.length; i++) {
        const rec = topic.records[i];
        const expectedIndex = i + 1;
        let expectedName = '';
        if (rec.filename) {
            const ext = rec.filename.split('.').pop();
            const padIndex = String(expectedIndex).padStart(3, '0');
            expectedName = `${padIndex}_${rec.title}.${ext}`;
        }

        if (rec.index !== expectedIndex || rec.filename !== expectedName) {
            // 需要改名
            if (rec.savedPath && expectedName) {
                const rs = await myApi.renameFile(rec.savedPath, expectedName);
                if (rs.success) rec.savedPath = rs.savedPath;
            }
            rec.index = expectedIndex;
            rec.filename = expectedName;
            updated = true;
        }
    }
    // 改回降冪(新到舊)
    topic.records.reverse();
    if (updated) {
        await saveData();
        await saveTopicSnapshot(topic);
    }
}

// 計算目前連續打卡次數 (必須與今天或昨天相連才算沒斷)
function calculateStreak(records) {
    if (!records || records.length === 0) return 0;
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const lastRecDate = new Date(sorted[sorted.length - 1].date);
    // 嚴格模式下，超過昨天就斷了
    const diffToToday = Math.round((today - lastRecDate) / (1000 * 60 * 60 * 24));
    const isStrict = appData.settings && appData.settings.difficulty === 'hard';
    if (isStrict && diffToToday > 1) return 0;

    let streak = 1;
    let currentStreak = 1;
    let maxStreak = 1;

    for (let i = sorted.length - 1; i > 0; i--) {
        const d1 = new Date(sorted[i].date);
        const d2 = new Date(sorted[i - 1].date);
        const diff = Math.round((d1 - d2) / (1000 * 60 * 60 * 24));
        if (diff === 1) {
            streak++;
        } else {
            // 一旦中斷，如果非嚴格模式往回溯，就保留遇到的最高連續紀錄
            maxStreak = Math.max(maxStreak, streak);
            if (isStrict) break;
            streak = 1; // 重新計算另一段連續
        }
    }

    return isStrict ? streak : Math.max(maxStreak, streak);
}

// ---------------- 主題列表 ----------------
function renderDashboard() {
    topicsList.innerHTML = '';
    if (appData.topics.length === 0) {
        topicsList.innerHTML = '<p style="color:var(--text-muted); grid-column:1/-1;">目前沒有任何挑戰主題，請點擊上方按鈕新增。</p>';
        return;
    }

    appData.topics.forEach(topic => {
        ensureTopicShape(topic);
        const card = document.createElement('div');
        card.className = 'topic-card';
        const streak = calculateStreak(topic.records);
        const remaining = getTopicRemaining(topic);

        card.innerHTML = `
            <h3>${topic.name}</h3>
            <p style="color:var(--text-muted); font-size:12px; margin-bottom: 5px;">${topic.folder}</p>
            <div style="font-size:14px; margin-top: 10px; display:flex; justify-content:space-between; color:var(--text-main);">
                <span>🔥 連續: <b style="font-size:24px; color:var(--primary); margin:0 5px;">${streak}</b>次</span>
                <span>🎯 剩餘: <b style="font-size:24px; color:var(--o-color); margin:0 5px;">${remaining}</b>次</span>
            </div>
        `;
        card.onclick = () => openTopic(topic.id);
        topicsList.appendChild(card);
    });
}

// ---------------- 主題詳細 ----------------
async function openTopic(id) {
    currentTopicId = id;
    const topic = getCurrentTopic();
    updateTopicHeader(topic);
    setTopicEditMode(false);

    // reset forms and filters
    formRecord.reset();
    inputDate.value = getLocalDateString(new Date());
    reasonGroup.style.display = 'none';
    resetSelectedFile();

    formRecord.style.display = 'none';
    step1Type.style.display = 'block';
    stepTitle.innerText = '步驟 1：選擇打卡方式';

    tabBtns.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.style.display = 'none');
    if (document.querySelector('[data-target="tab-record"]')) {
        document.querySelector('[data-target="tab-record"]').classList.add('active');
        document.getElementById('tab-record').style.display = 'block';
    }

    // clear search inputs
    Object.values(searchInputs).forEach(el => el.value = '');

    // 進行自動重新編號修正(以防萬一檔名錯誤)
    await reindexRecords(topic);

    currentCalDate = new Date();
    applyFilters();
    renderCalendar();
    switchView('detail');
}

function getCurrentTopic() {
    return appData.topics.find(t => t.id === currentTopicId);
}

async function renderSelectedFilePreview(filePath, label) {
    const preview = document.getElementById('selected-file-preview');
    const ext = (filePath.split('.').pop() || '').toLowerCase();

    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) {
        const b64 = await myApi.readFileBase64(filePath);
        if (b64) {
            preview.innerHTML = `<img src="${b64}" alt="preview">`;
            return;
        }
    }

    if (['mp4', 'webm', 'ogg', 'mov'].includes(ext)) {
        preview.textContent = '影片';
        return;
    }

    preview.textContent = label || ext.toUpperCase() || '檔案';
}

async function setSelectedFilePath(filePath, label) {
    selectedFile = filePath;
    const displayName = label || filePath.split(/[\\\/]/).pop();
    const selectedFileDisplay = document.getElementById('selected-file-display');
    const clearButton = document.getElementById('btn-clear-selected-file');
    const selectedFileName = document.getElementById('selected-file-name');
    const selectedFileHint = document.getElementById('selected-file-hint');
    selectedFileDisplay.classList.remove('is-empty');
    selectedFileName.innerText = '已選取檔案';
    selectedFileHint.innerText = '點右側 X 可取消';
    selectedFileDisplay.title = displayName;
    clearButton.style.display = 'inline-flex';
    await renderSelectedFilePreview(filePath, label);
}

function resetSelectedFile() {
    selectedFile = null;
    const selectedFileDisplay = document.getElementById('selected-file-display');
    const clearButton = document.getElementById('btn-clear-selected-file');
    const preview = document.getElementById('selected-file-preview');
    const selectedFileName = document.getElementById('selected-file-name');
    const selectedFileHint = document.getElementById('selected-file-hint');
    selectedFileDisplay.classList.add('is-empty');
    preview.innerHTML = '檔案';
    selectedFileName.innerText = '拖曳到此處或選擇檔案';
    selectedFileHint.innerText = '支援圖片、影片與 GIF';
    selectedFileDisplay.title = '';
    clearButton.style.display = 'none';
}

// 打卡
async function handleRecordSubmit(e) {
    e.preventDefault();
    const topic = getCurrentTopic();
    const dateStr = inputDate.value;
    let title = document.getElementById('input-title').value.trim();
    const reason = document.getElementById('input-reason').value.trim();
    const existingRecordIndex = topic.records.findIndex(r => r.date === dateStr);
    const existingRecord = existingRecordIndex === -1 ? null : topic.records[existingRecordIndex];

    if (existingRecord) {
        const shouldOverwrite = await myApi.confirm('已有打卡，是否要覆蓋舊紀錄？');
        if (!shouldOverwrite) return;
    }

    const selDate = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (selDate < yesterday && !reason) {
        showToast('超過昨天補卡，必須填寫錯過理由！', true); return;
    }

    // 連續性驗證
    const recordsAsc = topic.records
        .filter((_, idx) => idx !== existingRecordIndex)
        .sort((a, b) => a.date.localeCompare(b.date));
    if (recordsAsc.length > 0) {
        const lastDate = new Date(recordsAsc[recordsAsc.length - 1].date);
        const diff = (selDate - lastDate) / (1000 * 60 * 60 * 24);
        if (diff > 1) {
            if (!await myApi.confirm(`你選的不是連續日期唷！跳過了 ${Math.floor(diff) - 1} 天，確定要繼續嗎？`)) return;
        }
    }

    if (!title) title = `第 ${topic.records.length + (existingRecord ? 0 : 1)} 次挑戰`;

    // 先暫時塞一個假的 index，等一下靠 reindexRecords 計算與改名
    const fakeIndex = topic.records.length + 1;
    let newFileName = '';
    let savedPath = '';

    if (selectedFile) {
        const ext = selectedFile.split('.').pop();
        newFileName = `TEMP_${Date.now()}.${ext}`;

        const res = await myApi.saveFile(selectedFile, topic.folder, newFileName);
        if (!res.success) {
            showToast('檔案儲存失敗：' + res.error, true); return;
        }
        savedPath = res.savedPath;
    }

    if (existingRecord) {
        if (existingRecord.savedPath) {
            await myApi.deleteFile(existingRecord.savedPath);
        }
        topic.records.splice(existingRecordIndex, 1);
    }

    topic.records.push({
        index: fakeIndex,
        date: dateStr,
        title,
        filename: newFileName,
        savedPath: savedPath,
        reason: selDate < yesterday ? reason : ''
    });

    await reindexRecords(topic); // 會自動重新排序並改檔名

    showToast('🎉 打卡成功！');
    formRecord.reset();
    inputDate.value = getLocalDateString(new Date());
    reasonGroup.style.display = 'none';
    resetSelectedFile();

    formRecord.style.display = 'none';
    step1Type.style.display = 'block';
    stepTitle.innerText = '步驟 1：選擇打卡方式';

    // 更新標題數據
    updateTopicHeader(topic);

    applyFilters();
    renderCalendar();
}

async function deleteRecord(recordDate, event) {
    if (event) event.stopPropagation(); // 避免觸發 lightbox
    if (!await myApi.confirm('確定要刪除這筆挑戰紀錄嗎？關聯的檔案也會一起被刪除！')) return;

    const topic = getCurrentTopic();
    const idx = topic.records.findIndex(r => r.date === recordDate);
    if (idx === -1) return;

    const rec = topic.records[idx];
    if (rec.savedPath) {
        await myApi.deleteFile(rec.savedPath);
    }

    topic.records.splice(idx, 1);
    await reindexRecords(topic); // 動態把後面的補上，例如 3 刪除了，原 4 會變 3，並連帶改檔名

    showToast('紀錄已刪除');

    updateTopicHeader(topic);

    applyFilters();
    renderCalendar();
    return true;
}

// ---------------- 紀錄列表、搜尋與分頁 ----------------
function applyFilters() {
    const topic = getCurrentTopic();
    const qTitle = searchInputs.title.value.toLowerCase();
    const qExt = searchInputs.ext.value.toLowerCase();
    const dStart = searchInputs.start.value;
    const dEnd = searchInputs.end.value;

    filteredRecords = topic.records.filter(r => {
        if (qTitle && !r.title.toLowerCase().includes(qTitle)) return false;
        if (qExt) {
            const ext = r.filename.split('.').pop().toLowerCase();
            if (!ext.includes(qExt)) return false;
        }
        if (dStart && r.date < dStart) return false;
        if (dEnd && r.date > dEnd) return false;
        return true;
    });

    currentPage = 1;
    renderRecordsList();
}

async function renderRecordsList() {
    recordsContainer.innerHTML = '';
    const totalPages = Math.ceil(filteredRecords.length / itemsPerPage) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    document.getElementById('page-info').innerText = `${currentPage} / ${totalPages}`;

    if (filteredRecords.length === 0) {
        recordsContainer.innerHTML = '<p style="color:var(--text-muted); text-align:center;">找不到符合的紀錄</p>';
        return;
    }

    const startIndex = (currentPage - 1) * itemsPerPage;
    const paginated = filteredRecords.slice(startIndex, startIndex + itemsPerPage);

    for (let i = 0; i < paginated.length; i++) {
        const rec = paginated[i];

        const item = document.createElement('div');
        item.className = 'record-item';

        let thumbEl = null; // DOM element to append separately for async

        item.innerHTML = `
            <div class="record-thumb-wrap"></div>
            <div class="record-info">
                <span class="record-title">第${rec.index}次：${rec.title}</span>
                <span class="record-meta">${rec.date} ${rec.reason ? ' [補卡: ' + rec.reason + ']' : ''} | ${rec.filename || '純文字紀錄'}</span>
            </div>
            <button class="btn-delete-record" title="刪除紀錄">🗑️</button>
        `;

        // 非同步填入縮圖
        const thumbWrap = item.querySelector('.record-thumb-wrap');
        if (rec.savedPath) {
            const ext = (rec.filename || '').split('.').pop().toLowerCase();
            const isVid = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);
            if (isVid) {
                thumbWrap.innerHTML = '<div class="record-thumb" style="display:flex;justify-content:center;align-items:center;font-size:24px;">🎥</div>';
            } else {
                myApi.readFileBase64(rec.savedPath).then(b64 => {
                    if (b64) {
                        const img = document.createElement('img');
                        img.className = 'record-thumb';
                        img.src = b64;
                        thumbWrap.innerHTML = '';
                        thumbWrap.appendChild(img);
                    } else {
                        thumbWrap.innerHTML = '<div class="record-thumb" style="display:flex;justify-content:center;align-items:center;font-size:24px;">🖼</div>';
                    }
                });
                thumbWrap.innerHTML = '<div class="record-thumb" style="display:flex;justify-content:center;align-items:center;">讀取中...</div>';
            }
        } else {
            thumbWrap.innerHTML = '<div class="record-thumb" style="display:flex;justify-content:center;align-items:center;font-size:24px;">📝</div>';
        }

        item.onclick = () => openLightboxDynamic(startIndex + i);
        item.querySelector('.btn-delete-record').onclick = (e) => deleteRecord(rec.date, e);
        recordsContainer.appendChild(item);
    }
}

// ---------------- 日曆 ----------------
async function renderCalendar() {
    const topic = getCurrentTopic();
    const year = currentCalDate.getFullYear();
    const month = currentCalDate.getMonth();
    document.getElementById('cal-month-year').innerText = `${year}年 ${month + 1}月`;

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    calendarGrid.innerHTML = '';
    const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
    weekdays.forEach(wd => {
        const el = document.createElement('div');
        el.innerText = wd; el.style.fontWeight = 'bold'; el.style.paddingBottom = '5px';
        calendarGrid.appendChild(el);
    });

    for (let i = 0; i < firstDay; i++) {
        calendarGrid.appendChild(document.createElement('div'));
    }

    const todayStr = getLocalDateString(new Date());
    const recordMap = {};
    topic.records.forEach(r => recordMap[r.date] = r);

    // 尋找全範圍打卡中斷日 (X)
    const missedDates = new Set();
    if (topic.records.length > 0) {
        const datesArray = topic.records.map(r => r.date).sort();
        const start = new Date(datesArray[0]);
        const end = new Date(datesArray[datesArray.length - 1]);
        for (let d = start; d <= end; d.setDate(d.getDate() + 1)) {
            const dStr = getLocalDateString(d);
            if (!recordMap[dStr]) missedDates.add(dStr);
        }
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day';

        const cellDate = new Date(year, month, day);
        const cellDateStr = getLocalDateString(cellDate);

        // 左上角標示純日期數字
        cell.innerHTML = `<span class="date-val">${day}</span>`;

        if (cellDateStr === todayStr) cell.classList.add('today');

        // ① 或 X，以及略縮圖
        if (recordMap[cellDateStr]) {
            const rec = recordMap[cellDateStr];
            cell.classList.add('has-o');
            cell.setAttribute('data-index', rec.index); // 傳入 css 做 ①, ②, ③ 使用 content... 

            if (rec.savedPath) {
                const ext = (rec.filename || '').split('.').pop().toLowerCase();
                const isVid = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);

                if (isVid) {
                    // 影片用冊圖示，不嘗試噇入播放
                    cell.classList.add('has-thumb');
                } else {
                    // 圖片用 base64
                    myApi.readFileBase64(rec.savedPath).then(b64 => {
                        if (b64) {
                            cell.style.backgroundImage = `url('${b64}')`;
                            cell.classList.add('has-thumb');
                        }
                    });
                }
            }
            // 點擊可以開啟圖片
            cell.style.cursor = 'pointer';
            cell.onclick = () => {
                // 找到該日期在 filteredRecords 內的順序
                const findLocalIdx = filteredRecords.findIndex(r => r.date === cellDateStr);
                if (findLocalIdx !== -1) openLightboxDynamic(findLocalIdx);
            }
        } else if (missedDates.has(cellDateStr)) {
            cell.classList.add('has-x');
        } else {
            // 空白日期：點擊後將日期帶至指定日期欄
            const isAvailable = new Date(cellDateStr) <= new Date(getLocalDateString(new Date()));
            if (isAvailable) {
                cell.style.cursor = 'pointer';
                cell.title = '點擊帶入此日期';
                cell.onclick = () => {
                    inputDate.value = cellDateStr;
                    inputDate.dispatchEvent(new Event('change')); // 觸發處理理由欄泳現
                    // 滾動到表單
                    document.getElementById('form-record').scrollIntoView({ behavior: 'smooth', block: 'center' });
                };
            }
        }
        calendarGrid.appendChild(cell);
    }
}

// ---------------- 互動與事件 ----------------
function setupEventListeners() {
    // Tabs
    tabBtns.forEach(btn => {
        btn.onclick = () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.style.display = 'none');
            btn.classList.add('active');
            document.getElementById(btn.dataset.target).style.display = 'block';
        };
    });

    // Step-by-step
    document.getElementById('btn-type-text').onclick = () => {
        step1Type.style.display = 'none';
        formRecord.style.display = 'block';
        fileUploadGroup.style.display = 'none';
        stepTitle.innerText = '步驟 2：填寫純文字紀錄';

        const topic = getCurrentTopic();
        document.getElementById('input-title').placeholder = `預設自動名稱 (如: 第 ${topic.records.length + 1} 次挑戰)`;
        document.getElementById('input-title').value = '';
    };

    document.getElementById('btn-type-media').onclick = () => {
        step1Type.style.display = 'none';
        formRecord.style.display = 'block';
        fileUploadGroup.style.display = 'block';
        stepTitle.innerText = '步驟 2：上傳檔案與填寫日期';

        const topic = getCurrentTopic();
        document.getElementById('input-title').placeholder = `預設自動名稱 (如: 第 ${topic.records.length + 1} 次挑戰)`;
        document.getElementById('input-title').value = '';
    };

    btnBackStep1.onclick = () => {
        formRecord.style.display = 'none';
        step1Type.style.display = 'block';
        stepTitle.innerText = '步驟 1：選擇打卡方式';
    };

    const dragArea = document.getElementById('drag-drop-area');
    const clearSelectedFileBtn = document.getElementById('btn-clear-selected-file');
    const extractDroppedFilePath = async (dataTransfer) => {
        if (!dataTransfer) return null;
        if (dataTransfer.files && dataTransfer.files.length > 0) {
            const file = dataTransfer.files[0];
            const filePath = myApi.getPathForFile(file);
            if (filePath) return filePath;
        }
        if (dataTransfer.items && dataTransfer.items.length > 0) {
            for (const item of dataTransfer.items) {
                const file = item.getAsFile?.();
                if (!file) continue;
                const filePath = myApi.getPathForFile(file);
                if (filePath) return filePath;
            }
        }
        return null;
    };

    const applyDraggedFile = async (filePath) => {
        if (!filePath) return;
        await setSelectedFilePath(filePath);
    };

    if (dragArea) {
        dragArea.addEventListener('dragover', e => {
            e.preventDefault();
            e.stopPropagation();
            dragArea.classList.add('is-dragging');
        });
        dragArea.addEventListener('dragleave', e => {
            e.preventDefault();
            e.stopPropagation();
            dragArea.classList.remove('is-dragging');
        });
        dragArea.addEventListener('drop', async e => {
            e.preventDefault();
            e.stopPropagation();
            dragArea.classList.remove('is-dragging');
            const droppedFilePath = await extractDroppedFilePath(e.dataTransfer);
            if (!droppedFilePath) {
                showToast('拖曳的項目無法讀取，請改用瀏覽檔案', true);
                return;
            }
            await applyDraggedFile(droppedFilePath);
        });
    }

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evtName => {
        window.addEventListener(evtName, e => {
            e.preventDefault();
            if (evtName !== 'dragleave') e.stopPropagation();
        });
    });

    document.getElementById('btn-create-topic').onclick = () => {
        modalAddTopic.classList.add('active');
        selectedDir = null;
        document.getElementById('selected-dir-name').innerText = '未選擇';
        document.getElementById('input-topic-days').value = DEFAULT_TARGET_DAYS;
    };
    document.getElementById('btn-cancel-topic').onclick = () => modalAddTopic.classList.remove('active');

    // 說明 Modal
    document.getElementById('btn-help').onclick = () => document.getElementById('modal-help').classList.add('active');
    document.getElementById('btn-help-close').onclick = () => document.getElementById('modal-help').classList.remove('active');
    document.getElementById('modal-help').addEventListener('click', (e) => {
        if (e.target === document.getElementById('modal-help')) document.getElementById('modal-help').classList.remove('active');
    });

    document.getElementById('btn-back').onclick = () => {
        setTopicEditMode(false);
        saveData();
        renderDashboard();
        switchView('dashboard');
    };

    document.getElementById('btn-edit-topic').onclick = () => {
        setTopicEditMode(true);
    };

    document.getElementById('btn-cancel-topic-edit').onclick = () => {
        setTopicEditMode(false);
    };

    document.getElementById('btn-save-topic-edit').onclick = async () => {
        const topic = getCurrentTopic();
        if (!topic) return;

        const nextName = document.getElementById('input-edit-topic-name').value.trim();
        const nextDays = normalizeTargetDays(document.getElementById('input-edit-topic-days').value);
        if (!nextName) {
            showToast('主題名稱不可為空白', true);
            return;
        }

        topic.name = nextName;
        topic.targetDays = nextDays;
        await saveData();
        await saveTopicSnapshot(topic);
        updateTopicHeader(topic);
        setTopicEditMode(false);
        renderDashboard();
        updateExportTopicOptions();
        showToast('主題已更新');
    };

    // 刪除整個主題
    document.getElementById('btn-delete-topic').onclick = async () => {
        if (await myApi.confirm('確定要永久刪除此挑戰主題的所有紀錄與名單追蹤嗎？(資料夾內的原始檔案不會被刪除)')) {
            const topic = getCurrentTopic();
            await saveTopicSnapshot(topic);
            const idx = appData.topics.findIndex(t => t.id === currentTopicId);
            if (idx !== -1) appData.topics.splice(idx, 1);
            await saveData();
            switchView('dashboard');
            renderDashboard();
            showToast('已刪除挑戰主題');
        }
    };

    document.getElementById('btn-select-dir').onclick = async () => {
        const dir = await myApi.selectDirectory();
        if (dir) {
            selectedDir = dir;
            document.getElementById('selected-dir-name').innerText = dir;
            document.getElementById('selected-dir-name').title = dir;
        }
    };

    document.getElementById('form-topic').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('input-topic-name').value.trim();
        const targetDays = normalizeTargetDays(document.getElementById('input-topic-days').value);
        if (!selectedDir) { showToast('請選擇存檔位置', true); return; }

        const newTopic = {
            id: Date.now().toString(),
            name,
            folder: selectedDir,
            targetDays,
            records: []
        };
        appData.topics.push(newTopic);
        await saveData();
        await saveTopicSnapshot(newTopic);

        document.getElementById('form-topic').reset();
        modalAddTopic.classList.remove('active');
        renderDashboard();
        showToast('建立成功');
    };

    inputDate.onchange = () => {
        const selDate = new Date(inputDate.value);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        if (selDate < yesterday || isNaN(selDate.getTime())) {
            reasonGroup.style.display = 'block';
            document.getElementById('input-reason').required = true;
        } else {
            reasonGroup.style.display = 'none';
            document.getElementById('input-reason').required = false;
            document.getElementById('input-reason').value = '';
        }
    };

    document.getElementById('btn-select-file').onclick = async () => {
        const file = await myApi.selectFile();
        if (file) {
            await setSelectedFilePath(file);
        }
    };

    clearSelectedFileBtn.onclick = () => {
        resetSelectedFile();
    };

    // 剪貼簿貼上：按鈕 或 Ctrl/Cmd+V（焦點不在文字欄位時）
    async function pasteFromClipboard() {
        const format = appData.settings?.clipboardImageFormat || DEFAULT_CLIPBOARD_IMAGE_FORMAT;
        const result = await myApi.saveClipboardImage(format);
        if (result.success) {
            await setSelectedFilePath(result.filePath, `📋 ${format.toUpperCase()}`);
            showToast('📋 已貼上剪貼簿圖片！');
        } else {
            showToast('剪貼簿上沒有圖片可貼上', true);
        }
    }

    document.getElementById('btn-paste-clipboard').onclick = pasteFromClipboard;

    document.getElementById('theme-toggle').onchange = async (e) => {
        const themeMode = e.target.checked ? 'dark' : 'light';
        appData.settings.themeMode = themeMode;
        applyTheme(themeMode);
        await saveData();
    };

    document.addEventListener('keydown', async (e) => {
        const isCtrlV = (e.ctrlKey || e.metaKey) && e.key === 'v';
        if (!isCtrlV) return;
        // 只在詳細頁啟用
        if (!views.detail.classList.contains('active')) return;
        // 焦點在文字輸入框時，讓瀏覽器預設處理（正常貼上文字）
        const tag = document.activeElement?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        // 嘗試從剪貼簿讀圖
        e.preventDefault();
        await pasteFromClipboard();
    });

    formRecord.onsubmit = handleRecordSubmit;

    document.getElementById('cal-prev').onclick = () => { currentCalDate.setMonth(currentCalDate.getMonth() - 1); renderCalendar(); };
    document.getElementById('cal-next').onclick = () => { currentCalDate.setMonth(currentCalDate.getMonth() + 1); renderCalendar(); };

    document.getElementById('btn-settings').onclick = () => {
        // 更新設定頁面UI選項
        const isEasy = appData.settings && appData.settings.difficulty === 'easy';
        document.getElementById('diff-easy').checked = isEasy;
        document.getElementById('diff-hard').checked = !isEasy;
        document.getElementById('clipboard-image-format').value = appData.settings?.clipboardImageFormat || DEFAULT_CLIPBOARD_IMAGE_FORMAT;

        // 刷新匯出清單
        updateExportTopicOptions();

        switchView('settings');
    }

    document.getElementById('btn-back-settings').onclick = () => {
        switchView('dashboard');
        renderDashboard(); // 回來時也要重新繪製(可能改了難度)
    };

    document.getElementById('btn-save-settings').onclick = async () => {
        const val = document.querySelector('input[name="difficulty"]:checked').value;
        appData.settings.difficulty = val;
        appData.settings.clipboardImageFormat = document.getElementById('clipboard-image-format').value;
        ensureSettingsShape(appData.settings);
        await saveData();
        showToast('設定已儲存！');
    };

    // 匯出/匯入 (全系統或單一)
    document.getElementById('btn-export-all').onclick = async () => {
        const exportData = JSON.stringify(appData, null, 2);
        const success = await myApi.exportJson(exportData, `365挑戰紀錄_完整備份.json`);
        if (success) showToast('完整匯出成功！');
    };

    document.getElementById('btn-export-single').onclick = async () => {
        const tId = document.getElementById('export-topic-select').value;
        if (!tId) { showToast('未選擇任何主題', true); return; }
        const topic = appData.topics.find(t => t.id === tId);

        // 單獨匯出這個 topic, 保留它的結構
        const exportObj = { type: 'single_topic', topic };
        const exportData = JSON.stringify(exportObj, null, 2);
        const success = await myApi.exportJson(exportData, `${topic.name}_單一備份.json`);
        if (success) showToast('主題匯出成功！');
    };

    document.getElementById('btn-import-settings').onclick = async () => {
        const dataStr = await myApi.importJson();
        if (!dataStr) return;
        try {
            const imported = JSON.parse(dataStr);
            if (!imported) throw new Error('格式錯誤');

            if (imported.topics && Array.isArray(imported.topics)) {
                // 是完整備份
                if (confirm('匯入完整備份將取代當前所有的紀錄，確定繼續嗎？')) {
                    appData = imported;
                    if (!appData.settings) appData.settings = { difficulty: 'hard', clipboardImageFormat: DEFAULT_CLIPBOARD_IMAGE_FORMAT, themeMode: DEFAULT_THEME_MODE };
                    ensureSettingsShape(appData.settings);
                    ensureTopicsTargetDays(appData.topics);
                    // 重新編碼
                    for (const t of appData.topics) await reindexRecords(t);
                    await saveData();
                    await saveAllTopicSnapshots(appData.topics);
                    applyTheme(appData.settings.themeMode);
                    showToast('完整匯入成功！');
                    switchView('dashboard');
                    renderDashboard();
                }
            } else if (imported.type === 'single_topic' && imported.topic) {
                // 單一主題備份
                if (confirm(`準備匯入挑戰主題「${imported.topic.name}」，這會新增為一個新主題，確不繼續？`)) {
                    ensureTopicShape(imported.topic);
                    imported.topic.id = Date.now().toString(); // 重配新ID
                    appData.topics.push(imported.topic);
                    await reindexRecords(imported.topic);
                    await saveData();
                    await saveTopicSnapshot(imported.topic);
                    showToast('主題匯入成功！');
                    switchView('dashboard');
                    renderDashboard();
                }
            } else if (imported.id && imported.records) {
                // 舊版的單一紀錄備份
                if (confirm(`準備匯入挑戰主題「${imported.name}」，這會新增為一個新主題，確定繼續？`)) {
                    imported.id = Date.now().toString(); // 重配新ID
                    ensureTopicShape(imported);
                    appData.topics.push(imported);
                    await reindexRecords(imported);
                    await saveData();
                    await saveTopicSnapshot(imported);
                    showToast('舊主題版匯入成功！');
                    switchView('dashboard');
                    renderDashboard();
                }
            } else {
                throw new Error('未知的匯入格式');
            }
        } catch (e) {
            showToast('匯入失敗：' + e.message, true);
        }
    };

    // 搜尋功能
    Object.values(searchInputs).forEach(input => {
        input.addEventListener('input', applyFilters);
    });

    // 分頁
    document.getElementById('btn-page-prev').onclick = () => {
        if (currentPage > 1) { currentPage--; renderRecordsList(); }
    };
    document.getElementById('btn-page-next').onclick = () => {
        const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
        if (currentPage < totalPages) { currentPage++; renderRecordsList(); }
    };

    setupLightboxEvents();
}

// ---------------- 滿螢幕檢視圖層 Lightbox 與無限拖曳縮放 ----------------
const lightbox = document.getElementById('lightbox');
const lightboxWrapper = document.getElementById('lightbox-wrapper');
const lightboxTitle = document.getElementById('lightbox-title');
let mediaEl = null; // 動態綁定的元素 img 或 video
let currentFilteredIdx = -1; // 用來在搜尋結果內前後切換

// 轉換變數
let tz = 1, tx = 0, ty = 0;
let isDrag = false, startX, startY;

async function openLightboxDynamic(idxOfFiltered) {
    if (idxOfFiltered < 0 || idxOfFiltered >= filteredRecords.length) return;
    currentFilteredIdx = idxOfFiltered;
    const rec = filteredRecords[idxOfFiltered];

    lightboxTitle.innerText = `第${rec.index}次 - ${rec.title} (${rec.date})`;

    lightboxWrapper.innerHTML = '';

    if (rec.savedPath) {
        const ext = (rec.filename || '').split('.').pop().toLowerCase();
        const isVid = ['mp4', 'webm', 'ogg', 'mov'].includes(ext);

        if (isVid) {
            // 影片無法直接內嵌，提供打開按鈕
            mediaEl = document.createElement('div');
            mediaEl.style.cssText = 'color:#ccc;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;';
            mediaEl.innerHTML = `
                <div style="font-size:64px">🎥</div>
                <h2>影片無法在軟體內部預覽</h2>
                <p style="font-size:18px; color:#999;">${rec.filename}</p>
                <div style="display:flex; gap:15px; margin-top:10px;">
                    <button id="lb-open-file" style="padding:12px 24px; font-size:16px; background:var(--primary); border-radius:8px; border:none; color:white; cursor:pointer;">📂 用系統播放器打開</button>
                    <button id="lb-open-folder" style="padding:12px 24px; font-size:16px; background:rgba(255,255,255,0.1); border-radius:8px; border:none; color:white; cursor:pointer;">🗋 開啟所在資料夾</button>
                </div>
            `;
        } else {
            // 圖片用 base64顯示
            mediaEl = document.createElement('img');
            mediaEl.style.maxWidth = '90vw';
            mediaEl.style.maxHeight = '90vh';
            // 先顯示讀取中狀態
            const b64 = await myApi.readFileBase64(rec.savedPath);
            if (b64) {
                mediaEl.src = b64;
            } else {
                mediaEl.alt = '無法讀取檔案';
                mediaEl.style.display = 'none';
                // 變成提示卡
                const errDiv = document.createElement('div');
                errDiv.style.cssText = 'color:#ccc;text-align:center;';
                errDiv.innerHTML = `
                    <div style="font-size:48px;">⚠️</div>
                    <h2 style="margin:10px 0;">無法讀取圖片</h2>
                    <p>${rec.savedPath}</p>
                    <div style="display:flex;gap:15px;margin-top:15px;justify-content:center;">
                        <button id="lb-open-file" style="padding:10px 20px;background:var(--primary);border-radius:8px;border:none;color:white;cursor:pointer;font-size:15px;">📂 用系統開啓</button>
                        <button id="lb-open-folder" style="padding:10px 20px;background:rgba(255,255,255,0.1);border-radius:8px;border:none;color:white;cursor:pointer;font-size:15px;">🗋 開啟資料夾</button>
                    </div>
                `;
                lightboxWrapper.appendChild(errDiv);
            }
        }
    } else {
        // 純文字紀錄
        mediaEl = document.createElement('div');
        mediaEl.style.cssText = 'color:#ccc;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:15px;';
        mediaEl.innerHTML = `
            <div style="font-size:64px; margin-bottom: 10px;">📝</div>
            <h2>無夾帶檔案的純文字紀錄</h2>
            <p style="font-size:18px;">標題：${rec.title}</p>
            <p style="font-size:14px; color:#888;">日期：${rec.date}</p>
            ${rec.reason ? `<p style="font-size:14px; color:#aaa;">補卡理由：${rec.reason}</p>` : ''}
            <button id="lb-open-folder" style="padding:10px 20px; margin-top:10px; background:rgba(255,255,255,0.1); border-radius:8px; border:none; color:white; cursor:pointer; font-size:15px;">🗋 開啟對應資料夾</button>
        `;
    }

    mediaEl.id = 'lightbox-media';
    mediaEl.draggable = false;
    lightboxWrapper.appendChild(mediaEl);

    // 綁定開檔 / 開資料夾按鈕
    const btnFile = document.getElementById('lb-open-file');
    const btnFolder = document.getElementById('lb-open-folder');
    if (btnFile) btnFile.onclick = (e) => { e.stopPropagation(); myApi.openFile(rec.savedPath); };
    if (btnFolder) btnFolder.onclick = (e) => { e.stopPropagation(); myApi.showInFolder(rec.savedPath || getCurrentTopic().folder); };

    // Reset view
    tz = 1; tx = 0; ty = 0;
    updateImgTransform();
    lightbox.classList.add('active');
}

function navLightboxFiltered(dir) {
    let newIdx = currentFilteredIdx + dir;
    if (newIdx < 0) newIdx = filteredRecords.length - 1;
    if (newIdx >= filteredRecords.length) newIdx = 0;
    openLightboxDynamic(newIdx);
}

function updateImgTransform() {
    if (mediaEl) mediaEl.style.transform = `translate(${tx}px, ${ty}px) scale(${tz})`;
}

function setupLightboxEvents() {
    const deleteCurrentRecordBtn = document.getElementById('btn-delete-current-record');
    document.getElementById('lightbox-close').onclick = () => lightbox.classList.remove('active');
    document.getElementById('lightbox-prev').onclick = () => navLightboxFiltered(1);
    document.getElementById('lightbox-next').onclick = () => navLightboxFiltered(-1);
    deleteCurrentRecordBtn.onclick = async (e) => {
        e.stopPropagation();
        if (currentFilteredIdx < 0 || currentFilteredIdx >= filteredRecords.length) return;
        const rec = filteredRecords[currentFilteredIdx];
        const deleted = await deleteRecord(rec.date);
        if (deleted) {
            lightbox.classList.remove('active');
        }
    };

    // 點黑底（lightbox 本身或 wrapper 空白區域）關閉
    // 但若剛結束拖曳，忽略這次 click（避免大幅移動後誤觸關閉）
    let wasDragging = false;
    lightbox.addEventListener('click', (e) => {
        if (wasDragging) { wasDragging = false; return; }
        if (e.target === lightbox || e.target === lightboxWrapper) {
            lightbox.classList.remove('active');
        }
    });

    window.addEventListener('keydown', (e) => {
        if (!lightbox.classList.contains('active')) return;
        if (e.key === 'ArrowRight') navLightboxFiltered(-1);
        if (e.key === 'ArrowLeft') navLightboxFiltered(1);
        if (e.key === 'Escape') lightbox.classList.remove('active');
    });

    // 按鈕縮放
    document.getElementById('btn-zoom-in').onclick = () => { tz = Math.min(tz + 0.2, 8); updateImgTransform(); };
    document.getElementById('btn-zoom-out').onclick = () => { tz = Math.max(tz - 0.2, 0.2); updateImgTransform(); };

    // 滾輪縮放
    lightboxWrapper.addEventListener('wheel', (e) => {
        if (!lightbox.classList.contains('active')) return;
        e.preventDefault();
        tz += e.deltaY > 0 ? -0.1 : 0.1;
        if (tz < 0.2) tz = 0.2;
        if (tz > 8) tz = 8;
        updateImgTransform();
    }, { passive: false });

    // 滑鼠拖曳：移動超過門檻才算「拖曳」，純點擊不會誤判
    let isMouseDown = false;
    let mouseDownX = 0, mouseDownY = 0;
    const DRAG_THRESHOLD = 5; // px

    lightboxWrapper.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isMouseDown = true;
        mouseDownX = e.clientX;
        mouseDownY = e.clientY;
        startX = e.clientX - tx;
        startY = e.clientY - ty;
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
        if (!isMouseDown) return;
        const dx = Math.abs(e.clientX - mouseDownX);
        const dy = Math.abs(e.clientY - mouseDownY);
        // 超過門檻才進入拖曳模式
        if (!isDrag && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
            isDrag = true;
        }
        if (isDrag) {
            tx = e.clientX - startX;
            ty = e.clientY - startY;
            updateImgTransform();
        }
    });

    window.addEventListener('mouseup', () => {
        wasDragging = isDrag; // 只有真正拖曳過才標記
        isDrag = false;
        isMouseDown = false;
        document.body.style.userSelect = '';
    });
}

document.addEventListener('DOMContentLoaded', init);
