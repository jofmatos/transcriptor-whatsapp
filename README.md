# 🎙️ Transcritor de Áudio do WhatsApp

App web (PWA) que transcreve áudios do WhatsApp para texto **100% dentro do seu iPhone** — sem servidor, sem chave de API e sem que o áudio saia do aparelho.

🔗 **App publicado:** https://jofmatos.github.io/transcriptor-whatsapp/

## Como funciona

A transcrição usa o **Whisper** (modelo de reconhecimento de fala da OpenAI) rodando no próprio navegador via [`@huggingface/transformers`](https://github.com/huggingface/transformers.js) (transformers.js). Ele tenta usar **WebGPU** (disponível no iPhone 15 / Safari recente) e cai automaticamente para **WASM** quando necessário.

- ✅ Roda offline depois do primeiro carregamento (PWA)
- ✅ Privado: o áudio é processado localmente
- ✅ Português por padrão (também inglês, espanhol e detecção automática)
- ✅ Aceita os formatos que o WhatsApp exporta: `.opus`, `.ogg`, além de `.m4a`, `.mp3`, `.wav`, `.aac`

## Como usar no iPhone

1. No WhatsApp, segure o áudio → **Encaminhar** / **Compartilhar** → **Salvar em Arquivos**.
2. Abra https://jofmatos.github.io/transcriptor-whatsapp/ no Safari.
3. Toque em **Escolher áudio** e selecione o arquivo salvo.
4. Toque em **Transcrever**. Na primeira vez o modelo é baixado (fica em cache para as próximas).

> 💡 Dica: toque em **Compartilhar → Adicionar à Tela de Início** para usar como um app.

### Por que não dá pra "compartilhar direto do WhatsApp para o site"?

O iOS/Safari não permite que um site funcione como destino de compartilhamento de arquivos. Por isso o passo de **Salvar em Arquivos** é necessário. Todo o resto é local e automático.

## Modelos disponíveis

| Modelo | Velocidade | Qualidade | Quando usar |
|--------|-----------|-----------|-------------|
| `whisper-tiny` | ⚡⚡⚡ | ★★ | áudios curtos / aparelho fraco |
| `whisper-base` (padrão) | ⚡⚡ | ★★★ | melhor equilíbrio |
| `whisper-small` | ⚡ | ★★★★ | melhor precisão (mais pesado) |

## Publicação (GitHub Pages)

O deploy é automático via GitHub Actions (`.github/workflows/deploy.yml`) a cada push na branch `main`.

Para ativar:
1. **Settings → Pages → Source = GitHub Actions**.
2. Faça push na `main` — o site publica sozinho.

O arquivo `.nojekyll` garante que o GitHub Pages sirva os arquivos sem processamento Jekyll.

## Estrutura

```
index.html              # interface
styles.css              # estilo (tema escuro estilo WhatsApp)
app.js                  # seleção do arquivo, decodificação → 16 kHz mono, UI
worker.js               # Whisper rodando em Web Worker
manifest.webmanifest    # PWA
sw.js                   # service worker (offline)
icons/                  # ícones do app
.github/workflows/      # deploy automático no Pages
.nojekyll
```

## Tecnologia

- Whisper via transformers.js (WebGPU + WASM)
- Web Audio API para decodificar e reamostrar o áudio para 16 kHz mono
- Web Worker para não travar a interface
- PWA (instalável, funciona offline)
