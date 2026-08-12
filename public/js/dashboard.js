// dashboard.js — the main app screen: list links, create/edit/delete,
// search, and render a tiny sparkline per link from its 14-day counts.

Auth.requireAuthOrRedirect();

const els = {
  userName: document.getElementById("userName"),
  avatar: document.getElementById("avatar"),
  logoutBtn: document.getElementById("logoutBtn"),
  headerSub: document.getElementById("headerSub"),
  statLinks: document.getElementById("statLinks"),
  statClicks: document.getElementById("statClicks"),
  statRecent: document.getElementById("statRecent"),
  searchInput: document.getElementById("searchInput"),
  linkList: document.getElementById("linkList"),
  newLinkBtn: document.getElementById("newLinkBtn"),
  modalBackdrop: document.getElementById("linkModalBackdrop"),
  modalTitle: document.getElementById("modalTitle"),
  linkForm: document.getElementById("linkForm"),
  editingId: document.getElementById("editingId"),
  urlInput: document.getElementById("urlInput"),
  titleInput: document.getElementById("titleInput"),
  slugInput: document.getElementById("slugInput"),
  slugField: document.getElementById("slugField"),
  formError: document.getElementById("formError"),
  cancelModalBtn: document.getElementById("cancelModalBtn"),
  saveLinkBtn: document.getElementById("saveLinkBtn"),
};

let allLinks = [];

function initUser() {
  const user = Auth.getUser();
  if (!user) return;
  els.userName.textContent = user.name;
  els.avatar.textContent = initials(user.name);
}

els.logoutBtn.addEventListener("click", () => {
  Auth.clear();
  window.location.href = "/login.html";
});

function sparklineSvg(counts) {
  const W = 100, H = 32;
  const max = Math.max(1, ...counts);
  const step = W / (counts.length - 1);
  const points = counts.map((c, i) => {
    const x = i * step;
    const y = H - (c / max) * (H - 6) - 3;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const hasClicks = counts.some((c) => c > 0);
  const color = hasClicks ? "#35e6c2" : "#3a4250";
  return `<svg class="sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">
    <polyline points="${points.join(" ")}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

function renderStats(links) {
  const totalClicks = links.reduce((sum, l) => sum + l.clickCount, 0);
  const recentClicks = links.reduce((sum, l) => sum + l.spark.reduce((a, b) => a + b, 0), 0);
  els.statLinks.textContent = links.length;
  els.statClicks.textContent = totalClicks;
  els.statRecent.textContent = recentClicks;
  els.headerSub.textContent = links.length
    ? `${links.length} link${links.length === 1 ? "" : "s"} · ${totalClicks} total click${totalClicks === 1 ? "" : "s"}`
    : "Create your first link to get started";
}

function renderList(links) {
  if (links.length === 0) {
    els.linkList.innerHTML = `
      <div class="empty-state">
        <div class="glyph">◌</div>
        <h3>No links yet</h3>
        <p>Shorten your first URL and its clicks will start showing up here.</p>
      </div>`;
    return;
  }

  els.linkList.innerHTML = links
    .map((link) => {
      const shortUrl = `${location.origin}/${link.slug}`;
      return `
      <div class="link-row" data-id="${link.id}">
        <div class="link-info">
          <div class="link-title">${escapeHtml(link.title)}</div>
          <div>
            <a class="link-slug" href="/analytics.html?id=${link.id}">/${escapeHtml(link.slug)}</a>
            <span class="link-url"> → ${escapeHtml(link.url)}</span>
          </div>
        </div>
        ${sparklineSvg(link.spark)}
        <div class="link-clicks">
          <div class="count">${link.clickCount}</div>
          <div class="word">clicks</div>
        </div>
        <div class="row-actions">
          <button class="icon-btn" data-action="copy" data-url="${shortUrl}" title="Copy short link" aria-label="Copy short link">⧉</button>
          <button class="icon-btn" data-action="analytics" data-id="${link.id}" title="View analytics" aria-label="View analytics">📈</button>
          <button class="icon-btn" data-action="edit" data-id="${link.id}" title="Edit link" aria-label="Edit link">✎</button>
          <button class="icon-btn danger" data-action="delete" data-id="${link.id}" title="Delete link" aria-label="Delete link">✕</button>
        </div>
      </div>`;
    })
    .join("");
}

function showSkeleton() {
  els.linkList.innerHTML = Array.from({ length: 3 }).map(() => `<div class="skeleton-row"></div>`).join("");
}

async function loadLinks() {
  showSkeleton();
  try {
    const { links } = await api("/links");
    allLinks = links;
    renderStats(links);
    renderList(links);
  } catch (err) {
    toast(err.message, "error");
    els.linkList.innerHTML = `<div class="empty-state"><h3>Couldn't load your links</h3><p>${escapeHtml(err.message)}</p></div>`;
  }
}

els.searchInput.addEventListener("input", () => {
  const q = els.searchInput.value.trim().toLowerCase();
  const filtered = !q
    ? allLinks
    : allLinks.filter(
        (l) => l.title.toLowerCase().includes(q) || l.slug.toLowerCase().includes(q) || l.url.toLowerCase().includes(q)
      );
  renderList(filtered);
});

// -------------------- modal: create / edit --------------------
function openModal(mode, link) {
  els.formError.textContent = "";
  els.linkForm.reset();
  if (mode === "edit") {
    els.modalTitle.textContent = "Edit link";
    els.editingId.value = link.id;
    els.urlInput.value = link.url;
    els.titleInput.value = link.title;
    els.slugField.classList.add("hidden");
  } else {
    els.modalTitle.textContent = "New link";
    els.editingId.value = "";
    els.slugField.classList.remove("hidden");
  }
  els.modalBackdrop.classList.add("show");
  els.urlInput.focus();
}

function closeModal() {
  els.modalBackdrop.classList.remove("show");
}

els.newLinkBtn.addEventListener("click", () => openModal("create"));
els.cancelModalBtn.addEventListener("click", closeModal);
els.modalBackdrop.addEventListener("click", (e) => {
  if (e.target === els.modalBackdrop) closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

els.linkForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.formError.textContent = "";
  els.saveLinkBtn.disabled = true;
  els.saveLinkBtn.textContent = "Saving…";

  const id = els.editingId.value;
  const body = { url: els.urlInput.value.trim(), title: els.titleInput.value.trim() };
  if (!id && els.slugInput.value.trim()) body.slug = els.slugInput.value.trim();

  try {
    if (id) {
      await api(`/links/${id}`, { method: "PUT", body });
      toast("Link updated");
    } else {
      await api("/links", { method: "POST", body });
      toast("Link created");
    }
    closeModal();
    await loadLinks();
  } catch (err) {
    els.formError.textContent = err.message;
  } finally {
    els.saveLinkBtn.disabled = false;
    els.saveLinkBtn.textContent = "Save link";
  }
});

// -------------------- row actions (event delegation) --------------------
els.linkList.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const action = btn.dataset.action;
  const id = btn.dataset.id;

  if (action === "copy") {
    try {
      await navigator.clipboard.writeText(btn.dataset.url);
      toast("Short link copied");
    } catch {
      toast("Couldn't copy — copy it manually", "error");
    }
  }

  if (action === "analytics") {
    window.location.href = `/analytics.html?id=${id}`;
  }

  if (action === "edit") {
    const link = allLinks.find((l) => l.id === id);
    if (link) openModal("edit", link);
  }

  if (action === "delete") {
    const link = allLinks.find((l) => l.id === id);
    if (!link) return;
    if (!confirm(`Delete "${link.title}"? This also deletes its click history. This can't be undone.`)) return;
    try {
      await api(`/links/${id}`, { method: "DELETE" });
      toast("Link deleted");
      await loadLinks();
    } catch (err) {
      toast(err.message, "error");
    }
  }
});

initUser();
loadLinks();
