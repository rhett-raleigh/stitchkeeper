import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { setPatternPhoto } from "@/app/actions";
import { getPattern } from "@/lib/db";
import { photoChoices } from "@/lib/extractor";
import { getFile, getJson, putExtracted, putJson } from "@/lib/files";

export default async function ChoosePhotoPage({ params }: PageProps<"/patterns/[id]/photo">) {
  await connection();
  const record = await getPattern(Number((await params).id));
  if (!record?.sourceFile) notFound();
  const sourceFile = record.sourceFile;

  const hash = sourceFile.replace(/\.pdf$/, "");
  const pages = record.sourcePages ?? { first: 1, last: 1 };
  // Pattern books put the finished-piece photo on the page before the title.
  const range = { first: Math.max(1, pages.first - 1), last: pages.last };
  // Extracted on first visit (that can take a while for a big PDF), then remembered in R2.
  const key = `choices/${hash}-${range.first}-${range.last}.json`;
  const choices =
    (await getJson<{ photos: string[]; pageRenders: string[] }>(key)) ??
    (await (async () => {
      const pdf = await getFile(sourceFile);
      if (!pdf) notFound();
      const { files, ...names } = await photoChoices(await pdf.arrayBuffer(), hash, range);
      await putExtracted(files);
      await putJson(key, names);
      return names;
    })());
  const photos = choices.photos.map((name) => `/files/${name}`);
  const pageRenders = choices.pageRenders.map((name) => `/files/${name}`);

  const option = (url: string, label: string) => (
    <li key={url}>
      <form action={setPatternPhoto.bind(null, record.id, url)}>
        <button
          className={`group block w-full overflow-hidden rounded-2xl border bg-card text-left transition hover:border-yarn ${
            url === record.imageUrl ? "border-yarn ring-2 ring-yarn" : "border-line"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
          <span className="block px-3 py-2 text-xs text-muted">{url === record.imageUrl ? "Current photo" : label}</span>
        </button>
      </form>
    </li>
  );

  return (
    <div className="pt-6">
      <Link href={`/patterns/${record.id}`} className="text-sm text-muted underline">
        ← {record.title}
      </Link>
      <h1 className="mt-3 font-display text-3xl font-semibold">Choose a photo</h1>
      <p className="mt-1 text-muted">
        From {range.first === range.last ? `page ${range.first}` : `pages ${range.first}–${range.last}`} of the PDF.
      </p>

      {photos.length > 0 && (
        <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((url) => option(url, `Photo, page ${url.match(/-p(\d+)/)?.[1]}`))}
        </ul>
      )}
      <h2 className="mt-10 font-display text-xl font-semibold">Or use a whole page</h2>
      <ul className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {pageRenders.map((url) => option(url, `Page ${url.match(/-p(\d+)/)?.[1]}`))}
      </ul>
      {record.imageUrl && (
        <form action={setPatternPhoto.bind(null, record.id, null)} className="mt-8">
          <button className="rounded-full border border-line px-5 py-2.5 text-sm text-muted hover:border-yarn hover:text-yarn">
            No photo
          </button>
        </form>
      )}
    </div>
  );
}
