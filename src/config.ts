import type { Site, SocialObjects } from "./types";
export const SITE: Site = {
  website: "https://salviogoncalves.com.br", // replace this with your deployed domain
  author: "Salvio Gonçalves",
  desc: "Salvio Gonçalves, terapeuta. Reflexões sobre ansiedade, procrastinação, autoconhecimento e saúde emocional. Um espaço de acolhimento para uma vida mais leve.",
  title: "Salvio Gonçalves",
  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerPage: 3,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
};
export const LOCALE = {
  lang: "pt-br", // html lang code. Set this empty and default will be "en"
  langTag: ["pt-BR"], // BCP 47 Language Tags. Set this empty [] to use the environment default
} as const;
export const LOGO_IMAGE = {
  enable: false,
  svg: true,
  width: 216,
  height: 46,
};
export const SOCIALS: SocialObjects = [
  {
    name: "Instagram",
    href: "https://instagram.com/SEU_USUARIO", // troque SEU_USUARIO pelo seu perfil real
    linkTitle: `Salvio Gonçalves no Instagram`,
    active: true,
  },
  {
    name: "Mail",
    href: "mailto:contato@salviogoncalves.com.br",
    linkTitle: `Enviar e-mail para Salvio Gonçalves`,
    active: true,
  },
  {
    name: "WhatsApp",
    href: "https://wa.me/55SEUNUMERO", // quando me passar o número, ativo
    linkTitle: `Salvio Gonçalves no WhatsApp`,
    active: false,
  },
];
