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
