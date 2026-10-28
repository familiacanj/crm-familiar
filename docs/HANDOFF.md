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
