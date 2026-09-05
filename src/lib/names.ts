const TITLES = new Set([
  "dr",
  "dr.",
  "mr",
  "mr.",
  "mrs",
  "mrs.",
  "ms",
  "ms.",
  "nurse",
  "prof",
  "prof.",
]);

function parts(name: string) {
  return name.split(" ").filter((p) => p && !TITLES.has(p.toLowerCase()));
}

export function firstName(name: string) {
  return parts(name)[0] ?? name;
}

export function initials(name: string) {
  return parts(name)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
