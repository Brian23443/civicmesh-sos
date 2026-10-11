import type { CSSProperties } from 'react';

const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWER = 'abcdefghijklmnopqrstuvwxyz';

/** Glyphs a reel passes through before landing: deterministic (same every load), same case as the target. */
function reel(target: string, index: number): string[] {
  const set = target === target.toUpperCase() && target !== target.toLowerCase() ? UPPER : LOWER;
  const steps = 7 + index * 2; // later letters spin longer, so they land in order
  const start = (target.toLowerCase().charCodeAt(0) * 7 + index * 11) % set.length;
  return [...Array.from({ length: steps }, (_, k) => set[(start + k * 5) % set.length]), target];
}

/**
 * Odometer text: every letter rolls vertically through a reel of glyphs and lands on the right one,
 * left to right. Screen readers get the plain word; prefers-reduced-motion shows it static (CSS).
 */
export function Odometer({ text, className = '' }: { text: string; className?: string }) {
  return <span className={`odometer ${className}`}>
    <span className="sr-only">{text}</span>
    {[...text].map((char, i) => {
      const glyphs = reel(char, i);
      const style = { '--steps': glyphs.length - 1, '--i': i } as CSSProperties;
      return <span aria-hidden="true" className="odometer-slot" key={i} style={style}>
        <span className="odometer-sizer">{char}</span>
        <span className="odometer-reel">{glyphs.map((g, k) => <span key={k}>{g}</span>)}</span>
      </span>;
    })}
  </span>;
}
