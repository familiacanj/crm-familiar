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
