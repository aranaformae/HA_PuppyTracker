// Keep puppy chart series visually tied to the physical collar color.
// collar_color is intentionally free text, so common Dutch/English names are
// normalized here while valid CSS colors (for example #2196f3) are accepted.
const NAMED_COLORS = [
    [["lichtblauw", "lightblue", "skyblue"], "#42a5f5"],
    [["donkerblauw", "darkblue", "navy"], "#1565c0"],
    [["blauw", "blue"], "#1e88e5"],
    [["lichtroze", "lightpink"], "#f48fb1"],
    [["donkerroze", "darkpink"], "#d81b60"],
    [["roze", "pink"], "#ec407a"],
    [["lichtgroen", "lightgreen", "lime"], "#7cb342"],
    [["donkergroen", "darkgreen"], "#2e7d32"],
    [["groen", "green"], "#43a047"],
    [["rood", "red"], "#e53935"],
    [["geel", "yellow"], "#f9a825"],
    [["paars", "purple", "violet"], "#8e24aa"],
    [["oranje", "orange"], "#fb8c00"],
    [["turquoise", "turkoois", "cyan", "aqua"], "#00acc1"],
    [["bruin", "brown"], "#795548"],
    [["grijs", "gray", "grey", "zilver", "silver"], "#78909c"],
    [["zwart", "black"], "#424242"],
    // Pure white disappears on the default light HA card. Keep it recognisably
    // white while retaining enough contrast to remain readable as a chart line.
    [["wit", "white"], "#b0bec5"],
  ];

  const normalize = (value) => String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9#(),.%\s-]/g, "");

  const compact = (value) => normalize(value).replace(/[\s_-]+/g, "");

  const fallbackColor = (index) => `hsl(${index * 63 + 205} 68% 52%)`;

export function collarColor(value, index = 0) {
    const normalized = normalize(value);
    if (!normalized) return fallbackColor(index);

    const compactValue = compact(normalized);
    for (const [aliases, color] of NAMED_COLORS) {
      if (aliases.some((alias) => compactValue === compact(alias))) return color;
    }

    // Free text is also allowed to contain a recognizable color word, e.g.
    // "neon groen" or "bandje blauw".
    for (const [aliases, color] of NAMED_COLORS) {
      if (aliases.some((alias) => compactValue.includes(compact(alias)))) return color;
    }

    if (globalThis.CSS?.supports?.("color", normalized)) return normalized;
    return fallbackColor(index);
}
