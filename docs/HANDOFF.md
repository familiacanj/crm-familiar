# CRM Familiar — Handoff

**Atualizado em:** 13/11/2026
**Repositório:** `familiacanj/crm-familiar`

## Estado atual

- `main` contém a correção de parentesco: backend `e36eb52` e frontend `2c0be05`; ambos ficaram Ready em Production. Deployment não equivale à homologação visual/funcional pelo proprietário.
- Frontend Expo Web/PWA e API FastAPI são projetos Vercel separados: `crm-familiar-web` e `crm-familiar`. Dados e autenticação usam Supabase.
- Login Google e retorno foram corrigidos no código ao longo das etapas anteriores. O usuário confirmou funcionamento no computador e no PWA instalado; a conclusão do login em Chrome Android normal permanece sem homologação final comprovada.
- A criação da família no código inicia somente com a pessoa financeira do proprietário. A correção para manter a aba Família e mostrar a mensagem única de boas-vindas está no estado atual da `main`; o commit de produção `c785b83` tem a mesma árvore de arquivos de `5ce81dd`, embora `5ce81dd` não seja ancestral de `main`. Falta registrar a homologação real do comportamento após essa publicação.
- O PWA usa manifesto, ícones, service worker e shell público. A tela animada com o GIF foi trabalhada em Preview/branch; não inferir validação de produção ou de todos os aparelhos sem teste.
- A branch `codex/family-profiles-privacy` (commit `ae63ece`) contém implementação em desenvolvimento de perfis por família, parentesco, fotos, papéis e finanças privadas/compartilhadas, incluindo migração SQL, RLS e verificações da API. Não foi integrada à `main`; não aplicar sua migração na produção.
- O MCP `supabase-crm-familiar` está conectado ao projeto de produção `iougyvryqotidbhloazg`. A conexão permite consultas SQL e inspeção de tabelas, mas não oferece operação dedicada de Auth Admin/Storage; o proprietário fez a limpeza de Auth no painel. Para testar a migração de privacidade, confirmar primeiro um Supabase de staging realmente isolado; testes com gravação não devem usar produção.
- O fluxo de aprovação de correções de lançamentos compartilhados continua futuro, não implementado.
- O Superadministrador e o Painel Administrativo foram implementados e publicados conforme a seção de entrega de 13/11/2026 abaixo. A branch de privacidade familiar continua separada e não foi integrada.

## Dados de teste e autenticação — 13/11/2026

- Antes da limpeza, a consulta confirmou 16 usuários Auth, 13 famílias, 16 perfis, 43 pessoas financeiras, 289 categorias e 1 convite; lançamentos, pagamentos, metas e depósitos estavam vazios. O bucket privado de fotos não continha objetos.
- Foi criado e verificado um backup recuperável local das 10 tabelas públicas antes da limpeza. A limpeza ocorreu em uma transação, sem exclusão de usuários Auth e sem alteração de estrutura, RLS, configurações ou deployments.
- Após a limpeza, as consultas confirmaram zero famílias e zero dados familiares/financeiros nas tabelas verificadas, um perfil público sem vínculo familiar para a identidade preservada, zero arquivos e nenhuma referência órfã.
- A identidade escolhida para a configuração inicial futura de Superadministrador é `ajudapopular@gmail.com`. O proprietário informou que removeu manualmente os outros 15 usuários pelo painel e confirmou visualmente que somente essa identidade permanece no Supabase Auth. Esse último estado é **confirmação do proprietário**, não uma nova consulta independente do MCP.
- O papel global ainda não foi concedido nem implementado. Não criar o privilégio apenas com base em dados enviados pelo frontend.

## Próximos passos controlados

1. Criar ou confirmar staging isolado e validar ali a migração de perfis/privacidade, RLS, permissões e convites.
2. Homologar a navegação de primeiro acesso e os fluxos Google no Chrome Android normal, separadamente do computador e do PWA standalone.
3. Revisar os resultados de Preview e apresentar SQL, testes e riscos antes de pedir aprovação específica para qualquer migração de produção.
4. Homologar o Painel Administrativo em aparelho real, se necessário, e validar separadamente o acesso negado por uma identidade comum quando houver uma conta de teste autorizada.
5. Implementar solicitações de correção, aprovações e notificações somente após autorização específica.
6. Registrar no HANDOFF cada funcionalidade implementada, corrigida ou homologada. Atualizar o PRD quando uma decisão de produto for aprovada ou alterada.

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
- O commit `84aba4d` preservou a prioridade dos arquivos estáticos no fallback; manifesto, service worker e ícones continuam sendo entregues pelos próprios arquivos.
- O backend `crm-familiar.vercel.app` respondeu `{"status":"ok"}` em `/health`.
- O frontend `crm-familiar-web.vercel.app` ficou Ready no commit `84aba4d`; o manifesto público respondeu com nome `CRM Família`, modo `standalone` e um ícone, e a rota `/invite?token=invalid` abriu a tela de convite exibindo `Convite inválido.`.
- O fluxo completo com um convite real, usuário proprietário/administrador e aceitação em aparelho PWA ainda precisa de homologação manual. As três famílias antigas continuam sem proprietário inferido de propósito; é necessário associar explicitamente cada proprietário antes de gerar convites para elas.

## 2026-10-29 correção de idioma, instalação PWA e retorno de convites

- O pós-build web agora força `lang="pt-BR"` e traduz a mensagem de fallback do HTML, evitando que o Chrome identifique a página como inglês.
- O manifesto passou a declarar ícones oficiais de 192×192 e 512×512; o service worker foi versionado para `v3` e inclui o novo tamanho sem armazenar API, Supabase ou callbacks OAuth.
- O logout limpa o convite pendente e, na web, retorna à raiz do CRM; sair da tela de convite também limpa o token salvo.
- No Supabase, a URL padrão foi ajustada para `https://crm-familiar-web.vercel.app` e foram adicionados somente os callbacks `/invite` da produção e do localhost, preservando os existentes.
- Build web, ESLint direcionado, verificação dos artefatos PWA e `git diff --check` foram executados. O TypeScript continua com os três erros preexistentes em `frontend/src/theme.ts`; não relacionados a esta correção.
- A publicação no Vercel e a validação final em aparelho real ainda dependem do push/deployment e do novo teste do usuário.

## 2026-10-29 correção prioritária de login, convites e instalação PWA

- A causa do login normal cair em `/invite` foi reproduzida: a rota pública `invite` estava declarada antes das telas protegidas no `Stack`, então a raiz autenticada escolhia convite como primeira tela disponível.
- A ordem do roteamento foi corrigida para que `/` selecione login, onboarding ou Home conforme a sessão e a família; `/invite` continua disponível para links de convite diretos.
- Como a ordem declarativa isolada não era suficiente no Expo Router, foi criada uma rota raiz explícita em `frontend/app/index.tsx`, com redirecionamento determinístico para login, onboarding ou Home.
- Login normal agora remove qualquer `pending_invite_token` antigo antes de iniciar o OAuth; login por convite mantém somente o token recebido pelo link.
- O botão Voltar de `/invite` limpa o contexto e usa navegação direta para a raiz na web, evitando loops e dependência do estado anterior do roteador.
- A Tela 1 passa a capturar `beforeinstallprompt` e mostra `Instalar aplicativo` somente quando o navegador realmente oferece a instalação. Em iPhone e em navegadores sem esse evento, permanecem as instruções manuais do sistema.
- O problema foi reproduzido com login Google real: o callback chegou à raiz, mas o roteador escolheu `/invite`; a correção ainda precisa ser validada após a nova publicação.

## 2026-10-29 prévia social e diagnóstico do login Android

- O HTML público inicial não possuía Open Graph nem Twitter Card; foram adicionados título, descrição, URL de produção e o ícone oficial público de 512×512, sem alterar a imagem.
- O manifesto, os ícones 192×192/512×512, o service worker e o botão condicional `beforeinstallprompt` foram verificados e não apresentaram falha estrutural.
- No navegador interno, o botão Google foi confirmado como botão HTML habilitado, com área de toque adequada e OAuth retornando ao CRM sem erro JavaScript.
- A validação em Android físico permanece pendente; não foi feita alteração desnecessária no OAuth enquanto a falha não puder ser reproduzida fora do aparelho.

## 2026-10-29 otimização inicial de desempenho

- Linha de base: primeira resposta do backend em aproximadamente 6,5 s, chamadas aquecidas em 0,2–0,5 s, bundle inicial de cerca de 2,7 MB e fotografias aprovadas de aproximadamente 2,4 MB cada.
- O cache do React Query agora reutiliza dados autenticados somente em memória por 30 s, limpa após logout e não usa o service worker público para respostas financeiras.
- A Tela 1 mantém o visual aprovado, reaproveita logo e fotografia com cache local do `expo-image` e mostra uma mensagem transitória se o início do OAuth demorar, sem alterar o redirecionamento.
- Foram criadas versões JPEG de alta qualidade da fotografia somente para a web: a vertical caiu de aproximadamente 2,4 MB para 275 KB e a horizontal para 261 KB; o Android continua usando os PNG originais aprovados.
- O HTML passou a antecipar conexões ao Supabase e ao backend; recursos estáticos versionados recebem cache imutável no Vercel, enquanto manifesto e ícones continuam com atualização curta.
- O login registra somente durações, sem URLs, tokens ou dados pessoais, distinguindo início, preparação do redirecionamento e carregamento de `/auth/me` após o retorno.
- As dependências do backend foram reduzidas ao conjunto efetivamente importado pela API e pelos testes, preservando `openpyxl` para exportação e `uvicorn` para execução local.

## 2026-10-30 correção dirigida do toque Google no Chrome Android

- A falha física foi delimitada ao Chrome Android em aba normal: o botão recebia `onPressIn` (animação visível), mas o `onPress` final podia ser cancelado pelo gesto/variação de viewport do navegador; standalone e desktop não reproduziram.
- Somente nesse ambiente, o login começa no `onPressIn`, com trava contra chamada duplicada e área de retenção maior; desktop, PWA standalone e Android nativo mantêm o acionamento anterior.
- A mensagem transitória `Toque recebido. Preparando o Google...` permite distinguir com segurança se o evento chegou, sem registrar token, código, URL, cookie ou dado pessoal.
- Quando o Chrome Android não disponibiliza `beforeinstallprompt`, a Tela 1 mostra apenas a orientação discreta para instalar pelo menu; o botão `Instalar aplicativo` continua aparecendo somente quando possui ação real.
- O shell PWA foi versionado para `v4`, e o registro do service worker passa a verificar atualização sem reutilizar o cache HTTP do próprio worker.
- Em emulação de 390×844, o botão estava habilitado, sem sobreposição, e o OAuth navegou em cerca de 2,2 s; a homologação conclusiva continua dependendo dos três aparelhos Android que reproduziam a falha.

## 2026-10-30 correção do bloqueio pré-OAuth no Chrome Android

- A etapa que travava foi isolada no código: o login web normal aguardava `storage.removeItem("pending_invite_token")` antes de sequer chamar `signInWithOAuth`. No Chrome Android normal, esse await podia ficar pendente, mantendo o indicador de carregamento sem abrir o Google.
- A limpeza do convite pendente na web agora é não bloqueante. O token de convite verdadeiro continua no `redirectTo` e o fluxo nativo mantém a persistência aguardada.
- A tela informa progressivamente: toque recebido, início da autenticação, solicitação ao Supabase e resposta pronta para abrir o Google. Nenhum token, URL, código, cookie ou dado pessoal é mostrado.
- A solicitação de autorização ao Supabase agora tem timeout único de 12 segundos. Se exceder, o botão é liberado e mostra erro recuperável; não há retry automático nem dois fluxos OAuth paralelos.
- Build web e ESLint direcionado dos arquivos modificados passaram. `npm run lint` ainda aponta cinco erros preexistentes em `lancar.tsx`, `categoria.tsx` e `meta.tsx`; o TypeScript mantém os três erros preexistentes em `theme.ts`.

## 2026-11-13 consolidação do PRD e estado atual

- `memory/PRD.md` foi atualizado para v1.1; o arquivo original v1.0 de 28/10/2026 foi arquivado sem alterações em `docs/archive/PRD_CRM_Familiar_v1.0.docx`. A v1.1 substitui Emergent/MongoDB pela arquitetura Expo Web/PWA, FastAPI, Supabase Auth/DB e Vercel.
- O PRD separa funcionalidades em `main`, desenvolvimento em `codex/family-profiles-privacy`, planejamento futuro e pendências. Registra que proprietário/administrador não têm acesso automático às finanças pessoais privadas de outros adultos e que não há exceções automáticas por idade.
- O modelo de perfis/privacidade está em desenvolvimento na branch `codex/family-profiles-privacy` (inclui migração SQL, RLS, permissões na API, nome/foto/parentesco por família e âmbitos pessoal/compartilhado). Não está integrado à `main`; não foi aplicado ao Supabase de produção. Testes com gravação dependem de staging isolado.
- Correção de RLS/permissões por coluna foi incorporada à branch de privacidade. A implementação precisa de validação completa em ambiente isolado antes de integração ou migração de produção.
- Decisões aprovadas para uma fase futura: lançamentos compartilhados criados por integrantes não poderão ser editados/excluídos diretamente após salvar; será possível solicitar correção com justificativa. Proprietário ou administrador autorizado decide, uma aprovação basta, e histórico/notificações devem registrar o processo. Nada disso está implementado ainda.
- O papel de Superadministrador é global e independente das famílias. `ajudapopular@gmail.com` foi designado pelo proprietário como identidade inicial; concessão segura, área administrativa, autorização no backend e auditoria ainda precisam ser implementadas.
- Convites por link: token aleatório guardado como hash, uso único e validade de 24 horas; o nome escolhido no aceite deve persistir após novo login.
- O MCP `supabase-crm-familiar` foi conectado ao projeto correto. Consultas confirmaram a limpeza dos dados familiares públicos e o perfil preservado sem vínculo familiar. O proprietário relata que removeu pelo painel os outros 15 usuários Auth e confirmou visualmente que apenas `ajudapopular@gmail.com` permanece. Até essa confirmação manual, a consulta anterior ainda mostrava 16 identidades; não registrar o estado final como consulta independente do MCP.
- Login Google/navegação: houve correções de limpeza do contexto de convite e roteamento determinístico. Desktop e PWA standalone foram relatados como funcionais; a falha no Chrome Android normal não tem homologação final conclusiva.
- Criação da primeira família: a correção para iniciar somente com o proprietário e direcionar para a aba Família com uma mensagem única de sucesso está no código de `main`. O commit de produção é `c785b83`; sua árvore coincide com a árvore de `5ce81dd`, embora `5ce81dd` não seja ancestral de `main`. A validação real após essa versão ainda precisa ser registrada.
- O PWA com GIF animado foi validado pelo usuário em Preview; isso não comprova por si só a atualização ou a homologação em todos os ambientes/aparelhos.
- Regra de continuidade: ao implementar/corrigir/homologar, registrar a evidência e o estado de código, banco e deployment neste HANDOFF; ao aprovar/alterar decisão de produto, atualizar também o PRD.

## 2026-11-13 implementação inicial do Superadministrador — desenvolvimento local

- Criada a branch `codex/platform-superadmin` a partir de `codex/family-profiles-privacy` (`ae63ece`), trazendo também a consolidação documental v1.1 aprovada. A implementação preserva os perfis e a privacidade da branch-base; não inclui alterações em `main`.
- Backend preparado para conferir a concessão `platform_superadmins` pelo `user_id` do JWT validado pelo Supabase. Endpoints de painel, diretório administrativo de famílias e auditoria retornam apenas contagens/metadados; não consultam tabelas de lançamentos ou finanças privadas. Falha de autorização ou auditoria fecha o acesso.
- Migração aditiva `202611140001_platform_superadmin.sql` preparada com RLS sem políticas de acesso direto para `anon`/`authenticated`, tabelas de concessão, auditoria e rascunhos de comunicados, além de RPCs agregadas restritas à `service_role`. A concessão de produção verifica o UUID autorizado e o e-mail Auth confirmado. O script auxiliar de staging foi excluído desta publicação porque não é necessário para o ambiente atual e usa `min(uuid)`, incompatível com o PostgreSQL 17.11 deste projeto. Nenhuma migração foi aplicada nesta etapa.
- Frontend preparado com rota `Painel Administrativo`, entrada inicial para Superadministrador, links de ida e volta para o CRM quando apropriado, indicadores agregados, lista paginada de famílias, auditoria e áreas informativas de suporte/comunicados sem envio. A proteção de tela é conveniência de navegação; a autorização efetiva permanece nos endpoints.
- Não foi criado fluxo de acesso excepcional a dados familiares. Implementá-lo no futuro exige autorização explícita do proprietário, escopo, prazo, revogação e auditoria antes de qualquer leitura de dados privados.
- Verificações locais: `20 passed` nos testes direcionados de Superadministrador, privacidade/perfis e criação da família; 11 asserções de rota/interface e 9 regressões do primeiro acesso passaram; ESLint direcionado passou; `npm run build` exportou a web e incluiu a rota `platform-admin`.
- `tsc --noEmit` ainda aponta somente os três erros preexistentes de tipos `StyleSheet.NamedStyles` em `frontend/src/theme.ts`. A suíte backend inteira não é isolada: 21 passaram, mas os testes antigos de integração falharam (39 + 4 erros) ao usar o endereço Emergent fixo `familia-orcamento-1.preview.emergentagent.com`, que respondeu 404; essa suíte não validou a API CRM nem o Superadministrador.
- Não houve teste em navegador, autenticação real ou staging. Nenhum merge, push, deployment, configuração sensível ou alteração do banco foi realizado.
- Para homologar, primeiro revisar SQL/testes, criar ou confirmar Supabase de staging isolado, configurar somente variáveis Preview do backend/frontend para esse staging, aplicar a migração lá e testar o painel com a identidade autorizada e negar um usuário comum. A produção requer aprovação específica posterior.

## 2026-11-13 publicação do Superadministrador em produção

- A pedido e com autorização explícita, foi preparada uma linha de release a partir da `main` vigente. Foram integrados somente a consolidação documental e os commits do Superadministrador; os commits de perfis/privacidade em desenvolvimento não foram incorporados. O helper de staging incompatível com PostgreSQL 17 não foi publicado.
- Migração `202611140001_platform_superadmin.sql` aplicada no projeto Supabase `iougyvryqotidbhloazg`. Verificação posterior confirmou as três tabelas novas com RLS habilitado, sem políticas de acesso direto; concessões de tabela/RPC restritas à `service_role`; uma única concessão de Superadministrador para o UUID `f4f0c80e-79b0-4ec0-8e57-159c3cedb914`, cujo e-mail Auth confirmado é `ajudapopular@gmail.com`. Nenhum dado familiar ou financeiro foi excluído ou reclassificado.
- A API foi publicada primeiro e verificada: `/health` respondeu HTTP 200 e `/api/platform-admin/overview` sem autenticação respondeu 401. A versão final do frontend e backend está em Production nos projetos Vercel `crm-familiar-web` e `crm-familiar`, ambos Ready a partir da `main` no commit `86d490c`.
- Commits de produção: `092df7e` (migração e backend administrativo), `86d490c` (painel frontend). Antes deles, `0347e34` consolidou PRD/HANDOFF. O push para `main` foi fast-forward a partir de `c785b83`; não houve rebase destrutivo.
- Testes direcionados: backend Superadministrador/criação de família: 9 passaram; verificações de rota/UI: 11 asserções passaram; regressões do primeiro acesso: 9 passaram; ESLint direcionado e `npm run build` passaram. O build exportou a rota `platform-admin`. `tsc --noEmit` ainda aponta três erros preexistentes de estilo em `frontend/src/theme.ts`; a suíte legada completa continua sem validação por depender de um endereço Emergent removido.
- Homologação de navegador: o Google OAuth foi concluído com a conta autorizada e o endereço `/platform-admin` abriu os indicadores, diretório básico de famílias e auditoria. As consultas de painel não exibem receitas, despesas, saldos ou lançamentos privados. A negação de usuário sem sessão foi comprovada pela API (401); um teste com outra identidade autenticada não foi realizado porque a limpeza deixou somente a identidade do proprietário.
- Permanecem como não homologados o teste em aparelho físico/PWA e a tentativa de acesso com uma conta comum autenticada. Suporte ainda é uma área futura/placeholder e comunicados permanecem como rascunho, sem disparo automático.

## 2026-11-13 parentesco separado em Nova pessoa — publicado

- A tela Família → Adicionar pessoa separa Nome e Parentesco. A lista inclui mãe/pai, cônjuges, filha/filho, avó/avô, irmã/irmão, neta/neto, tia/tio, sogra/sogro e Outros; Outros permite informar vínculo livre até 80 caracteres.
- `public.members.relationship` é texto opcional e descritivo. A migração `202611140002_family_member_relationship.sql` é aditiva (`ADD COLUMN IF NOT EXISTS`), sem reescrita ou remoção de registros; linhas existentes ficam com `NULL`. A consulta pós-migração confirmou a coluna, RLS habilitado e a contagem anterior de pessoas preservada.
- A API valida e normaliza o campo na criação e edição e continua persistindo pessoas financeiras sem exigir identidade autenticada própria. Nenhuma lógica de papel ou permissão consulta parentesco.
- Backend: commit `e36eb52c1168b44aa864c09b22b3f50387a1a812` em `main`, Production Ready; `/health` respondeu HTTP 200 e o OpenAPI público inclui `relationship` em `MemberIn`.
- Frontend: commit `2c0be0501017a54e9a1fb59ddd5024a64cb907cf` em `main`, Production Ready. O domínio público `https://crm-familiar-web.vercel.app/` respondeu HTTP 200 com título CRM Familiar. O manifesto respondeu HTTP 200 com `name`/`short_name` CRM Familiar, `start_url` e `scope` `/`, `display` `standalone`; o service worker respondeu HTTP 200. O bundle publicado da rota de membro respondeu HTTP 200 e contém o placeholder novo e as opções de parentesco.
- A migração `202611140002_family_member_relationship.sql` foi aplicada no projeto Supabase de produção `iougyvryqotidbhloazg`. Consulta posterior confirmou a coluna presente, RLS habilitado, uma pessoa financeira preservada e zero valores de parentesco preenchidos; nenhum cadastro foi apagado ou reclassificado.
- Branch de desenvolvimento `codex/family-relationship`: commit `ac582e6339d95c317474f24049c5eefb45f3adfc`, Preview Ready no projeto `crm-familiar-web` em `crm-familiar-meaycpvhn-crm-familiar.vercel.app` (o acesso à prévia pode exigir os controles de proteção da Vercel).
- Testes direcionados de backend: 7 passaram (criação sem usuário vinculado, campo opcional, edição, normalização/limite e caráter aditivo da migração), com 8 avisos preexistentes de depreciação do ciclo de vida FastAPI. ESLint direcionado e build Expo Web passaram. O fluxo com login real, edição visual em aparelho e gravação de parentesco pela interface ainda aguardam homologação do proprietário.
