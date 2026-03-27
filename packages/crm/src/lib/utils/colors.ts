export function adjustBrightness(hslTriplet: string, delta: number) {
  const parts = hslTriplet.trim().split(/\s+/);

  if (parts.length !== 3) {
    return hslTriplet;
  }

  const lightness = Number.parseFloat(parts[2].replace("%", ""));

  if (Number.isNaN(lightness)) {
    return hslTriplet;
  }

  const next = Math.min(100, Math.max(0, lightness + delta));
  return `${parts[0]} ${parts[1]} ${next}%`;
}
