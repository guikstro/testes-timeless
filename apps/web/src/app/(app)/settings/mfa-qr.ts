"use server";

import QRCode from "qrcode";

/**
 * Desenha o QR no servidor, a partir do endereço `otpauth://`.
 *
 * Aqui, e não num serviço externo: o endereço carrega o segredo do segundo
 * fator, e mandá-lo para um terceiro desenhar seria entregar a chave da
 * fechadura para alguém guardar.
 *
 * É também a única parte deste recurso que precisou de dependência. Gerar QR
 * envolve correção de erro Reed-Solomon, que não é algo que a stack já
 * resolva nem que valha escrever à mão.
 */
export async function desenhaQr(endereco: string): Promise<string> {
  return QRCode.toDataURL(endereco, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220,
    // Preto no branco sempre, inclusive no tema escuro: a câmera precisa de
    // contraste real, e um QR "elegante" que não lê é um QR quebrado.
    color: { dark: "#000000", light: "#FFFFFF" },
  });
}
