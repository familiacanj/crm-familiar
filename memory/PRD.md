# CRM Familiar — Documento de Requisitos do Produto

**Versão:** 1.4
**Atualizado em:** 14 de novembro de 2026
**Base:** PRD v1.0, de 28/10/2026, preservado em [`docs/archive/PRD_CRM_Familiar_v1.0.docx`](../docs/archive/PRD_CRM_Familiar_v1.0.docx), e decisões de produto aprovadas posteriormente.

Este documento descreve requisitos e o estado conhecido do produto. A presença de um requisito não prova que ele esteja implementado ou homologado. Consulte `docs/HANDOFF.md` para o histórico técnico, commits, evidências e pendências operacionais. As páginas atuais de Política de Privacidade e Termos de Uso são preliminares, não documentos jurídicos finais.

## 1. Visão e objetivos

CRM Familiar é um aplicativo financeiro familiar multiusuário para organizar o orçamento compartilhado da casa e, com privacidade, as finanças pessoais de cada adulto. Deve facilitar o registro de receitas, despesas, contribuições e contas futuras, apresentar saldos e relatórios compreensíveis e funcionar em dispositivos móveis e na web.

Objetivos do piloto:

- Tornar o orçamento familiar colaborativo sem expor indevidamente finanças pessoais privadas.
- Manter fluxos curtos, linguagem acessível, alvos de toque amplos e interface responsiva.
- Preservar consistência financeira, separação entre famílias, autorização no servidor e trilha de auditoria para ações sensíveis.
- Validar o produto com famílias de teste antes de decidir escala e comercialização.

O piloto gratuito foi concebido inicialmente para a família do criador e cerca de dez famílias/amigos. Publicidade, pagamentos, licenças e recursos de IA são posteriores e não devem ser considerados ativos sem decisão e implementação próprias.

## 2. Estado do produto e da arquitetura

### 2.1 Arquitetura atual

- Frontend em Expo Router e React Native Web, exportado para web e publicado no Vercel como `crm-familiar-web`.
- Aplicativo web com manifesto, ícones, service worker e modo de instalação PWA; o aplicativo Android nativo é uma superfície separada.
- API/backend em FastAPI, publicado separadamente no Vercel como `crm-familiar`.
- Supabase Auth com Google OAuth e Supabase Database para persistência. A chave privilegiada, se usada por serviços de servidor, nunca pode integrar bundle público, navegador, logs ou GitHub.
- Repositório GitHub `familiacanj/crm-familiar`; `main` é a linha de produção e branches `codex/*` são usadas para desenvolvimento/Preview.

### 2.2 Legenda de estado

- **Implementado em `main` (não equivale a homologação integral):** presente no código de produção segundo a evidência registrada no HANDOFF.
- **Em desenvolvimento:** existe em branch de trabalho e ainda não está integrado à `main`.
- **Planejado/aprovado:** requisito acordado, sem implementação concluída.
- **Pendente de decisão ou homologação:** falta decisão de produto, prova operacional ou validação real.

### 2.3 Estado conhecido em 13/11/2026

| Área | Estado | Limite conhecido |
|---|---|---|
| Expo Web, API FastAPI, Supabase e publicação Vercel separada | Implementado em `main` | Deployment e execução devem ser confirmados por versão/ambiente; não presumir que todo fluxo esteja homologado. |
| Google OAuth | Implementado em `main` | Desktop e PWA instalado foram relatados pelo proprietário como funcionais. Chrome Android em aba normal segue sem homologação conclusiva. |
| Login, onboarding e roteamento de convite | Implementado em `main` | Correções estão registradas; fluxos reais devem ser homologados por cenário. |
| Nome de exibição do convite e gestão por papel | Publicado em Production (`e49cac2` API, `57216a2` frontend) | A migração é aditiva; proprietário/administrador gerenciam pessoas, categorias e convites; integrante não altera cadastros administrativos. Teste funcional real do aceite ainda pendente. |
| Criação de família somente com proprietário e retorno à aba Família na primeira criação | Implementado em `main` conforme código registrado | Falta evidência conclusiva de homologação real após a última publicação. |
| PWA e tela de abertura com GIF | Implementado em branches/Preview segundo histórico | Teste do GIF em Preview foi relatado; isso não comprova produção, instalação em todos os aparelhos nem atualização uniforme. |
| Parentesco descritivo de pessoa financeira | Implementado em `main` | Campo opcional independente de conta autenticada e de papel/permissão; pessoas antigas permanecem com parentesco nulo até edição. |
| Perfis, foto, papéis e privacidade financeira | Em desenvolvimento em `codex/family-profiles-privacy` | Essa branch não foi integrada à `main`; sua migração e políticas dependem de Supabase de staging isolado. |
| Superadministrador e área administrativa | Implementado em `main` (`092df7e`, `86d490c`) | Migração aplicada e painel aberto após Google OAuth em navegador. Teste em aparelho físico e negação com outra conta autenticada pendentes. |
| Solicitações de correção/aprovação de lançamentos compartilhados | Planejado/aprovado | Não implementado. |
| Política de Privacidade e Termos de Uso | Preliminares | Precisam de revisão de conteúdo e jurídica antes de uso definitivo ou piloto externo. |

## 3. Famílias, identidades e papéis

Uma identidade autenticada pode participar de uma família por um vínculo explícito. Pessoas financeiras — isto é, pessoas sobre as quais o orçamento registra receitas/contribuições — são entidades independentes das contas autenticadas. Nem toda pessoa financeira precisa ter login.

### 3.1 Papéis familiares

- **Proprietário:** papel de gestão da família, incluindo criação e administração dos vínculos e configurações autorizadas.
- **Administrador:** auxilia a gestão dentro das permissões concedidas.
- **Integrante:** participa do orçamento e das ações explicitamente permitidas.
- Proprietário e administrador podem adicionar, editar e remover pessoas financeiras, configurar categorias e emitir/cancelar convites.
- Integrante não pode administrar pessoas financeiras, categorias, vínculos de conta ou convites. A API verifica o papel atual da associação familiar; a interface também oculta esses controles.
- Pessoas financeiras sem login continuam independentes dos usuários autenticados; parentesco não concede permissões.

O papel administrativo é independente do parentesco. O perfil por família deve permitir nome de exibição próprio, foto e vínculo/parentesco, sem alterar o nome ou a identidade da conta Google. O nome escolhido ao aceitar convite deve persistir nos acessos posteriores.

O parentesco da pessoa financeira é um rótulo descritivo opcional, armazenado separadamente do nome. Exemplos incluem mãe, pai, cônjuge, filha/filho, avó/avô, irmã/irmão, neta/neto, tia/tio, sogra/sogro e outro vínculo informado livremente. Esse campo não concede acesso ao aplicativo, não cria uma conta Google e nunca determina permissões. Pessoas sem acesso ao aplicativo continuam válidas no orçamento familiar.

### 3.2 Regras aprovadas de autorização

- Toda autorização deve ser aplicada e validada na API e no banco por RLS quando disponível; ocultar controles no frontend não é controle de segurança suficiente.
- Usuários de outra família não podem ler nem alterar dados daquela família.
- Proprietário e administrador **não recebem acesso automático às finanças pessoais privadas dos outros adultos**.
- Não implementar nesta etapa regras especiais automáticas com base em idade, cadastro de idade ou controle parental.
- Integrantes podem criar lançamentos compartilhados. Após salvar, não podem editar nem excluir diretamente lançamentos compartilhados de outras pessoas.
- Pessoas financeiras não autenticadas continuam podendo existir como referência de orçamento sem ganhar conta ou permissões de aplicativo.

### 3.3 Superadministrador global

O Superadministrador é um papel global da plataforma, independente de proprietário, administrador ou integrante de família. A concessão inicial em produção está vinculada ao Auth User ID `f4f0c80e-79b0-4ec0-8e57-159c3cedb914`, cuja identidade Google confirmada é `ajudapopular@gmail.com`.

O backend valida o UUID autenticado contra a tabela de concessões; o frontend não concede privilégios por comparação de e-mail. A migração aditiva `202611140001_platform_superadmin.sql` foi aplicada no Supabase de produção. A tela, os endpoints de metadados agregados e a auditoria estão publicados em `main` (`092df7e`, `86d490c`). A conta autorizada completou Google OAuth e abriu o Painel Administrativo em navegador. Consulta a dados de família só poderá ocorrer mediante autorização explícita do proprietário daquela família, com escopo, prazo, revogação e registro auditável. A primeira versão não oferece ferramentas de suporte que leiam conteúdo financeiro; não existe atalho que ignore essa autorização. Homologação em aparelho físico e negação com outra identidade autenticada continuam pendentes.

## 4. Privacidade e modelo financeiro

### 4.1 Âmbitos dos lançamentos

Novos registros devem distinguir:

- **Compartilhado:** pertence ao orçamento da família e é visível apenas aos membros autorizados pelas regras familiares.
- **Pessoal privado:** pertence à área pessoal do autor e não é automaticamente visível ao proprietário, administrador ou outros integrantes.

Os registros financeiros que já existiam antes da implantação da separação foram explicitamente preservados como compartilhados. Não reclassificar, transferir ou excluir esses registros automaticamente; eventual reclassificação requer ação explícita de usuário autorizado.

### 4.2 Receitas, contribuições, despesas e caixa

- Registrar quem recebeu/pagou ou contribuiu, origem do recurso, categoria, data, valor, descrição e vínculo financeiro pertinente.
- Uma contribuição em dinheiro ao caixa compartilhado aumenta o caixa uma única vez; transferências internas não podem duplicar receita.
- Uma despesa familiar paga diretamente com recursos pessoais conta como despesa familiar e contribuição do pagador, sem ser entrada nem saída do caixa compartilhado.
- Exemplo do PRD v1.0: caixa recebe R$ 9.000 e integrante paga R$ 300 diretamente por uma despesa familiar; contribuições totais R$ 9.300, entrada de caixa R$ 9.000 e despesa de R$ 300 sem saída do caixa.
- Saldo final do mês passa a ser saldo inicial do seguinte, sem ser contabilizado como nova receita.
- Distinguir saldo atual (recursos efetivamente disponíveis no caixa) de saldo previsto (saldo atual mais entradas futuras menos contas futuras pertinentes, considerando datas e status sem duplicidade).
- Reserva de emergência deve ser identificada como reserva e não como despesa. Seu efeito sobre saldo disponível ainda requer decisão.

### 4.3 Correções de lançamentos compartilhados

Requisito aprovado para fase futura: integrante que criou lançamento compartilhado não pode editá-lo ou excluí-lo diretamente após salvar; deve solicitar correção com justificativa. Proprietário ou administrador autorizado pode aprovar ou recusar, sem dupla aprovação. Decisão, responsável, data e justificativa devem ser auditáveis e o sistema deve notificar destinatários pertinentes. Esse fluxo ainda não está implementado. Até sua implementação, não presumir que o requisito esteja operacional.

## 5. Requisitos das telas e fluxos

### 5.1 Acesso e criação da primeira família

- Tela pública apresenta a identidade CRM Familiar e o acesso por Google.
- Login sem convite válido não pode seguir para `/invite` por resíduo de rota/estado.
- Usuário autenticado sem família recebe o fluxo de criação/entrada de família.
- Criar uma família nova não deve gerar cônjuge, filhos, mãe ou outras pessoas fictícias. Inicialmente deve existir somente a pessoa financeira correspondente ao proprietário, preferencialmente com o nome dele.
- Depois da confirmação da primeira criação, a aba Família deve abrir e a mensagem “Sua família foi criada com sucesso!” deve aparecer uma única vez.
- Em acessos posteriores, usuário já vinculado deve abrir a Home normalmente.
- Regras de primeiro acesso não devem criar redirecionamento permanente para a aba Família.

Estado: código de produção contém correções para não criar integrantes fictícios e direcionar a primeira criação; homologação real final da navegação ainda deve ser documentada em `docs/HANDOFF.md`.

### 5.2 Convites

- Convite é compartilhado por link e preserva o contexto do convite durante o login Google.
- Token deve ser aleatório, armazenado somente como hash no backend/banco, de uso único e com validade aprovada de 24 horas.
- Convite inválido/expirado deve permitir voltar à rota inicial sem loop e limpar contexto inválido.
- Somente quem possui autorização familiar pode emitir/cancelar convites conforme o papel implementado.
- O nome de exibição informado no aceite deve ser salvo no perfil daquela família e continuar correto após novo login.

O convite usa token aleatório armazenado como hash, validade de 24 horas e aceitação atômica de uso único. A aceitação é vinculada à identidade autenticada pelo backend; a RPC só pode ser executada por `service_role`. O nome escolhido é gravado em `family_memberships.display_name`, separado de `profiles.google_name`, e não é substituído por metadados Google em logins futuros. A migração aditiva foi aplicada sem excluir ou reclassificar registros. API (`e49cac2`) e frontend (`57216a2`) foram publicados; o aceite de novo convite e a negação com uma conta integrante ainda aguardam homologação funcional real.

### 5.3 Home, Contas, Ano e Família

- Home apresenta informações do orçamento permitido, período e atalhos de uso frequente.
- Contas permite registrar/consultar receitas e despesas conforme âmbito, origem e autorização.
- Ano oferece balanço anual familiar ou pessoal somente com dados que o usuário pode consultar.
- Família apresenta membros/vínculos e funções permitidas ao papel do usuário.
- A responsividade deve manter valores e textos legíveis; ações flutuantes não podem cobrir conteúdo.
- Consultas e exportações devem aplicar os mesmos limites de privacidade da tela de origem. Excel, PDF, balanços mensais/anuais não podem contornar autorização.

Perfis e privacidade foram implementados em branch separada e ainda precisam ser validados em staging. Antes da integração, verificar filtros de Início, Contas, Ano, Excel e PDF tanto na API quanto na interface.

### 5.4 Perfil e configurações

- Perfil familiar tem nome de exibição, foto própria opcional e parentesco/vínculo, separados da identidade Google e do papel de autorização.
- Foto deve usar armazenamento privado e controles compatíveis com as permissões; URLs públicas permanentes não devem expor imagens privadas sem decisão.
- Proprietário/administrador podem operar configurações familiares somente no limite do papel e sem ganhar visibilidade de finanças pessoais privadas de adultos.

Estado: em desenvolvimento na branch `codex/family-profiles-privacy`; migração aditiva, RLS e permissões ainda não aprovadas para produção. Validar em projeto Supabase de staging isolado antes de testes que gravam dados.

### 5.5 Relatórios, exportação e notificações

- Exportações PDF e Excel devem apresentar totais e detalhes apenas dos âmbitos autorizados, identificando saldo inicial, receitas, despesas, contribuições e saldo final quando aplicável.
- Histórico de ações sobre registros deve permitir rastrear criação, decisão de correção e alterações autorizadas.
- Notificações devem ser dirigidas somente aos destinatários pertinentes. Push depende de suporte e permissão do dispositivo/navegador; não prometer entrega universal.
- Prioridade e classificação final dos alertas, retenção e parte dos comportamentos de notificações permanecem pendentes.

## 6. PWA, plataformas e experiência

- O frontend web deve ser responsivo e oferecer PWA instalável quando elegível: manifesto, nome CRM Familiar, ícones aprovados, `start_url`/`scope` coerentes, `standalone` e service worker com atualização segura.
- Cache público pode incluir shell e ativos estáticos apropriados; não armazenar respostas autenticadas, API, dados financeiros, callbacks OAuth ou conteúdo privado em cache compartilhado.
- O login Google precisa retornar à aplicação e recuperar/persistir sessão, respeitando a diferença entre web, PWA standalone e Android nativo.
- A abertura do PWA pode apresentar o GIF aprovado durante a inicialização controlada pelo aplicativo, sem substituir a splash nativa do Android nem impor espera fixa. Em falha de inicialização, deve haver recuperação sem bloqueio indefinido.
- Manter zoom de acessibilidade e evitar transbordamento horizontal e zoom inesperado de campos no celular.

Estado: há implementação de PWA e GIF registrada em branches/Preview; login em desktop e standalone foi relatado como funcional, mas o login em Chrome Android normal e a instalabilidade em aparelhos específicos não têm homologação conclusiva registrada. A produção deve ser avaliada pelo deployment efetivo, não apenas pelo estado do Preview.

## 7. Segurança, dados, auditoria e retenção

- Isolamento por família e por usuário deve ser aplicado na API e em RLS; autorização deve ser negada por padrão.
- Novas tabelas devem ter políticas RLS adequadas, chaves/índices e proteção contra alteração de identificadores que permita acesso cruzado.
- Segredos de servidor não podem estar em código, bundle público, logs, documentação ou GitHub. Nunca usar service role no frontend.
- Operações administrativas e suporte devem usar privilégio mínimo e deixar trilha de auditoria.
- Exclusão operacional de lançamento não deve destruir silenciosamente a trilha histórica quando as regras aprovadas exigirem auditoria.
- Exclusões definitivas, retenção, encerramento de família, recuperação, backups e prazo legal dependem de política aprovada e verificações aplicáveis. O prazo de 90 dias citado na v1.0 era exemplo, não decisão.
- Dados fictícios de teste em produção foram removidos conforme histórico do HANDOFF; a remoção manual de identidades Auth foi confirmada visualmente pelo proprietário. Não alterar estrutura/configurações ao executar limpeza de dados autorizada.

## 8. Requisitos comerciais e legais preservados

- O piloto inicial foi planejado como gratuito para cerca de dez famílias/amigos; os custos reais de hospedagem, banco, armazenamento, notificação e suporte devem ser observados.
- Planos/licenças são estrutura conceitual futura. Gratuito com anúncios, remoção de anúncios, licenças anuais ou de prazo indeterminado foram opções a avaliar, não decisões comerciais finais.
- Preço, cobrança por família/usuário, limites, renovação, pagamentos e anúncios permanecem sem aprovação definitiva.
- Não inserir publicidade que interrompa lançamentos ou prejudique legibilidade/privacidade. Não reservar espaços permanentes de anúncio antes de decisão.
- Política de Privacidade e Termos de Uso precisam refletir o sistema real, considerar LGPD, provedores, direitos, bases legais, retenção, exclusão e segurança, e passar pela revisão apropriada. As páginas existentes são preliminares e não constituem aconselhamento ou documento jurídico final.

## 9. Critérios de aceitação

1. Login normal leva à Home para usuário com família ou à criação/entrada para usuário sem família; somente convite válido segue o fluxo de convite.
2. Criar primeira família cria apenas a pessoa financeira do proprietário, abre Família e apresenta a confirmação uma vez; acessos seguintes abrem Home.
3. Convite válido tem validade de 24 horas, uso único, mantém nome escolhido e não dá acesso a outra família.
4. Dados compartilhados e privados têm isolamento testado por usuário, família, API e RLS; proprietário/administrador não leem automaticamente finanças pessoais privadas de outros adultos.
5. Integrante não edita/exclui diretamente lançamentos compartilhados de outras pessoas após salvar; o fluxo futuro de solicitação só pode ser marcado aceito depois de existir e ser testado.
6. Pagamento direto de despesa familiar conta para contribuição e despesa sem entrada/saída duplicada do caixa.
7. Saldo inicial do mês corresponde ao saldo final anterior, sem duplicar receita; previsto considera apenas movimentos futuros pertinentes.
8. Home, Contas, Ano e exportações aplicam a mesma autorização e não revelam dados privados.
9. Rotas globais administrativas são negadas no backend a usuários sem papel Superadministrador, e ações administrativas ficam auditáveis.
10. PWA não armazena dados financeiros autenticados em cache público e mantém login/retorno sem regressões nas plataformas suportadas.
11. Cadastro de pessoa financeira mantém Nome e Parentesco separados; o vínculo é opcional, pode usar valor livre em Outros, é recuperado ao editar e não exige uma conta autenticada nem altera permissões.

Critérios que dependem de recursos ainda planejados não são considerados aprovados por documentação apenas.

## 10. Decisões e pendências

### Aprovado

- Separação de lançamentos pessoais privados e orçamento compartilhado para novos registros.
- Registros antigos permanecem compartilhados, sem reclassificação automática.
- Proprietário e administrador não ganham acesso automático às finanças privadas dos outros adultos.
- Sem política especial baseada em idade nesta etapa.
- Integrante poderá criar lançamento compartilhado, mas correção posterior será por solicitação justificada, com decisão única de proprietário/administrador autorizado, histórico e notificação.
- Superadministrador global será independente dos papéis familiares; acesso a dados de uma família requer autorização explícita do respectivo proprietário e auditoria.
- Convites por link com token seguro, uso único e duração de 24 horas.
- Campo opcional de parentesco para pessoas financeiras, independente do nome e dos papéis de acesso; vazio para registros anteriores até edição explícita.

### Pendente de decisão ou detalhamento

- Se e como mostrar agregados/contribuições individuais sem revelar detalhes pessoais privados.
- Efeito da reserva de emergência no saldo disponível.
- Campos e limites de edição do papel administrador.
- Política de retenção, recuperação e exclusão definitiva; prazo de 90 dias não foi aprovado.
- Preferências e níveis de urgência de notificação, incluindo suporte push real.
- Conteúdo final e revisão jurídica de Política de Privacidade e Termos.
- Preços, planos, cobrança, publicidade e eventual IA.
- Confirmação de homologação em Android Chrome normal, iPhone e ambientes de produção afetados.

## 11. Controle de versão e manutenção

- **1.0 — 28/10/2026:** versão de referência, preservada sem alterações em `docs/archive/PRD_CRM_Familiar_v1.0.docx`.
- **1.1 — 13/11/2026:** consolidação da arquitetura atual, decisões posteriores sobre privacidade, papéis, convites, dados de teste e estados de implementação.
- **1.2 — 13/11/2026:** registro da implementação e publicação do Superadministrador, da concessão inicial no Supabase e dos limites de homologação restantes.
- **1.3 — 13/11/2026:** especificação do parentesco descritivo opcional para pessoas financeiras e registro de sua implementação aditiva, sem impacto em login, vínculo autenticado ou autorização.
- **1.4 — 14/11/2026:** persistência do nome escolhido em convites por família, separação da identidade Google e permissões administrativas de pessoas/categorias/convites; status técnico e de homologação registrado no HANDOFF.

Manter este PRD atualizado quando uma decisão de produto for aprovada ou alterada. Atualizar `docs/HANDOFF.md` sempre que uma funcionalidade for implementada, corrigida ou homologada, registrando evidência e distinguindo local, GitHub, Vercel, Supabase e validação real. Não marcar uma etapa como concluída apenas por build, teste automatizado ou deployment Ready.
