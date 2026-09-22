export function renderGradeTrend(target, screenings = []) {
  const points = screenings
    .map((screening) => ({
      date: new Date(screening.createdAt),
      grade: screening.review?.finalGrade ?? screening.result?.classification?.primary?.predictedGrade
    }))
    .filter((point) => Number.isInteger(point.grade) && point.grade >= 0 && point.grade <= 4 && !Number.isNaN(point.date.getTime()))
    .sort((a, b) => a.date - b.date);
  target.replaceChildren();
  if (points.length < 2) {
    target.textContent = "At least two completed screenings are needed to show a trend.";
    target.setAttribute("aria-label", target.textContent);
    return;
  }

  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 640 220");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", `DR grades over ${points.length} screenings, from grade ${points[0].grade} to grade ${points.at(-1).grade}`);
  const add = (name, attrs, text) => {
    const element = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
    if (text !== undefined) element.textContent = text;
    svg.append(element);
    return element;
  };
  const left = 70, right = 610, top = 18, bottom = 174;
  for (let grade = 0; grade <= 4; grade++) {
    const y = bottom - grade * (bottom - top) / 4;
    add("line", { x1: left, x2: right, y1: y, y2: y, stroke: "#dbe7e4", "stroke-width": 1 });
    add("text", { x: 10, y: y + 4, fill: "#526b67", "font-size": 12 }, `Grade ${grade}`);
  }
  const min = points[0].date.getTime(), max = points.at(-1).date.getTime();
  const coords = points.map((point, index) => ({
    x: min === max ? left + index * (right - left) / (points.length - 1) : left + (point.date.getTime() - min) / (max - min) * (right - left),
    y: bottom - point.grade * (bottom - top) / 4,
    ...point
  }));
  add("polyline", { points: coords.map((point) => `${point.x},${point.y}`).join(" "), fill: "none", stroke: "#176d68", "stroke-width": 3, "stroke-linejoin": "round" });
  for (const point of coords) {
    add("circle", { cx: point.x, cy: point.y, r: 5, fill: "#176d68", stroke: "white", "stroke-width": 2 });
  }
  add("text", { x: left, y: 207, fill: "#526b67", "font-size": 12 }, points[0].date.toLocaleDateString());
  add("text", { x: right, y: 207, fill: "#526b67", "font-size": 12, "text-anchor": "end" }, points.at(-1).date.toLocaleDateString());
  target.append(svg);
}
