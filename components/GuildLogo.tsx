/**
 * GUILD のロゴマーク。
 * Discord のサーバーアイコンを SVG で起こしたもの（元画像は「阪大選抜型」だったが、
 * 阪大 × 京大 のコミュニティなので同じ書体・色で「京大」を並べている）。
 *
 * 画像ファイルに差し替えたくなったら public/ に置いて <Image> にするだけでよい。
 */
export default function GuildLogo({
  className = "h-10 w-10",
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="阪大・京大選抜型 AIコミュニティ GUILD"
    >
      <circle cx="100" cy="100" r="100" fill="#070707" />
      <g
        fontFamily='"Hiragino Mincho ProN", "Yu Mincho", "MS Mincho", serif'
        textAnchor="middle"
      >
        <text
          x="100"
          y="76"
          fontSize="21"
          fill="#f2d271"
          textLength="150"
          lengthAdjust="spacingAndGlyphs"
        >
          阪大・京大選抜型
        </text>
        <text
          x="100"
          y="108"
          fontSize="21"
          fill="#f2d271"
          textLength="150"
          lengthAdjust="spacingAndGlyphs"
        >
          AIコミュニティ
        </text>
        <text
          x="100"
          y="164"
          fontSize="52"
          fill="#ffffff"
          textLength="160"
          lengthAdjust="spacingAndGlyphs"
        >
          GUILD
        </text>
      </g>
    </svg>
  );
}
