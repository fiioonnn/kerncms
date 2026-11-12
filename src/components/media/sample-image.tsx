import { cn } from "@/lib/utils";

/*
 * Stand-in "photo" for the UI until real uploads exist. Drawn with CSS so
 * filters and transforms in the image editor have something visible to act on.
 */

const palettes = [
  { sky: "#f3d9b1", wall: "#e6b98a", table: "#8a5a3b", tableDark: "#5e3a24", bread: "#c98a3e", crust: "#8b4f1d" },
  { sky: "#cfe3ea", wall: "#a9c7cf", table: "#d8c3a5", tableDark: "#b29a78", bread: "#d7a04f", crust: "#9a5a1e" },
  { sky: "#f6e6c8", wall: "#ecd2a4", table: "#6f7d5c", tableDark: "#4d5a3d", bread: "#e0b469", crust: "#a46a2a" },
  { sky: "#efd0c4", wall: "#e2a99a", table: "#7b4b3a", tableDark: "#553126", bread: "#d9a25a", crust: "#94561f" },
];

function hash(value: string) {
  let h = 0;
  for (const ch of value) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function SampleImage({
  name,
  className,
  style,
}: {
  name: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  if (name.endsWith(".svg")) {
    return (
      <div className={cn("@container flex items-center justify-center bg-white", className)} style={style}>
        <span className="flex aspect-square w-[38%] items-center justify-center rounded-[22%] bg-code text-[14cqw] font-bold text-white">
          BM
        </span>
      </div>
    );
  }

  const p = palettes.at(hash(name) % palettes.length)!;
  const shift = (hash(name) % 20) - 10;

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      style={{ background: `linear-gradient(180deg, ${p.sky} 0%, ${p.wall} 58%, ${p.table} 58%, ${p.tableDark} 100%)`, ...style }}
    >
      {/* window light */}
      <div
        className="absolute rounded-full opacity-70 blur-2xl"
        style={{ left: "62%", top: "-10%", width: "45%", height: "55%", background: "#fff6e0" }}
      />
      {/* loaves */}
      <div
        className="absolute rounded-[50%]"
        style={{
          left: `${18 + shift}%`,
          top: "48%",
          width: "44%",
          height: "30%",
          background: `radial-gradient(ellipse at 40% 30%, ${p.bread} 0%, ${p.crust} 75%)`,
          boxShadow: "0 18px 24px -12px rgba(0,0,0,0.45)",
        }}
      />
      <div
        className="absolute rounded-[50%]"
        style={{
          left: `${58 + shift / 2}%`,
          top: "58%",
          width: "26%",
          height: "20%",
          background: `radial-gradient(ellipse at 40% 30%, ${p.bread} 0%, ${p.crust} 80%)`,
          boxShadow: "0 14px 20px -10px rgba(0,0,0,0.45)",
        }}
      />
      {/* scoring lines on the big loaf */}
      <div
        className="absolute rounded-full opacity-60"
        style={{ left: `${30 + shift}%`, top: "56%", width: "20%", height: "2%", background: p.sky, transform: "rotate(-12deg)" }}
      />
      <div
        className="absolute rounded-full opacity-60"
        style={{ left: `${33 + shift}%`, top: "63%", width: "18%", height: "2%", background: p.sky, transform: "rotate(-12deg)" }}
      />
    </div>
  );
}
