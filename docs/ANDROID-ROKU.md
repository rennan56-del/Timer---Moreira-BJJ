# Android, música e Roku TV — viabilidade e validação

Pesquisa documental realizada em **28 de outubro de 2026**, com fontes oficiais de Android, Chromium/Chrome e Roku. Não foram realizados testes físicos em Android, Roku TV, Bluetooth ou equipamento de som. Este documento não certifica compatibilidade de um modelo específico. Nenhuma versão nativa Roku foi desenvolvida nesta etapa.

## Uso prioritário: espelhar o Android

O aplicativo executa no navegador/PWA do celular; a televisão recebe a imagem pelo espelhamento do sistema. A Roku orienta iniciar a conexão no Android (por exemplo, **Smart View** em Samsung), selecionar a televisão e autorizar a conexão na Roku. O nome do recurso e sua disponibilidade dependem do fabricante. A documentação atual também ressalta exceções de dispositivos, incluindo Google Pixel/Nexus. A versão do Android, isoladamente, não garante suporte. [Guia oficial de espelhamento Roku](https://support.roku.com/article/screen-mirror-your-phone-tablet-or-computer).

O espelhamento Android compatível utiliza a implementação de tela sem fio do aparelho, geralmente Miracast — a Samsung documenta essa exigência para Smart View. [Samsung: compatibilidade Miracast](https://www.samsungsvc.co.kr/solution/26007). O botão “Transmitir” de um telefone pode usar outro protocolo e não identificar a Roku; isso não é corrigido por JavaScript no cronômetro. Antes do treino, confira os modelos exatos e a função de espelhamento oferecida pelo fabricante. O guia da Roku identifica problemas de compatibilidade, rede e configuração como causas comuns de falha. [Roku: formas de compartilhar conteúdo](https://support.roku.com/article/ways-to-share-media-from-your-phone).

Para a academia:

1. Conecte o Android e a Roku à rede indicada pelo fabricante e faça o pareamento de espelhamento pelo sistema.
2. Abra o timer no celular, escolha o modo e ative o layout TV. Use orientação horizontal e tela cheia quando oferecida.
3. Mantenha o celular ativo. Se Wake Lock for negado ou indisponível, confira o bloqueio automático.
4. Teste **bip curto**, **bip prolongado** e **reativar áudio** antes de iniciar. Verifique em qual saída cada som está chegando.
5. Se o sistema trocar a saída ou suspender áudio, reative o contexto por toque; não reinicie o treino para recuperar o som.

O aplicativo não instala um receptor na televisão nem exige Chromecast. Também não pode adicionar Miracast a um celular incompatível. Espelhamento pode introduzir latência, alterar resolução e rotear áudio; a precisão do motor no celular não elimina atraso da TV ou da transmissão. Desconexão da TV não deve apagar o treino no celular.

**A Roku TV não deve ser tratada como um navegador web completo.** O suporte oficial informa que o Roku OS não oferece navegação na internet na televisão. Portanto, não é correto prometer abrir o endereço da PWA ou instalá-la diretamente na Roku. [Roku: disponibilidade de navegador web](https://support.roku.com/en-us/article/can-i-browse-the-internet).

## Música e bipes no mesmo Android

Android pode misturar saídas de aplicativos, mas o gerenciamento de **foco de áudio** pode pausar, reduzir ou interromper outra reprodução. A política varia com versão do sistema, navegador e aplicativos envolvidos. Não há garantia geral de Spotify, YouTube Music ou outro player continuar sem alteração em todo aparelho. [Android Developers: gerenciamento de foco de áudio](https://developer.android.com/media/optimize/audio-focus).

A estratégia menos intrusiva nesta aplicação é gerar sinais breves com `OscillatorNode` e `GainNode`, manter controle de ganho próprio e evitar arquivos longos, elementos de mídia, sessão de reprodução ou solicitações nativas de foco exclusivo. Uma nota histórica do Chrome descreve Web Audio sem solicitação de foco Android; essa publicação é de **2017** e não deve ser tomada como contrato atual de todos os navegadores. A opção **Compatibilidade com música** reduz a intrusão dos efeitos; ela não desativa as políticas do sistema. [Chrome: notas de implementação de Media Session](https://developer.chrome.com/blog/media-session).

Reativação de áudio deve chamar `AudioContext.resume()` como resposta a um toque e conferir o estado obtido. Isso é separado do motor de tempo: não muda round, duração, pausa ou início do treino. A política de autoplay do Chromium exige considerar contextos suspensos e ativação pelo usuário. Não é necessário nem recomendável mudar configurações de segurança do navegador para usar o aplicativo. [Chromium: autoplay e Web Audio](https://www.chromium.org/audio-video/autoplay/).

O volume interno afeta os bipes; o volume de mídia do Android e a saída selecionada continuam afetando o resultado. A PWA não oferece um controle universal para mandar música ao Bluetooth e bipes à Roku de forma independente. Também não deve usar áudio silencioso contínuo, loops longos ou Media Session apenas para tentar manter o sistema acordado. Se um bip não pôde executar enquanto a página estava suspensa, não se deve reproduzir todos os sinais atrasados ao retornar.

## Teste físico obrigatório antes de uso em aula

| Cenário | O que observar | Estado desta entrega |
| --- | --- | --- |
| Música tocando antes de abrir o timer | Continua, diminui ou pausa ao habilitar o áudio? | Não executado em Android físico |
| Modo Música + teste curto/prolongado | Sinais distinguíveis; volume adequado sem mascarar a música | Não executado em Android físico |
| Modo silencioso | Contagem e fases continuam, sem emitir bipes | Validar no aparelho da academia |
| Android espelhado na Roku | Números à distância, atraso e saída real dos sons | Não executado em Roku física |
| Troca de orientação | Mantém round, tempo e estado de pausa | Complementar testes de navegador com teste físico |
| Voltar de outro aplicativo/bloqueio | Recupera tempo e contexto por toque, sem repetir sinais antigos | Suspensão real pelo SO ainda pendente |
| Bluetooth/caixa externa | Conferir roteamento e reconexão sem reiniciar o treino | Não executado em hardware |

Faça um treino curto de três rounds, com música e espelhamento ativos, depois execute a sequência completa pretendida pela academia. Se houver conflito de áudio, a alternativa gratuita com equipamento já disponível é reproduzir a música em outro celular/computador, ou usar o timer silencioso. Isso é uma alternativa operacional, não uma garantia de correção do áudio do aparelho.

## Futura versão nativa Roku: possível, com desenvolvimento específico

O caminho tradicional é uma aplicação Roku com **SceneGraph** para interface e **BrightScript** para comportamento. Não consiste em copiar HTML/CSS, Service Worker ou IndexedDB para a TV. Seria preciso adaptar o motor, interface horizontal, controle remoto, armazenamento de fotos/configurações e síntese/reprodução de sinais às APIs Roku. Um timer local controlado pelo controle remoto pode ser projetado sem backend; controle pelo celular exigiria um protocolo adicional e testes de sincronização. Estas são propostas de arquitetura, não funcionalidades implementadas. [Roku: visão geral do desenvolvimento](https://developer.roku.com/dev/docs/roku-overview).

Há uma mudança relevante de plataforma: em 28/10/2026, a Roku anuncia o **RSG 2.0 SDK** para TypeScript/JavaScript, com beta pública prevista para **29/10/2026**. O FAQ oficial informa licença MIT, coexistência com BrightScript e restrições de publicação durante a beta, que requerem orientação/aprovação explícita da Roku. Assim, ele é uma opção futura de avaliação, sem presumir disponibilidade estável hoje. Suporte a TypeScript não transforma a Roku em navegador nem permite executar a PWA diretamente. [Roku Developers: FAQ oficial RSG 2.0](https://forum.developer.roku.com/t/rsg-2-0-faqs/11453).

Para experimentar uma futura aplicação no equipamento da academia, existe **Developer Mode** e instalação local de pacote (*sideload*). É necessário um dispositivo Roku compatível, computador na rede local e inscrição no programa de desenvolvedores. Somente uma aplicação pode estar instalada por sideload por vez; outra substitui a anterior. Não foram ativados Developer Mode, contas, senhas ou instalações neste projeto. [Roku: configuração de desenvolvimento](https://developer.roku.com/dev/docs/developer-setup).

A publicação pública exige pacote, revisão e certificação; não é automática. Aplicações beta distribuídas pelo painel têm prazo e limites próprios, portanto não devem ser tratadas como instalação permanente de produção. [Roku: publicação de aplicativos](https://developer.roku.com/dev/docs/channel-publishing-guide).

### Custos e alternativas

- A documentação oficial informa que inscrição, desenvolvimento e publicação no Streaming Store não têm tarifa de programa; isso não elimina trabalho de engenharia, testes, manutenção ou eventual necessidade de equipamento. [Roku: visão geral e custos](https://developer.roku.com/dev/docs/roku-overview).
- SDK/documentação e ferramentas comunitárias gratuitas permitem começar sem contratar plataforma. Uma TV/aparelho Roku real é necessária para validar o resultado; nesta etapa não há compra ou contratação.
- Hospedagem, serviços de fotos ou backend só seriam custos adicionais se uma futura arquitetura os adotasse. Um timer nativo local não precisa desses serviços por definição, mas precisaria de uma biblioteca de fotos e fluxo de importação próprios.
- Hoje, a alternativa prioritária sem custo adicional é a PWA no Android compatível e espelhamento nativo já existente. Um computador disponível ligado à TV por HDMI é outra alternativa; cabos/adaptadores necessários podem ter custo se ainda não existirem.

Antes de investir em versão nativa, validar o fluxo Android → Roku da academia é a forma mais direta de confirmar se ela realmente é necessária.
