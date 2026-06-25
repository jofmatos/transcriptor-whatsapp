// Transcritor de Áudio do WhatsApp — main thread
// Lê o arquivo, decodifica para 16 kHz mono e envia ao Web Worker (Whisper).

const fileInput = document.getElementById('fileInput');
const dropzone = document.getElementById('dropzone');
const filePreview = document.getElementById('filePreview');
const fileName = document.getElementById('fileName');
const fileSize = document.getElementById('fileSize');
const audioPlayer = document.getElementById('audioPlayer');
const transcribeBtn = document.getElementById('transcribeBtn');
const modelSelect = document.getElementById('modelSelect');
const langSelect = document.getElementById('langSelect');
const preloadBtn = document.getElementById('preloadBtn');
const modelStatus = document.getElementById('modelStatus');
const statusEl = document.getElementById('status');
const statusText = document.getElementById('statusText');
const spinner = document.getElementById('spinner');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');
const resultCard = document.getElementById('resultCard');
const resultText = document.getElementById('resultText');
const copyBtn = document.getElementById('copyBtn');
const shareBtn = document.getElementById('shareBtn');

let selectedFile = null;
let lastObjectUrl = null;
let worker = null;
let busy = false;
let modelReady = false;     // modelo atual carregado em memória
let preloading = false;

const SAMPLE_RATE = 16000;

function fmtSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function setStatus(text, showSpinner = true) {
  statusEl.classList.remove('hidden');
  statusText.textContent = text;
  spinner.style.display = showSpinner ? '' : 'none';
}
function hideStatus() { statusEl.classList.add('hidden'); }
function setProgress(pct) {
  if (pct == null) { progressWrap.classList.add('hidden'); return; }
  progressWrap.classList.remove('hidden');
  progressBar.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function setModelStatus(text, cls) {
  modelStatus.textContent = text;
  modelStatus.className = 'model-status' + (cls ? ' ' + cls : '');
}

function handleFile(file) {
  if (!file) return;
  selectedFile = file;
  fileName.textContent = file.name || 'áudio';
  fileSize.textContent = fmtSize(file.size);
  filePreview.classList.remove('hidden');
  if (lastObjectUrl) { try { URL.revokeObjectURL(lastObjectUrl); } catch (_) {} }
  try {
    lastObjectUrl = URL.createObjectURL(file);
    audioPlayer.src = lastObjectUrl;
  } catch (_) {}
  transcribeBtn.disabled = false;
  resultCard.classList.add('hidden');
  hideStatus();
  setProgress(null);
  // Aquece o modelo em segundo plano para já estar pronto na hora de transcrever.
  preloadModel();
}

fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));

['dragenter', 'dragover'].forEach(ev =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(ev =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); }));
dropzone.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) handleFile(f);
});

// Trocar de modelo invalida o que estava carregado.
modelSelect.addEventListener('change', () => {
  modelReady = false;
  setModelStatus('Modelo ainda não baixado');
});

// Decodifica para Float32 mono 16 kHz
async function decodeToMono16k(file) {
  const arrayBuffer = await file.arrayBuffer();
  const AC = window.AudioContext || window.webkitAudioContext;
  const tmpCtx = new AC();
  let audioBuffer;
  try {
    audioBuffer = await tmpCtx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    tmpCtx.close();
  }

  const numCh = audioBuffer.numberOfChannels;
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  for (let ch = 0; ch < numCh; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < length; i++) mono[i] += data[i] / numCh;
  }

  if (audioBuffer.sampleRate === SAMPLE_RATE) return mono;

  const targetLen = Math.round(length * SAMPLE_RATE / audioBuffer.sampleRate);
  const offline = new OfflineAudioContext(1, targetLen, SAMPLE_RATE);
  const monoBuffer = offline.createBuffer(1, length, audioBuffer.sampleRate);
  monoBuffer.copyToChannel(mono, 0);
  const src = offline.createBufferSource();
  src.buffer = monoBuffer;
  src.connect(offline.destination);
  src.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function getWorker() {
  if (worker) return worker;
  worker = new Worker('worker.js', { type: 'module' });
  worker.addEventListener('message', onWorkerMessage);
  worker.addEventListener('error', (e) => {
    console.error(e);
    finishWithError('Erro no processador: ' + (e.message || 'desconhecido'));
  });
  return worker;
}

// Pré-carrega (baixa + inicializa) o modelo selecionado, se ainda não estiver pronto.
function preloadModel() {
  if (modelReady || preloading) return;
  preloading = true;
  setModelStatus('Baixando modelo… (só na 1ª vez)', 'loading');
  getWorker().postMessage({ type: 'preload', model: modelSelect.value });
}

preloadBtn.addEventListener('click', () => {
  if (modelReady) { setModelStatus('Modelo pronto ✓ (em cache)', 'ready'); return; }
  preloadModel();
});

function onWorkerMessage(e) {
  const msg = e.data;
  switch (msg.type) {
    case 'loading':
      if (!busy) setModelStatus('Carregando modelo…', 'loading');
      else setStatus(msg.text || 'Carregando modelo…');
      break;
    case 'download':
      if (typeof msg.progress === 'number') {
        const pct = Math.round(msg.progress);
        if (busy) { setProgress(msg.progress); setStatus(`Baixando modelo… ${pct}%`); }
        else setModelStatus(`Baixando modelo… ${pct}%`, 'loading');
      }
      break;
    case 'preloaded':
      preloading = false;
      modelReady = true;
      setModelStatus('Modelo pronto ✓ (em cache)', 'ready');
      break;
    case 'ready':
      modelReady = true;
      setModelStatus('Modelo pronto ✓ (em cache)', 'ready');
      setStatus('Transcrevendo o áudio…');
      setProgress(null);
      break;
    case 'done':
      resultCard.classList.remove('hidden');
      resultText.value = (msg.text || '').trim() || '(sem fala detectada)';
      setStatus('Pronto ✓', false);
      setProgress(null);
      busy = false;
      transcribeBtn.disabled = false;
      transcribeBtn.textContent = 'Transcrever';
      break;
    case 'error':
      finishWithError(msg.text || 'Falha ao transcrever.');
      break;
  }
}

function finishWithError(text) {
  preloading = false;
  setStatus('⚠️ ' + text, false);
  setModelStatus('Algo deu errado — tente o modelo "Rápido (tiny)"', 'error');
  setProgress(null);
  busy = false;
  transcribeBtn.disabled = false;
  transcribeBtn.textContent = 'Transcrever';
}

transcribeBtn.addEventListener('click', async () => {
  if (!selectedFile || busy) return;
  busy = true;
  transcribeBtn.disabled = true;
  transcribeBtn.textContent = 'Processando…';
  resultText.value = '';
  resultCard.classList.add('hidden');
  setProgress(null);

  try {
    setStatus('Lendo e convertendo o áudio…');
    const audio = await decodeToMono16k(selectedFile);

    const w = getWorker();
    w.postMessage({
      type: 'transcribe',
      audio,
      model: modelSelect.value,
      language: langSelect.value,
    }, [audio.buffer]);
  } catch (err) {
    console.error(err);
    finishWithError('Não consegui ler este áudio. Tente outro arquivo (.opus/.m4a/.mp3).');
  }
});

copyBtn.addEventListener('click', async () => {
  const text = resultText.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    copyBtn.textContent = '✓ Copiado';
    setTimeout(() => (copyBtn.textContent = '📋 Copiar'), 1500);
  } catch (_) {
    resultText.select();
    document.execCommand('copy');
  }
});

shareBtn.addEventListener('click', async () => {
  const text = resultText.value;
  if (!text) return;
  if (navigator.share) {
    try { await navigator.share({ text }); } catch (_) {}
  } else {
    await navigator.clipboard.writeText(text);
    shareBtn.textContent = '✓ Copiado';
    setTimeout(() => (shareBtn.textContent = '↗︎ Enviar'), 1500);
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
