// Bölüm ekranında yenilemeler arasında gelen yeni işleri bulur (ilk yüklemedeki işler "yeni" sayılmaz).
export function newJobIds(known: ReadonlySet<string>, current: { id: string }[]): string[] {
  return current.filter((j) => !known.has(j.id)).map((j) => j.id);
}

/** Kısa üç tonlu uyarı sesi; tarayıcı izin vermezse sessizce geçer. */
export function beep(): void {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [660, 880, 990].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.17);
    });
    setTimeout(() => void ctx.close(), 1000);
  } catch {
    // ses çalınamadı
  }
}
