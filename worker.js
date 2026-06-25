// Web Worker — roda o Whisper via transformers.js fora da thread principal.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

// Configuração: usa modelos remotos do Hugging Face Hub e cache no navegador.
env.allowLocalModels = false;
env.useBrowserCache = true;

let transcriber = null;
let loadedModel = null;

async function getTranscriber(model, postMessage) {
  if (transcriber && loadedModel === model) return transcriber;

  // Libera instância anterior se trocou de modelo
  transcriber = null;
  loadedModel = null;

  postMessage({ type: 'loading', text: 'Carregando modelo (1ª vez baixa, depois fica em cache)…' });

  // Tenta WebGPU (iPhone 15 / Safari recente); cai para WASM se indisponível.
  let device = 'wasm';
  try {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator && navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      if (adapter) device = 'webgpu';
    }
  } catch (_) { device = 'wasm'; }

  const dtype = device === 'webgpu' ? 'fp16' : 'q8';

  transcriber = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: (p) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        postMessage({ type: 'download', progress: p.progress });
      } else if (p.status === 'ready') {
        postMessage({ type: 'loading', text: 'Modelo pronto.' });
      }
    },
  });

  loadedModel = model;
  return transcriber;
}

self.addEventListener('message', async (e) => {
  const msg = e.data;
  if (msg.type !== 'transcribe') return;

  const post = (m) => self.postMessage(m);

  try {
    const pipe = await getTranscriber(msg.model, post);
    post({ type: 'ready' });

    const options = {
      chunk_length_s: 30,
      stride_length_s: 5,
      return_timestamps: false,
    };
    if (msg.language && msg.language !== 'auto') {
      options.language = msg.language;
      options.task = 'transcribe';
    }

    const output = await pipe(msg.audio, options);
    const text = Array.isArray(output)
      ? output.map((o) => o.text).join(' ')
      : (output?.text || '');

    post({ type: 'done', text });
  } catch (err) {
    post({ type: 'error', text: (err && err.message) ? err.message : String(err) });
  }
});
