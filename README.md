# Moreira BJJ Timer — 1.3.2

Cronômetro de academia com números gigantes, preparação amarela, luta verde-limão e descanso vermelho. O modo Moreira é direto e profissional; o modo BJJ mostra as fotos nos primeiros e últimos três segundos de cada fase e na finalização, sem frases humorísticas. O relógio nunca é coberto pelas imagens.

Versão de teste hospedada: https://timer-moreira-bjj-teste.rennan56.chatgpt.site (acesso privado, com a conta proprietária). As atualizações não alteram automaticamente seu repositório GitHub. Nenhuma VPS ou API paga é necessária.

## Usar

1. Escolha **Modo Moreira** ou **Modo BJJ** ao abrir.
2. Toque na engrenagem para ajustar **luta, descanso, rounds e som**. Toque em **LUTA** ou **DESCANSO** para abrir o editor exclusivo de minutos/segundos por rolagem. **CONCLUÍDO** confirma o tempo no rascunho e volta às configurações; **SALVAR** aplica, persiste e fecha as configurações automaticamente. Não há digitação.
3. Toque **Iniciar**. A preparação é sempre de três segundos.
4. Pause, continue, reinicie ou encerre pelos botões principais. O menu **•••** reúne tela cheia, reativação de áudio, instalação, avanço de etapa e ajuda.

Há um descanso entre os rounds; nenhum descanso após o último. O encerramento mostra **TREINO FINALIZADO** e, no BJJ, uma foto, sem frases extras. Os modos compartilham as mesmas durações. Trocar temporariamente de aplicativo ou girar a tela não abre novamente a escolha de modos.

## Som

Oferecemos somente **Normal**, **Academia**, **Silencioso** e **Testar Som**. O teste toca três curtos e um prolongado e não altera o treino. Ao iniciar uma sessão, qualquer teste pendente é cancelado.

Luta e descanso têm bipes nos três, dois e um segundos restantes, e um sinal longo no zero. O rastreador usa o tempo real do motor e chaves por fase/round, impedindo repetição ao pausar, continuar ou reativar áudio. Sinais que o SO impediu de tocar não são reproduzidos em sequência depois.

O perfil Academia usa ataque rápido, harmônicos, envelope sustentado e maior ganho percebido. Os bipes Academia são agudos (2400 Hz, 230 ms), com encerramento de 1080 Hz por 1050 ms. O perfil Normal usa 2000 Hz/180 ms e 960 Hz/900 ms. Academia é o padrão; a migração mantém o silêncio e preserva escolhas posteriores. Um ganho compartilhado limita os picos agregados a 0,9, inclusive em sobreposições. Isso evita clipping na síntese; não aumenta a potência física do alto-falante do celular ou da TV.

O app usa Web Audio, sem arquivos longos, Media Session, áudio silencioso contínuo ou foco exclusivo de áudio. **Música e bipes simultâneos dependem do Android/navegador**. Teste com a música antes da aula. Se o sistema reduzir ou pausar a música, use outro aparelho já disponível para ela ou mantenha o timer silencioso. Use **••• → Reativar áudio** para recuperar o contexto sem zerar tempo ou round. Veja [Android e Roku](docs/ANDROID-ROKU.md).

## Logo e fotos oficiais

O logo e as cinco fotos enviados pelo usuário foram incorporados, com autorização de divulgação pública confirmada na conversa. Foram otimizados fielmente para WebP, sem alteração dos rostos. Detalhes e registro da confirmação em [IMAGES.md](docs/IMAGES.md).

- Logo: `public/images/branding/logo.webp`.
- Integrantes: `public/images/athletes/athlete-01.webp` até `athlete-05.webp`.
- Para adicionar fotos, copie JPG/PNG/WebP/AVIF autorizados para `public/images/athletes/` e execute o build.
- O build descobre automaticamente os arquivos, gera os catálogos e os inclui no cache offline.
- Fotos fixas podem ser ativadas/desativadas por dispositivo. Para removê-las do aplicativo distribuído, remova o arquivo e gere uma nova versão.

A biblioteca secundária mantém uploads do celular, visualização, ativação e exclusão de fotos locais. Uploads posteriores ficam somente no IndexedDB e não vão automaticamente para o GitHub. As frases foram retiradas da interface e da exibição; dados antigos permanecem preservados nas exportações. O sorteio evita repetir a foto anterior quando há outra ativa. O logo oficial aparece maior no topo e discretamente ao fundo.

Os arquivos do projeto são públicos quando distribuídos com o app; uploads locais são separados. Antes de incluir novas pessoas, confirme sua autorização. Não são usadas fotos genéricas de internet.

## Instalar, offline e TV

Abra por HTTPS ou localhost e espere **Pronto para offline**, indicado no menu. No Android, instale pelo navegador; no iPhone, use Compartilhar → Adicionar à Tela de Início. Instalar é opcional, mas a primeira carga completa e espaço de armazenamento são necessários para o offline.

O Service Worker guarda HTML, CSS, módulos, fonte, fotos, logo, ícones e manifest. Atualizações aguardam o fechamento de todas as abas do timer e não recarregam um treino em andamento. Para receber uma nova versão, feche todas as abas/PWA e reabra, ou use **••• → Atualizar aplicativo** com todos os treinos parados. A atualização manual é bloqueada durante treino ativo ou pausado.

Na Roku, use o espelhamento compatível do Android e orientação horizontal. O botão TV otimiza a apresentação; a interface também é responsiva sem ele. Tela cheia depende do navegador. A Roku não é tratada como navegador completo e nenhuma versão nativa foi desenvolvida. Miracast, saída de áudio e latência dependem do equipamento.

## Precisão e recuperação

O motor existente usa prazos monotônicos (`performance.now()`), não soma chamadas de intervalos. Atrasos atravessam as fases vencidas até recuperar round e tempo corretos. Pausar congela os milissegundos restantes. Ao retornar de suspensão, o relógio é reconciliado; em SOs que congelam o relógio monotônico, o tempo civil preenche a lacuna. Alterar manualmente a hora durante uma suspensão é ambíguo; evite fazê-lo durante treinos.

A sessão é salva localmente quando possível. Após recarregar, escolha um modo e recupere o treino salvo. Sessões corridas consideram o tempo fora da página; pausadas mantêm a fração restante. Uma sessão antiga ou corrompida não é executada automaticamente.

Web Locks impede dois treinos simultâneos na mesma origem/navegador. Em navegadores sem a API existe um fallback conservador com reserva e verificação de propriedade; ele não tem a atomicidade de Web Locks. Uma reserva de aba suspensa não é tomada automaticamente. A liberação de reserva antiga exige confirmar o fechamento das outras instâncias.

Wake Lock mantém a tela ativa quando permitido. O Android pode suspender execução e áudio em segundo plano; não prometemos sinais enquanto isso ocorrer. Limpar dados do navegador pode apagar configurações e uploads. Exporte configurações e guarde as fotos originais.

## Desenvolvimento local

Requer Node.js 24+. Não há dependências para instalar.

```bash
npm run dev
```

Abra http://localhost:5173 **no computador onde o comando está executando**. Esse não é um link público para outro aparelho. O modo dev recompila arquivos e dispensa o cache offline; recarregue após editar.

Para a versão PWA de produção:

```bash
npm run build
npm run preview
```

Abra http://localhost:4173. Não use `file://`. Para celular em outra máquina, use hospedagem HTTPS ou o encaminhamento suportado do ambiente. HTTP por IP local não oferece todas as APIs PWA.

A stack é TypeScript modular e DOM nativo, preservando a solução sem dependências criada quando React/Vite não puderam ser instalados. O Node 24 transforma o TypeScript; não faz checagem estática equivalente a `tsc --noEmit`. A interface foi simplificada sem refazer o motor.

## Testes

```bash
npm test
npm run test:browser
python3 tests/browser-wheels.py
# Opcional: repetir a edição sob CPU limitada no Chromium
WHEEL_CPU_RATE=4 python3 tests/browser-wheels.py
```

O primeiro usa bibliotecas nativas do Node. O segundo usa Python, Playwright e Chromium previamente instalados; não baixa dependências. Cobertura e resultados executados estão em [TESTING.md](docs/TESTING.md) e [VALIDATION.json](docs/VALIDATION.json). Capturas ficam em `artifacts/`, ignorado pelo Git. Emulação touch não certifica Android ou Roku físicos.

## Organização

- `src/core/`: relógio, motor, rastreador de sinais, IDs e exclusividade entre abas.
- `src/components/`: tela minimalista e formulário principal/áreas secundárias.
- `src/media/`: áudio, playlist de descanso e Wake Lock.
- `src/storage/`: configurações, sessão, IndexedDB, frases e catálogo de imagens.
- `src/styles/main.css`: apresentação responsiva, contraste e movimento reduzido.
- `public/images/`: fotos autorizadas e logo oficial; `public/fonts/`: fonte local Apache 2.0.
- `scripts/`: build, catálogos, Service Worker e servidor local.
- `tests/`: testes nativos e QA visual; `docs/`: limitações, imagens e validação.

## GitHub e publicação

Repositório: https://github.com/rennan56-del/Timer---Moreira-BJJ. O envio desta versão foi autorizado pelo proprietário, incluindo as imagens autorizadas. A hospedagem usa uma cópia e um repositório interno separados.

Para atualizar o GitHub posteriormente, revise `git diff`, execute os testes, faça commit e use `git push origin main`. Preserve o histórico remoto e não use push forçado. `artifacts/`, `dist/`, credenciais e uploads privados ficam fora do Git. Para hospedar a PWA, publique o conteúdo de `dist/` em hospedagem estática HTTPS; não é necessário backend.

Licença do código: [MIT](LICENSE). Fonte Open Sans sob Apache 2.0, com aviso/licença em `public/fonts/`. As fotografias não são relicenciadas pela licença MIT.

## Correção das configurações — 1.3.1

O loop continua conferindo o motor e os sinais a cada 50 ms durante o treino, mas só redesenha a interface quando muda a informação exibida. Parado, consulta a cada 250 ms sem reescrever o DOM. O diálogo preserva a cor existente e dispensa o desfoque custoso do fundo. Os seletores usam rolagem nativa, renderizam no máximo 11 linhas por coluna e não capturam gestos globais. Salvar lê imediatamente a posição atual, mesmo antes do fim da inércia. Em falha de armazenamento, informa o erro e preserva os valores anteriores. A versão 1.3.1 foi preparada para teste na hospedagem existente, após solicitação do usuário. O envio ao GitHub permanece separado.

## Editor exclusivo — 1.3.2 local, não publicada

Fluxo baseado na gravação de tela enviada: lista de tempos → editor exclusivo com dois seletores e cinco posições visíveis → CONCLUÍDO → configurações → SALVAR → cronômetro. Voltar ou Escape no editor descartam apenas o valor ainda não confirmado; fechar as configurações sem salvar descarta o rascunho. Testar Som não persiste os tempos em rascunho. Erros de validação ou armazenamento mantêm a tela aberta para correção e nova tentativa.

A superfície tocada é permanente: os números virtualizados não recebem eventos diretamente. Isso evita perder touchend quando uma linha desaparece durante a rolagem. O encaixe aguarda o término do toque/inércia, e CONCLUÍDO lê a posição imediatamente. Apenas duas colunas (até 22 linhas) são montadas no editor. A versão online anterior não foi alterada nesta revisão, conforme solicitado.
