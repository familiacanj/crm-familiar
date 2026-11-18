import { LegalPage, type LegalSection } from "@/src/components/legal-page";

const sections: LegalSection[] = [
  {
    title: "1. Quem responde pelo tratamento",
    paragraphs: [
      "O controlador e responsável pelo CRM Familiar é Cesar Bittencourt, pessoa física. O aplicativo organiza informações de orçamento doméstico e está em preparação para um piloto limitado.",
      "Canal para dúvidas, exercício de direitos e solicitações de privacidade: ajudapopular@gmail.com. O controlador deve acompanhar esse canal e responder aos pedidos de forma segura e nos prazos aplicáveis.",
    ],
  },
  {
    title: "2. Dados tratados pelo aplicativo",
    paragraphs: [
      "No login Google, o CRM recebe o identificador da conta, e-mail, nome e, quando disponível, imagem de perfil. O perfil também pode conter nome de exibição, data de nascimento, vínculo familiar e autorização para compartilhar relatório pessoal.",
      "O CRM registra famílias, integrantes e permissões, categorias, contas, orçamento compartilhado, contribuições, compromissos, pagamentos, metas e lançamentos financeiros pessoais. Os valores são inseridos pelos usuários; não há conexão bancária nem movimentação de dinheiro pelo aplicativo.",
      "Convites armazenam a família, o identificador de quem os criou, horários de criação, expiração e uso ou cancelamento, além de um hash do token. O token do link deve ser tratado como confidencial.",
    ],
  },
  {
    title: "3. Finalidades e bases legais",
    paragraphs: [
      "As finalidades incluem autenticação, manutenção do perfil, operação de convites, organização dos orçamentos, cálculo de resumos e segurança/auditoria de alterações. A base legal aplicável a cada finalidade deve ser avaliada e documentada pelo controlador, considerando o contexto de cada tratamento; não se presume consentimento como fundamento universal.",
    ],
  },
  {
    title: "4. Compartilhamento entre integrantes e serviços",
    paragraphs: [
      "Lançamentos classificados como familiares são compartilhados com integrantes ativos daquela família. Lançamentos pessoais de adultos e salários não são apresentados automaticamente ao proprietário, administrador, superadministrador ou outros integrantes. Relatórios pessoais de adultos só podem ser consultados mediante autorização específica revogável do titular. A autorização de responsável para dados de menores segue controles próprios.",
      "Google fornece o login; Supabase fornece autenticação e banco de dados; Vercel hospeda a interface e a API. O banco de produção Supabase está na região us-east-1. Local de processamento dos demais serviços, suboperadores, transferências internacionais e retenção de logs devem ser conferidos pelo controlador. Os provedores também tratam dados conforme seus próprios termos e políticas.",
      "A revisão de código não encontrou integração com anúncios ou analytics de terceiros; isso não substitui a conferência das configurações operacionais dos provedores.",
    ],
  },
  {
    title: "5. Armazenamento, segurança e sessão",
    paragraphs: [
      "A API valida a sessão Supabase e aplica verificações de família, papel e titularidade. O banco utiliza políticas RLS; a chave privilegiada é utilizada somente no backend. Essas medidas reduzem o risco de acesso indevido, mas não eliminam todos os riscos de segurança.",
      "O navegador mantém a sessão para permitir o acesso. O service worker armazena somente recursos públicos do aplicativo; requisições de autenticação e API são excluídas do cache, e a ativação de uma nova versão remove o cache anterior. Em dispositivos compartilhados, encerre a sessão e proteja o aparelho.",
    ],
  },
  {
    title: "6. Retenção, correção e exclusão",
    paragraphs: [
      "Não há exclusão automática por inatividade. Enquanto a conta está ativa, os dados necessários às funções utilizadas são mantidos. Remover uma pessoa da família revoga seu acesso compartilhado, mas não apaga suas finanças pessoais; registros familiares podem permanecer para preservar a integridade do histórico dos demais integrantes.",
      "O perfil permite registrar ou cancelar uma solicitação autenticada de exclusão definitiva. O pedido fica pendente de análise humana; seu envio não desativa a conta nem apaga dados imediatamente. A análise deve identificar dados a excluir ou anonimizar e qualquer registro familiar estritamente necessário a preservar, com justificativa e acesso restrito. Não foi definido um prazo legal específico ou um prazo operacional de atendimento para este CRM. Os períodos devem ser determinados por finalidade e obrigações aplicáveis, não por suposição; a LGPD não estabelece prazo geral único de retenção.",
    ],
  },
  {
    title: "7. Direitos e pedidos",
    paragraphs: [
      "A pessoa titular pode solicitar confirmação, acesso, correção, anonimização, bloqueio, portabilidade ou eliminação, conforme a legislação aplicável. O contato é ajudapopular@gmail.com. A identidade poderá ser verificada de maneira proporcional para proteger a conta e os dados de terceiros.",
      "Cesar Bittencourt é o canal responsável por receber e encaminhar os pedidos. O controlador deve manter um fluxo para confirmar o recebimento, avaliar o pedido, comunicar eventual impossibilidade e registrar a providência, sem prometer um prazo não confirmado. Recomenda-se revisão jurídica das bases e dos prazos do piloto.",
    ],
  },
  {
    title: "8. Dados de crianças e adolescentes",
    paragraphs: [
      "O CRM permite associar dados de perfil e orçamento a menores e possui controles específicos de autorização de responsável para consulta de relatórios pessoais. O controlador deve definir orientação adequada ao melhor interesse, base legal, informação apropriada à idade e salvaguardas antes do piloto. Não insira dados de menores sem autorização e fundamento apropriados.",
    ],
  },
  {
    title: "9. Alterações desta política",
    paragraphs: [
      "Esta política deve ser atualizada quando as práticas mudarem. Permanecem sujeitos a confirmação operacional os locais de processamento e suboperadores fora do Supabase, transferências internacionais, fundamentos por finalidade e critérios justificados de retenção e exclusão.",
    ],
  },
];

export default function PrivacyPolicy() {
  return <LegalPage title="Política de Privacidade" updatedAt="18 de novembro de 2026" sections={sections} />;
}
