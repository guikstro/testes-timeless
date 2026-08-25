-- CreateEnum
CREATE TYPE "WhatsAppConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('NEW');

-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'OTHER');

-- CreateEnum
CREATE TYPE "LeadEventType" AS ENUM ('LEAD_CREATED', 'CONVERSATION_STARTED', 'MESSAGE_RECEIVED');

-- CreateTable
CREATE TABLE "whatsapp_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "display_phone_number" TEXT NOT NULL,
    "access_token_encrypted" TEXT,
    "status" "WhatsAppConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "connected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disconnected_at" TIMESTAMP(3),
    "last_event_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "normalized_phone" TEXT NOT NULL,
    "raw_phone" TEXT NOT NULL,
    "name" TEXT,
    "status" "LeadStatus" NOT NULL DEFAULT 'NEW',
    "first_contact_at" TIMESTAMP(3) NOT NULL,
    "last_contact_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "whatsapp_connection_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_message_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "type" "MessageType" NOT NULL,
    "text" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lead_id" TEXT NOT NULL,
    "type" "LeadEventType" NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_organization_id_key" ON "whatsapp_connections"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_connections_phone_number_id_key" ON "whatsapp_connections"("phone_number_id");

-- CreateIndex
CREATE INDEX "leads_organization_id_last_contact_at_idx" ON "leads"("organization_id", "last_contact_at");

-- CreateIndex
CREATE UNIQUE INDEX "leads_organization_id_normalized_phone_key" ON "leads"("organization_id", "normalized_phone");

-- CreateIndex
CREATE INDEX "conversations_organization_id_idx" ON "conversations"("organization_id");

-- CreateIndex
CREATE INDEX "conversations_lead_id_idx" ON "conversations"("lead_id");

-- CreateIndex
CREATE UNIQUE INDEX "messages_external_id_key" ON "messages"("external_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_timestamp_idx" ON "messages"("conversation_id", "timestamp");

-- CreateIndex
CREATE INDEX "lead_events_lead_id_occurred_at_idx" ON "lead_events"("lead_id", "occurred_at");

-- AddForeignKey
ALTER TABLE "whatsapp_connections" ADD CONSTRAINT "whatsapp_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_whatsapp_connection_id_fkey" FOREIGN KEY ("whatsapp_connection_id") REFERENCES "whatsapp_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_events" ADD CONSTRAINT "lead_events_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
