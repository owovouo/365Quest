const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    selectDirectory: () => ipcRenderer.invoke('dialog:selectDirectory'),
    selectFile: () => ipcRenderer.invoke('dialog:selectFile'),
    saveFile: (sourcePath, targetDir, newFileName) => ipcRenderer.invoke('fs:saveFile', sourcePath, targetDir, newFileName),
    readData: (filename) => ipcRenderer.invoke('fs:readData', filename),
    writeData: (filename, data) => ipcRenderer.invoke('fs:writeData', filename, data),
    writeTopicSnapshot: (topic) => ipcRenderer.invoke('fs:writeTopicSnapshot', topic),
    exportJson: (dataStr, defaultName) => ipcRenderer.invoke('dialog:exportJson', dataStr, defaultName),
    importJson: () => ipcRenderer.invoke('dialog:importJson'),
    confirm: (message) => ipcRenderer.invoke('dialog:confirm', message),
    readFileBase64: (filePath) => ipcRenderer.invoke('fs:readFileBase64', filePath),
    deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
    renameFile: (oldPath, newFileName) => ipcRenderer.invoke('fs:renameFile', oldPath, newFileName),
    openFile: (filePath) => ipcRenderer.invoke('shell:openFile', filePath),
    showInFolder: (filePath) => ipcRenderer.invoke('shell:showInFolder', filePath),
    saveClipboardImage: () => ipcRenderer.invoke('clipboard:saveImage')
});
