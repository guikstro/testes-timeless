import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { randomUUID } from "node:crypto";
import { SalesWorkspace } from "./sales-workspace";

describe("SalesWorkspace form submissions", () => {
  const sale = {
    id: "00000000-0000-4000-8000-000000000001",
    status: "POSSIBLE",
    amountCents: 85000,
    currency: "BRL",
    confidence: 0.55,
    needsReview: true,
    confirmationSource: "CONVERSATION",
    confirmedAt: null,
    customerName: "Maria",
    customerPhone: null,
    occurredAt: null,
    lead: null,
    source: null,
    unit: null,
    evidence: [],
    conflicts: [],
  };
  const fetchMock = jest.fn();
  beforeEach(() => {
    Object.defineProperty(crypto, "randomUUID", {
      configurable: true,
      value: randomUUID,
    });
    global.fetch = fetchMock;
    fetchMock
      .mockReset()
      .mockImplementation(async (url: string, options?: RequestInit) => ({
        ok: true,
        json: async () =>
          options?.method === "POST"
            ? { ...sale, needsReview: false }
            : url.includes("list?")
              ? { items: [sale], total: 1 }
              : url.endsWith("units")
                ? []
                : sale,
      }));
  });

  it("registers a sale without sending a fictional unit when no units exist", async () => {
    render(<SalesWorkspace canManage canAnalyze={false} />);
    await screen.findByText("Maria");
    fireEvent.click(
      screen.getByRole("button", { name: /^Registrar venda$/ }),
    );
    fireEvent.change(screen.getByLabelText("Cliente"), {
      target: { value: "Maria" },
    });
    fireEvent.change(screen.getByLabelText("Valor", { exact: true }), {
      target: { value: "850,00" },
    });
    fireEvent.change(screen.getByLabelText("Data e hora"), {
      target: { value: "2026-10-07T14:30" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar e registrar" }),
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "POST"),
      ).toBe(true),
    );
    const [, options] = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "POST",
    )!;
    expect(JSON.parse(options.body)).toEqual(
      expect.objectContaining({ valueCents: 85000, currency: "BRL" }),
    );
    expect(JSON.parse(options.body)).not.toHaveProperty("unitCode");
    await screen.findByText("Venda registrada com confirmação manual.");
  });

  it("confirms an ordinary candidate without sending a null evidence ID", async () => {
    render(<SalesWorkspace canManage canAnalyze={false} />);
    fireEvent.click(await screen.findByRole("button", { name: "Evidências" }));
    const button = await screen.findByRole("button", {
      name: "Confirmar / corrigir valor",
    });
    // jsdom 20 does not populate SubmitEvent.submitter when clicking a button.
    const submission = new Event("submit", { bubbles: true, cancelable: true });
    Object.defineProperty(submission, "submitter", { value: button });
    fireEvent(button.closest("form")!, submission);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([, options]) => options?.method === "POST"),
      ).toBe(true),
    );
    const [, options] = fetchMock.mock.calls.find(
      ([, options]) => options?.method === "POST",
    )!;
    const body = JSON.parse(options.body);
    expect(body).toEqual(
      expect.objectContaining({ action: "CONFIRM", valueCents: 85000 }),
    );
    expect(body).not.toHaveProperty("selectedEvidenceId");
    await screen.findByText("Revisão registrada na auditoria.");
  });
});
