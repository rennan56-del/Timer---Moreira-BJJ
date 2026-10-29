# Referência e revisão dos sinais sonoros

Análise realizada em 28/10/2026 (America/Sao_Paulo) com FFmpeg/FFprobe e NumPy, sem serviços externos. Os vídeos fornecidos foram usados somente como referência técnica; nenhum áudio extraído foi colocado no aplicativo ou no repositório.

## O que os arquivos contêm

- `1-ScreenRecording_10-28-2026-21-50-16_1.mp4`: 8,32 s, AAC estéreo a 44,1 kHz. Há três bipes separados por aproximadamente um segundo e um sinal prolongado no zero. Os bipes têm fundamental aproximada de **1.685 Hz**, duração útil de cerca de **68 ms** e ataque muito rápido. O prolongado tem fundamental aproximada de **998 Hz**, dura aproximadamente **714 ms** e apresenta harmônicos ímpares, compatíveis com um timbre semelhante a onda triangular.
- `2-ScreenRecording_10-28-2026-21-49-49_1.mp4`: 14,43 s, AAC estéreo a 44,1 kHz. A faixa de áudio decodificada contém somente zeros digitais. Esse arquivo não permite comparar timbre ou volume.

As medições consideram um canal estéreo original. A redução automática de estéreo para mono aumenta a amplitude nesses arquivos e não serve para concluir que a referência tem forte clipping. O pico por canal medido foi aproximadamente 1,014, compatível com pequeno overshoot de codificação AAC. A análise temporal usou janelas de 8 ms; frequência foi estimada por FFT de trechos estáveis. Portanto, os valores são aproximações.

## Síntese original implementada

O usuário pediu sinais perceptivelmente mais fortes e agudos. A implementação anterior tinha fundamental de 1.320 Hz nos bipes e 620 Hz no prolongado, onda triangular e pico por voz de 0,46 no perfil Academia. A nova síntese usa:

| Perfil | Bip curto | Zero prolongado | Pico por voz |
| --- | --- | --- | --- |
| Normal, volume 65 | 2.000 Hz, 180 ms | 960 Hz, 900 ms | 0,507 |
| Academia, volume 100 | 2.400 Hz, 230 ms | 1.080 Hz, 1.050 ms | 0,88 |
| Silencioso | Nenhum | Nenhum | 0 |

O timbre é um buzzer original com harmônicos ímpares 1, 3, 5 e 7, amplitudes relativas 1, 1/3, 1/5 e 1/7, normalizados pela Web Audio API. É mais rico/agudo que a onda triangular anterior. Há ataque de 2 ms em Academia, patamar de amplitude sustentado e saída curta suavizada. Cada sinal continua usando apenas um oscilador; não há arquivo sonoro ou música incorporada.

Um ganho mestre mantém a soma dos picos máximos de todas as vozes em até **0,9**, inclusive quando um sinal prolongado coincide com o primeiro bip curto da etapa seguinte. Isso limita o sinal gerado pelo aplicativo sem descartar bipes obrigatórios. O navegador faz a síntese de `PeriodicWave` com normalização e limitação dos harmônicos à banda disponível. Se a API de onda periódica não estiver disponível, a síntese usa o oscilador quadrado nativo.

As durações na tabela são as do envelope audível. O oscilador é encerrado 15 ms depois, já com amplitude residual mínima. O rastreador da sequência 3–2–1–zero não foi alterado: relógio, deduplicação e descarte de sinais antigos continuam separados do áudio.

Compatibilidade com música não reduz mais a intensidade dos sinais obrigatórios. Permanecem apenas osciladores e ganhos Web Audio: sem elementos de mídia, Media Session, pedido de foco exclusivo ou buffer silencioso contínuo.

## Verificação e limites

Os testes de áudio verificam frequência, duração, patamar sustentado, normalização dos harmônicos, um oscilador por sinal, pico agregado, silêncio, recuperação e igualdade de potência com compatibilidade musical. Os testes existentes de sinais continuam verificando três curtos, zero prolongado e ausência de duplicação.

Também foi gerada uma prévia WAV inteiramente sintética em `/tmp/moreira-strong-signals-preview.wav`, com bipes nos instantes 0, 1 e 2 s e prolongado em 3 s. A análise por FFT confirmou a fundamental de aproximadamente 2.400 Hz e pico inferior a 0,9. A prévia é uma representação matemática da síntese, não uma gravação de Android ou Roku.

Não é possível garantir pressão sonora física ou reprodução conjunta com música em todo aparelho. Volume de mídia do Android, saída Bluetooth/HDMI, espelhamento, limite do alto-falante e políticas do navegador/sistema continuam externos ao aplicativo. Nenhum teste físico Android/Roku é declarado como realizado nesta revisão.
