import { LegalPage, type LegalSection } from "@/src/components/legal-page";

const sections: LegalSection[] = [
  {
    title: "1. Finalidade e fase do serviço",
    paragraphs: [
      "O CRM Familiar organiza informações de orçamento doméstico, incluindo receitas, despesas, contas, contribuições e metas informadas pelos usuários. O aplicativo está em preparação para um piloto limitado.",
      "Por se tratar de um piloto, podem ocorrer erros, indisponibilidades, mudanças ou interrupções. Não há garantia de disponibilidade contínua. Antes do piloto, o responsável deverá confirmar identidade, canal de suporte, duração e condições de encerramento.",
    ],
  },
  {
    title: "2. Uso individual e familiar",
    paragraphs: [
      "Uma pessoa pode criar uma família e começar a utilizar o CRM sozinha. A criação não exige convidar outras pessoas. O proprietário poderá adicionar integrantes posteriormente por convite, conforme as opções disponibilizadas no aplicativo.",
      "Os integrantes ativos podem consultar os dados compartilhados da respectiva família. Receitas, despesas e relatórios pessoais de adultos permanecem privados, salvo autorização específica registrada pelo titular. Antes de registrar dados de outra pessoa, obtenha autorização apropriada.",
    ],
  },
  {
    title: "3. Conta, convites e permissões",
    paragraphs: [
      "O acesso atual utiliza uma conta Google. Cada usuário deve proteger sua conta. O proprietário ou um administrador pode gerar um convite; os links são individuais, de uso único, expiram em 24 horas e podem ser cancelados.",
      "Os papéis de proprietário, administrador e integrante delimitam operações de gestão. Proprietário e administrador não recebem acesso automático às finanças pessoais de adultos. A autorização de relatório pessoal pode ser revogada pelo titular. Não compartilhe convites ou credenciais com pessoas não autorizadas.",
    ],
  },
  {
    title: "4. Responsabilidades dos usuários",
    paragraphs: [
      "O usuário é responsável pela exatidão dos dados que registra, por revisar os valores utilizados em seus cálculos e por manter a segurança de sua conta Google e de seus dispositivos. Também deve usar o CRM de forma lícita, respeitar a privacidade dos demais integrantes e não tentar acessar dados de outras famílias.",
      "O CRM organiza as informações fornecidas pelos usuários e apresenta cálculos para apoio ao acompanhamento do orçamento. Ele não substitui aconselhamento financeiro, contábil ou jurídico e não verifica automaticamente se os valores lançados estão corretos.",
    ],
  },
  {
    title: "5. Privacidade e dados financeiros",
    paragraphs: [
      "Somente lançamentos classificados como familiares são compartilhados na família. O detalhamento de salário e despesas pessoais de adultos não é disponibilizado automaticamente aos demais integrantes. O funcionamento e os limites de acesso estão descritos na Política de Privacidade.",
      "O tratamento de dados pessoais é descrito na Política de Privacidade. Esta versão dos Termos não substitui a política nem reduz direitos previstos em lei.",
    ],
  },
  {
    title: "6. Limites e disponibilidade",
    paragraphs: [
      "O aplicativo é fornecido para avaliação no piloto e pode ser alterado ou interrompido. O usuário é responsável por conferir os valores. O CRM Familiar não movimenta dinheiro nem se conecta a contas bancárias.",
    ],
  },
  {
    title: "7. Encerramento de acesso e exclusão de conta",
    paragraphs: [
      "Sair da família, encerrar a sessão e solicitar exclusão definitiva são ações distintas. Encerrar a sessão não desativa a conta nem apaga dados. O perfil permite registrar e cancelar uma solicitação autenticada de exclusão; o pedido fica pendente de análise e não executa apagamento imediato.",
      "A análise deve identificar dados pessoais e financeiros a excluir ou anonimizar e os registros familiares estritamente necessários a preservar. Não há prazo legal fixo de retenção definido para este serviço. A conclusão depende de o responsável confirmar a base de retenção aplicável, o procedimento operacional e o canal de contato; contas de Superadministrador exigem análise específica.",
    ],
  },
  {
    title: "8. Condições comerciais e revisão",
    paragraphs: [
      "Não há preço, assinatura ou condição comercial aprovada descrita neste documento. Qualquer condição comercial futura deverá ser informada antes de sua aplicação e incorporada a uma versão revisada destes Termos.",
      "O responsável pelo serviço é Cesar Bittencourt, pessoa física. O canal de contato e suporte é ajudapopular@gmail.com. Esta versão descreve o funcionamento do aplicativo, mas continua preliminar; recomenda-se revisão jurídica e confirmação das condições operacionais antes de tratá-la como termo definitivo.",
    ],
  },
];

export default function TermsOfUse() {
  return <LegalPage title="Termos de Uso" updatedAt="18 de novembro de 2026" sections={sections} />;
}
