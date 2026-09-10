import type { Site, SocialObjects } from "./types";
export const SITE: Site = {
  website: "https://salviogoncalves.com.br", // replace this with your deployed domain
  author: "Salvio Gonçalves",
  desc: "Salvio Gonçalves, terapeuta. Reflexões sobre ansiedade, procrastinação, autoconhecimento e saúde emocional. Um espaço de acolhimento para uma vida mais leve.",
  title: "Salvio Gonçalves",
  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerPage: 12,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
};
export const LOCALE = { lang: "pt-br", langTag: ["pt-BR"] } as const;
export const LOGO_IMAGE = { enable: true, svg: true, width: 300, height: 72 };
export const SOCIALS: SocialObjects = [
  { name: "Instagram", href: "https://instagram.com/salviogoncalvesoficial", linkTitle: "Salvio Gonçalves no Instagram", active: true },
  { name: "Mail", href: "mailto:contato@salviogoncalves.com.br", linkTitle: "Enviar e-mail para Salvio Gonçalves", active: true },
  { name: "WhatsApp", href: "https://wa.me/55SEUNUMERO", linkTitle: "Salvio Gonçalves no WhatsApp", active: false },
];
