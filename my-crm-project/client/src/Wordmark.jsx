import logo from './assets/Logos/bam-logo.png';

// Sidebar logo area: framed logo, two-line heavy wordmark, 32x2 gold rule, muted gold italic tagline.
export default function Wordmark({ tagline = 'Work the book.' }) {
  return (
    <div className="px-5 pb-5 pt-6 text-center">
      <img
        src={logo}
        alt="Big Ass Motors"
        className="mx-auto mb-4 block w-full rounded-md border-2 border-white/80 object-cover"
        style={{ boxShadow: '0 0 14px rgb(255 255 255 / .55), 0 0 32px rgb(255 255 255 / .25)' }}
      />
      <div
        className="font-['Orbitron'] text-[26px] font-black uppercase leading-[1.05] tracking-wider text-white"
        style={{ textShadow: '0 0 18px rgb(var(--bam-gold-rgb) / .8), 0 0 3px rgb(var(--bam-gold-rgb))' }}
      >
        <div>Big Ass</div>
        <div>Motors</div>
      </div>
      <div className="mx-auto mt-2 h-[2px] w-8 bg-gold" aria-hidden="true" />
      <div className="mt-2 text-[11px] italic text-gold/60">{tagline}</div>
    </div>
  );
}
