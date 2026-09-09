import { slugifyStr } from "@utils/slugify";
import Datetime from "./Datetime";
import type { CollectionEntry } from "astro:content";
export interface Props {
  href?: string;
  frontmatter: CollectionEntry<"blog">["data"];
  secHeading?: boolean;
  image?: string;
  className?: string;
}
export default function Card({
  href,
  frontmatter,
  secHeading = true,
  image,
  className,
}: Props) {
  const { title, pubDatetime, modDatetime, description, ogImage } =
    frontmatter;
  const coverImage =
    (typeof ogImage === "string" ? ogImage : ogImage?.src) ?? image;
  const headerProps = {
    style: { viewTransitionName: slugifyStr(title) },
    className: "text-lg font-medium decoration-dashed hover:underline",
  };
  return (
    <li className={className ?? "my-6"}>
      {coverImage && (
        <a
          href={href}
          className="mb-3 block overflow-hidden rounded-2xl border border-skin-line"
        >
          <img
            src={coverImage}
            alt={title}
            loading="lazy"
            className="aspect-[16/9] w-full object-cover"
          />
        </a>
      )}
      <a
        href={href}
        className="inline-block text-lg font-medium text-skin-accent decoration-dashed underline-offset-4 focus-visible:no-underline focus-visible:underline-offset-0"
      >
        {secHeading ? (
          <h2 {...headerProps}>{title}</h2>
        ) : (
          <h3 {...headerProps}>{title}</h3>
        )}
      </a>
      <Datetime pubDatetime={pubDatetime} modDatetime={modDatetime} />
      <p>{description}</p>
    </li>
  );
}
