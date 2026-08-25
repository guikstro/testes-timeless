# Integração com WhatsApp

> **Status: não implementado ainda.** Chega na Fase 3.

## O que vai entrar aqui quando a Fase 3 for concluída

- Qual estratégia de conexão foi escolhida (WhatsApp Business Platform /
  Cloud API oficial, e/ou conexão compatível com WhatsApp Web via QR Code) e
  por quê, com riscos, estabilidade e limitações documentados explicitamente
  antes de qualquer solução não oficial ser considerada.
- A abstração `WhatsAppProvider` e como ela evita acoplar o produto a um
  único método de conexão.
- Fluxo de conexão (tela Configurações → WhatsApp: status, número, última
  sincronização, conectar/desconectar).
- Como a ingestão de mensagens é idempotente (um evento recebido duas vezes
  nunca cria dois leads).
- Normalização de telefone (E.164) e estratégia de deduplicação de leads.

## Credenciais necessárias para homologação real

Já presentes em `.env.example`, ainda sem efeito:

- `WHATSAPP_PROVIDER`, `WHATSAPP_CLOUD_API_TOKEN`,
  `WHATSAPP_CLOUD_API_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
  `WHATSAPP_APP_SECRET` — obtidas no Meta for Developers / WhatsApp Business
  Platform, necessárias apenas quando esta fase for implementada.
