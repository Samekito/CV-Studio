// On-screen and print rendering of a Cv. Mirrors the .docx layout in lib/docx.ts.
import type { Cv } from "@/lib/types";

export default function CvPreview({ cv }: { cv: Cv }) {
  return (
    <article className="cv-sheet rounded-lg border border-border bg-white p-8 text-[13px] leading-relaxed text-black shadow-sm">
      <header className="mb-3 text-center">
        <h2 className="text-xl font-bold tracking-wide">{cv.name}</h2>
        <p className="font-semibold">{cv.headline}</p>
        <p className="text-xs text-neutral-600">{cv.contact.join(" | ")}</p>
      </header>

      <Section title="Summary">
        <p>{cv.summary}</p>
      </Section>

      {cv.sections.map((section, i) => (
        <Section key={`${section.title}-${i}`} title={section.title}>
          {section.items.map((item, j) => (
            <div key={j} className="mb-2 break-inside-avoid">
              {item.heading && (
                <p>
                  <strong>{item.heading}</strong>
                  {item.subheading && <span> | {item.subheading}</span>}
                </p>
              )}
              {!item.heading && item.subheading && <p className="italic">{item.subheading}</p>}
              {item.meta && <p className="text-xs italic text-neutral-600">{item.meta}</p>}
              {item.text && <p>{item.text}</p>}
              {item.bullets && item.bullets.length > 0 && (
                <ul className="ml-5 list-disc">
                  {item.bullets.map((b, k) => (
                    <li key={k}>{b}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>
      ))}
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-3">
      <h3 className="mb-1 border-b border-neutral-400 text-sm font-bold uppercase tracking-wide">{title}</h3>
      {children}
    </section>
  );
}
