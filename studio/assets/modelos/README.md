# Modelos

## pessoa.onnx — segmentação de pessoa

Usado para o **texto atrás da pessoa**: acha onde está quem fala em cada
quadro, para a pessoa ficar na frente do texto. O mesmo arquivo roda na
prévia (navegador) e no worker de render (Node), com a mesma biblioteca
(`onnxruntime-web`, em WebAssembly, só CPU).

- **Modelo:** MediaPipe Selfie Segmentation (Google), licença Apache 2.0
  (`LICENSE-mediapipe.txt`).
- **Origem do ONNX:** Qualcomm AI Hub, `mediapipe_selfie`, precisão
  float, release v0.63.0:
  `https://qaihub-public-assets.s3.us-west-2.amazonaws.com/qai-hub-models/models/mediapipe_selfie/releases/v0.63.0/mediapipe_selfie-onnx-float.zip`
- **Conversão:** o zip traz o grafo e os pesos em arquivos separados
  (`.onnx` + `.data`). Eles foram juntados num arquivo só, sem mudar
  nada do modelo:

  ```python
  import onnx
  onnx.save(onnx.load('mediapipe_selfie.onnx'), 'pessoa.onnx')
  ```

- **Entrada:** `image`, float32 `[1, 3, 256, 256]`, RGB de 0 a 1.
- **Saída:** `mask`, float32 `[1, 1, 256, 256]`, de 0 (fundo) a 1 (pessoa).
- **Custo medido:** ~15 ms por quadro (CPU, Python) e ~33 ms no Node
  (WebAssembly, uma thread).
