import glyphs from '../brand/glyphs.json';

/** The Z ♥ J wordmark, drawn as local vector paths (no font, no emoji). */
export function Wordmark({ height = 34, className }: { height?: number; className?: string }) {
  const [, , w, h] = glyphs.viewBox.split(' ').map(Number) as [number, number, number, number];
  return (
    <svg
      className={className}
      viewBox={glyphs.viewBox}
      height={height}
      width={Math.round((height * w) / h)}
      role="img"
      aria-label="Z heart J"
      focusable="false"
    >
      <path d={glyphs.swash} fill="none" stroke={glyphs.colors.swash} strokeWidth={glyphs.swashStrokeWidth} strokeLinecap="round" />
      <g fill="none" stroke={glyphs.colors.letters} strokeWidth={glyphs.letterStrokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <path d={glyphs.z} />
        <path d={glyphs.jBar} />
        <path d={glyphs.jStem} />
      </g>
      <path fill={glyphs.colors.heart} transform={glyphs.heartTransform} d={glyphs.heart} />
    </svg>
  );
}
