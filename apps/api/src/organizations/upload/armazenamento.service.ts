import { Injectable, Logger } from "@nestjs/common";
import { createHash, randomBytes } from "crypto";
import { mkdir, readFile, unlink, writeFile } from "fs/promises";
import { join, normalize } from "path";
import { ImagemValida } from "./imagem-enviada";

/**
 * Onde as imagens enviadas ficam.
 *
 * Disco local montado em volume, e não objeto em nuvem: acrescentar S3 aqui
 * exigiria credenciais que este produto ainda não tem, e a logo de uma
 * organização é um arquivo pequeno que raramente muda. Trocar depois é
 * substituir esta classe, não reescrever as telas.
 */
const PASTA = process.env.UPLOAD_DIR ?? "/app/uploads";

/** Só o que a validação de imagem aceita chega até aqui. */
const TIPO_POR_EXTENSAO: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp",
};

@Injectable()
export class ArmazenamentoService {
  private readonly logger = new Logger(ArmazenamentoService.name);

  /**
   * Grava e devolve o nome do arquivo.
   *
   * O nome é sorteado, nunca vindo do cliente: um nome escolhido por quem
   * envia permitiria sobrescrever o arquivo de outra organização, ou escapar
   * da pasta com `../`.
   */
  async guardar(imagem: ImagemValida): Promise<string> {
    await mkdir(PASTA, { recursive: true });
    const nome = `${randomBytes(16).toString("hex")}.${imagem.extensao}`;
    await writeFile(join(PASTA, nome), imagem.bytes);
    return nome;
  }

  /**
   * Lê um arquivo, recusando qualquer caminho que não seja um nome simples.
   *
   * A conferência é por formato, e não por normalização: aceitar só
   * hexadecimal mais extensão conhecida elimina de uma vez `..`, barras,
   * bytes nulos e nomes absolutos.
   */
  async ler(nome: string): Promise<{ bytes: Buffer; tipo: string } | null> {
    const casamento = /^([0-9a-f]{32})\.(png|jpg|webp)$/.exec(nome);
    if (!casamento) return null;

    const caminho = join(PASTA, `${casamento[1]}.${casamento[2]}`);
    // Cinto e suspensório: mesmo com o formato conferido, o caminho final
    // precisa continuar dentro da pasta.
    if (!normalize(caminho).startsWith(normalize(PASTA))) return null;

    try {
      const bytes = await readFile(caminho);
      return { bytes, tipo: TIPO_POR_EXTENSAO[casamento[2]] };
    } catch {
      return null;
    }
  }

  /**
   * Apaga um arquivo nosso, se a URL apontar para um.
   *
   * Falhar aqui não pode derrubar a troca de logo: o pior caso é um arquivo
   * órfão ocupando alguns quilobytes, e o melhor caso de uma exceção seria o
   * cliente não conseguir trocar a própria marca.
   */
  async apagarPelaUrl(url: string | null): Promise<void> {
    if (!url) return;
    const nome = url.split("/").pop() ?? "";
    if (!/^[0-9a-f]{32}\.(png|jpg|webp)$/.test(nome)) return;

    try {
      await unlink(join(PASTA, nome));
    } catch (erro) {
      this.logger.warn(JSON.stringify({ event: "arquivo_orfao", nome, error: String(erro) }));
    }
  }

  /** Etag estável para o navegador não rebaixar a mesma logo toda vez. */
  etagDe(bytes: Buffer): string {
    return `"${createHash("sha1").update(bytes).digest("hex")}"`;
  }
}
