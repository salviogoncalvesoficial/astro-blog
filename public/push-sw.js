self.addEventListener("push", event => {
  let data = { title: "Inbox do Salvio", body: "Você recebeu uma nova mensagem", url: "/admin/" };
  try { data = { ...data, ...(event.data ? event.data.json() : {}) }; } catch {}
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: "/1789058902899-favicon.png", badge: "/1789058902899-favicon.png", tag: "inbox-message", data: { url: data.url }, vibrate: [100, 50, 100] }));
});
self.addEventListener("notificationclick", event => { event.notification.close(); const url = new URL(event.notification.data?.url || "/admin/", self.location.origin).href; event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => { const c = list.find(x => x.url.startsWith(self.location.origin + "/admin")); return c ? c.focus().then(() => c.navigate(url)) : clients.openWindow(url); })); });
