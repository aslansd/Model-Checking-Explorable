/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/**
 * A deliberately tiny Markdown renderer.
 *
 * The chapter narratives and the AI helper both return Markdown. Rendering it
 * as plain text meant learners saw literal `**asterisks**` and backticks.
 * This covers the subset actually used: headings, bullets, bold, italics and
 * inline code. It builds React elements rather than HTML strings, so nothing
 * from the model response can inject markup.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((chunk, i) => {
    const key = `${keyPrefix}-${i}`;
    if (chunk.startsWith('**') && chunk.endsWith('**')) {
      return <strong key={key} className="font-bold text-white">{chunk.slice(2, -2)}</strong>;
    }
    if (chunk.startsWith('`') && chunk.endsWith('`')) {
      return (
        <code
          key={key}
          className="code-fancy text-[0.95em] bg-slate-800/70 text-cyan-300 border border-slate-700 rounded px-1.5 py-0.5 mx-0.5 whitespace-nowrap"
        >
          {chunk.slice(1, -1)}
        </code>
      );
    }
    if (chunk.startsWith('*') && chunk.endsWith('*')) {
      return <em key={key} className="italic text-slate-400">{chunk.slice(1, -1)}</em>;
    }
    return <React.Fragment key={key}>{chunk}</React.Fragment>;
  });
}

interface MarkdownProps {
  children: string;
  className?: string;
}

export default function Markdown({ children, className = '' }: MarkdownProps) {
  const blocks = children.trim().split(/\n{2,}/);

  return (
    <div className={`flex flex-col gap-3.5 ${className}`}>
      {blocks.map((block, bi) => {
        const lines = block.split('\n');

        if (lines.every(l => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={bi} className="flex flex-col gap-1.5 pl-1">
              {lines.map((line, li) => (
                <li key={li} className="flex gap-2">
                  <span className="text-indigo-400 shrink-0 select-none">•</span>
                  <span>{renderInline(line.replace(/^\s*[-*]\s+/, ''), `${bi}-${li}`)}</span>
                </li>
              ))}
            </ul>
          );
        }

        const heading = block.match(/^(#{1,4})\s+(.*)$/);
        if (heading) {
          return (
            <h4 key={bi} className="title-fancy text-sm font-bold text-white">
              {renderInline(heading[2], `h-${bi}`)}
            </h4>
          );
        }

        return (
          <p key={bi} className="leading-relaxed">
            {lines.map((line, li) => (
              <React.Fragment key={li}>
                {li > 0 && <br />}
                {renderInline(line, `${bi}-${li}`)}
              </React.Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
