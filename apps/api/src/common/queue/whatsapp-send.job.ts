/**
 * Shape of jobs on the `whatsapp-send` queue — shared by the API (producer)
 * and worker (consumer).
 *
 * Carrega só o id da `Message` já persistida, nunca o texto: a mensagem é
 * gravada como PENDING *antes* de enfileirar, então o worker relê o estado
 * atual do banco na hora de enviar. Isso é o que impede uma tentativa
 * atrasada de reenviar algo que já foi enviado (mesma lição da Fase 7).
 */
export interface WhatsAppSendJob {
  messageId: string;
}
