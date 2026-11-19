import React from 'react';

interface MarkdownWithCitationsProps {
  markdown: string;
  onCitationClick: (sourceId: number) => void;
}

export function renderInlineWithCitations(
  text: string,
  onCitationClick: (sourceId: number) => void
): React.ReactNode[] {
  const tokenRegex =
    /(\[\d+(?:\s*,\s*\d+)*\]|\[[^\]]+\]\(https?:\/\/[^)]+\)|\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

  const parts = text.split(tokenRegex);
  return parts.map((part, idx) => {
    if (!part) return null;

    const citMatch = part.match(/^\[(\d+(?:\s*,\s*\d+)*)\]$/);
    if (citMatch) {
      const nums = citMatch[1].split(',').map((n) => Number(n.trim()));
      return (
        <span key={idx} className="inline-flex items-baseline gap-0.5 mx-0.5">
          {nums.map((num, nIdx) => (
            <button
              key={`${idx}-${nIdx}`}
              type="button"
              onClick={() => onCitationClick(num)}
              className="font-mono text-[11px] font-medium text-sky-400 hover:text-sky-300 hover:underline cursor-pointer tabular-nums"
            >
              [{num}]
            </button>
          ))}
        </span>
      );
    }

    const linkMatch = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
        >
          {linkMatch[1]}
        </a>
      );
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={idx}>{part.slice(2, -2)}</strong>;
    }

    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={idx}>{part.slice(1, -1)}</code>;
    }

    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={idx}>{part.slice(1, -1)}</em>;
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

export function MarkdownWithCitations({
  markdown,
  onCitationClick,
}: MarkdownWithCitationsProps) {
  if (!markdown.trim()) return null;

  const lines = markdown.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      i++;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      blocks.push(
        <pre key={`code-${i}`}>
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (
      trimmed.startsWith('|') &&
      i + 1 < lines.length &&
      /^\s*\|[\s:-]+\|/.test(lines[i + 1])
    ) {
      const headers = trimmed
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        rows.push(
          lines[i]
            .trim()
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim())
        );
        i++;
      }
      blocks.push(
        <div key={`table-${i}`} className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {headers.map((h, hIdx) => (
                  <th key={hIdx}>{renderInlineWithCitations(h, onCitationClick)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((cell, cIdx) => (
                    <td key={cIdx}>{renderInlineWithCitations(cell, onCitationClick)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3 key={`h3-${i}`}>
          {renderInlineWithCitations(trimmed.slice(4), onCitationClick)}
        </h3>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      blocks.push(
        <h2 key={`h2-${i}`}>
          {renderInlineWithCitations(trimmed.slice(3), onCitationClick)}
        </h2>
      );
      i++;
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1 key={`h1-${i}`}>
          {renderInlineWithCitations(trimmed.slice(2), onCitationClick)}
        </h1>
      );
      i++;
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      blocks.push(
        <ul key={`ul-${i}`}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineWithCitations(item, onCitationClick)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={`ol-${i}`}>
          {items.map((item, idx) => (
            <li key={idx}>{renderInlineWithCitations(item, onCitationClick)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (trimmed.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('> ')) {
        quoteLines.push(lines[i].trim().slice(2));
        i++;
      }
      blocks.push(
        <blockquote key={`bq-${i}`}>
          {renderInlineWithCitations(quoteLines.join(' '), onCitationClick)}
        </blockquote>
      );
      continue;
    }

    const paraLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('|') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('> ') &&
      !/^[-*•]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }

    blocks.push(
      <p key={`p-${i}`}>
        {renderInlineWithCitations(paraLines.join(' '), onCitationClick)}
      </p>
    );
  }

  return <div className="research-prose">{blocks}</div>;
}
