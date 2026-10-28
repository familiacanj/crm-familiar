# CRM Família — Handoff

## Estado atual

- Projeto local: CRM Família.
- Repositório: `familiacanj/crm-familiar`.
- Backend migrado localmente de MongoDB/Emergent para Supabase; as alterações ainda precisam ser validadas e enviadas ao GitHub antes da publicação.
- O JSON de credenciais OAuth do Google é local e está excluído pelo `.gitignore`; não deve ser versionado.
- O Vercel foi configurado inicialmente com a raiz `backend`, por isso a implantação atual não representa a tela do aplicativo.

## Próximos passos controlados

1. Validar o backend e o frontend localmente.
2. Enviar ao GitHub somente código e exemplos de ambiente, sem segredos.
3. Publicar a API com as variáveis privadas do Supabase no Vercel.
4. Publicar o frontend Expo Web em um projeto Vercel separado, apontando para a API pública.
5. Validar a abertura do aplicativo e o login Google em ambiente externo.

## 2026-10-28 visual pass

- O PRD aprovado foi revisado como especificação de planejamento; a direção visual complementar está em `design_guidelines.json`.
- A primeira fatia visual é somente a tela Resumo/Home.
- O cabeçalho da Home agora mostra a foto do Google quando disponível, o rótulo do orçamento familiar e a saudação; o seletor de mês foi preservado.
- Os três cards financeiros agora usam uma grade de duas colunas com alvos de toque amplos, sem alterar API, banco, autenticação ou Android.
- Contas, Família, PWA instalável, permissões, auditoria, notificações, relatórios e comercialização continuam pendentes de etapas próprias.

## 2026-10-28 Tela 1 — antes do login

- A tela inicial agora usa os assets aprovados locais: logotipo claro e fotografias vertical/horizontal da família.
- O layout foi reorganizado para logo e frase no topo, fotografia central e ações abaixo, com seleção responsiva da fotografia para telas estreitas e largas.
- `Entrar com Google` preserva o fluxo de autenticação existente.
- `Conheça o Aplicativo` permanece visível, mas desabilitado até a Central de Ajuda existir; nenhuma navegação falsa foi criada.
- Onboarding, Home, API, Supabase, autenticação/redirecionamentos e Android não foram alterados nesta etapa.

## 2026-10-28 ajuste final da Tela 1

- O logo agora se adapta à largura disponível e mantém espaçamento seguro de 16px antes da frase em celulares menores.
- A mensagem interna sobre a Central de Ajuda foi removida da tela; o botão `Conheça o Aplicativo` foi preservado, sem criar navegação ou telas adicionais.

## 2026-10-28 Tela 1 mobile e PWA web

- A fotografia da tela antes do login agora reduz proporcionalmente conforme a largura e a altura disponíveis; telas excepcionalmente pequenas continuam podendo rolar sem sobreposição.
- A versão web agora publica `manifest.webmanifest`, modo `standalone`, cores CRM, ícone oficial 512×512 e metadados Apple Touch Icon.
- O service worker faz cache somente do shell e de arquivos públicos estáticos; não intercepta API, Supabase, callbacks OAuth ou URLs com dados de autenticação.
- O build web ganhou um pós-build explícito para inserir os metadados PWA no `dist/index.html` do Vercel.
- Android nativo, Supabase, backend, autenticação e demais telas não foram alterados.
- Instalação em aparelho Android/iPhone e homologação visual/funcional real permanecem pendentes da validação do usuário.
- O projeto Vercel `crm-familiar-web` foi ajustado para usar `npm run build`, preservando raiz `frontend` e saída `dist`, para que o pós-build PWA seja aplicado nas próximas implantações.

## 2026-10-28 responsividade da Home

- Os cartões financeiros da Home usam uma coluna abaixo de 720px e duas colunas quando há largura suficiente, com largura mínima protegida para texto, valor e ícones.
- O conteúdo ganhou espaço inferior adicional para que o botão flutuante `Anotar` não cubra informações ao final da rolagem.
- A viewport web usa `viewport-fit=cover`, sem `maximum-scale` ou `user-scalable=no`, preservando o zoom de acessibilidade.
- O cache público do service worker foi versionado para `v2` para invalidar com segurança o bundle anterior nos PWAs já instalados.
- A implantação `9d94829` está Ready em produção; a homologação visual autenticada em celular, tablet e computador permanece pendente porque a sessão não estava disponível no navegador interno.

## 2026-10-28 Tela 2 e convites — implementação local controlada

- A Tela 2 normal foi separada do fluxo de convite: após o login sem convite, mostra somente a criação de família, com largura máxima de 520px no desktop.
- Foi criado localmente o fluxo de convite por link: prévia pública, login Google preservando o token, confirmação do nome e aceitação única.
- O backend usa token aleatório, armazena somente o hash, valida validade/cancelamento/uso e consome o convite por função SQL atômica.
- A área Família passou a oferecer geração, compartilhamento nativo e cópia do link para proprietário/administrador; o código legado não é mais exibido.
- A migração `202610280001_family_invitations.sql` foi aplicada no projeto Supabase. A tabela, a coluna de papel, a função atômica, a política e o RLS foram verificados; as contagens permaneceram em 3 famílias, 5 perfis, 0 lançamentos e 69 categorias.
- As famílias existentes ficaram sem proprietário inferido de propósito e precisam de associação explícita antes de liberar convites nelas. Famílias novas já recebem proprietário automaticamente.
- Python, ESLint e build web passaram. O TypeScript continua com os três erros preexistentes em `frontend/src/theme.ts`. Publicação no Vercel e homologação real do convite permanecem pendentes.

## 2026-10-28 publicação do sistema de convites

- O commit `cc16d3e` foi enviado para `main` e publicado no backend e no frontend.
- O commit `1232903` adicionou o fallback de rotas do Expo Web no Vercel, permitindo abrir diretamente links como `/invite?token=...` sem 404.
- O backend `crm-familiar.vercel.app` respondeu `{"status":"ok"}` em `/health`.
- O frontend `crm-familiar-web.vercel.app` ficou Ready no commit `1232903`; a rota pública `/invite?token=invalid` abriu a tela de convite e exibiu `Convite inválido.`.
- O fluxo completo com um convite real, usuário proprietário/administrador e aceitação em aparelho PWA ainda precisa de homologação manual. As três famílias antigas continuam sem proprietário inferido de propósito; é necessário associar explicitamente cada proprietário antes de gerar convites para elas.
