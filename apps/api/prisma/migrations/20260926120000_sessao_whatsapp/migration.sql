-- Sessão do WhatsApp por QR Code, guardada no banco para sobreviver a deploy.
CREATE TABLE "sessoes_whatsapp" (
    "instance_name" TEXT NOT NULL,
    "chave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessoes_whatsapp_pkey" PRIMARY KEY ("instance_name","chave")
);

-- O Supabase publica o schema public pela Data API. Sem RLS, esta tabela
-- seria legível com a chave anon. A API conecta como dona da tabela e não é
-- afetada; sem política nenhuma, todo o resto fica de fora.
ALTER TABLE "sessoes_whatsapp" ENABLE ROW LEVEL SECURITY;
