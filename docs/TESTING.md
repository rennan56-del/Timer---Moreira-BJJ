# Validação — Timer Moreira BJJ 1.3

Ambiente de desenvolvimento: Node.js 24.19.0, npm 11.9.0 e Chromium Linux disponível no Codex Cloud. Fontes oficiais e roteiro de Android/Roku em [ANDROID-ROKU.md](ANDROID-ROKU.md).

## Resultado desta entrega

**79 testes nativos aprovados, zero falhas. 40 cenários de navegador aprovados, zero falhas.** Build final e artefatos da versão 1.3.0 verificados no Chromium Linux. A suíte usa relógio controlado para sessões longas e relógio real para o padrão sonoro de luta/descanso.


Os resultados exatos desta revisão estão em [VALIDATION.json](VALIDATION.json). Os testes nativos incluem o motor anterior, áudio reforçado, limite agregado de ganho, catálogo de cinco fotos e marca, recuperação e a corrida de liberação de Web Locks encontrada no navegador. A interface foi verificada nas dimensões 320×740, 390×844, 844×390 e 1920×1080.

**Não foram testados Android ou Roku físicos, música de outro aplicativo no Android, Bluetooth ou alto-falantes reais da academia.** A construção de osciladores e seus envelopes foi testada, mas não certifica volume percebido ou foco de áudio em hardware.

Falhas encontradas durante a revisão foram corrigidas antes da publicação: largura do relógio no retrato e tentativa de readquirir um Web Lock da própria aba antes de o navegador concluir sua liberação. A suíte também sincroniza explicitamente o início com a reserva assíncrona, sem avançar o relógio artificial antes de o motor iniciar.

## O que cada teste comprova

`npm test` recompila o aplicativo sem dependências e executa testes nativos do Node. O build transforma a sintaxe TypeScript; não equivale a uma checagem `tsc --noEmit`. O aviso de transformador experimental do Node 24 é esperado.

O motor existente foi mantido. A suíte cobre início, pausa, retomada, preparação, encerramento, descanso zero, limites, callbacks atrasados e relógio congelado durante sono. Os novos casos validam **dez rounds de cinco minutos com nove descansos de três minutos**, captura/recuperação, migração das configurações, exclusividade entre abas e sequência sonora por limiares reais.

Os testes sonoros usam tanto simulações da Web Audio quanto instrumentação de osciladores no Chromium. Verificam três tons curtos e um longo, deduplicação, recuperação sem repetir sons antigos, silêncio, volume, prioridade e modo música. Instanciar osciladores corretamente não comprova audibilidade física nem ausência de interrupção de outro aplicativo no Android.

`python3 tests/browser-minimal.py` abre um servidor temporário local, navega no Chromium e produz capturas e relatório JSON em `artifacts/`, ignorado pelo Git. Usa relógio controlado para percorrer dez rounds e um relógio real em um treino curto para verificar oito sinais distintos: 3 curtos + 1 longo na luta e no descanso. Emulação touch não é um aparelho Android.

## Cobertura da atualização

| Requisito | Verificação automatizada | Verificação física pendente |
| --- | --- | --- |
| Tela de escolha a cada nova abertura | Gate antes do timer, escolha após reload e retomada explícita | Tela inicial na PWA instalada Android |
| Moreira sem humor | Fotos, frases e seletor ocultos; movimento desativado | Legibilidade à distância |
| BJJ com bibliotecas | Upload/visualização/ativação/exclusão; fotos nas janelas iniciais/finais e no encerramento; nenhuma frase | Fotos reais autorizadas da academia |
| Dez rounds e nove descansos | Motor puro e interface com relógio controlado | Aula completa com música e espelhamento |
| Último round encerra | Zero parado e TREINO FINALIZADO, sem novo descanso | — |
| Bipes 3–2–1–zero | Chaves únicas e durações de osciladores no Chromium | Volume percebido e atraso da transmissão |
| Pausa/retomada | Tempo congelado e nenhum sinal repetido | Interrupções do Android real |
| Reativar áudio | Mesmo round/tempo e contexto recuperado sem bip antigo | Bluetooth e troca de rota de áudio |
| Orientação | Retrato/paisagem sem trocar modo ou reiniciar treino | Espelhamento na Roku da academia |
| Persistência | Configurações, fotos no IndexedDB e sessão pausada após reload | Descarte pelo SO e pressão de armazenamento |
| Som habilitado/silêncio | Osciladores com áudio, ausência deles em silêncio | Modo silencioso e volume de mídia do Android |
| Compatibilidade com música | Configuração persistida, tons breves e efeitos extras desligados | Player de música concorrente no aparelho real |
| TV horizontal | 1920×1080 e 844×390; foto e relógio em áreas separadas | Roku física e rede da academia |
| Sem regressões | Offline real via Service Worker, importação/exportação e fotos | Instalação no Android/iPhone |
| Instância única | Web Locks; fallback conservador, fencing e recuperação explícita | Navegadores não Chromium e comportamento do SO |
| Retorno após suspensão | Relógio, visibilidade e ordem simulada de bfcache | Suspensão real de processo pelo Android |

## Execução

```bash
npm test
npm run test:browser
```

O segundo comando precisa de Python, Playwright e Chromium previamente instalados. Não baixa navegadores nem dependências. Se a sandbox bloquear sockets ou o Chromium, a execução exige a permissão suportada para teste local; não é necessário alterar ou contornar o proxy.

Os resultados atuais e contagens exatas são registrados em [VALIDATION.json](VALIDATION.json). Nenhum teste interrompido ou não executado deve ser contado como aprovado. Nenhum aparelho Android ou Roku físico foi testado neste ambiente.

## Roteiro antes da primeira aula

1. Abra a versão HTTPS no Android da academia e instale quando oferecido. Confirme o cache offline.
2. Toque em cada modo numa nova abertura. Alterne temporariamente de aplicativo: a seleção não deve reaparecer nem apagar o treino.
3. Ligue a música no player utilizado na academia. Selecione Academia ou Normal e teste os sinais com a música tocando. Observe se a música continua, diminui ou pausa.
4. Espelhe na Roku pelo recurso compatível do fabricante. Gire para paisagem, ative Modo TV e confira números, saída do som e atraso.
5. Execute 10 rounds curtos: confirme 3 bipes curtos e um longo no fim de cada fase, exatamente 9 descansos e parada no décimo round.
6. Durante o treino, teste pausa/retomada, troca de orientação e **REATIVAR ÁUDIO**. O round não pode zerar.
7. Bloqueie/troque de aplicativo por 20 segundos e volte. Confira fase e tempo recalculados; não espere sons que o SO impediu.
8. Pause, recarregue, escolha modo e recupere: o tempo deve ser mantido. Em execução, a recuperação deve descontar o período fora da página.
9. Abra uma segunda aba e confirme o bloqueio de outro treino. Feche corretamente todas as instâncias antes de liberar uma reserva antiga de fallback.
10. Confira biblioteca e treino com rede desligada. Guarde fotos originais e exporte configurações antes de limpar dados.

Se o Android pausar a música mesmo no Modo Música, use o timer silencioso ou um segundo dispositivo já disponível para a reprodução musical. Isso é uma alternativa gratuita quando o equipamento já existe; não é uma garantia de roteamento pelo app.

## Revisão 1.3

O som Academia usa bipes agudos de 2400 Hz/230 ms e encerramento de 1080 Hz/1050 ms, com limite agregado de ganho. Foram adicionados testes de migração respeitando silêncio, janelas de fotos sem frases, logo oficial no topo e ao fundo, atualização manual bloqueada durante treino e preservação do estado. A análise dos dois vídeos fornecidos está em [AUDIO-REFERENCE.md](AUDIO-REFERENCE.md). O segundo vídeo tem faixa de áudio silenciosa.

## Correção 1.3.1: edição e desempenho

Comandos executados: `npm test` (79 aprovados), `python3 tests/browser-minimal.py` (40 cenários aprovados), `python3 tests/browser-wheels.py` e `WHEEL_CPU_RATE=4 python3 tests/browser-wheels.py` (9 cenários aprovados em cada execução).

Cada execução dos seletores percorre 12 ciclos de edição/salvamento imediato/fechar/reabrir/navegação, rolagem por toque emulado com alinhamento automático, limites e acesso por teclado, atualização imediata do relógio, persistência após recarregamento, falha simulada de armazenamento e recuperação, além de três ciclos de pausa/configurações/alterar som/retomada. O teste garante no máximo 55 linhas de seleção montadas no DOM e ausência de exceções JavaScript.

A medição via MutationObserver no Chromium em 390×844, com configurações abertas e timer parado, registrou 280 mutações no DOM por segundo na versão anterior e zero na corrigida. Isso comprova a remoção do trabalho repetitivo nessa condição, não uma certificação de FPS nem reprodução do congelamento no aparelho do usuário. Não houve acesso ao Android físico ou à Roku. A limitação de CPU do Chromium também não simula integralmente o hardware, a GPU ou o sistema Android.

A primeira tentativa de teste revelou uma rolagem programática excessivamente longa ao usar End até 1440 minutos. Saltos grandes passaram a ser instantâneos; movimentos curtos continuam suaves. As execuções completas finais passaram depois dessa correção. Captura: `artifacts/wheel-settings-mobile.png`; relatório: `artifacts/wheel-results.json`. A publicação da versão 1.3.1 na hospedagem de teste foi solicitada pelo usuário após a validação local. Não houve envio ao GitHub.

## Editor exclusivo 1.3.2 — somente local

A gravação anexada tem 14,295 segundos. A sequência mostra a lista principal, o editor de luta, CONCLUÍDO, o editor de descanso e o retorno à lista. O fluxo foi implementado preservando o motor, a interface do cronômetro e as bibliotecas.

Executados após a implementação: `npm test` (79 aprovados), `python3 tests/browser-minimal.py` (40 cenários aprovados) e `WHEEL_CPU_RATE=4 python3 tests/browser-wheels.py` (12 cenários aprovados). São 52 cenários de navegador, sem falhas na execução final. Houve também uma execução anterior completa de 11 cenários do editor em CPU normal, antes de acrescentar o teste de toque no vizinho/dedo apoiado.

O fluxo percorre 12 ciclos completos com edição dos dois tempos, CONCLUÍDO, SALVAR, fechamento automático, persistência, atualização imediata do relógio e reabertura. Verifica cancelamento, rascunho na navegação, erro de armazenamento com nova tentativa, som sem gravar tempos em rascunho, limites, inércia e alinhamento, toque num valor vizinho, orientação horizontal e três ciclos de pausa/configurações/retomada. O editor monta no máximo 22 linhas e o timer parado mantém zero mutações por segundo na área principal.

Falha reproduzida no teste: virtualizar linhas que eram alvo do toque removia esse alvo durante o gesto e podia impedir touchend de chegar ao seletor. A área de toque agora é fixa e o evento de término volta a ser recebido. O encaixe não é forçado enquanto há um toque ativo. As execuções de inércia/alinhamento passaram após a correção.

Capturas: `artifacts/editor-luta-mobile.png` e `artifacts/editor-descanso-landscape.png`. Relatório: `artifacts/wheel-results.json`. Não houve teste em Android físico/Roku nem publicação no GitHub ou na hospedagem nesta revisão. CPU limitada e toque emulado não certificam desempenho no aparelho do usuário.

## Protocolos 1.4.0 — envio ao GitHub solicitado, sem publicação da hospedagem

Executados: `npm test` (92 aprovados, incluindo 13 novos testes de protocolos), `python3 tests/browser-minimal.py` (40 cenários aprovados), `python3 tests/browser-protocols.py` (12 cenários aprovados) e `WHEEL_CPU_RATE=4 python3 tests/browser-wheels.py` (12 cenários aprovados). São 64 cenários de navegador, sem falhas nas execuções completas.

Cada protocolo percorreu todas as etapas no Modo Moreira e no Modo BJJ. Foram verificados preparação, nenhuma partida automática ao selecionar, pausa/retomada, durações exatas, ausência de descanso final, identificação dos alunos, confirmação/cancelamento de troca/saída, retorno às últimas configurações manuais e recuperação de protocolo pausado após reload. Editar as durações manuais enquanto um protocolo está selecionado não modifica o protocolo e fica disponível ao sair dele.

Os testes nativos verificam os três bipes curtos e um longo em todas as etapas, sem repetição na pausa/retomada; compensação de atraso numa luta variável; validação de capturas e compatibilidade com sessões manuais antigas. Nos drills por aluno, há exatamente sete intervalos de 30 s, com uma única troca de aluno entre as rodadas quatro e cinco.

`artifacts/protocol-results.json` contém o relatório; `artifacts/protocol-{moreira,bjj}-{mobile,tv}.png` contém capturas. O navegador usa relógio controlado para as sessões longas. Não foram testados Android/Roku físicos, música simultânea ou acústica real. Não foi usada VPS nem serviço pago.

## Recuperação de áudio 1.4.1 — local, sem publicação

Comandos executados: `npm test` (103 aprovados), `python3 tests/browser-minimal.py` (40 cenários) e `python3 tests/browser-audio-recovery.py` (8 cenários). A suíte adicional usa contextos Chromium reais com falhas injetadas para estados suspended/interrupted, relógio congelado apesar de running e recusa de resume simulando exigência de gesto no iOS.

São seis ciclos de visibilidade em execução, três pausados, bloqueio com reativação por toque, retomada por foco e BFcache. Os testes conferem tempo descontado, pausa, round, protocolo, modo, ausência de tons gerados pela recuperação e sinais 2/1/zero após recuperar num segundo 3 já consumido. A opção Silencioso impede recuperação automática e mensagens desnecessárias. A ação direta também fica disponível brevemente após retorno aparentemente saudável, pois o JavaScript não mede a audibilidade na saída AirPlay. O aviso de recuperação não intercepta o botão de pausa/retomada.

Os 11 novos testes nativos verificam o avanço real do relógio do contexto simulado, dez ciclos repetidos, ciclo suspend/resume, recriação com sink exposto, deduplicação de solicitações simultâneas, invalidação de resultados antigos, gesto que preempta uma tentativa pendente e timeout de resume. Os testes anteriores de síntese/envelope usam uma sonda de relógio injetada para isolar suas verificações; a suíte nova exercita a sonda padrão.

Relatório: `artifacts/audio-recovery-results.json`. O roteiro físico está em [ANDROID-ROKU.md](ANDROID-ROKU.md). Não foram executados bloqueio/desbloqueio em iPhone real, Roku física, música de outro aplicativo ou testes acústicos. Contexto running e currentTime avançando não provam saída audível nem manutenção da rota de áudio pelo iOS.

## Início pela marca e independência 1.5.0 — somente local

`npm test`: 103 testes aprovados. `python3 tests/browser-minimal.py`: 40 cenários aprovados. `python3 tests/browser-home-isolation.py`: 6 cenários aprovados.

A suíte nova testa a marca inteira por imagem, texto e teclado, nos dois modos e nos estados pronto, preparação, luta, pausa, descanso e concluído. Verifica interrupção dos sons, remoção da retomada e conservação das configurações. Um callback de Web Lock propositalmente atrasado confirma que sair pela marca impede início tardio do treino. O layout de 320 px foi conferido sem rolagem horizontal.

Três perfis independentes usam o mesmo servidor/origem simultaneamente, com lutas/descansos/rounds distintos e protocolo variável. Um deles usa o fallback sem Web Locks. Avanços, pausa, saída, alterações de configurações e recuperação após reload de um perfil não alteram os demais. Outra aba no mesmo perfil continua bloqueada e sair pela marca nessa aba não apaga a sessão que pertence à aba ativa.

O teste confirma que as requisições de aplicação são leituras de arquivos locais/estáticos, sem transporte de estado de treino para servidor. Não há alteração funcional no mecanismo de independência, pois ele já usa armazenamento e motores locais; foi documentado e validado. Relatório: `artifacts/home-isolation-results.json`. Não foram usados celulares físicos ou executados testes de carga do serviço de hospedagem.
