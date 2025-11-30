// DOM Elements
const navItems = document.querySelectorAll('.nav-item');
const sections = document.querySelectorAll('.section');
const providerSelect = document.getElementById('provider');
const apiKeyInput = document.getElementById('apiKey');
const keyLink = document.getElementById('keyLink');
const saveBtn = document.getElementById('saveBtn');
const msgEl = document.getElementById('msg');
const statusEl = document.getElementById('status');
const shortcutInput = document.getElementById('shortcutInput');
const recordShortcutBtn = document.getElementById('recordShortcutBtn');
const totalWordsEl = document.getElementById('totalWords');
const timeSavedEl = document.getElementById('timeSaved');
const showIndicatorCheckbox = document.getElementById('showIndicator');

if (!window.electronAPI) {
    console.error('Electron API missing');
    document.body.innerHTML = '<h1 style="color:red;padding:20px">Error: API Missing. Preload failed.</h1>';
}

// State
let currentShortcut = 'Option+Space';
let isRecordingShortcut = false;

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));

        item.classList.add('active');
        document.getElementById(item.dataset.target).classList.add('active');
    });
});

// Load Config
window.electronAPI.onLoadConfig((config) => {
    apiKeyInput.value = config.key || '';
    providerSelect.value = config.provider || 'openai';
    currentShortcut = config.shortcut || 'Option+Space';
    shortcutInput.value = currentShortcut;
    showIndicatorCheckbox.checked = config.showIndicator !== false;
    updateLinks();
});

// Stats
window.electronAPI.onUpdateStats((stats) => {
    if (stats.totalWords !== undefined) {
        totalWordsEl.textContent = stats.totalWords.toLocaleString();
        // Est. 40 wpm typing speed vs 150 wpm speaking. Saved = Words / 40 - Words / 150? 
        // Let's just say 1 minute saved per 100 words for simplicity or just show words.
        // Time saved calculation: (Words / 40) minutes.
        const minutes = Math.round(stats.totalWords / 40);
        timeSavedEl.textContent = `${minutes}m`;
    }
});

// Provider Logic
providerSelect.addEventListener('change', updateLinks);

function updateLinks() {
    const isGroq = providerSelect.value === 'groq';
    keyLink.href = isGroq ? 'https://console.groq.com/keys' : 'https://platform.openai.com/api-keys';
    keyLink.textContent = isGroq ? 'Get Free Groq Key' : 'Get OpenAI Key';
    apiKeyInput.placeholder = isGroq ? 'gsk_...' : 'sk-...';
}

// Save Settings
saveBtn.addEventListener('click', () => {
    const config = {
        key: apiKeyInput.value.trim(),
        provider: providerSelect.value,
        shortcut: currentShortcut,
        showIndicator: showIndicatorCheckbox.checked
    };

    window.electronAPI.saveConfig(config);

    window.electronAPI.saveConfig(config);
});

window.electronAPI.onShortcutRegistered((shortcut) => {
    msgEl.textContent = `Settings saved! Shortcut '${shortcut}' active.`;
    msgEl.style.color = 'green';
    setTimeout(() => msgEl.textContent = '', 3000);
});

// Shortcut Recording
recordShortcutBtn.addEventListener('click', () => {
    if (isRecordingShortcut) {
        // Stop recording manually
        isRecordingShortcut = false;
        recordShortcutBtn.textContent = 'Record';
        recordShortcutBtn.classList.remove('recording');
        // Keep current value
        currentShortcut = shortcutInput.value;
    } else {
        // Start recording
        isRecordingShortcut = true;
        recordShortcutBtn.textContent = 'Stop';
        recordShortcutBtn.classList.add('recording');
        shortcutInput.value = '';
    }
});

document.addEventListener('keydown', (e) => {
    if (!isRecordingShortcut) return;
    e.preventDefault();

    const modifiers = [];
    if (e.metaKey) modifiers.push('Command');
    if (e.ctrlKey) modifiers.push('Control');
    if (e.altKey) modifiers.push('Option');
    if (e.shiftKey) modifiers.push('Shift');

    let key = e.key.toUpperCase();
    if (key === ' ') key = 'Space';

    // Don't add modifier keys as the "main" key
    if (['META', 'CONTROL', 'ALT', 'SHIFT'].includes(key)) {
        key = null;
    }

    // Build current combo string for display
    let shortcutParts = [...modifiers];
    if (key) shortcutParts.push(key);

    const shortcut = shortcutParts.join('+');
    shortcutInput.value = shortcut;

    // Only finalize if a non-modifier key is pressed
    if (key) {
        currentShortcut = shortcut;
        isRecordingShortcut = false;
        recordShortcutBtn.textContent = 'Record';
        recordShortcutBtn.classList.remove('recording');
    }
});

// Recording Status
window.electronAPI.onStartRecording(() => {
    statusEl.textContent = 'Listening...';
    statusEl.className = 'status-text recording';

    // Start audio recording logic
    startAudioCapture();
});

window.electronAPI.onStopRecording(() => {
    stopAudioCapture();
    statusEl.textContent = 'Processing...';
    statusEl.className = 'status-text';
});

window.electronAPI.onStatusUpdate((status) => {
    statusEl.textContent = status;
    statusEl.className = 'status-text';
});

window.electronAPI.onError((msg) => {
    statusEl.textContent = 'Error';
    msgEl.textContent = msg;
    msgEl.style.color = 'red';
});

// Audio Capture Logic (Same as before)
let mediaRecorder;
let audioChunks = [];

async function startAudioCapture() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        audioChunks = [];

        mediaRecorder.ondataavailable = (event) => {
            audioChunks.push(event.data);
        };

        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            const arrayBuffer = await audioBlob.arrayBuffer();
            window.electronAPI.sendRecordingFinished(arrayBuffer);
            stream.getTracks().forEach(track => track.stop());
        };

        mediaRecorder.start();
    } catch (err) {
        console.error('Mic error:', err);
        window.electronAPI.onError('Microphone access denied');
    }
}

function stopAudioCapture() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
    }
}
