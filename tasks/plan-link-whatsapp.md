# Plano: link externo para o cliente conectar o WhatsApp

## Objetivo

A equipe gera um **link temporário** e envia ao cliente. O cliente abre o link
em qualquer aparelho, sem login, vê o QR Code e lê com o celular. A conexão
aparece na plataforma como "conectado", sem ninguém da equipe precisar estar
junto.

## Fluxo

```
Equipe (tela WhatsApp da organização)  ──► "Gerar link" ──► https://<site>/conectar-whatsapp/<token>
                                                              │ (enviado por WhatsApp/e-mail)
Cliente abre o link (sem login) ──► página pública ──► QR Code (atualiza a cada 5 s)
                                                              │ lê com o celular
Motor do WhatsApp (API) ──► connection.update "open" ──► status CONNECTED no banco
                                                              │
Página pública mostra "Conectado ✓"   e   a plataforma mostra "Conectado"
```

## O que já existe e será reaproveitado

| Peça | Onde | Uso aqui |
|---|---|---|
| Iniciar QR e consultar o status | `WhatsAppConnectionsService.connectViaQrCode` / `getQrCode` | A rota pública só troca o token pela organização e chama estes métodos. |
| Token guardado por hash, com validade no Redis | `EntregaDeSessaoService` (entrar como cliente) e `hashToken` | Mesmo padrão: token aleatório, só o hash guardado, TTL no Redis. |
| Tela do QR com consulta a cada 5 s | `web/.../integrations/whatsapp/qr-connect.tsx` | Recebe as funções de iniciar/consultar por parâmetro e serve às duas telas. |
| Limite de requisições | `common/throttling/limites.ts` | Um limite próprio para a rota pública. |
| Auditoria | `AuditoriaService` | Registra quem gerou o link e quando foi usado. |

## Decisões

1. **Guardado no Redis com validade, não numa tabela nova.** Segue o padrão
   do `EntregaDeSessaoService`, sem migração, e a expiração é automática. Se o
   Redis free reiniciar, o link some e basta gerar outro.
2. **Um link ativo por organização.** Gerar um novo invalida o anterior. Não há
   lista nem gestão de links (YAGNI).
3. **Validade de 24 h e uso único.** O link deixa de valer quando a conexão
   abre, ou quando vence.
4. **O token nunca carrega o `organizationId`.** É aleatório (32 bytes,
   base64url), e só o SHA-256 dele fica guardado. A organização sai do Redis,
   então não dá para trocar de organização mexendo na URL.
5. **Organização já conectada:** o link mostra "já conectado" e **não** reinicia
   o QR. Sem isso, abrir um link velho derrubaria o status de uma conexão ativa
   (o `connectViaQrCode` grava `PENDING_QR`).
6. **Quem gera:** dono ou admin da organização, pela tela de WhatsApp. A equipe
   da plataforma gera pelo "entrar como" que já existe, sem tela nova no painel
   admin.
7. **A página pública mostra o mínimo:** o nome da organização (para o cliente
   saber o que está conectando), o QR e o status. Nenhum dado de lead, número
   ou configuração.

## Segurança (regras do projeto: token e dados sensíveis)

- O token entra só no path, com `Referrer-Policy: no-referrer` (o `helmet` na
  API; conferir o Next) para não vazar em links externos.
- Limite de requisições por IP na rota pública, contra força bruta. O token de
  256 bits já é impraticável de adivinhar; o limite protege a API.
- A resposta é a mesma para token inválido, vencido ou já usado (`404`), sem
  dizer qual é o caso.
- Auditoria de `WHATSAPP_LINK_CRIADO` e `WHATSAPP_LINK_USADO`, com IP e
  aparelho vindos do contexto da requisição, que já existe.
- A rota pública não aceita desconectar nem enviar mensagens. Ela só inicia e
  consulta.

## Tarefas

Os detalhes estão em [`todo-link-whatsapp.md`](todo-link-whatsapp.md).

### Fase 1: o caminho completo
- [ ] T1: A equipe gera o link na tela de WhatsApp
- [ ] T2: O cliente abre o link, vê o QR e conecta

**Checkpoint 1:** no Render, gerar o link, abrir no celular de outra pessoa,
ler o QR e ver "Conectado" na plataforma.

### Fase 2: travas e acabamento
- [ ] T3: Uso único, organização já conectada e novo link invalidando o antigo
- [ ] T4: Auditoria e limite de requisições da rota pública
- [ ] T5: A plataforma atualiza para "Conectado" sozinha

**Checkpoint 2:** os critérios de segurança acima conferidos um a um, e
revisão humana.

## Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| O site no Render free dorme: a primeira abertura do link leva cerca de 50 s | Médio | Estado de "carregando" claro na página. Se incomodar, a página pode ser servida pela própria API, que fica sempre ligada (ver pergunta 2). |
| Link encaminhado a quem não devia | Médio | Validade de 24 h, uso único, um link por organização e auditoria. O pior caso é outra pessoa conectar um número à organização, o que aparece na tela e se desfaz desconectando. |
| O Redis free reinicia e os links ativos somem | Baixo | O cliente pede outro link. Nenhum dado se perde. |

## Perguntas em aberto

1. **Validade:** 24 h está bom, ou prefere menos (1 h) ou mais (7 dias)?
2. **Onde fica a página pública:** no **site** (mesmo visual da plataforma, e
   dorme no free) ou servida pela **API** (sempre ligada, abre na hora, visual
   simples)? A recomendação é o site, pelo visual. Se a espera de ~50 s
   incomodar, dá para mudar depois.
3. **Quem gera o link:** só dono/admin da organização (recomendado), ou também
   um botão no painel da plataforma, direto na lista de clientes?
