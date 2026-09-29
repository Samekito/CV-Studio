// Builds an editable Word file from a Cv in the browser, laid out like the existing
// original hand-made CV files: centred name, headline, contact line, ruled section titles.
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { Cv } from "./types";

const FONT = "Calibri";

function sectionTitle(title: string): Paragraph {
  return new Paragraph({
    spacing: { before: 240, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "999999", space: 2 } },
    children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 22, font: FONT })],
  });
}

function line(text: string, opts: { bold?: boolean; italics?: boolean; size?: number } = {}): Paragraph {
  return new Paragraph({
    spacing: { after: 40 },
    children: [new TextRun({ text, font: FONT, size: opts.size ?? 20, bold: opts.bold, italics: opts.italics })],
  });
}

export function buildCvDocument(cv: Cv): Document {
  const children: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: cv.name, bold: true, size: 32, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [new TextRun({ text: cv.headline, bold: true, size: 21, font: FONT })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: cv.contact.join(" | "), size: 18, font: FONT })],
    }),
    sectionTitle("Summary"),
    line(cv.summary),
  ];

  for (const section of cv.sections) {
    children.push(sectionTitle(section.title));
    for (const item of section.items) {
      if (item.heading) {
        children.push(
          new Paragraph({
            spacing: { before: 100, after: 20 },
            children: [
              new TextRun({ text: item.heading, bold: true, size: 20, font: FONT }),
              ...(item.subheading ? [new TextRun({ text: ` | ${item.subheading}`, size: 20, font: FONT })] : []),
            ],
          }),
        );
      } else if (item.subheading) {
        children.push(line(item.subheading, { italics: true }));
      }
      if (item.meta) children.push(line(item.meta, { italics: true, size: 18 }));
      if (item.text) children.push(line(item.text));
      for (const bullet of item.bullets ?? []) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 30 },
            children: [new TextRun({ text: bullet, size: 20, font: FONT })],
          }),
        );
      }
    }
  }

  return new Document({
    creator: cv.name,
    title: `${cv.name} CV`,
    sections: [
      {
        properties: { page: { margin: { top: 720, bottom: 720, left: 900, right: 900 } } },
        children,
      },
    ],
  });
}

export function buildLetterDocument(name: string, letter: string): Document {
  return new Document({
    creator: name,
    title: `${name} cover letter`,
    sections: [
      {
        properties: { page: { margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } } },
        children: letter
          .split(/\n{2,}/)
          .map((para) => new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: para.trim(), font: FONT, size: 22 })] })),
      },
    ],
  });
}

export async function downloadDocx(doc: Document, filename: string): Promise<void> {
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
