// Albert Extension Content Script
// Injects floating voice button on all pages

(function() {
  'use strict';

  // Prevent double injection
  if (window.albertInjected) return;
  window.albertInjected = true;

  // Configuration
  const CONFIG = {
    serverUrl: 'https://echo-two-omega.vercel.app',
    buttonEnabled: true,
  };

  // State
  let isListening = false;
  let peerConnection = null;
  let dataChannel = null;
  let audioElement = null;

  // Load config from storage
  chrome.storage.local.get(['serverUrl', 'floatingButtonEnabled'], (result) => {
    if (result.serverUrl) CONFIG.serverUrl = result.serverUrl;
    if (result.floatingButtonEnabled === false) CONFIG.buttonEnabled = false;

    if (CONFIG.buttonEnabled) {
      injectFloatingButton();
    }
  });

  // Listen for messages from popup/background
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'GET_PAGE_CONTEXT':
        sendResponse(getPageContext());
        break;

      case 'GET_SELECTION':
        sendResponse({
          selectedText: window.getSelection()?.toString() || '',
        });
        break;

      case 'START_VOICE':
        startVoice();
        sendResponse({ success: true });
        break;

      case 'STOP_VOICE':
        stopVoice();
        sendResponse({ success: true });
        break;

      case 'TOGGLE_BUTTON':
        CONFIG.buttonEnabled = message.enabled;
        if (message.enabled) {
          injectFloatingButton();
        } else {
          removeFloatingButton();
        }
        sendResponse({ success: true });
        break;
    }
    return true; // Keep channel open for async response
  });

  function getPageContext() {
    const main = document.querySelector('main, article, [role="main"]');
    const pageText = main ? main.textContent : document.body.textContent;

    return {
      url: window.location.href,
      title: document.title,
      pageText: pageText?.slice(0, 5000) || '',
      selectedText: window.getSelection()?.toString() || '',
    };
  }

  function injectFloatingButton() {
    // Don't inject if already exists
    if (document.getElementById('albert-voice-button')) return;

    const button = document.createElement('button');
    button.id = 'albert-voice-button';
    button.innerHTML = '<div id="albert-voice-orb"></div>';
    button.title = 'Talk to Albert (Ctrl+Shift+V)';

    button.addEventListener('click', toggleVoice);

    document.body.appendChild(button);

    // Create toast element
    const toast = document.createElement('div');
    toast.id = 'albert-toast';
    document.body.appendChild(toast);

    // Create mini transcript
    const miniTranscript = document.createElement('div');
    miniTranscript.id = 'albert-mini-transcript';
    miniTranscript.innerHTML = `
      <div class="header">
        <span>Albert</span>
        <button class="close-btn" id="albert-close-transcript">&times;</button>
      </div>
      <div class="content" id="albert-transcript-content">Click the orb to start talking...</div>
    `;
    document.body.appendChild(miniTranscript);

    // Close button handler
    document.getElementById('albert-close-transcript').addEventListener('click', () => {
      miniTranscript.classList.remove('visible');
    });
  }

  function removeFloatingButton() {
    const button = document.getElementById('albert-voice-button');
    const toast = document.getElementById('albert-toast');
    const transcript = document.getElementById('albert-mini-transcript');

    if (button) button.remove();
    if (toast) toast.remove();
    if (transcript) transcript.remove();
  }

  function showToast(message, duration = 3000) {
    const toast = document.getElementById('albert-toast');
    if (!toast) return;

    toast.textContent = message;
    toast.classList.add('visible');

    setTimeout(() => {
      toast.classList.remove('visible');
    }, duration);
  }

  function updateTranscript(text, append = false) {
    const content = document.getElementById('albert-transcript-content');
    const container = document.getElementById('albert-mini-transcript');

    if (!content || !container) return;

    if (append) {
      content.textContent += text;
    } else {
      content.textContent = text;
    }

    container.classList.add('visible');
    content.scrollTop = content.scrollHeight;
  }

  function toggleVoice() {
    if (isListening) {
      stopVoice();
    } else {
      startVoice();
    }
  }

  async function startVoice() {
    const button = document.getElementById('albert-voice-button');

    try {
      isListening = true;
      if (button) button.classList.add('listening');
      updateTranscript('Connecting to Albert...');

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

      updateTranscript('Connected! Start speaking...');
      showToast('Albert is listening');

    } catch (error) {
      console.error('[Albert] Voice error:', error);
      showToast(`Error: ${error.message}`);
      updateTranscript(`Error: ${error.message}`);
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
          if (data.delta) {
            updateTranscript(data.delta, true);
          }
          break;

        case 'conversation.item.input_audio_transcription.completed':
          if (data.transcript) {
            updateTranscript(`You: ${data.transcript}\n\nAlbert: `);
          }
          break;

        case 'response.done':
          updateTranscript('\n\n---\n', true);
          break;

        case 'error':
          console.error('[Albert] Realtime error:', data);
          showToast(`Error: ${data.error?.message || 'Unknown error'}`);
          break;
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  }

  function stopVoice() {
    const button = document.getElementById('albert-voice-button');

    isListening = false;
    if (button) button.classList.remove('listening');

    if (peerConnection) {
      peerConnection.close();
      peerConnection = null;
    }

    if (audioElement) {
      audioElement.srcObject = null;
      audioElement = null;
    }

    dataChannel = null;
    showToast('Albert stopped listening');
  }

  // Keyboard shortcut listener
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+V or Cmd+Shift+V to toggle voice
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'V') {
      e.preventDefault();
      toggleVoice();
    }
  });

  console.log('[Albert] Content script loaded');
})();
