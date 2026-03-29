const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, nativeImage } = require('electron');
const os = require('os');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');

    // 不再預設開啟，改為註冊快捷鍵 (F12) 讓使用者可以隨時呼叫
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
            mainWindow.webContents.toggleDevTools();
            event.preventDefault();
        }
    });

    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
        console.log(`[Frontend] ${message} (at ${sourceId}:${line})`);
    });
}

// 必須在 app.whenReady() 之前宣告，讓 local:// 有正常媒體權限
// (already removed - using shell.openPath instead)

app.whenReady().then(() => {

    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// IPC: 選擇資料夾
ipcMain.handle('dialog:selectDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
    });
    if (result.canceled) {
        return null;
    }
    return result.filePaths[0];
});

// IPC: 選擇單一檔案(如果是要上傳檔案，可以用 input type=file，但 Electron 有時也用 dialog)
ipcMain.handle('dialog:selectFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Images & Media', extensions: ['jpg', 'png', 'gif', 'mp4', 'jpeg'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });
    if (result.canceled) {
        return null;
    }
    return result.filePaths[0];
});

// IPC: 儲存檔案到指定路徑並改名
ipcMain.handle('fs:saveFile', async (event, sourcePath, targetDir, newFileName) => {
    try {
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }
        const targetPath = path.join(targetDir, newFileName);
        fs.copyFileSync(sourcePath, targetPath);
        return { success: true, savedPath: targetPath };
    } catch (error) {
        console.error('Save file error:', error);
        return { success: false, error: error.message };
    }
});

// IPC: 刪除檔案
ipcMain.handle('fs:deleteFile', async (event, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return { success: true };
        }
        return { success: false, error: '檔案不存在' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// IPC: 重新命名檔案
ipcMain.handle('fs:renameFile', async (event, oldPath, newFileName) => {
    try {
        if (fs.existsSync(oldPath)) {
            const dir = path.dirname(oldPath);
            const newPath = path.join(dir, newFileName);
            // 避免覆蓋
            if (oldPath !== newPath && fs.existsSync(newPath)) {
                return { success: false, error: '目標檔名已存在' };
            }
            fs.renameSync(oldPath, newPath);
            return { success: true, savedPath: newPath };
        }
        return { success: false, error: '檔案不存在' };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// IPC: 讀取全域檔案 (例如 userData 中的 topics.json)
ipcMain.handle('fs:readData', async (event, filename) => {
    try {
        const userDataPath = app.getPath('userData');
        const filePath = path.join(userDataPath, filename);
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
        return null;
    } catch (error) {
        console.error('Read data error:', error);
        return null;
    }
});

// IPC: 寫入全域檔案
ipcMain.handle('fs:writeData', async (event, filename, data) => {
    try {
        const userDataPath = app.getPath('userData');
        const filePath = path.join(userDataPath, filename);
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
        return { success: true };
    } catch (error) {
        console.error('Write data error:', error);
        return { success: false, error: error.message };
    }
});

ipcMain.handle('fs:writeTopicSnapshot', async (event, topic) => {
    try {
        if (!topic || !topic.folder) {
            return { success: false, error: '主題資料夾不存在' };
        }

        if (!fs.existsSync(topic.folder)) {
            fs.mkdirSync(topic.folder, { recursive: true });
        }

        const filePath = path.join(topic.folder, '__topic_autosave__.json');
        const snapshot = {
            type: 'single_topic',
            source: 'autosave',
            exportedAt: new Date().toISOString(),
            topic
        };

        fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), 'utf-8');
        return { success: true, filePath };
    } catch (error) {
        console.error('Write topic snapshot error:', error);
        return { success: false, error: error.message };
    }
});

// IPC: 匯出匯入 (Dialog)
ipcMain.handle('dialog:exportJson', async (event, dataStr, defaultName) => {
    const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultName,
        filters: [{ name: 'JSON file', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePath) {
        fs.writeFileSync(result.filePath, dataStr, 'utf-8');
        return true;
    }
    return false;
});

ipcMain.handle('dialog:importJson', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'JSON file', extensions: ['json'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
        const content = fs.readFileSync(result.filePaths[0], 'utf-8');
        return content;
    }
    return null;
});

// 使用原生 messageBox 替代瀏覽器 confirm，避免失焦導致的 input focus bug
ipcMain.handle('dialog:confirm', async (event, message) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['確定', '取消'],
        defaultId: 0,
        cancelId: 1,
        title: '確認',
        message: message
    });
    return response === 0;
});

// IPC: 讀取剪貼簿圖片並存到暫存資料夾
ipcMain.handle('clipboard:saveImage', async (event, format = 'png') => {
    try {
        const image = clipboard.readImage();
        if (image.isEmpty()) return { success: false, error: '剪貼簿上沒有圖片' };

        const normalizedFormat = format === 'jpg' ? 'jpg' : 'png';
        const ext = normalizedFormat === 'jpg' ? 'jpg' : 'png';
        const tmpFile = path.join(os.tmpdir(), `clipboard_${Date.now()}.${ext}`);
        const buffer = normalizedFormat === 'jpg' ? image.toJPEG(90) : image.toPNG();

        fs.writeFileSync(tmpFile, buffer);
        return { success: true, filePath: tmpFile };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// IPC: 用第三方軟體打開檔案
ipcMain.handle('shell:openFile', async (event, filePath) => {
    const err = await shell.openPath(filePath);
    return err === '' ? { success: true } : { success: false, error: err };
});

// IPC: 在資料夾中類選檔案
ipcMain.handle('shell:showInFolder', (event, filePath) => {
    shell.showItemInFolder(filePath);
});

// 為了讓前端能載入本地圖片，使用 readFileBase64 API
// 為避免 CSP 問題，我們提供一個讀取圖片轉 base64 的 API
ipcMain.handle('fs:readFileBase64', async (event, filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            const ext = path.extname(filePath).toLowerCase();
            let mime = 'image/jpeg';
            if (ext === '.png') mime = 'image/png';
            if (ext === '.gif') mime = 'image/gif';

            const bitmap = fs.readFileSync(filePath);
            return `data:${mime};base64,${Buffer.from(bitmap).toString('base64')}`;
        }
        return null;
    } catch (err) {
        console.error(err);
        return null;
    }
});
