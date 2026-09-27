/**
 * Lê um arquivo de texto respeitando a codificação dele.
 *
 * `File.text()` supõe UTF-8, e o "CSV para Excel" do Google Ads vem em UTF-16:
 * lido como UTF-8, cada letra vira letra e byte nulo, e nenhuma coluna é
 * reconhecida. A marca no começo do arquivo diz qual é.
 */
export function decodificaTexto(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8").decode(bytes);
}

export async function leArquivoDeTexto(arquivo: Blob): Promise<string> {
  return decodificaTexto(new Uint8Array(await arquivo.arrayBuffer()));
}
