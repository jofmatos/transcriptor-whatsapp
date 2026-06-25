// Web Worker — roda o Whisper via transformers.js fora da thread principal.
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2';

// Modelos remotos (Hugging Face Hub) + cache no navegador.
env.allowLocalModels = false;
env.useBrowserCache = true;

// GitHub Pages não tem cross-origin isolation → sem SharedArrayBuffer.
// Mantemos WASM single-thread (estável; evita crash por threads indisponíveis).
try { env.backends.onnx.wasm.numThreads = 1; } catch (_) {}

function isApple() {
  const nav = self.navigator || {};
  const ua = nav.userAgent || '';
  // iPhone/iPad/iPod, e iPadOS recente que se identifica como "Macintosh" com toque.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && (nav.maxTouchPoints || 0) > 1);
}

// No iOS/Safari a WebGPU é instável com Whisper e derruba a aba ("um problema
// ocorreu repetidamente"). Por isso forçamos WASM em aparelhos Apple.
async function pickDevice() {
  if (isApple()) return 'wasm';
  try {
    const nav = self.navigator || {};
    if ('gpu' in nav && nav.gpu) {
      const adapter = await nav.gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch (_) {}
  return 'wasm';
}

let transcriber = null;
let loadedModel = null;

async function getTranscriber(model, post) {
  if (transcriber && loadedModel === model) return transcriber;

  transcriber = null;
  loadedModel = null;

  const device = await pickDevice();
  const dtype = device === 'webgpu' ? 'fp16' : 'q8'; // q8 = quantizado, baixa memória

  post({ type: 'loading', text: 'Carregando modelo…', device });

  transcriber = await pipeline('automatic-speech-recognition', model, {
    device,
    dtype,
    progress_callback: (p) => {
      if (p.status === 'progress' && typeof p.progress === 'number') {
        post({ type: 'download', progress: p.progress });
      }
    },
  });

  loadedModel = model;
  return transcriber;
}

self.addEventListener('message', async (e) => {
  const msg = e.data;
  const post = (m) => self.postMessage(m);

  try {
    if (msg.type === 'preload') {
      await getTranscriber(msg.model, post);
      post({ type: 'preloaded', model: msg.model });
      return;
    }

    if (msg.type === 'transcribe') {
      const pipe = await getTranscriber(msg.model, post);
      post({ type: 'ready' });

      // Chunks menores reduzem o pico de memória no Safari.
      const options = {
        chunk_length_s: 20,
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
    }
  } catch (err) {
    post({ type: 'error', text: (err && err.message) ? err.message : String(err) });
  }
});
