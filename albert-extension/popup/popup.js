// Albert Extension Popup Script

// Configuration
const CONFIG = {
  // Production URL for Echo/Albert
  serverUrl: 'https://echo-two-omega.vercel.app',
  productionUrl: 'https://echo-two-omega.vercel.app',
};

// State
let isListening = false;
let peerConnection = null;
let dataChannel = null;
let audioElement = null;

// Elements
const voiceBtn = document.getElementById('voiceBtn');
const voiceBtnText = document.getElementById('voiceBtnText');
const voiceIcon = document.getElementById('voiceIcon');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const transcript = document.getElementById('transcript');
const serverUrlEl = document.getElementById('serverUrl');
const openFullApp = document.getElementById('openFullApp');

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved server URL
  const stored = await chrome.storage.local.get(['serverUrl']);
  if (stored.serverUrl) {
    CONFIG.serverUrl = stored.serverUrl;
  }
  serverUrlEl.textContent = new URL(CONFIG.serverUrl).host;
  openFullApp.href = CONFIG.serverUrl;

  // Check connection
  checkServerConnection();

  // Setup event listeners
  setupEventListeners();
});

function setupEventListeners() {
  voiceBtn.addEventListener('click', toggleVoice);

  document.getElementById('sendPageBtn').addEventListener('click', sendPageContext);
  document.getElementById('sendSelectionBtn').addEventListener('click', sendSelection);
  document.getElementById('summarizeBtn').addEventListener('click', () => sendCommand('summarize'));
  document.getElementById('askAboutBtn').addEventListener('click', () => sendCommand('ask'));

  serverUrlEl.addEventListener('click', changeServer);
  openFullApp.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: CONFIG.serverUrl });
  });
}

async function checkServerConnection() {
  try {
    const response = await fetch(`${CONFIG.serverUrl}/api/extension/context`, {
      method: 'GET',
    });

    if (response.ok) {
      statusDot.classList.remove('disconnected');
      statusText.textContent = 'Connected to Albert';
    } else {
      throw new Error('Server error');
    }
  } catch (error) {
    statusDot.classList.add('disconnected');
    statusText.textContent = 'Cannot connect to server';
  }
}

async function toggleVoice() {
  if (isListening) {
    stopVoice();
  } else {
    startVoice();
  }
}

async function startVoice() {
  try {
    voiceBtn.classList.add('listening');
    voiceBtnText.textContent = 'Listening...';
    voiceIcon.textContent = '&#128308;'; // Red circle
    isListening = true;
    transcript.classList.add('active');
    transcript.textContent = 'Connecting to Albert...';

    // Get ephemeral token from server
    const tokenResponse = await fetch(`${CONFIG.serverUrl}/api/realtime/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to get session token');
    }

    const { client_secret } = await tokenResponse.json();

    // Setup WebRTC
    await setupWebRTC(client_secret.value);

    transcript.textContent = 'Connected! Start speaking...';
  } catch (error) {
    console.error('Voice error:', error);
    // Provide helpful error messages
    if (error.name === 'NotAllowedError' || error.message.includes('Permission')) {
      transcript.textContent = 'Microphone access denied. Click the lock icon in the address bar and allow microphone access, then try again.';
    } else if (error.name === 'NotFoundError') {
      transcript.textContent = 'No microphone found. Please connect a microphone and try again.';
    } else {
      transcript.textContent = `Error: ${error.message}`;
    }
    stopVoice();
  }
}

async function setupWebRTC(ephemeralToken) {
  // Create peer connection
  peerConnection = new RTCPeerConnection();

  // Setup audio output
  audioElement = document.createElement('audio');
  audioElement.autoplay = true;

  peerConnection.ontrack = (e) => {
    audioElement.srcObject = e.streams[0];
  };

  // Get microphone
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
    }
  });

  stream.getTracks().forEach(track => {
    peerConnection.addTrack(track, stream);
  });

  // Create data channel for events
  dataChannel = peerConnection.createDataChannel('oai-events');
  dataChannel.onmessage = handleDataChannelMessage;

  // Create offer
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);

  // Send to OpenAI Realtime
  const sdpResponse = await fetch(
    'https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-12-17',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ephemeralToken}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    }
  );

  if (!sdpResponse.ok) {
    throw new Error('Failed to connect to OpenAI');
  }

  const answerSdp = await sdpResponse.text();
  await peerConnection.setRemoteDescription({
    type: 'answer',
    sdp: answerSdp,
  });
}

function handleDataChannelMessage(event) {
  try {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'response.audio_transcript.delta':
        // Update transcript with assistant response
        if (data.delta) {
          transcript.textContent += data.delta;
          transcript.scrollTop = transcript.scrollHeight;
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        // User's speech transcription
        if (data.transcript) {
          transcript.textContent = `You: ${data.transcript}\n\nAlbert: `;
        }
        break;

      case 'response.done':
        transcript.textContent += '\n\n---\n';
        break;

      case 'error':
        console.error('Realtime error:', data);
        transcript.textContent += `\nError: ${data.error?.message || 'Unknown error'}`;
        break;
    }
  } catch (e) {
    // Ignore non-JSON messages
  }
}

function stopVoice() {
  isListening = false;
  voiceBtn.classList.remove('listening');
  voiceBtnText.textContent = 'Start Talking';
  voiceIcon.textContent = '&#127908;'; // Microphone

  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }

  if (audioElement) {
    audioElement.srcObject = null;
    audioElement = null;
  }

  dataChannel = null;
}

async function sendPageContext() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Get page content via content script
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const main = document.querySelector('main, article, [role="main"]');
        const text = main ? main.textContent : document.body.textContent;
        return {
          url: window.location.href,
          title: document.title,
          pageText: text?.slice(0, 5000) || '',
        };
      },
    });

    const pageData = results[0].result;

    // Send to server
    const response = await fetch(`${CONFIG.serverUrl}/api/extension/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pageData),
    });

    if (response.ok) {
      transcript.classList.add('active');
      transcript.textContent = `Page context sent: "${pageData.title}"`;
    } else {
      throw new Error('Failed to send context');
    }
  } catch (error) {
    console.error('Send page error:', error);
    transcript.classList.add('active');
    transcript.textContent = `Error: ${error.message}`;
  }
}

async function sendSelection() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        return {
          url: window.location.href,
          title: document.title,
          selectedText: window.getSelection()?.toString() || '',
        };
      },
    });

    const data = results[0].result;

    if (!data.selectedText) {
      transcript.classList.add('active');
      transcript.textContent = 'No text selected. Highlight some text first.';
      return;
    }

    const response = await fetch(`${CONFIG.serverUrl}/api/extension/context`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      transcript.classList.add('active');
      transcript.textContent = `Selection sent: "${data.selectedText.slice(0, 100)}..."`;
    }
  } catch (error) {
    console.error('Send selection error:', error);
    transcript.classList.add('active');
    transcript.textContent = `Error: ${error.message}`;
  }
}

async function sendCommand(command) {
  transcript.classList.add('active');
  transcript.textContent = `Command: ${command} - Feature coming soon!`;
}

async function changeServer() {
  const newUrl = prompt('Enter Albert server URL:', CONFIG.serverUrl);
  if (newUrl && newUrl !== CONFIG.serverUrl) {
    CONFIG.serverUrl = newUrl;
    await chrome.storage.local.set({ serverUrl: newUrl });
    serverUrlEl.textContent = new URL(newUrl).host;
    openFullApp.href = newUrl;
    checkServerConnection();
  }
}
