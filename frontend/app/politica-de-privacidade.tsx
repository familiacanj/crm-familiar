import { LegalPage, type LegalSection } from "@/src/components/legal-page";

const sections: LegalSection[] = [
  {
    title: "1. Quem responde pelo tratamento",
    paragraphs: [
      "O CRM Familiar é um aplicativo em fase piloto para organização de orçamento doméstico. A pessoa ou entidade responsável por decidir as finalidades e os meios do tratamento (controlador) ainda precisa ser identificada: [NOME/RAZÃO SOCIAL E DADOS DE IDENTIFICAÇÃO A DEFINIR].",
      "Canal para dúvidas e solicitações sobre dados pessoais: [E-MAIL OU OUTRO CANAL OFICIAL A DEFINIR]. Até essa informação ser preenchida, esta página é um rascunho de revisão e não deve ser usada como política final na Google Play.",
    ],
  },
  {
    title: "2. Dados tratados pelo aplicativo",
    paragraphs: [
      "No acesso com Google, o sistema recebe e mantém no perfil do CRM o identificador da conta, o endereço de e-mail, o nome e, quando fornecida pelo provedor, a imagem de perfil. Esses dados são usados para autenticar e identificar a conta no aplicativo.",
      "Quando uma pessoa cria uma família, o CRM mantém o nome da família e associa o perfil autenticado a ela com um papel de acesso. O sistema registra nomes de pessoas usados no orçamento, categorias e contas, valores de renda e despesas, pagamentos de contas, metas e depósitos mensais. Esses valores são inseridos pelos próprios usuários; o código analisado não mostra integração com contas bancárias.",
      "Para convites, o sistema mantém a família relacionada, quem criou o convite, datas de criação, validade, uso ou cancelamento e um resumo criptográfico do token. O link de convite contém um token que deve ser tratado como confidencial por quem o recebe.",
    ],
  },
  {
    title: "3. Finalidades e bases legais",
    paragraphs: [
      "Os dados são tratados para permitir o login, manter o perfil, organizar o orçamento informado, calcular resumos financeiros, associar integrantes à família e operar convites. As bases legais aplicáveis a cada finalidade ainda precisam ser avaliadas e documentadas pelo responsável antes da publicação definitiva desta política.",
    ],
  },
  {
    title: "4. Compartilhamento entre integrantes e serviços",
    paragraphs: [
      "Os dados de orçamento vinculados a uma família são disponibilizados aos perfis associados à mesma família conforme o funcionamento atual do aplicativo. Proprietários e administradores podem gerar convites; os links são de uso único e expiram em 24 horas. Compartilhe dados de outras pessoas somente quando tiver autorização apropriada.",
      "O login é fornecido pelo Google e processado com Supabase Auth. O banco de dados e a autenticação do CRM utilizam Supabase. O frontend é hospedado pela Vercel. O provedor, a região, os suboperadores e os períodos de retenção da hospedagem da API e de seus logs precisam ser confirmados pelo responsável. Cada provedor pode tratar dados de acordo com seus próprios termos e políticas.",
      "Não foi localizada no código analisado integração com plataformas de anúncios ou analytics de terceiros. Essa observação de código não substitui a conferência das configurações dos provedores de hospedagem e infraestrutura.",
    ],
  },
  {
    title: "5. Armazenamento, segurança e sessão",
    paragraphs: [
      "Os registros do aplicativo são persistidos no Supabase e as operações da API utilizam a sessão autenticada para determinar a conta e a família. O banco possui políticas de segurança por linha; a API também utiliza uma credencial privilegiada exclusivamente no servidor, por isso a autorização aplicada pela API é parte importante da proteção.",
      "No navegador, a sessão de autenticação é persistida no armazenamento local do aplicativo para manter o acesso. O service worker do PWA mantém arquivos públicos de funcionamento do aplicativo e, conforme o código analisado, não deve armazenar respostas da API financeira em cache público. Não é possível prometer risco zero ou descrever controles operacionais que não foram auditados.",
    ],
  },
  {
    title: "6. Retenção, correção e exclusão",
    paragraphs: [
      "O projeto ainda não define um prazo de retenção nem oferece uma função de exclusão de conta. Sair do aplicativo encerra a sessão local, mas não apaga o perfil, a família ou os lançamentos armazenados. O prazo, os critérios de retenção e o procedimento seguro para atender pedidos de exclusão precisam ser aprovados e implementados pelo responsável; não prometemos exclusão automática ou em prazo específico nesta versão preliminar.",
      "Antes da disponibilização na Google Play, o responsável deverá definir e oferecer um meio claro para solicitar a exclusão da conta e dos dados associados, incluindo um caminho acessível fora do aplicativo, conforme os requisitos aplicáveis da loja.",
    ],
  },
  {
    title: "7. Direitos e pedidos",
    paragraphs: [
      "A pessoa titular pode solicitar confirmação do tratamento, acesso, correção e demais direitos previstos na legislação aplicável, inclusive a LGPD. O pedido deverá ser encaminhado ao canal oficial que será definido nesta página. A identidade do solicitante poderá ser confirmada de forma proporcional para proteger a conta e os dados de terceiros.",
      "O responsável ainda precisa definir o fluxo interno, a pessoa encarregada ou contato responsável e como responderá aos pedidos. A publicação final depende dessas definições e de revisão das práticas reais.",
    ],
  },
  {
    title: "8. Dados de crianças e adolescentes",
    paragraphs: [
      "O aplicativo permite que usuários registrem nomes e valores associados a integrantes da família. O responsável pelo tratamento deve definir orientações para dados de crianças e adolescentes e avaliar o melhor interesse e as medidas aplicáveis antes de liberar o serviço amplamente. Usuários não devem inserir dados de terceiros sem autorização adequada.",
    ],
  },
  {
    title: "9. Alterações desta política",
    paragraphs: [
      "Esta política poderá ser atualizada quando as práticas do CRM Familiar forem confirmadas ou mudarem. A data de atualização será indicada no início da página. A versão final deverá identificar o responsável, o canal de contato e práticas completas de retenção, exclusão e compartilhamento.",
    ],
  },
];

export default function PrivacyPolicy() {
  return <LegalPage title="Política de Privacidade" updatedAt="11 de novembro de 2026" sections={sections} />;
}
