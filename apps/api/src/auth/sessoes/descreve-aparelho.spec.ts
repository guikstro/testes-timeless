import { descreveAparelho, rotuloDoAparelho } from "./descreve-aparelho";

/*
  User agents reais, copiados de navegadores em uso. O formato é hostil de
  propósito: todo navegador se declara compatível com os outros, e a leitura
  só funciona se perguntar pelo mais específico primeiro.
*/
const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:130.0) Gecko/20100101 Firefox/130.0",
  safariIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  chromeIphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/129.0.6668.46 Mobile/15E148 Safari/604.1",
  samsung:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
};

describe("descreveAparelho", () => {
  it.each([
    [UA.chromeMac, "Chrome no macOS"],
    [UA.safariMac, "Safari no macOS"],
    [UA.firefoxLinux, "Firefox no Linux"],
    [UA.safariIphone, "Safari no iPhone"],
    [UA.chromeAndroid, "Chrome no Android"],
  ])("reconhece %#", (ua, esperado) => {
    expect(rotuloDoAparelho(descreveAparelho(ua))).toBe(esperado);
  });

  it("não confunde Edge com Chrome, embora o Edge se anuncie como Chrome", () => {
    expect(rotuloDoAparelho(descreveAparelho(UA.edgeWindows))).toBe("Edge no Windows");
  });

  it("não confunde Chrome com Safari, embora o Chrome se anuncie como Safari", () => {
    expect(descreveAparelho(UA.chromeMac).navegador).toBe("Chrome");
  });

  it("reconhece o Chrome do iPhone, que se chama CriOS", () => {
    expect(rotuloDoAparelho(descreveAparelho(UA.chromeIphone))).toBe("Chrome no iPhone");
  });

  it("não confunde o navegador da Samsung com o Chrome em que ele se baseia", () => {
    expect(descreveAparelho(UA.samsung).navegador).toBe("Samsung Internet");
  });

  it("marca o que é telefone", () => {
    expect(descreveAparelho(UA.safariIphone).movel).toBe(true);
    expect(descreveAparelho(UA.chromeAndroid).movel).toBe(true);
    expect(descreveAparelho(UA.chromeMac).movel).toBe(false);
  });

  describe("quando não reconhece", () => {
    it("diz que não reconhece, em vez de adivinhar", () => {
      expect(rotuloDoAparelho(descreveAparelho(null))).toBe("Aparelho não identificado");
      expect(rotuloDoAparelho(descreveAparelho(""))).toBe("Aparelho não identificado");
      expect(rotuloDoAparelho(descreveAparelho("curl/8.4.0"))).toBe("Aparelho não identificado");
    });

    it("aproveita o que der para aproveitar", () => {
      expect(rotuloDoAparelho(descreveAparelho("AlgumNavegador (Windows NT 10.0)"))).toBe("Navegador no Windows");
    });
  });
});
