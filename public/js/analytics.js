// analytics.js — per-link detail view. Draws the 14-day trend line as a
// hand-built SVG polyline (no charting library needed) plus simple bar
// breakdowns for device and referrer.

Auth.requireAuthOrRedirect();

const params = new URLSearchParams(location.search);
const linkId = params.get("id");
if (!linkId) window.location.href = "/dashboard.html";

document.getElementById("logoutBtn").addEventListener("click", () => {
  Auth.clear();
  window.location.href = "/login.html";
});

function drawDailyChart(days) {
  const svg = document.getElementById("dailyChart");
  const W = 700, H = 220, PAD = 28;
  const max = Math.max(1, ...days.map((d) => d.count));
  const stepX = (W - PAD * 2) / (days.length - 1);

  const points = days.map((d, i) => {
    const x = PAD + i * stepX;
    const y = H - PAD - (d.count / max) * (H - PAD * 2);
    return { x, y, ...d };
  });

  const linePath = "M " + points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)},${H - PAD} L ${points[0].x.toFixed(1)},${H - PAD} Z`;

  const gridLines = [0, 0.5, 1]
    .map((f) => {
      const y = PAD + f * (H - PAD * 2);
      return `<line x1="${PAD}" y1="${y}" x2="${W - PAD}" y2="${y}" stroke="#1f2530" stroke-width="1" />`;
    })
    .join("");

  const dots = points
    .map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="3" fill="#0a0d12" stroke="#35e6c2" stroke-width="1.5"><title>${p.date}: ${p.count} click${p.count === 1 ? "" : "s"}</title></circle>`)
    .join("");

  const labels = points
    .filter((_, i) => i % 2 === 0)
    .map((p) => `<text x="${p.x.toFixed(1)}" y="${H - 6}" fill="#626d7d" font-size="10" text-anchor="middle" font-family="JetBrains Mono, monospace">${p.date.slice(5)}</text>`)
    .join("");

  svg.innerHTML = `
    <defs>
      <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#35e6c2" stop-opacity="0.25" />
        <stop offset="100%" stop-color="#35e6c2" stop-opacity="0" />
      </linearGradient>
    </defs>
    ${gridLines}
    <path d="${areaPath}" fill="url(#areaFill)" stroke="none" />
    <path d="${linePath}" fill="none" stroke="#35e6c2" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    ${dots}
    ${labels}
  `;
}

function renderBreakdown(container, dataObj) {
  const entries = Object.entries(dataObj).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    container.innerHTML = `<p style="color: var(--text-low); font-size:13px;">No data yet.</p>`;
    return;
  }
  const max = Math.max(...entries.map((e) => e[1]));
  container.innerHTML = entries
    .map(
      ([label, value]) => `
      <div class="bar-row">
        <span class="bar-label">${escapeHtml(label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${(value / max) * 100}%"></span></span>
        <span class="bar-value">${value}</span>
      </div>`
    )
    .join("");
}

function renderClicksTable(clicks) {
  const tbody = document.getElementById("clicksTableBody");
  const table = document.getElementById("clicksTable");
  const empty = document.getElementById("noClicks");

  if (clicks.length === 0) {
    table.classList.add("hidden");
    empty.classList.remove("hidden");
    return;
  }
  table.classList.remove("hidden");
  empty.classList.add("hidden");

  tbody.innerHTML = clicks
    .map(
      (c) => `
      <tr>
        <td class="mono">${timeAgo(c.timestamp)}</td>
        <td><span class="badge">${escapeHtml(c.device)}</span></td>
        <td class="mono">${escapeHtml(c.referrer || "Direct")}</td>
      </tr>`
    )
    .join("");
}

async function load() {
  try {
    const { link, daily, byDevice, byReferrer, recent } = await api(`/links/${linkId}/analytics`);

    document.getElementById("linkTitle").textContent = link.title;
    document.getElementById("linkMeta").textContent = `${location.origin}/${link.slug}  →  ${link.url}`;
    document.getElementById("statTotal").textContent = link.clickCount;
    document.getElementById("statFortnight").textContent = daily.reduce((a, d) => a + d.count, 0);
    document.getElementById("statCreated").textContent = new Date(link.createdAt).toLocaleDateString(undefined, {
      year: "numeric", month: "short", day: "numeric",
    });

    drawDailyChart(daily);
    renderBreakdown(document.getElementById("deviceBreakdown"), byDevice);
    renderBreakdown(document.getElementById("referrerBreakdown"), byReferrer);
    renderClicksTable(recent);

    document.getElementById("copyBtn").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(`${location.origin}/${link.slug}`);
        toast("Short link copied");
      } catch {
        toast("Couldn't copy — copy it manually", "error");
      }
    });
  } catch (err) {
    toast(err.message, "error");
    if (err.message.includes("not found")) window.location.href = "/dashboard.html";
  }
}

load();
