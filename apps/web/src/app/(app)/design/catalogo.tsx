"use client";

import { ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input, SearchInput, Select, Textarea } from "@/components/ui/input";
import { Checkbox, Radio, RadioGroup, Switch } from "@/components/ui/choice";
import { DatePicker, DateRangePicker } from "@/components/ui/date";
import { Combobox } from "@/components/ui/combobox";
import { Alert } from "@/components/ui/alert";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/tooltip";
import { DropdownMenu } from "@/components/ui/menu";
import { ConfirmButton, Dialog, Drawer, Sheet } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { DataTable } from "@/components/ui/table";
import { GrupoDePilulas } from "@/components/ui/pill-group";
import { formatCentsAsBRL } from "@/lib/currency";

/*
  Dados de exemplo, só desta página: mostram o componente com conteúdo
  parecido com o real, sem nada de cliente nenhum.
*/
const CAMPANHAS = [
  { id: "1", nome: "Captação | Vídeo 01", gasto: 184_250, leads: 42, vendas: 6 },
  { id: "2", nome: "Remarketing | Carrossel", gasto: 61_900, leads: 11, vendas: 3 },
  { id: "3", nome: "Institucional", gasto: 22_400, leads: 0, vendas: 0 },
];

const PESSOAS = [
  { valor: "1", rotulo: "Ana Beatriz", descricao: "ana@exemplo.com" },
  { valor: "2", rotulo: "Conceição Lima", descricao: "conceicao@exemplo.com" },
  { valor: "3", rotulo: "João Pedro", descricao: "joao@exemplo.com" },
  { valor: "4", rotulo: "Mariana Souza", descricao: "mariana@exemplo.com" },
];

function Secao({ titulo, descricao, children }: { titulo: string; descricao: string; children: ReactNode }) {
  return (
    <Card className="p-6">
      <CardHeader title={titulo} description={descricao} className="mb-5" />
      {children}
    </Card>
  );
}

export function Catalogo() {
  const { avisa } = useToast();
  const [dialogo, setDialogo] = useState(false);
  const [gaveta, setGaveta] = useState(false);
  const [folha, setFolha] = useState(false);
  const [pessoa, setPessoa] = useState<string | null>("2");
  const [pilula, setPilula] = useState("mes");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">Componentes</h1>
        <p className="mt-1 text-corpo text-ink-mute">
          O design system da Timeless, em uso. Troque o tema no botão do topo para ver os dois. Documentação em{" "}
          <code className="rounded bg-panel-soft px-1.5 py-0.5 text-apoio">docs/DESIGN_SYSTEM.md</code>.
        </p>
      </header>

      <Secao titulo="Botões" descricao="A variante diz a hierarquia: uma ação principal por tela.">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Principal</Button>
          <Button variant="accent">Destaque da marca</Button>
          <Button variant="secondary">Secundário</Button>
          <Button variant="ghost">Discreto</Button>
          <Button variant="danger">Excluir</Button>
          <Button loading>Salvando</Button>
          <Button disabled>Indisponível</Button>
          <Button size="sm">Pequeno</Button>
          <Button size="lg">Grande</Button>
        </div>
      </Secao>

      <Secao titulo="Selos" descricao="Estado com rótulo escrito, nunca só com cor.">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutro</Badge>
          <Badge tone="info">Informação</Badge>
          <Badge tone="success" dot>
            Conectado
          </Badge>
          <Badge tone="warning">Atenção</Badge>
          <Badge tone="danger" dot>
            Caiu
          </Badge>
          <Badge tone="brand">Marca</Badge>
        </div>
      </Secao>

      <Secao titulo="Campos" descricao="Field liga rótulo, dica e erro ao campo, também para o leitor de tela.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nome da campanha" hint="Como aparece no relatório.">
            {(id, ligacao) => <Input id={id} placeholder="Captação | Vídeo 01" {...ligacao} />}
          </Field>
          <Field label="E-mail" error="Informe um e-mail válido.">
            {(id, ligacao) => <Input id={id} type="email" defaultValue="ana@" {...ligacao} />}
          </Field>
          <Field label="Plataforma">
            {(id, ligacao) => (
              <Select id={id} defaultValue="meta" {...ligacao}>
                <option value="meta">Meta Ads</option>
                <option value="google">Google Ads</option>
              </Select>
            )}
          </Field>
          <Field label="Responsável" hint="Digite para buscar, sem se preocupar com acento.">
            {(id, ligacao) => <Combobox id={id} opcoes={PESSOAS} valor={pessoa} aoMudar={setPessoa} {...ligacao} />}
          </Field>
          <Field label="Busca">{(id) => <SearchInput id={id} placeholder="Buscar lead" />}</Field>
          <Field label="Desativado">{(id) => <Input id={id} disabled defaultValue="Não dá para editar" />}</Field>
          <Field label="Observação" className="sm:col-span-2">
            {(id, ligacao) => <Textarea id={id} placeholder="Algo que a equipe precisa saber" {...ligacao} />}
          </Field>
        </div>
      </Secao>

      <Secao titulo="Escolhas" descricao="Checkbox vale ao enviar; Switch vale na hora.">
        <div className="grid gap-6 sm:grid-cols-3">
          <div className="space-y-2.5">
            <Checkbox defaultChecked>Leads</Checkbox>
            <Checkbox descricao="Mensagens e respostas.">Conversas</Checkbox>
            <Checkbox disabled>Configurações</Checkbox>
          </div>
          <RadioGroup legenda="Acesso">
            <Radio name="acesso-exemplo" defaultChecked>
              Um cliente
            </Radio>
            <Radio name="acesso-exemplo">Equipe Timeless</Radio>
          </RadioGroup>
          <div className="space-y-2.5">
            <Switch defaultChecked descricao="Leads fora do horário esperam o dia seguinte.">
              Horário de atendimento
            </Switch>
            <Switch>Avisar por e-mail</Switch>
          </div>
        </div>
      </Secao>

      <Secao titulo="Datas" descricao="Seletor nativo: no celular abre o calendário do sistema.">
        <div className="flex flex-col gap-5">
          <DatePicker defaultValue="2026-09-28" aria-label="Dia" />
          <DateRangePicker
            de="2026-09-01"
            ate="2026-09-28"
            maximo="2026-09-28"
            atalhos={[
              { rotulo: "Este mês", de: "2026-09-01", ate: "2026-09-28" },
              { rotulo: "Mês passado", de: "2026-08-01", ate: "2026-08-31" },
            ]}
          />
        </div>
      </Secao>

      <Secao titulo="Navegação" descricao="Pílulas para trocar de página ou filtro; Tabs para trocar conteúdo na mesma tela.">
        <div className="space-y-6">
          <GrupoDePilulas
            ativo={pilula}
            opcoes={[
              { chave: "semana", rotulo: "7 dias", aoClicar: () => setPilula("semana") },
              { chave: "mes", rotulo: "Este mês", aoClicar: () => setPilula("mes") },
              { chave: "ano", rotulo: "Este ano", aoClicar: () => setPilula("ano") },
            ]}
          />
          <Tabs
            abas={[
              { chave: "resumo", rotulo: "Resumo", conteudo: <p className="text-corpo text-ink-soft">Conteúdo do resumo.</p> },
              { chave: "detalhe", rotulo: "Detalhe", conteudo: <p className="text-corpo text-ink-soft">Conteúdo do detalhe.</p> },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Tooltip conteudo="Custo por lead: gasto dividido pelos leads do período.">
              <Button variant="secondary" size="sm">
                CPL
              </Button>
            </Tooltip>
            <DropdownMenu
              rotulo="Mais opções"
              itens={[
                { rotulo: "Editar", aoEscolher: () => avisa("Editar escolhido", "info") },
                { rotulo: "Duplicar", aoEscolher: () => avisa("Duplicado") },
                { rotulo: "Excluir", perigoso: true, aoEscolher: () => avisa("Excluir escolhido", "danger") },
              ]}
            />
          </div>
        </div>
      </Secao>

      <Secao titulo="Avisos" descricao="Alert fica na tela; Toast confirma e some.">
        <div className="space-y-3">
          <Alert tom="info" titulo="Sincronizando">
            A primeira sincronização com a Meta leva alguns minutos.
          </Alert>
          <Alert tom="success" titulo="WhatsApp conectado" />
          <Alert
            tom="warning"
            titulo="Este período é anterior ao WhatsApp"
            acao={
              <Button size="sm" variant="secondary">
                Ver integrações
              </Button>
            }
          >
            O que aconteceu antes da configuração não passou pelo sistema.
          </Alert>
          <Alert tom="danger" titulo="A Meta bloqueou o acesso do app à API">
            Veja o painel do app em developers.facebook.com.
          </Alert>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" variant="secondary" onClick={() => avisa("Link copiado")}>
              Aviso de sucesso
            </Button>
            <Button size="sm" variant="secondary" onClick={() => avisa("Não foi possível salvar. Tente de novo.", "danger")}>
              Aviso de falha
            </Button>
          </div>
        </div>
      </Secao>

      <Secao titulo="Sobreposições" descricao="Dialog decide, Drawer detalha ao lado, Sheet sobe de baixo no celular.">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setDialogo(true)}>
            Abrir diálogo
          </Button>
          <Button variant="secondary" onClick={() => setGaveta(true)}>
            Abrir gaveta
          </Button>
          <Button variant="secondary" onClick={() => setFolha(true)}>
            Abrir folha
          </Button>
          <ConfirmButton
            variant="danger"
            titulo="Remover Ana Beatriz da conta?"
            descricao="Ela perde o acesso na hora, em todos os aparelhos. Os leads e o histórico dela continuam."
            rotuloConfirmar="Remover Ana"
            aoConfirmar={async () => {
              await new Promise((pronto) => setTimeout(pronto, 600));
              avisa("Ana removida");
            }}
          >
            Remover com confirmação
          </ConfirmButton>
        </div>
        <Dialog
          aberto={dialogo}
          aoFechar={() => setDialogo(false)}
          titulo="Nova verba"
          descricao="Quanto pode ser investido no período."
          rodape={
            <>
              <Button variant="ghost" size="sm" onClick={() => setDialogo(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => setDialogo(false)}>
                Salvar
              </Button>
            </>
          }
        >
          <Field label="Valor">{(id) => <Input id={id} inputMode="decimal" placeholder="R$ 0,00" />}</Field>
        </Dialog>
        <Drawer aberto={gaveta} aoFechar={() => setGaveta(false)} titulo="Ana Beatriz" descricao="Lead desde 12 de setembro.">
          <p className="text-corpo text-ink-soft">Detalhe do lead, sem sair da lista.</p>
        </Drawer>
        <Sheet aberto={folha} aoFechar={() => setFolha(false)} titulo="Filtros">
          <p className="text-corpo text-ink-soft">No celular, os filtros sobem de baixo.</p>
        </Sheet>
      </Secao>

      <Secao titulo="Tabela" descricao="No celular, cada linha vira um bloco; números à direita e com algarismos alinhados.">
        <DataTable
          legenda="Campanhas de exemplo"
          linhas={CAMPANHAS}
          chaveDaLinha={(c) => c.id}
          colunas={[
            { chave: "nome", titulo: "Campanha", principal: true, celula: (c) => c.nome },
            { chave: "gasto", titulo: "Gasto", alinhar: "direita", celula: (c) => formatCentsAsBRL(c.gasto) },
            { chave: "leads", titulo: "Leads", alinhar: "direita", celula: (c) => c.leads },
            { chave: "vendas", titulo: "Vendas", alinhar: "direita", celula: (c) => c.vendas },
          ]}
        />
      </Secao>

      <Secao titulo="Estados" descricao="Carregando tem a forma do que vem; vazio e erro dizem o próximo passo.">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 rounded-2xl border border-line/60 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
          <div className="rounded-2xl border border-line/60">
            <EmptyState title="Nenhum lead ainda" description="Os leads aparecem aqui quando alguém escrever no WhatsApp." />
          </div>
          <div className="rounded-2xl border border-line/60">
            <ErrorState
              action={
                <Button size="sm" variant="secondary">
                  Tentar de novo
                </Button>
              }
            />
          </div>
        </div>
      </Secao>
    </div>
  );
}
