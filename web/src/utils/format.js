export function fmt(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "No aplica";
  return "$" + Math.round(n).toLocaleString("es-CL");
}

export function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "No aplica";
  return (n * 100).toFixed(1) + "%";
}

export function nameKey(n) {
  return (n || "").trim().toLowerCase();
}

