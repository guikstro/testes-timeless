import { Contato, Identificacao, PaginaLegal } from "@/components/pagina-legal";

export const metadata = { title: "Política de privacidade" };

export default function PrivacidadePage() {
  return (
    <PaginaLegal
      titulo="Política de privacidade"
      resumo="Quais dados o sistema guarda, para quê, com quem eles são compartilhados e como pedir para ver, corrigir ou apagar os seus."
    >
      <section>
        <h2>Quem cuida dos dados</h2>
        <p>
          O sistema é oferecido por <Identificacao />. Para os dados de quem usa o sistema (você e a sua equipe), a
          Timeless é a <strong>controladora</strong>. Para os dados das pessoas que conversam com a sua empresa, a sua
          empresa é a controladora e a Timeless é a <strong>operadora</strong>, tratando esses dados só para prestar o
          serviço.
        </p>
      </section>

      <section>
        <h2>Quais dados</h2>
        <ul>
          <li>
            <strong>De quem usa o sistema:</strong> nome, e-mail, senha (guardada só em forma cifrada, que ninguém consegue
            ler), e o aparelho e o endereço de internet de cada entrada, para a segurança da conta.
          </li>
          <li>
            <strong>Das pessoas que conversam com a sua empresa:</strong> nome e telefone do WhatsApp, as mensagens trocadas,
            de qual anúncio ou link a pessoa veio e as vendas registradas.
          </li>
          <li>
            <strong>Dos anúncios:</strong> campanhas, gasto e resultados das contas da Meta e do Google que a sua empresa
            conectou.
          </li>
          <li>
            <strong>Dos links rastreáveis:</strong> a data do clique, a página de origem, o navegador e os códigos de
            campanha do anúncio, para saber de onde veio cada conversa.
          </li>
        </ul>
      </section>

      <section>
        <h2>Para quê</h2>
        <ul>
          <li>Prestar o serviço contratado: mostrar de onde vêm os clientes e quanto custou cada um.</li>
          <li>Proteger as contas: registrar entradas, detectar acessos estranhos e manter o histórico de quem fez o quê.</li>
          <li>Avisar a sua equipe de novas conversas e de problemas na conexão.</li>
          <li>Cumprir obrigações legais.</li>
        </ul>
        <p>
          Os dados não são vendidos, não são usados para anúncios da Timeless e não são cruzados com os de outras empresas
          clientes.
        </p>
      </section>

      <section>
        <h2>Com quem são compartilhados</h2>
        <ul>
          <li>
            <strong>Meta e Google</strong>, só quando a sua empresa conecta as contas de anúncios e pede o envio de
            conversões: eles recebem o aviso de que um contato virou lead ou venda, para melhorar a entrega dos anúncios.
          </li>
          <li>
            <strong>Os serviços que mantêm o sistema no ar</strong>, como hospedagem, banco de dados, envio de e-mail e os
            avisos do navegador, que só guardam ou transportam os dados.
          </li>
          <li>Autoridades, quando a lei ou uma ordem judicial exigir.</li>
        </ul>
        <p>
          Alguns desses serviços ficam fora do Brasil. Nesses casos a transferência segue o que a LGPD permite, com
          empresas que adotam proteção equivalente.
        </p>
      </section>

      <section>
        <h2>Por quanto tempo</h2>
        <p>
          Enquanto a conta da sua empresa estiver ativa. Sessões paradas saem depois de 30 dias, e os avisos antigos
          depois de 90. Encerrada a conta, os dados são apagados em até 90 dias, exceto o que a lei obriga a guardar.
        </p>
      </section>

      <section>
        <h2>Segurança</h2>
        <p>
          As chaves das contas conectadas ficam cifradas, a entrada pode exigir um segundo fator, cada empresa só enxerga
          os próprios dados e toda entrada da equipe Timeless numa conta de cliente fica registrada.
        </p>
      </section>

      <section>
        <h2>Seus direitos</h2>
        <p>Pela LGPD, qualquer pessoa pode pedir:</p>
        <ul>
          <li>confirmação de que os seus dados são tratados, e uma cópia deles;</li>
          <li>correção do que estiver errado ou desatualizado;</li>
          <li>anonimização, bloqueio ou eliminação do que for desnecessário;</li>
          <li>a portabilidade para outro serviço;</li>
          <li>saber com quem os dados foram compartilhados;</li>
          <li>revogar um consentimento dado.</li>
        </ul>
        <p>
          Se você conversou com uma empresa que usa o sistema, faça o pedido a ela, que é quem decide sobre os seus dados.
          A Timeless ajuda a empresa a atender. Para os dados da sua conta no sistema, fale com a Timeless <Contato />.
        </p>
      </section>

      <section>
        <h2>Cookies</h2>
        <p>
          O sistema usa só os cookies necessários para manter você conectado e lembrar escolhas como o tema. Não há
          cookies de publicidade nem de rastreamento de terceiros dentro do sistema.
        </p>
      </section>

      <section>
        <h2>Mudanças nesta política</h2>
        <p>
          Quando esta política mudar, a data no topo desta página muda junto, e mudanças importantes são avisadas dentro do
          sistema antes de valer.
        </p>
      </section>
    </PaginaLegal>
  );
}
