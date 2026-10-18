// Kumaş/sap renk adı (serbest metin) için küçük renk noktası; bilinmeyen renkte desenli nokta.
const COLOURS: Record<string, string> = {
  beyaz: '#ffffff', krem: '#f3e7c9', ekru: '#efe6d2', siyah: '#1c1917', gri: '#9ca3af', antrasit: '#3f3f46',
  kırmızı: '#dc2626', bordo: '#7f1d1d', pembe: '#f472b6', turuncu: '#f97316', sarı: '#facc15', hardal: '#ca8a04',
  yeşil: '#16a34a', 'haki': '#78716c', mavi: '#2563eb', lacivert: '#1e3a8a', 'açık mavi': '#7dd3fc', turkuaz: '#14b8a6',
  mor: '#7c3aed', lila: '#c4b5fd', kahverengi: '#78350f', bej: '#d6c6a8', naturel: '#eadfc8',
};

export function ColourSwatch({ name }: { name: string }) {
  const c = COLOURS[name.trim().toLocaleLowerCase('tr')];
  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden
        className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-stone-300"
        style={c ? { background: c } : { background: 'repeating-linear-gradient(45deg,#e7e5e4 0 3px,#fff 3px 6px)' }}
      />
      {name}
    </span>
  );
}
