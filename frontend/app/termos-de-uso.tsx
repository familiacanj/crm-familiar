import { LegalPage, type LegalSection } from "@/src/components/legal-page";

const sections: LegalSection[] = [
  {
    title: "1. Finalidade e fase do serviço",
    paragraphs: [
      "O CRM Familiar é um aplicativo em desenvolvimento para registrar e acompanhar informações de orçamento doméstico, como rendas, contas, despesas, pagamentos e metas. O serviço está em fase piloto e será disponibilizado inicialmente a um grupo limitado de famílias.",
      "Durante o piloto, podem ocorrer erros, indisponibilidades, mudanças de interface ou interrupções. O responsável pelo serviço ainda precisa definir suporte, disponibilidade esperada, duração do piloto e regras para encerramento dessa fase.",
    ],
  },
  {
    title: "2. Uso individual e familiar",
    paragraphs: [
      "Uma pessoa pode criar uma família e começar a utilizar o CRM sozinha. A criação não exige convidar outras pessoas. O proprietário poderá adicionar integrantes posteriormente por convite, conforme as opções disponibilizadas no aplicativo.",
      "Os integrantes associados a uma família podem acessar as informações orçamentárias compartilhadas nela. Antes de registrar dados de outra pessoa ou compartilhar um convite, o usuário deve ter autorização apropriada e informar os integrantes sobre esse compartilhamento.",
    ],
  },
  {
    title: "3. Conta, convites e permissões",
    paragraphs: [
      "O acesso é feito com uma conta Google. Cada usuário deve proteger sua conta e usar informações corretas. O proprietário ou um administrador pode gerar um convite; cada link é individual, de uso único e válido por 24 horas, podendo ser cancelado conforme a funcionalidade disponível.",
      "Os papéis de proprietário, administrador e integrante orientam as permissões do aplicativo. No funcionamento atual, a gestão de convites é limitada a proprietário e administradores, enquanto os dados do orçamento são associados à família. O usuário não deve compartilhar links de convite ou credenciais com pessoas não autorizadas.",
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
      "Os dados financeiros inseridos são compartilhados dentro da família correspondente conforme as permissões e o funcionamento descritos na Política de Privacidade. O usuário deve evitar inserir informações desnecessárias ou dados de terceiros sem autorização.",
      "O tratamento de dados pessoais é descrito na Política de Privacidade. Esta versão dos Termos não substitui a política nem reduz direitos previstos em lei.",
    ],
  },
  {
    title: "6. Limites e disponibilidade",
    paragraphs: [
      "Por estar em fase piloto, o serviço é fornecido para avaliação e pode ser alterado ou interrompido. O responsável ainda precisa definir as condições finais de suporte, disponibilidade, cópias de segurança, encerramento do piloto e responsabilidades contratuais. Nenhuma garantia de disponibilidade contínua é estabelecida por este rascunho.",
      "O CRM Familiar não realiza, no código analisado, movimentação de dinheiro nem conexão com contas bancárias. As informações e os resultados dependem dos dados inseridos pelo usuário.",
    ],
  },
  {
    title: "7. Encerramento de acesso e exclusão de conta",
    paragraphs: [
      "O usuário pode sair da sessão pelo aplicativo. Essa ação encerra o acesso naquele momento, mas não exclui o perfil nem os dados da família. O projeto ainda não oferece exclusão de conta pelo aplicativo e o procedimento externo para solicitar essa exclusão precisa ser definido e implementado.",
      "As regras para remoção de integrantes, encerramento de famílias, retenção e eliminação de registros ainda precisam ser confirmadas. Até lá, não se deve interpretar o logout como solicitação ou confirmação de exclusão de dados.",
    ],
  },
  {
    title: "8. Condições comerciais e revisão",
    paragraphs: [
      "Não há preço, assinatura ou condição comercial aprovada descrita neste documento. Qualquer condição comercial futura deverá ser informada antes de sua aplicação e incorporada a uma versão revisada destes Termos.",
      "Este documento é preliminar, baseado no funcionamento observado no código e sujeito à revisão do responsável pelo CRM Familiar e de profissional jurídico antes de sua publicação definitiva.",
    ],
  },
];

export default function TermsOfUse() {
  return <LegalPage title="Termos de Uso" updatedAt="11 de novembro de 2026" sections={sections} />;
}
