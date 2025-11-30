const { app, BrowserWindow, globalShortcut, ipcMain, clipboard, Tray, Menu, systemPreferences, shell, nativeImage, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const { exec } = require('child_process');
const Store = require('electron-store');
require('dotenv').config();

const store = new Store();

let mainWindow;
let indicatorWindows = [];
let tray;
let isRecording = false;
let openai;

// Default config
let currentConfig = {
    key: store.get('apiKey') || process.env.OPENAI_API_KEY,
    provider: store.get('provider') || 'openai',
    shortcut: store.get('shortcut') || 'Option+Space',
    showIndicator: store.get('showIndicator') !== false // Default true
};

function configureOpenAI() {
    if (!currentConfig.key) return;

    const config = { apiKey: currentConfig.key };

    if (currentConfig.provider === 'groq') {
        config.baseURL = 'https://api.groq.com/openai/v1';
    }

    openai = new OpenAI(config);
}

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 500,
        height: 600,
        show: false, // Ensure hidden
        titleBarStyle: 'hiddenInset', // macOS style
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    mainWindow.loadFile('index.html');

    // Send initial stats
    mainWindow.webContents.on('did-finish-load', () => {
        const stats = {
            totalWords: store.get('stats.totalWords') || 0
        };
        mainWindow.webContents.send('update-stats', stats);
        mainWindow.webContents.send('load-config', currentConfig);
    });

    mainWindow.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });
}

function getIconPath(iconName) {
    const localPath = path.join(__dirname, iconName);
    if (fs.existsSync(localPath)) return localPath;
    const resourcePath = path.join(process.resourcesPath, iconName);
    if (fs.existsSync(resourcePath)) return resourcePath;
    return localPath; // Fallback
}

function createIndicatorWindows() {
    // Close existing windows
    indicatorWindows.forEach(w => {
        if (!w.isDestroyed()) w.close();
    });
    indicatorWindows = [];

    if (!currentConfig.showIndicator) return;

    const displays = screen.getAllDisplays();

    displays.forEach(display => {
        const win = new BrowserWindow({
            width: 200,
            height: 60,
            x: display.bounds.x + Math.round(display.bounds.width / 2 - 100),
            y: display.bounds.y + display.bounds.height - 80,
            frame: false,
            transparent: true,
            alwaysOnTop: true,
            focusable: false,
            skipTaskbar: true,
            hasShadow: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false
            }
        });

        win.loadFile('indicator.html');
        win.setIgnoreMouseEvents(true);
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

        // Initial status
        const status = isRecording ? 'recording' : 'idle';
        win.webContents.on('did-finish-load', () => {
            win.webContents.send('update-indicator-status', status);
        });

        indicatorWindows.push(win);
    });
}

function updateIndicatorStatus(status) {
    indicatorWindows.forEach(w => {
        if (!w.isDestroyed()) {
            w.webContents.send('update-indicator-status', status);
        }
    });
}

function updateTrayIcon() {
    if (!tray) return;
    const iconName = isRecording ? 'iconRecordingTemplate.svg' : 'iconTemplate.svg';
    const iconPath = getIconPath(iconName);
    const icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);
    // Resize to 16x16 or 22x22 for menu bar
    tray.setImage(icon);

    // Update Indicator Windows
    const status = isRecording ? 'recording' : 'idle';
    updateIndicatorStatus(status);

    // Update Tray Menu Status
    updateTrayMenu();
}

function updateTrayMenu() {
    if (!tray) return;
    const statusText = isRecording ? 'Recording...' : 'Ready';
    const contextMenu = Menu.buildFromTemplate([
        { label: `Status: ${statusText}`, enabled: false },
        { type: 'separator' },
        { label: 'Settings...', click: () => mainWindow.show() },
        { type: 'separator' },
        {
            label: 'Quit', click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);
    tray.setContextMenu(contextMenu);
}

function createTray() {
    const iconPath = getIconPath('iconTemplate.svg');
    const icon = nativeImage.createFromPath(iconPath);
    icon.setTemplateImage(true);
    tray = new Tray(icon);

    updateTrayMenu();
    tray.setToolTip('AlphaVoice');
}

function registerShortcut() {
    globalShortcut.unregisterAll();

    try {
        const ret = globalShortcut.register(currentConfig.shortcut, () => {
            console.log('Shortcut pressed');
            if (isRecording) {
                mainWindow.webContents.send('stop-recording');
                isRecording = false;
                updateTrayIcon();
            } else {
                mainWindow.webContents.send('start-recording');
                isRecording = true;
                updateTrayIcon();
            }
        });

        if (!ret) {
            console.log('Registration failed for', currentConfig.shortcut);
            return false;
        }
        return true;
    } catch (err) {
        console.error('Shortcut registration error', err);
        return false;
    }
}

async function handleRecordingFinished(event, buffer) {
    console.log('Processing audio...');
    console.log('Processing audio...');
    mainWindow.webContents.send('status-update', 'Transcribing...');
    updateIndicatorStatus('processing');

    try {
        if (!currentConfig.key) {
            mainWindow.show();
            mainWindow.webContents.send('error', 'Please set your API Key');
            isRecording = false;
            updateTrayIcon();
            return;
        }

        if (!openai) configureOpenAI();

        const tempFilePath = path.join(app.getPath('userData'), 'temp_recording.webm');
        fs.writeFileSync(tempFilePath, Buffer.from(buffer));

        const model = currentConfig.provider === 'groq' ? 'whisper-large-v3' : 'whisper-1';

        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(tempFilePath),
            model: model,
        });

        const text = transcription.text;
        console.log('Transcription:', text);

        if (text) {
            // Update stats
            const wordCount = text.trim().split(/\s+/).length;
            const totalWords = (store.get('stats.totalWords') || 0) + wordCount;
            store.set('stats.totalWords', totalWords);
            mainWindow.webContents.send('update-stats', { totalWords });

            // Paste text
            clipboard.writeText(text);
            pasteText();
            mainWindow.webContents.send('status-update', 'Ready');
            updateIndicatorStatus('idle');
        }
    } catch (error) {
        console.error('Error:', error);
        mainWindow.webContents.send('error', error.message);
    } finally {
        isRecording = false;
        updateTrayIcon();
    }
}

function pasteText() {
    const script = `tell application "System Events" to keystroke "v" using command down`;
    exec(`osascript -e '${script}'`, (error) => {
        if (error) console.error('Paste failed:', error);
    });
}

app.whenReady().then(async () => {
    if (process.platform === 'darwin') {
        app.dock.hide(); // Hide dock icon
        await systemPreferences.askForMediaAccess('microphone');
    }

    createMainWindow();
    createTray();
    createIndicatorWindows();
    registerShortcut();

    screen.on('display-added', createIndicatorWindows);
    screen.on('display-removed', createIndicatorWindows);
    screen.on('display-metrics-changed', createIndicatorWindows);

    ipcMain.on('recording-finished', handleRecordingFinished);

    ipcMain.on('save-config', (event, config) => {
        currentConfig = { ...currentConfig, ...config };
        store.set('apiKey', config.key);
        store.set('provider', config.provider);
        store.set('shortcut', config.shortcut);
        store.set('showIndicator', config.showIndicator);

        createIndicatorWindows();

        configureOpenAI();
        const success = registerShortcut();

        if (success) {
            mainWindow.webContents.send('shortcut-registered', currentConfig.shortcut);
        } else {
            mainWindow.webContents.send('error', `Failed to register shortcut: ${currentConfig.shortcut}`);
        }
        console.log('Config updated');
    });

    app.on('activate', () => {
        // On dock click (if dock icon was visible), show settings. 
        // Since we hide dock, this might not be triggered often, but good to have.
        if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
        else if (mainWindow) mainWindow.show();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
