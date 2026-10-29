# Imagens fornecidas para o projeto

O usuário confirmou nesta sessão, em **28/10/2026 no fuso America/Sao_Paulo**, que todas
as pessoas retratadas autorizaram a divulgação pública das imagens fornecidas. A inclusão
dos arquivos abaixo se baseia nessa confirmação do usuário; não representa verificação
independente de identidade ou obtenção de autorizações por terceiros.

| Arquivo recebido | Uso | Arquivo otimizado |
| --- | --- | --- |
| 1-Photo-1.jpg | Logo oficial da Moreira BJJ Academy | `public/images/branding/logo.webp` |
| 2-Photo-2.jpg | Foto de atleta | `public/images/athletes/athlete-01.webp` |
| 3-Photo-3.jpg | Foto de atleta | `public/images/athletes/athlete-02.webp` |
| 4-Photo-4.jpg | Foto de atleta | `public/images/athletes/athlete-03.webp` |
| 5-Photo-5.jpg | Foto de atleta | `public/images/athletes/athlete-04.webp` |
| 6-Photo-6.jpg | Foto de atletas | `public/images/athletes/athlete-05.webp` |
| 7-Photo-7.jpg | Referência visual do cronômetro | Não incluída como foto de atleta ou asset |

As cinco fotos foram convertidas fielmente para WebP com qualidade 85, sem ampliação,
limitando o lado maior a 1.200 px e removendo metadados. Não houve regeneração por IA,
retoque de rostos ou alteração das pessoas. Somente a terceira foto de atleta precisou
ser reduzida: 575×1.280 → 539×1.200 px.

No logo, foram removidas apenas as margens escuras vazias acima e abaixo do desenho,
usando o retângulo `(0, 225, 590, 1045)` da imagem original de 590×1.280 px. A imagem
resultante é 590×820 px; o desenho e os textos completos foram preservados. Houve
conversão WebP de qualidade 85 e remoção de metadados.

Os seis arquivos otimizados somam aproximadamente **110 KiB**. O build gera catálogos
com caminhos relativos à base do aplicativo, inclui as imagens no Service Worker e
permite funcionamento em subdiretórios. Os IDs fixos usam o prefixo `project-athlete-`
e são derivados do caminho, não de dados pessoais ou reconhecimento facial.

Fotografias que o usuário importar depois pela interface continuam somente no IndexedDB
do respectivo dispositivo. Elas não são copiadas automaticamente para estes diretórios
nem para o repositório. Nenhum arquivo foi enviado ao GitHub nesta etapa.
