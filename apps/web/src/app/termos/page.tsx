import Link from "next/link";
import { Contato, Identificacao, PaginaLegal } from "@/components/pagina-legal";

export const metadata = { title: "Termos de uso" };

export default function TermosPage() {
  return (
    <PaginaLegal
      titulo="Termos de uso"
      resumo="As regras para usar o sistema: o que ele faz, o que cabe a você e o que cabe à Timeless. Ao criar uma conta ou entrar por convite, você concorda com estes termos."
    >
      <section>
        <h2>O serviço</h2>
        <p>
          O sistema é oferecido por <Identificacao />. Ele reúne num lugar só os anúncios da sua empresa, as conversas
          que chegam pelo WhatsApp conectado e as vendas que saem delas, mostrando de qual anúncio cada cliente veio.
        </p>
        <p>
          Os números de anúncios vêm das contas da Meta e do Google que você conecta. As conversas vêm do WhatsApp que
          você conecta. O sistema não cria contatos nem envia mensagens por conta própria: as mensagens enviadas por ele
          são as que alguém da sua equipe escreve.
        </p>
      </section>

      <section>
        <h2>Sua conta</h2>
        <ul>
          <li>Você é responsável pelas pessoas que convida e pelo que elas fazem no sistema com o acesso que você deu.</li>
          <li>Guarde a sua senha e ative o segundo fator de entrada. A Timeless nunca pede a sua senha.</li>
          <li>Avise a Timeless assim que suspeitar que alguém usou a sua conta sem permissão.</li>
          <li>
            A equipe Timeless pode entrar na sua conta para dar suporte. Toda entrada fica registrada, e você vê o
            histórico em Configurações.
          </li>
        </ul>
      </section>

      <section>
        <h2>O que não é permitido</h2>
        <ul>
          <li>Enviar mensagens em massa para quem não pediu contato, ou qualquer forma de spam.</li>
          <li>Usar o sistema para golpe, conteúdo ilegal ou para enganar quem conversa com a sua empresa.</li>
          <li>Desrespeitar as regras do WhatsApp, da Meta ou do Google, que continuam valendo dentro do sistema.</li>
          <li>Tentar acessar dados de outra empresa, contornar limites de acesso ou atrapalhar o funcionamento do serviço.</li>
        </ul>
        <p>Nesses casos a Timeless pode suspender a conta, avisando antes sempre que possível.</p>
      </section>

      <section>
        <h2>Os dados dos seus clientes</h2>
        <p>
          As conversas, nomes e telefones das pessoas que falam com a sua empresa pertencem à sua empresa. Pela Lei
          Geral de Proteção de Dados (LGPD), a sua empresa é a <strong>controladora</strong> desses dados e a Timeless é a{" "}
          <strong>operadora</strong>: ela guarda e organiza os dados só para prestar o serviço, seguindo as suas
          instruções, e não os usa para nenhuma outra finalidade.
        </p>
        <p>
          Cabe à sua empresa ter um motivo legítimo para falar com esses contatos e atender os pedidos deles sobre os
          próprios dados. A Timeless ajuda a localizar, corrigir ou apagar o que for preciso. Os detalhes estão na{" "}
          <Link href="/privacidade" className="font-medium text-ink underline decoration-line underline-offset-4">
            política de privacidade
          </Link>
          .
        </p>
      </section>

      <section>
        <h2>Serviços de terceiros</h2>
        <p>
          WhatsApp, Meta e Google são serviços de outras empresas. Quando eles mudam regras, saem do ar ou desconectam
          uma conta, o sistema pode deixar de receber dados até a conexão ser refeita. A Timeless avisa quando percebe uma
          queda, mas não responde pelo funcionamento desses serviços.
        </p>
      </section>

      <section>
        <h2>Disponibilidade</h2>
        <p>
          A Timeless trabalha para manter o sistema no ar o tempo todo, mas manutenções e falhas podem acontecer. Paradas
          programadas são avisadas com antecedência sempre que possível.
        </p>
      </section>

      <section>
        <h2>Pagamento</h2>
        <p>
          Valores, forma de pagamento e prazo seguem a proposta comercial ou o contrato combinado com a Timeless. Com o
          pagamento em atraso, o acesso pode ser limitado até a regularização, sem perda dos dados.
        </p>
      </section>

      <section>
        <h2>Encerramento</h2>
        <p>
          Você pode encerrar a conta quando quiser, falando com a Timeless. Antes do encerramento, você pode pedir uma
          cópia dos seus dados. Depois dele, os dados são apagados em até 90 dias, exceto o que a lei obriga a guardar.
        </p>
      </section>

      <section>
        <h2>Responsabilidade</h2>
        <p>
          O sistema mostra o que os dados provam e diz quando não sabe. As decisões sobre anúncios, verba e atendimento
          continuam sendo da sua empresa. A Timeless não responde por resultados de vendas nem por prejuízos causados por
          uso fora destes termos.
        </p>
      </section>

      <section>
        <h2>Mudanças nestes termos</h2>
        <p>
          Quando os termos mudarem, a data no topo desta página muda junto, e mudanças importantes são avisadas dentro do
          sistema antes de valer. Dúvidas sobre estes termos podem ser enviadas <Contato />.
        </p>
        <p>Estes termos seguem a lei brasileira.</p>
      </section>
    </PaginaLegal>
  );
}
