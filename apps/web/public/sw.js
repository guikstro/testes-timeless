/*
  Recebe os avisos de mensagem nova mesmo com o sistema fechado.

  Arquivo estático de propósito: o navegador exige que um service worker seja
  servido como está, no endereço raiz. Não faz cache de nada, só avisos.
*/
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  let aviso = {};
  try {
    aviso = evento.data ? evento.data.json() : {};
  } catch {
    aviso = { title: "Nova mensagem", body: evento.data ? evento.data.text() : "" };
  }

  const titulo = aviso.title || "Nova mensagem";
  evento.waitUntil(
    self.registration.showNotification(titulo, {
      body: aviso.body || "",
      icon: "/icon.svg",
      // Avisos do mesmo lead se substituem em vez de empilhar.
      tag: aviso.tag || undefined,
      renotify: Boolean(aviso.tag),
      data: { url: aviso.url || "/conversas" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL((evento.notification.data && evento.notification.data.url) || "/conversas", self.location.origin).href;

  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (janelas) => {
      // Reaproveita uma aba do sistema já aberta em vez de abrir outra.
      for (const janela of janelas) {
        if (new URL(janela.url).origin === self.location.origin && "navigate" in janela) {
          await janela.navigate(destino);
          return janela.focus();
        }
      }
      return self.clients.openWindow(destino);
    }),
  );
});
