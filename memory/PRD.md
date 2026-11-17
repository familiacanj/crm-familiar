# CRM Familiar — Documento de Requisitos do Produto

**Versão:** 2.1
**Atualizado em:** 17 de novembro de 2026
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

### 2.3 Estado conhecido em 17/11/2026

| Área | Estado | Limite conhecido |
|---|---|---|
| Expo Web, API FastAPI, Supabase e publicação Vercel separada | Implementado em `main` | Deployment e execução devem ser confirmados por versão/ambiente; não presumir que todo fluxo esteja homologado. |
| Google OAuth | Implementado em `main` | Desktop e PWA instalado foram relatados pelo proprietário como funcionais. Chrome Android em aba normal segue sem homologação conclusiva. |
| Login, onboarding e roteamento de convite | Implementado em `main` | Correções estão registradas; fluxos reais devem ser homologados por cenário. |
| Nome de exibição do convite e gestão por papel | Publicado em Production (`e49cac2` API, `57216a2` frontend) | A migração é aditiva; proprietário/administrador gerenciam pessoas, categorias e convites; integrante não altera cadastros administrativos. Aceite real por sessão Auth foi validado no staging; PWA publicado continua pendente. |
| Criação de família somente com proprietário e retorno à aba Família na primeira criação | Implementado em `main` conforme código registrado | Falta evidência conclusiva de homologação real após a última publicação. |
| PWA e tela de abertura com GIF | Implementado em branches/Preview segundo histórico | Teste do GIF em Preview foi relatado; isso não comprova produção, instalação em todos os aparelhos nem atualização uniforme. |
| Parentesco descritivo de pessoa financeira | Implementado em `main` | Campo opcional independente de conta autenticada e de papel/permissão; pessoas antigas permanecem com parentesco nulo até edição. |
| Meu perfil: nome familiar, fotografia própria e dados da conta | Implementado em `main` após publicação de 14/11/2026 | Nome editável só no vínculo familiar ativo; e-mail e papel somente leitura; foto privada gerida pela API. A homologação real pelo usuário ainda está pendente. |
| Simplificação financeira (Home somente resumo; Contas como operação) | Implementada localmente em `codex/personal-finances`; migração aplicada somente no staging | Home e Minhas Finanças são resumos; Contas reúne entradas, despesas pessoais/da casa/mistas e transferências. Cálculos e idempotência foram testados por RPC em transação revertida; formulários ainda aguardam envio ponta a ponta pela interface. |
| Perfis, data de nascimento, consentimento e acesso de responsável | Schema/RLS aplicados somente no staging; backend e testes automatizados atualizados | Isolamento de adultos e autorização Owner/Administrador foram exercitados em SQL com identidades de teste. Consentimento real, menor/responsável real e expiração aos 18 anos ainda não foram homologados ponta a ponta. |
| Senha exclusiva de relatórios | Gate visual e proteção backend implementados localmente; staging pronto | Sessão, bloqueio de rotas/exportações e permissões possuem testes direcionados. Não foi criada senha de relatório em UI; a redefinição por e-mail depende de `REPORT_RECOVERY_REDIRECT_URL` e da allowlist de Auth, ainda não configuradas no staging. |
| Superadministrador e área administrativa | Implementado em `main` (`092df7e`, `86d490c`) | Migração e painel de produção existem; no staging foi validado o schema sem Superadministrador fictício, conforme autorizado nesta etapa, com tabelas/RPCs restritos a `service_role`. Teste do painel com identidade comum e aparelho físico continuam pendentes. |
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

### 3.3 Meu perfil

- Qualquer usuário autenticado com vínculo familiar pode abrir **Meu perfil** pela fotografia ou inicial no cabeçalho da Home, independentemente de ser proprietário, administrador ou integrante.
- A pessoa pode alterar somente o próprio nome de exibição no vínculo da família ativa, fotografia e data de nascimento. E-mail, papel e família são exibidos conforme cadastro/convite e não são editáveis nesta tela.
- Data de nascimento é validada no servidor e a idade é calculada automaticamente. A autorização de dados de menores expira automaticamente quando a pessoa completa 18 anos.
- A seção permanente **Privacidade e autorizações** permite ao adulto conceder ou revogar consentimento para o proprietário consultar seus relatórios pessoais. O consentimento começa desligado, é auditável e não concede leitura nas telas comuns nem a administradores.
- Proprietário designa responsáveis familiares para menores de 18 anos; somente responsáveis designados podem consultar seus dados pessoais e relatórios enquanto forem menores. A designação e revogação são auditáveis e não se baseiam apenas no parentesco textual.
- O nome de exibição é armazenado em `family_memberships.display_name`; não é substituído pelo nome retornado pelo Google em logins futuros. O nome Google permanece como dado de identidade da conta.
- Fotografias pessoais são armazenadas no bucket privado existente `family-member-photos`. Upload e remoção passam pela API autenticada, limitados à identidade da sessão, com validação de JPG/PNG/WebP e tamanho máximo de 5 MB. URLs retornadas são assinadas e temporárias; não há leitura pública do bucket.
- Depois de confirmar um convite, o novo integrante deve completar nome de exibição, data de nascimento e parentesco antes de acessar qualquer tela do CRM. A fotografia continua opcional. A pendência é persistida no vínculo familiar e reaparece após interromper o cadastro ou autenticar novamente; não existe opção **Fazer depois**.
- O parentesco do usuário autenticado é armazenado por vínculo em `family_memberships.relationship`; descreve a relação com aquela família e não altera o papel nem concede permissões.
- Datas são digitadas em `DD/MM/AAAA`, validadas no servidor como datas reais e não futuras, e convertidas para ISO somente no armazenamento. A idade é calculada pela data local de São Paulo.
- A conclusão do perfil é aplicada tanto na navegação quanto na API: enquanto pendente, somente leitura de sessão/acesso, atualização do próprio perfil e foto própria são permitidas. A identidade Google permanece independente dos campos editáveis.
- Editar o perfil não altera papéis, permissões, vínculos com pessoas financeiras nem dados financeiros. Alterações são refletidas no cabeçalho da Home e em **Quem usa o app** na tela Família.

O parentesco da pessoa financeira é um rótulo descritivo opcional, armazenado separadamente do nome. Exemplos incluem mãe, pai, cônjuge, filha/filho, avó/avô, irmã/irmão, neta/neto, tia/tio, sogra/sogro e outro vínculo informado livremente. Esse campo não concede acesso ao aplicativo, não cria uma conta Google e nunca determina permissões. Pessoas sem acesso ao aplicativo continuam válidas no orçamento familiar.

### 3.2 Regras aprovadas de autorização

- Toda autorização deve ser aplicada e validada na API e no banco por RLS quando disponível; ocultar controles no frontend não é controle de segurança suficiente.
- Usuários de outra família não podem ler nem alterar dados daquela família.
- Proprietário e administrador **não recebem acesso automático às finanças pessoais privadas dos outros adultos**.
- Administrador não recebe acesso automático a relatórios pessoais de adultos ou menores.
- O proprietário só lê relatório pessoal de adulto com consentimento explícito vigente; sua própria senha de relatórios não substitui o consentimento do titular.
- Dados pessoais de menores podem ser consultados somente pelo próprio titular e por responsável familiar explicitamente autorizado. A regra é recalculada pela data de nascimento em cada requisição e cessa no 18º aniversário.
- O acesso à área Ano e às exportações anuais exige senha de relatórios verificada no backend, inclusive por URL direta. A senha é armazenada somente como hash; redefinição exige confirmação de identidade pelo e-mail cadastrado.
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
- Compras mistas são um lançamento único em Contas; a parte pessoal e a parte da casa são vinculadas e separadas sem duplicar o total.
- O resumo familiar separa entrada, saída e saldo do caixa de despesas da casa pagas diretamente pelos integrantes; contribuição em compras nunca aumenta dinheiro disponível.
- O resumo mensal apresenta todas as pessoas integrantes, inclusive quem contribuiu R$ 0,00, sem alertas ou julgamentos.
- Exemplo do PRD v1.0: caixa recebe R$ 9.000 e integrante paga R$ 300 diretamente por uma despesa familiar; contribuições totais R$ 9.300, entrada de caixa R$ 9.000 e despesa de R$ 300 sem saída do caixa.
- Saldo final do mês passa a ser saldo inicial do seguinte, sem ser contabilizado como nova receita.
- Distinguir saldo atual (recursos efetivamente disponíveis no caixa) de saldo previsto (saldo atual mais entradas futuras menos contas futuras pertinentes, considerando datas e status sem duplicidade).
- Reserva de emergência deve ser identificada como reserva e não como despesa. Seu efeito sobre saldo disponível ainda requer decisão.

**Modelo aprovado (Correção 02, 17/11/2026):** `Contas` mantém `Entrada` e `Saída`, com uma ação separada e simples `Transferir para a família`. Entradas são dinheiro pessoal efetivamente recebido. A renda mensal cadastrada na aba Família é apenas uma referência de planejamento e nunca cria entrada ou contribuição. Saídas pessoais, da casa e mistas são um único lançamento; a parte da casa cria uma movimentação familiar vinculada, sem duplicar o gasto e sem expor a descrição pessoal aos demais integrantes. Despesa da casa paga diretamente conta como despesa/contribuição em compras, nunca como entrada ou saída do caixa. A transferência pessoal→família cria, numa única operação idempotente, um débito pessoal e um crédito compartilhado vinculados. O saldo inicial do caixa é o saldo real transportado de períodos anteriores; não é receita nova. A saída do caixa continua separada e limitada aos administradores autorizados. Reembolso só é registrado quando efetivamente pago, sem solicitação automática.

As migrações aditivas `20261116190000_personal_expense_allocation.sql` e `20261116193000_hide_private_expense_link.sql` foram aplicadas apenas no projeto isolado de homologação `bnsfkddqdcjctcjllkxc`. Testes com contextos autenticados distintos confirmaram que o proprietário lê seus dados privados e movimentos compartilhados; Administrador e Integrante leem somente seus próprios lançamentos privados e os movimentos compartilhados; usuário sem vínculo não lê nenhum desses registros. A coluna que conectaria uma movimentação da família à despesa privada não fica visível aos clientes autenticados. As funções de gravação são `SECURITY INVOKER`, idempotentes e sem execução direta por `anon`/`authenticated`.

O cenário anterior por RPC incluiu uma transferência de R$ 300 para validar a compatibilidade histórica e a idempotência. Pela decisão atual, a nova interface não oferece essa operação; transferências anteriores permanecem intactas e continuam compondo o histórico e o caixa como já estavam registradas.

**Correção 02 — publicada em produção em 17/11/2026:** o resumo pessoal calcula somente transações efetivamente registradas; `planned_income` permanece informativo. Transferências de Contas usam chave idempotente e atualizam os resumos pessoal e familiar. A descrição de compras familiares pagas pessoalmente é genérica no histórico compartilhado. A migração aditiva `20261117215000_financial_integration_balance_privacy.sql` foi aplicada em staging e produção; o histórico remoto de produção a registrou como `20261117222611_financial_integration_balance_privacy`. Ela revoga a leitura da coluna `description` por `authenticated` e cria o cálculo de saldo inicial como `SECURITY INVOKER`, executável somente por `service_role`, sem alterar linhas nem políticas RLS. Em produção, a verificação confirmou RLS habilitada, função não executável por `anon`/`authenticated` e descrição inacessível a `authenticated`. Backend e frontend foram publicados na Vercel como commit `f55c47a5e96d0e5a4d7667a6eec58ab0c41e8b7e`, ambos `READY`; o app e `/login` responderam HTTP 200 e a API `/health` respondeu HTTP 200. Login Google autenticado não foi reexecutado nesta publicação. O dump atualizado foi preservado; a restauração completa segue não testada por ausência da extensão local `supabase_vault`.

Na rodada visual de 16/11, usando apenas o Proprietário fictício no staging, a interface registrou salário R$ 2.000, despesa pessoal R$ 150, despesa familiar paga pelo integrante R$ 180 e compra mista R$ 600 (R$ 400 pessoais/R$ 200 da casa). O Home passou a mostrar entrada pessoal total de R$ 13.100, saídas R$ 1.860, saldo pessoal R$ 10.948,02, despesas pessoais R$ 1.100 e despesas da casa pagas pelo usuário R$ 760; esses totais incluem os dados fictícios já existentes antes desta rodada. A contribuição familiar em compras subiu R$ 380; entradas em dinheiro (R$ 1.925,66), saídas do caixa (R$ 366,78) e saldo do caixa (R$ 1.558,88) não mudaram. Cada operação apareceu uma vez e não houve reembolso automático. Os lançamentos `QA-MVP-20261116-*` permanecem no staging.

Início e Contas foram verificados em apresentação estreita e desktop; a duplicidade da barra inferior foi removida de Contas e a antiga rota `/pessoal` agora retorna à Home unificada. Os controles existentes de orçamento e saída do caixa ficaram na área Família/Administração financeira, limitados a Proprietário/Administrador. Testes de contrato, convite/permissões, perfil, primeiro acesso (9 asserções), roteamento administrativo (11 asserções), TypeScript, ESLint completo e build PWA passaram. Não houve mudança de backend, migração, publicação, commit ou push nesta rodada. Cartões/faturas e parcelamentos permanecem fora do escopo.

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

O convite usa token aleatório armazenado como hash, validade de 24 horas e aceitação atômica de uso único. A aceitação é vinculada à identidade autenticada pelo backend; a RPC só pode ser executada por `service_role`. O nome escolhido é gravado em `family_memberships.display_name`, separado de `profiles.google_name`, e não é substituído por metadados Google em logins futuros. A migração aditiva foi aplicada sem excluir ou reclassificar registros. API (`e49cac2`) e frontend (`57216a2`) foram publicados; o aceite foi exercitado com uma sessão Auth real no staging e o convite ficou marcado como usado pelo próprio integrante. O fluxo visual completo no PWA e o retorno após novo login ainda aguardam homologação.

### 5.3 Home, Contas, Ano e Família

- Início é somente visualização mensal, com as opções `Finanças da Família` e `Minhas Finanças`. Não contém formulários, blocos duplicados nem atalhos de lançamento.
- Resumo familiar mostra entradas do caixa, saídas do caixa e saldo disponível; apresenta todos os integrantes, inclusive R$ 0,00, com barras e valores separados para dinheiro no caixa e despesas da casa pagas diretamente. Compras de integrantes não aumentam o caixa.
- Resumo pessoal mostra entradas, saídas totais e saldo mensal, separando despesas pessoais das despesas da casa pagas pelo usuário.
- Contas tem exatamente duas operações: `Entrada` e `Saída`. Entrada inclui data atual editável, valor e texto livre sobre a origem do dinheiro; não classifica nem transfere a entrada automaticamente para a família.
- Saída inclui data atual editável, valor, local do gasto, descrição opcional do que foi comprado e escolha obrigatória entre despesa pessoal, despesa da casa ou parte pessoal/parte da casa. A opção mista mostra somente o campo de valor destinado à casa e um resumo automático antes de salvar.
- Datas de Entrada, Saída e saída do caixa familiar aparecem como `DD/MM/AAAA`; o calendário usa a data local atual como padrão, permite selecionar dias anteriores e mantém o valor interno `AAAA-MM-DD` para salvar sem inversão de dia/mês.
- A saída é um único lançamento idempotente. A parte pessoal compõe as finanças privadas; a parte familiar aparece automaticamente como despesa/contribuição compartilhada, sem duplicar o total, sem aumentar o caixa e sem reembolso automático. Atalhos de categorias existentes podem preencher o local do gasto sem adicionar outra operação.
- A interface de Contas não oferece transferência ou contribuição em dinheiro. Transferências antigas permanecem no histórico e nos cálculos já associados. Se o proprietário/administrador precisar registrar uma saída efetiva do caixa familiar, a operação fica na administração financeira da aba Família, fora dos formulários Entrada/Saída.
- A administração familiar preserva a gestão do orçamento e das saídas do caixa somente para Proprietário/Administrador. RLS e permissões atuais continuam obrigatórias.
- Ano mantém senha de relatórios, autorização pessoal e proteção de tela, URL, API e exportação.
- Família apresenta membros, convites e controles compatíveis com o papel do usuário.
- A responsividade deve manter valores e textos legíveis; a navegação principal aparece uma única vez e controles fixos não cobrem o formulário.
- Consultas e exportações aplicam os limites de privacidade da tela de origem. Excel, PDF e balanços não podem contornar autorização.

Família permanece com a estrutura visual aprovada; novas ferramentas de privacidade devem ser acrescentadas sem redesenhar essa tela.

### 5.4 Perfil e configurações

- Perfil familiar tem nome de exibição, foto própria opcional, e-mail, família e papel conforme cadastro, data de nascimento e idade calculada.
- Adulto pode conceder/revogar autorização opcional para o proprietário consultar exclusivamente seus relatórios anuais pessoais; a decisão é inicialmente negada e auditada.
- Proprietário designa/revoga responsáveis pelos menores por vínculo autenticado explícito; papel de administrador ou parentesco descritivo não concede acesso por si só.
- Foto deve usar armazenamento privado e controles compatíveis com as permissões; URLs públicas permanentes não devem expor imagens privadas sem decisão.
- Proprietário/administrador podem operar configurações familiares somente no limite do papel e sem ganhar visibilidade de finanças pessoais privadas de adultos.

Estado: implementação e validação somente em `codex/personal-finances` e no Supabase de homologação. Nenhuma alteração de produção está autorizada nesta rodada.

### 5.5 Relatórios, exportação e notificações

- Exportações PDF e Excel devem apresentar totais e detalhes apenas dos âmbitos autorizados, identificando saldo inicial, receitas, despesas, contribuições e saldo final quando aplicável.
- Histórico de ações sobre registros deve permitir rastrear criação, decisão de correção e alterações autorizadas.
- Notificações devem ser dirigidas somente aos destinatários pertinentes. Push depende de suporte e permissão do dispositivo/navegador; não prometer entrega universal.
- Prioridade e classificação final dos alertas, retenção e parte dos comportamentos de notificações permanecem pendentes.
- Antes de abrir Ano, a pessoa cria uma senha de relatórios e confirma ou informa a existente. Ao sair da área, o token temporário é descartado; deep links e APIs anuais também exigem verificação.
- A senha de relatórios não substitui autenticação Google/Supabase nem consentimento de compartilhamento. Seu reset usa a confirmação de identidade do e-mail autenticado.
- Exportações anuais PDF e Excel passam pelo mesmo controle de sessão e autorização de relatório.

## 6. PWA, plataformas e experiência

- O frontend web deve ser responsivo e oferecer PWA instalável quando elegível: manifesto, nome CRM Familiar, ícones aprovados, `start_url`/`scope` coerentes, `standalone` e service worker com atualização segura.
- Cache público pode incluir shell e ativos estáticos apropriados; não armazenar respostas autenticadas, API, dados financeiros, callbacks OAuth ou conteúdo privado em cache compartilhado.
- O login Google precisa retornar à aplicação e recuperar/persistir sessão, respeitando a diferença entre web, PWA standalone e Android nativo.
- A abertura do PWA pode apresentar o GIF aprovado durante a inicialização controlada pelo aplicativo, sem substituir a splash nativa do Android nem impor espera fixa. Em falha de inicialização, deve haver recuperação sem bloqueio indefinido.
- Manter zoom de acessibilidade e evitar transbordamento horizontal e zoom inesperado de campos no celular.

Estado: confirmar e atualizar os resultados vigentes em `docs/HANDOFF.md`; referências históricas deste documento não substituem prova do build e da sessão atuais.

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
12. Home tem somente resumos mensais. Contas registra múltiplas entradas/saídas diárias, despesas pessoais/da casa/mistas e transferências sem duplicação.
13. Resumo familiar inclui contribuições de todos, inclusive R$ 0,00, separa caixa de compras pagas por integrante e exibe saldo sem confundir esses valores.
14. Senha de relatórios protege interface, deep links, API e exportações; é verificada e armazenada em forma segura pelo servidor, e expira ao sair da área.
15. Adultos mantêm dados privados. Proprietário só consulta relatórios de adulto com consentimento válido; administrador não consulta relatórios pessoais; responsável só consulta dados de menor explicitamente designado e o acesso termina automaticamente aos 18 anos.
16. Criação, alteração e revogação de consentimento e de responsável deixam trilha auditável.

Critérios que dependem de recursos ainda planejados não são considerados aprovados por documentação apenas.

## 10. Decisões e pendências

### Aprovado

- Separação de lançamentos pessoais privados e orçamento compartilhado para novos registros.
- A separação deve valer para Home, Contas, Ano e exportações; a API e RLS devem aplicar a autorização, não apenas a interface.
- Salário pessoal deve poder ser registrado em Minhas Finanças sem aparecer como receita compartilhada; somente uma contribuição explicitamente transferida para a casa aparece no âmbito compartilhado.
- Despesa da casa paga por integrante deve contar como despesa familiar/contribuição sem movimentar o caixa e sem criar pedido automático de reembolso. Registrar reembolso somente quando o pagamento efetivo ocorrer; esse pagamento não é nova despesa operacional.
- Compra mista é um único lançamento em Minhas Finanças, dividido entre parcelas pessoal e familiar, com vínculos e sem duplicar o total. Controle de cartão, fatura, ciclo ou parcelamento está fora do MVP.
- Registros antigos permanecem compartilhados, sem reclassificação automática.
- Proprietário e administrador não ganham acesso automático às finanças privadas dos outros adultos.
- Acesso de responsável a dados pessoais de menores é baseado em designação explícita e idade calculada; expira automaticamente aos 18 anos.
- Consentimento de adulto é opcional, começa desligado e autoriza somente relatórios do proprietário, nunca painéis pessoais normais.
- Todos os lançamentos cotidianos começam em Contas; Home e Minhas Finanças/Finanças da Família em Início são somente consulta.
- Integrante poderá criar lançamento compartilhado, mas correção posterior será por solicitação justificada, com decisão única de proprietário/administrador autorizado, histórico e notificação.
- Superadministrador global será independente dos papéis familiares; acesso a dados de uma família requer autorização explícita do respectivo proprietário e auditoria.
- Convites por link com token seguro, uso único e duração de 24 horas.
- Campo opcional de parentesco para pessoas financeiras, independente do nome e dos papéis de acesso; vazio para registros anteriores até edição explícita.

### Pendente de decisão ou detalhamento

- Revisão jurídica da Política de Privacidade/Termos para coleta de data de nascimento, consentimento de relatórios e acesso de responsáveis a dados de menores.
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
- **1.7 — 14/11/2026:** criação autorizada do projeto Supabase gratuito isolado `CRM Familiar Homologação`, validação das dependências, migração financeira, RLS com Proprietário/Administrador e idempotência de contribuições, despesas e reembolsos; produção permanece sem a migração.
- **1.8 — 15/11/2026:** transferência genérica entre orçamento pessoal e familiar implementada de forma aditiva, com vínculo privado/familiar e idempotência; preparação de configuração separada de staging. Auth real, Superadministrador e homologação visual PWA continuam pendentes.
- **1.9 — 15/11/2026:** três contas fictícias foram criadas exclusivamente no staging com senhas geradas fora do repositório; login Auth real e RLS foram verificados para Proprietário, Administrador e Integrante, incluindo isolamento de finanças pessoais, contribuição, transferência, despesa familiar, reembolso e idempotência. Um convite de uso único foi aceito por sessão Auth real. RPCs legadas de convite/papel foram endurecidas no staging para `service_role` somente; o Advisor ficou com três avisos informativos intencionais e a proteção contra senhas vazadas desabilitada, ainda pendente. Nenhuma identidade de Superadministrador foi criada; produção e Vercel permaneceram intocados. A integração visual completa do PWA continua pendente por falta de `service_role` configurada no backend local/Preview.
- **2.0 — 15/11/2026:** correções de lint preexistente foram separadas da implementação financeira; a tipagem da rota de primeiro acesso foi corrigida; TypeScript, ESLint completo, testes direcionados e build PWA passaram. O Expo Web foi iniciado com URL/chave pública do staging e a tela pública de login/instalação foi verificada no desktop e disponibilizada na rede local. O backend não foi iniciado porque a `service_role` não está disponível em variável local segura e não foi extraída nem exposta. Como o PWA atual oferece somente Google OAuth, as contas Auth e-mail/senha não foram usadas em fluxos autenticados da interface. Produção, Vercel e migrações de produção permanecem intocados.
- **2.1 — 15/11/2026:** foi implementado login temporário por e-mail e senha exclusivamente para homologação, condicionado simultaneamente à flag `EXPO_PUBLIC_HOMOLOGATION_AUTH=true` e ao projeto `bnsfkddqdcjctcjllkxc`. O fluxo usa `signInWithPassword` com chave pública, aparece também na tela de convite e não altera o Google OAuth de produção. A visualização foi confirmada no navegador interno; a homologação autenticada ponta a ponta permanece pendente da `service_role` local no backend e da entrada segura das senhas fictícias no navegador.
- **2.2 — 15/11/2026:** a revisão final para publicação financeira comparou produção e homologação sem alterar o banco. A produção ainda não possui as tabelas financeiras e preserva suas contagens atuais; as seis migrações financeiras do staging foram consideradas aditivas e dependentes da estrutura já existente. A publicação foi bloqueada porque o plano Free não oferece backup de banco para download/verificação independente e porque o Advisor de produção ainda aponta três funções `SECURITY DEFINER` executáveis por `anon`/`authenticated`, incluindo a gestão de papéis. O texto de perfil foi generalizado para `E-mail da conta`; testes, TypeScript, ESLint e build passaram. Não houve commit, push, migração, publicação ou alteração de autenticação nesta revisão.
- **2.3 — 16/11/2026:** backup local protegido foi validado estruturalmente antes da aplicação. A produção recebeu as migrações financeiras aditivas, a reconciliação idempotente da restrição de transferência e o endurecimento das funções legadas. Todas as tabelas financeiras estão com RLS e política explícita; as funções privilegiadas deixaram de estar expostas a `anon` e `authenticated`. As contagens legadas foram preservadas. A publicação Vercel e a validação real com usuários de produção devem ser registradas no HANDOFF após o deploy.
- **2.4 — 16/11/2026:** simplificação do lançamento financeiro retomada somente na branch local e no Supabase de homologação `bnsfkddqdcjctcjllkxc`. Home/Minhas Finanças ficaram em modo de consulta e Contas passou a ser a área operacional única; compra mista é dividida em um lançamento. A migração `20261117190000_simplified_accounts_and_report_privacy.sql` foi aplicada somente no staging. Testes de RLS com Proprietário, Administrador e Integrante, idempotência e cálculos foram concluídos com dados sintéticos em transação revertida. TypeScript, ESLint, testes direcionados e build PWA passaram. A verificação visual autenticada encontrou e corrigiu valores ausentes no resumo. A homologação de senha anual/reset de e-mail e o envio de lançamentos pela interface continuam pendentes; nenhuma alteração de produção ou publicação ocorreu.
- **2.5 — 16/11/2026:** fluxos financeiros principais foram submetidos pela interface autenticada no PWA local, apenas no staging, com lançamentos `QA-CRM-UI-20261116-*`. Os seis movimentos de teste (entrada, despesas pessoal/da casa/mista, transferência e saída de caixa) atualizaram saldos e resumo familiar sem duplicação nem reembolso automático; detalhes e totais incrementais estão no `docs/HANDOFF.md`. A URL de recuperação foi configurada exclusivamente no Auth do staging e no `.env` local ignorado. O gate Ano está ativo, mas criação da senha, recuperação com caixa de e-mail acessível, consentimento adulto pela conta Integrante, cenário real de menor/responsável, exportações após autenticação e viewport móvel seguem pendentes. Testes backend (26), contratos frontend, TypeScript, ESLint completo e build PWA passaram; nenhum dado ou configuração de produção foi alterado e não houve commit, push ou deploy.
- **2.6 — 16/11/2026:** modelo visual aprovado e aplicado localmente: Home só exibe resumos; Contas tem Entrada/Saída sem transferência, com divisão pessoal/familiar e resumo antes de salvar; movimentos familiares são refletidos sem duplicação ou aumento indevido do caixa. Administração do caixa foi separada e restrita a Proprietário/Administrador. Formulários foram testados pela interface autenticada no staging, em desktop e tela estreita; testes, TypeScript, ESLint e build passaram. Sem migração ou publicação em produção, commit ou push.
- **2.7 — 16/11/2026:** ajuste de usabilidade local na branch `codex/personal-finances`: calendários brasileiros em Contas e Saída do caixa familiar, com data local atual e seleção de datas anteriores mantendo serialização ISO; botão visível `Voltar para Família` na administração financeira, com confirmação quando há dados não salvos. Validado no staging visual com conta fictícia, em desktop e tela estreita, sem salvar lançamentos nem alterar dados. Testes direcionados, TypeScript, ESLint dos arquivos alterados e build PWA executados; sem migração, produção, deploy, commit ou push.
- **2.8 — 17/11/2026:** correção de cadastro/convites commitada em branch isolada baseada em `codex/personal-finances`: data brasileira com validação estrita, perfil por família, parentesco sem papel de acesso, conclusão obrigatória do perfil do convidado e bloqueio de rotas enquanto incompleto. O aceite continua atômico e não cria pessoa financeira duplicada. Migração aditiva `20261117210637` aplicada e validada somente no staging `bnsfkddqdcjctcjllkxc`; seis memberships existentes permaneceram sem pendência e contagens das tabelas verificadas não mudaram. Testes locais direcionados, TypeScript, ESLint e build passaram. Auth real/PWA e publicação permanecem pendentes. A data de nascimento é autodeclarada e não comprova idade civil.
- **2.9 — 17/11/2026:** Correção 02 implementada em worktree isolada sobre a Correção 01 publicada. Renda de planejamento deixou de afetar o saldo recebido; transferência pessoal→caixa tem débito/crédito vinculados e idempotentes; saldo inicial familiar carrega movimentos e contas pagas anteriores sem criar receita; saldo anual considera transferências e reembolsos efetivos; histórico familiar não expõe a descrição privada de uma compra mista. Migração aditiva aplicada somente no staging. Testes backend, contrato de Contas/perfil/convites, RLS com contexto autenticado, TypeScript, ESLint e build PWA passaram. Produção permanece sem alteração; publicação aguarda backup atual e restauração verificável.

Manter este PRD atualizado quando uma decisão de produto for aprovada ou alterada. Atualizar `docs/HANDOFF.md` sempre que uma funcionalidade for implementada, corrigida ou homologada, registrando evidência e distinguindo local, GitHub, Vercel, Supabase e validação real. Não marcar uma etapa como concluída apenas por build, teste automatizado ou deployment Ready.
