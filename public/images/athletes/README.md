# Fotos autorizadas da academia

Esta pasta contém fotografias aprovadas para inclusão no próprio aplicativo. Os arquivos
JPG/JPEG, PNG, WebP e AVIF (inclusive em subpastas) entram automaticamente no catálogo
gerado por `npm run build` e no cache offline. Não adicione capturas de tela, logos ou
imagens genéricas aqui.

Os cinco arquivos `athlete-01.webp` a `athlete-05.webp` são versões otimizadas das fotos
enviadas pelo usuário, que confirmou autorização de divulgação de todas as pessoas
retratadas. Consulte `docs/IMAGES.md` para origem e processamento.

Para adicionar uma nova foto fixa, coloque o arquivo autorizado aqui e execute novamente
o build. O catálogo não precisa ser editado. Os IDs são estáveis por caminho do arquivo.
As fotos ficam públicas se o projeto for publicado; uploads feitos dentro do aplicativo
continuam locais ao dispositivo no IndexedDB e não são gravados nesta pasta.
