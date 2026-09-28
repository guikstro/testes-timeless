import { pode } from "./permissoes";

describe("pode", () => {
  it("responde pelo que a API mandou na sessão", () => {
    expect(pode({ capacidades: ["audit.read"] }, "audit.read")).toBe(true);
    expect(pode({ capacidades: ["audit.read"] }, "ad.manage")).toBe(false);
  });

  it("sessão sem a lista não pode nada", () => {
    expect(pode({}, "member.manage")).toBe(false);
  });
});
