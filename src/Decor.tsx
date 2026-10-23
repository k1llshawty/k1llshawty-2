import { Snowflake } from "lucide-react";
import { useTheme } from "./theme";

const Pumpkin = ({ s = 28 }: { s?: number }) => (
  <svg className="pumpkin" width={s} height={s} viewBox="0 0 32 32" aria-hidden>
    <rect x="14.5" y="3" width="3" height="6" rx="1" fill="#6b7a45" />
    <ellipse cx="16" cy="19" rx="13" ry="10.5" fill="#b9682d" /><ellipse cx="16" cy="19" rx="6" ry="10.5" fill="#cc7a35" />
    <path d="M9 16l3 4-5 0zM23 16l3 4-5 0zM10 24q6 4 12 0-6 1.5-12 0z" fill="#1a130d" />
  </svg>);
const Ghost = ({ s = 30 }: { s?: number }) => (
  <svg className="ghost" width={s} height={s} viewBox="0 0 32 32" aria-hidden>
    <path d="M6 28V14a10 10 0 0120 0v14l-3.3-3-3.4 3-3.3-3-3.3 3-3.4-3z" fill="#d8dadf" />
    <circle cx="12.5" cy="14" r="2" fill="#18191c" /><circle cx="19.5" cy="14" r="2" fill="#18191c" />
  </svg>);
const Bat = ({ style }: { style: React.CSSProperties }) => (
  <svg className="bat" style={style} width="26" height="14" viewBox="0 0 26 14" aria-hidden><path d="M13 5l2-3 1 4c3-4 7-4 10-3-2 1-3 3-3 5-2-1-4 0-5 2-1-2-2-2-4-1-2-1-3-1-4 1-1-2-3-3-5-2 0-2-1-4-3-5 3-1 7-1 10 3l1-4z" fill="#0a0a0b" opacity=".75" /></svg>);
const Web = () => (
  <svg className="web" width="84" height="84" viewBox="0 0 84 84" aria-hidden fill="none" stroke="#fff" strokeWidth="1" opacity=".16">
    <path d="M0 0L84 0M0 0L0 84M0 0L70 50M0 0L50 70M0 0L80 22M0 0L22 80" /><path d="M20 0Q14 14 0 20M40 0Q28 28 0 40M62 0Q42 42 0 62" />
  </svg>);
const Snowman = ({ s = 38 }: { s?: number }) => (
  <svg className="snowman" width={s} height={s * 1.25} viewBox="0 0 32 40" aria-hidden>
    <circle cx="16" cy="29" r="10" fill="#e9ebef" /><circle cx="16" cy="13" r="7" fill="#e9ebef" />
    <circle cx="13.5" cy="12" r="1" fill="#222" /><circle cx="18.5" cy="12" r="1" fill="#222" /><path d="M16 14l4 1.2-4 .8z" fill="#c67a3c" />
    <rect x="9" y="19" width="14" height="2.4" rx="1.2" fill="#7b7e86" /><circle cx="16" cy="27" r="1" fill="#555" /><circle cx="16" cy="31" r="1" fill="#555" />
  </svg>);

const FLAKES = Array.from({ length: 16 }, (_, i) => ({ x: `${(i * 37 + 7) % 100}%`, s: `${3 + (i % 3)}px`, d: `${16 + (i * 5) % 14}s`, dl: `-${(i * 3) % 17}s`, y: `${(i * 23 + 11) % 95}%`, dx: `${(i % 2 ? 1 : -1) * (14 + (i % 4) * 6)}px` }));

/** Глобальный декоративный слой: не принимает клики и не меняет цвета интерфейса */
export function DecorLayer() {
  const t = useTheme();
  if (t === "default") return null;
  return (
    <div className="decor" aria-hidden>
      {t === "winter" && FLAKES.map((f, i) => <i key={i} className="flake" style={{ "--x": f.x, "--s": f.s, "--d": f.d, "--dl": f.dl, "--y": f.y, "--dx": f.dx } as React.CSSProperties} />)}
      {t === "halloween" && <><Bat style={{ top: "14%", animationDelay: "-6s" }} /><Bat style={{ top: "34%", animationDelay: "-27s", animationDuration: "52s" }} /></>}
    </div>);
}
export function BrandDecor() {
  const t = useTheme();
  return t === "winter" ? <Snowflake size={13} strokeWidth={1.5} className="brand-deco" /> : t === "halloween" ? <span className="brand-deco"><Pumpkin s={16} /></span> : null;
}
export function NavDecor() {
  const t = useTheme();
  return t === "winter" ? <div className="nav-deco"><Snowman /></div> : t === "halloween" ? <div className="nav-deco"><Ghost /></div> : null;
}
export function CoverDecor() {
  const t = useTheme();
  if (t === "winter") return (
    <div className="cover-deco" aria-hidden>
      <Snowflake size={14} strokeWidth={1.5} className="cd-a" /><Snowflake size={10} strokeWidth={1.5} className="cd-b" />
      <svg className="drift" viewBox="0 0 400 20" preserveAspectRatio="none"><path d="M0 20V12Q40 2 90 10T200 8T310 11T400 6V20z" fill="#e9ebef" opacity=".9" /></svg>
    </div>);
  if (t === "halloween") return <div className="cover-deco" aria-hidden><Web /><span className="cd-pump"><Pumpkin s={30} /></span></div>;
  return null;
}
