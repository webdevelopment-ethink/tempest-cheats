const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const PRODUCT_LABELS = {
  "arc-1-day": "1 Day",
  "arc-3-day": "3 Days",
  "arc-7-day": "7 Days",
  "arc-30-day": "30 Days",
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
  return data;
}

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function showLogin() {
  $("#login-screen").classList.remove("hidden");
  $("#app").classList.add("hidden");
}

function showApp() {
  $("#login-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
}

async function checkSession() {
  const me = await api("/admin/api/me");
  if (me.authenticated) {
    showApp();
    await loadDashboard();
  } else {
    showLogin();
  }
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const errEl = $("#login-error");
  errEl.textContent = "";
  try {
    await api("/admin/api/login", {
      method: "POST",
      body: JSON.stringify({ password: $("#login-password").value }),
    });
    $("#login-password").value = "";
    showApp();
    await loadDashboard();
  } catch (err) {
    errEl.textContent =
      err.message === "invalid_password" ? "Wrong password. Try again." : "Could not sign in. Check server is running.";
  }
});

$("#logout-btn").addEventListener("click", async () => {
  await api("/admin/api/logout", { method: "POST" });
  showLogin();
});

$$(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$(".tab").forEach((t) => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    const name = tab.dataset.tab;
    $$(".panel-view").forEach((p) => p.classList.add("hidden"));
    $(`#panel-${name}`).classList.remove("hidden");
    if (name === "dashboard") loadDashboard();
  });
});

async function loadDashboard() {
  const data = await api("/admin/api/analytics");

  const lowCount = data.lowStock?.length ?? 0;
  $("#stats-grid").innerHTML = `
    <div class="stat-card">
      <div class="stat-card__label">Available keys</div>
      <div class="stat-card__value">${data.totals.available}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Total sold</div>
      <div class="stat-card__value">${data.totals.sold}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Sold today</div>
      <div class="stat-card__value">${data.salesToday}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Sold (30 days)</div>
      <div class="stat-card__value">${data.salesLast30Days}</div>
    </div>
    <div class="stat-card">
      <div class="stat-card__label">Low stock alerts</div>
      <div class="stat-card__value ${lowCount ? "stat-card__value--warn" : ""}">${lowCount}</div>
    </div>
  `;

  const products = ["arc-1-day", "arc-3-day", "arc-7-day", "arc-30-day"];
  const stockBody = $("#stock-table tbody");
  stockBody.innerHTML = products
    .map((id) => {
      const row = data.stock[id] || { available: 0, sold: 0 };
      const low = row.available <= 5;
      return `<tr>
        <td>${PRODUCT_LABELS[id] || id} ${low ? '<span class="badge badge--low">Low</span>' : '<span class="badge badge--ok">OK</span>'}</td>
        <td>${row.available}</td>
        <td>${row.sold}</td>
      </tr>`;
    })
    .join("");

  const chart = $("#chart-bars");
  if (!data.salesLast7Days.length) {
    chart.innerHTML = '<p class="chart-empty">No sales in the last 7 days yet.</p>';
  } else {
    const max = Math.max(...data.salesLast7Days.map((d) => d.count), 1);
    chart.innerHTML = data.salesLast7Days
      .map((d) => {
        const pct = Math.round((d.count / max) * 100);
        const label = d.day?.slice(5) || d.day;
        return `<div class="chart-bar">
          <span class="chart-bar__count">${d.count}</span>
          <div class="chart-bar__fill" style="height:${Math.max(pct, 8)}%"></div>
          <span class="chart-bar__label">${label}</span>
        </div>`;
      })
      .join("");
  }

  const recentBody = $("#recent-table tbody");
  if (!data.recentSales.length) {
    recentBody.innerHTML = '<tr><td colspan="4" class="muted">No sales yet.</td></tr>';
  } else {
    recentBody.innerHTML = data.recentSales
      .map(
        (r) => `<tr>
        <td>${formatDate(r.sold_at)}</td>
        <td>${PRODUCT_LABELS[r.product_id] || r.product_id}</td>
        <td>${r.email}</td>
        <td><code>${r.key_code}</code></td>
      </tr>`
      )
      .join("");
  }
}

$("#import-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const resultEl = $("#import-result");
  resultEl.className = "form-message";
  resultEl.textContent = "Importing…";
  try {
    const data = await api("/admin/api/import", {
      method: "POST",
      body: JSON.stringify({
        productId: $("#import-product").value,
        keys: $("#import-keys").value,
      }),
    });
    resultEl.textContent = `Done — added ${data.added}, skipped ${data.skipped} (duplicates/empty).`;
    $("#import-keys").value = "";
  } catch (err) {
    resultEl.className = "form-message is-error";
    resultEl.textContent = err.message;
  }
});

$("#lookup-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#lookup-email").value.trim();
  const session = $("#lookup-session").value.trim();
  const box = $("#lookup-results");
  box.innerHTML = "<p class='muted'>Searching…</p>";

  try {
    const params = new URLSearchParams();
    if (email) params.set("email", email);
    else if (session) params.set("session", session);
    else {
      box.innerHTML = "<p class='form-message is-error'>Enter an email or session ID.</p>";
      return;
    }

    const data = await api(`/admin/api/lookup?${params}`);
    if (!data.results?.length) {
      box.innerHTML = "<p class='muted'>No results found.</p>";
      return;
    }

    box.innerHTML = data.results
      .map((r) => {
        const key = r.key_code || "—";
        const product = PRODUCT_LABELS[r.product_id] || r.product_id || "—";
        return `<div class="lookup-item">
          <strong>${key}</strong>
          <p>Product: ${product}</p>
          <p>Email: ${r.email || "—"}</p>
          <p>Sold: ${formatDate(r.sold_at || r.delivered_at)}</p>
          ${r.stripe_session_id ? `<p>Session: <code>${r.stripe_session_id}</code></p>` : ""}
        </div>`;
      })
      .join("");
  } catch (err) {
    box.innerHTML = `<p class="form-message is-error">${err.message}</p>`;
  }
});

checkSession().catch(() => showLogin());
