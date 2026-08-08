/*
 * Cửa cuốn — panel "Nhật ký đóng/mở" (native HA, Shadow DOM).
 *
 *   · Thẻ trạng thái: ĐANG MỞ (đếm giờ trực tiếp) / ĐÃ ĐÓNG (đóng từ lúc nào).
 *   · Thống kê hôm nay: số lượt mở · tổng thời gian mở · lượt lâu nhất.
 *   · Nhật ký từng lượt: giờ mở → giờ đóng, thời lượng, gom nhóm theo ngày.
 *
 * WebSocket: cua_cuon/get_log, cua_cuon/clear_log.
 */
const STYLE = `
<style>
:host{
  --bg:#14161c;--panel:#1d2029;--panel-2:#242833;--line:rgba(255,255,255,.08);
  --line-strong:rgba(255,255,255,.14);--text:#f2f4f8;--muted:#9aa4b6;--faint:#6b7385;
  --accent:#6aa9ff;--open:#ffb24c;--closed:#5fd29a;--bad:#f0888a;--radius:16px;
  --font:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;--mono:ui-monospace,Menlo,monospace;
  display:block;min-height:100vh;color:var(--text);font-family:var(--font);
  background:radial-gradient(1000px 500px at 80% -10%,rgba(106,169,255,.10),transparent 60%),var(--bg);
}
*{box-sizing:border-box}
.wrap{max-width:820px;margin:0 auto;padding:16px 16px 80px}
.top{display:flex;align-items:center;gap:12px;margin-bottom:16px}
.menu{width:42px;height:42px;border-radius:12px;flex:none;background:var(--panel);border:1px solid var(--line);
  color:var(--muted);font-size:20px;display:grid;place-items:center;cursor:pointer}
.menu:hover{border-color:var(--line-strong);color:var(--text)}
h1{font-weight:700;font-size:20px;margin:0;letter-spacing:-.02em}
.sub{font-size:12px;color:var(--faint)}

/* ---- thẻ trạng thái hiện tại ---- */
.hero{display:flex;align-items:center;gap:14px;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--radius);padding:16px;margin:0 0 12px}
.hero.open{border-color:color-mix(in srgb,var(--open) 45%,var(--line));
  background:linear-gradient(180deg,color-mix(in srgb,var(--open) 9%,var(--panel)),var(--panel))}
.hero.closed{border-color:color-mix(in srgb,var(--closed) 35%,var(--line))}
.hero .ic{width:54px;height:54px;border-radius:15px;flex:none;display:grid;place-items:center;background:var(--panel-2)}
.hero .ic svg{width:30px;height:30px}
.hero.open .ic{background:color-mix(in srgb,var(--open) 16%,var(--panel-2));color:var(--open)}
.hero.closed .ic{background:color-mix(in srgb,var(--closed) 14%,var(--panel-2));color:var(--closed)}
.hero .st{font-size:19px;font-weight:700;letter-spacing:-.01em}
.hero.open .st{color:var(--open)}
.hero.closed .st{color:var(--closed)}
.hero .since{font-size:13px;color:var(--muted);margin-top:3px;font-family:var(--mono)}
.hero .warn{font-size:12px;color:var(--bad);margin-top:5px}
.dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:7px;vertical-align:1px}
.hero.open .dot{background:var(--open);animation:pulse 1.6s ease-in-out infinite}
.hero.closed .dot{background:var(--closed)}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}

/* ---- thống kê ---- */
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:0 0 14px}
.stat{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:12px 13px}
.stat .lbl{font-size:11.5px;color:var(--faint)}
.stat .big{font-size:23px;font-weight:700;line-height:1.15;margin-top:4px;letter-spacing:-.02em}
.stat .big small{font-size:13px;font-weight:600;color:var(--muted);margin-left:2px}
@media (max-width:520px){.stats{grid-template-columns:1fr 1fr}.stat:last-child{grid-column:span 2}}

.bar{display:flex;align-items:center;gap:8px;margin:0 0 14px;flex-wrap:wrap}
.count{font-size:13px;color:var(--muted);width:100%;margin-bottom:2px}
.count b{color:var(--accent);font-size:15px}
.btn{display:inline-flex;align-items:center;gap:6px;padding:9px 13px;border-radius:11px;font-size:13px;font-weight:500;
  cursor:pointer;border:1px solid var(--line-strong);background:var(--panel);color:var(--text);font-family:inherit}
.btn:hover{border-color:var(--accent)}
.btn.danger{color:var(--bad)}
.btn.danger:hover{border-color:var(--bad)}

/* ---- nhật ký ---- */
.day{margin:18px 0 9px;display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.day h2{margin:0;font-size:14px;font-weight:700;color:var(--text)}
.day span{font-size:12px;color:var(--faint);font-family:var(--mono)}
.list{display:flex;flex-direction:column;gap:9px}
.item{display:flex;align-items:center;gap:12px;background:var(--panel);border:1px solid var(--line);
  border-radius:var(--radius);padding:12px 14px}
.item.live{border-color:color-mix(in srgb,var(--open) 45%,var(--line));
  box-shadow:0 0 0 1px color-mix(in srgb,var(--open) 14%,transparent) inset}
.item .ic{width:36px;height:36px;border-radius:11px;flex:none;display:grid;place-items:center;
  background:color-mix(in srgb,var(--accent) 13%,var(--panel-2));color:var(--accent)}
.item.live .ic{background:color-mix(in srgb,var(--open) 16%,var(--panel-2));color:var(--open)}
.item .ic svg{width:20px;height:20px}
.meta{min-width:0;flex:1}
.times{font-weight:600;font-size:14.5px;line-height:1.3;font-family:var(--mono)}
.times .arrow{color:var(--faint);margin:0 6px;font-family:var(--font)}
.times .now{color:var(--open);font-family:var(--font);font-weight:600}
.rel{font-size:11.5px;color:var(--faint);margin-top:3px;font-family:var(--mono)}
.rel .flag{color:var(--bad)}
.dur{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);background:var(--panel-2);
  border:1px solid var(--line);border-radius:10px;padding:7px 10px;flex:none;white-space:nowrap}
.item.live .dur{color:var(--open);border-color:color-mix(in srgb,var(--open) 35%,var(--line))}
.dur.long{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 35%,var(--line))}

.empty{text-align:center;padding:56px 20px;color:var(--faint)}
.empty .big{font-size:44px;opacity:.5}
.empty h3{color:var(--muted);font-weight:600;margin:14px 0 6px;font-size:17px}
.empty p{margin:0;font-size:14px;line-height:1.55}
.warnbox{background:color-mix(in srgb,var(--bad) 10%,var(--panel));border:1px solid color-mix(in srgb,var(--bad) 30%,var(--line));
  border-radius:12px;padding:10px 13px;margin:0 0 14px;font-size:12.5px;line-height:1.5}
</style>`;

const GARAGE = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V9l9-5 9 5v12"/><path d="M6 21v-8h12v8"/><path d="M6 16h12M6 18.5h12"/></svg>`;
const OPEN_IC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V9l9-5 9 5v12"/><path d="M6 21v-5h12v5"/><path d="M6 16h12"/></svg>`;

class CuaCuonPanel extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    if (!this._built) return;
    if (!this._ready) this._init();
  }
  set narrow(_n) {}
  set route(_r) {}
  set panel(_p) {}

  connectedCallback() {
    if (this._built) return;
    this._built = true;
    this._data = { sessions: [], open: false, open_at: null };
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = STYLE + this._shell();
    this._wire();
    if (this._hass) this._init();
  }
  disconnectedCallback() {
    if (this._poll) clearInterval(this._poll);
    if (this._tick) clearInterval(this._tick);
  }
  $(s) { return this.shadowRoot.querySelector(s); }

  _shell() {
    return `
    <div class="wrap">
      <div class="top">
        <button class="menu" title="Menu">&#9776;</button>
        <div><h1>🚪 Cửa cuốn</h1><span class="sub">Nhật ký đóng/mở + thời lượng</span></div>
      </div>
      <div id="hero"></div>
      <div id="stats"></div>
      <div class="bar">
        <span class="count" id="count">—</span>
        <button class="btn" id="refresh">↻ Làm mới</button>
        <button class="btn danger" id="clear">Xóa lịch sử</button>
      </div>
      <div id="view"></div>
    </div>`;
  }

  _wire() {
    this.$(".menu").addEventListener("click", () =>
      this.dispatchEvent(new CustomEvent("hass-toggle-menu", { bubbles: true, composed: true }))
    );
    this.$("#refresh").addEventListener("click", () => this._load());
    this.$("#clear").addEventListener("click", () => this._clear());
  }

  async _init() {
    this._ready = true;
    await this._load();
    if (this._poll) clearInterval(this._poll);
    if (this._tick) clearInterval(this._tick);
    this._poll = setInterval(() => this._load(), 5000);
    this._tick = setInterval(() => this._live(), 1000);   // đồng hồ chạy cho lượt đang mở
  }

  async _load() {
    try {
      const r = await this._hass.connection.sendMessagePromise({ type: "cua_cuon/get_log" });
      if (r) this._data = r;
    } catch {
      // lỗi tạm thời -> giữ dữ liệu cũ
    }
    this._render();
  }

  async _clear() {
    if (!confirm("Xóa toàn bộ nhật ký đóng/mở cửa?")) return;
    try {
      await this._hass.connection.sendMessagePromise({ type: "cua_cuon/clear_log" });
    } catch {}
    await this._load();
  }

  // ---------- tiện ích ----------
  _two(n) { return String(n).padStart(2, "0"); }
  _hm(iso) {
    const d = new Date(iso);
    return `${this._two(d.getHours())}:${this._two(d.getMinutes())}`;
  }
  _dayKey(iso) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${this._two(d.getMonth() + 1)}-${this._two(d.getDate())}`;
  }
  _dayLabel(key) {
    const today = this._dayKey(new Date().toISOString());
    const y = new Date(Date.now() - 86400000);
    if (key === today) return "Hôm nay";
    if (key === this._dayKey(y.toISOString())) return "Hôm qua";
    const [yy, mm, dd] = key.split("-");
    return `${dd}/${mm}/${yy}`;
  }
  _dur(sec) {
    if (sec == null || isNaN(sec)) return "—";
    const t = Math.max(0, Math.round(sec));
    if (t < 60) return `${t} giây`;
    const m = Math.floor(t / 60), s = t % 60;
    if (m < 60) return m < 10 && s ? `${m}p ${s}s` : `${m} phút`;
    const h = Math.floor(m / 60), mr = m % 60;
    return mr ? `${h}g ${mr}p` : `${h} giờ`;
  }
  _rel(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "vừa xong";
    const m = Math.floor(s / 60);
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    return `${Math.floor(h / 24)} ngày trước`;
  }
  /** Thời lượng 1 lượt: đã đóng -> dur đã lưu; đang mở -> tính tới bây giờ. */
  _seconds(s) {
    if (typeof s.dur === "number") return s.dur;
    const start = new Date(s.open).getTime();
    if (isNaN(start)) return null;
    const end = s.close ? new Date(s.close).getTime() : Date.now();
    return Math.max(0, (end - start) / 1000);
  }
  _isLive(s) { return !s.close; }

  // ---------- cập nhật đồng hồ mỗi giây (không vẽ lại cả trang) ----------
  _live() {
    const secs = this._openSeconds();
    const el = this.$("#live");
    if (el && secs != null) el.textContent = this._dur(secs);
    const row = this.$(".item.live .dur");
    if (row && secs != null) row.textContent = this._dur(secs);
  }
  _openSeconds() {
    if (!this._data.open || !this._data.open_at) return null;
    return Math.max(0, (Date.now() - new Date(this._data.open_at).getTime()) / 1000);
  }

  // ---------- vẽ ----------
  _renderHero() {
    const d = this._data;
    const alertMin = Number(d.alert_minutes || 0);
    if (d.open) {
      const secs = this._openSeconds();
      const over = alertMin > 0 && secs != null && secs >= alertMin * 60;
      return `<div class="hero open">
        <div class="ic">${OPEN_IC}</div>
        <div>
          <div class="st"><span class="dot"></span>ĐANG MỞ</div>
          <div class="since">Mở từ ${d.open_at ? this._hm(d.open_at) : "—"} · <span id="live">${this._dur(secs)}</span></div>
          ${over ? `<div class="warn">⚠ Đã quá ${alertMin} phút mà chưa đóng</div>` : ""}
        </div>
      </div>`;
    }
    const last = (d.sessions || []).find((s) => s.close);
    return `<div class="hero closed">
      <div class="ic">${GARAGE}</div>
      <div>
        <div class="st"><span class="dot"></span>ĐÃ ĐÓNG</div>
        <div class="since">${last ? `Đóng lúc ${this._hm(last.close)} · ${this._rel(last.close)}` : "Chưa ghi nhận lượt nào"}</div>
      </div>
    </div>`;
  }

  _renderStats() {
    const today = this._dayKey(new Date().toISOString());
    const list = (this._data.sessions || []).filter((s) => this._dayKey(s.open) === today);
    const durs = list.map((s) => this._seconds(s)).filter((v) => v != null);
    const total = durs.reduce((a, b) => a + b, 0);
    const max = durs.length ? Math.max(...durs) : null;
    return `<div class="stats">
      <div class="stat"><div class="lbl">Lượt mở hôm nay</div><div class="big">${list.length}<small>lượt</small></div></div>
      <div class="stat"><div class="lbl">Tổng thời gian mở</div><div class="big">${durs.length ? this._dur(total) : "—"}</div></div>
      <div class="stat"><div class="lbl">Lượt mở lâu nhất</div><div class="big">${max != null ? this._dur(max) : "—"}</div></div>
    </div>`;
  }

  _renderRow(s, index, total) {
    const live = this._isLive(s);
    const secs = this._seconds(s);
    const alertMin = Number(this._data.alert_minutes || 0);
    const long = alertMin > 0 && secs != null && secs >= alertMin * 60;
    const alerts = Number(s.alerts || 0);
    return `<div class="item${live ? " live" : ""}">
      <div class="ic">${live ? OPEN_IC : GARAGE}</div>
      <div class="meta">
        <div class="times">${this._hm(s.open)}<span class="arrow">→</span>${
          live ? `<span class="now">đang mở</span>` : this._hm(s.close)
        }</div>
        <div class="rel">#${total - index} · ${this._rel(s.open)}${
          alerts ? ` · <span class="flag">⏰ ${alerts} lần nhắc</span>` : ""
        }</div>
      </div>
      <span class="dur${long ? " long" : ""}">${this._dur(secs)}</span>
    </div>`;
  }

  _render() {
    const sessions = this._data.sessions || [];
    const n = sessions.length;
    this.$("#hero").innerHTML = this._renderHero();
    this.$("#stats").innerHTML = this._renderStats();
    this.$("#count").innerHTML = n
      ? `Nhật ký: <b>${n}</b> lượt gần nhất`
      : "Chưa có lượt đóng/mở nào";

    const view = this.$("#view");
    if (!n) {
      view.innerHTML = `<div class="empty"><div class="big">🚪</div>
        <h3>Chưa có dữ liệu</h3>
        <p>Mở hoặc đóng cửa cuốn một lần — mỗi lượt sẽ hiện ở đây kèm giờ mở, giờ đóng và
        thời gian cửa mở.</p></div>`;
      return;
    }

    // gom nhóm theo ngày (danh sách đã sắp mới nhất trước)
    const groups = [];
    sessions.forEach((s, i) => {
      const key = this._dayKey(s.open);
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) groups.push((g = { key, rows: [] }));
      g.rows.push({ s, i });
    });

    view.innerHTML = groups
      .map((g) => {
        const durs = g.rows.map((r) => this._seconds(r.s)).filter((v) => v != null);
        const total = durs.reduce((a, b) => a + b, 0);
        return `<div class="day"><h2>${this._dayLabel(g.key)}</h2>
            <span>${g.rows.length} lượt · tổng ${this._dur(total)}</span></div>
          <div class="list">${g.rows.map((r) => this._renderRow(r.s, r.i, n)).join("")}</div>`;
      })
      .join("");
  }
}

if (!customElements.get("cua-cuon-panel")) {
  customElements.define("cua-cuon-panel", CuaCuonPanel);
}
console.info("%c CỬA CUỐN %c panel v1 ", "background:#6aa9ff;color:#0f1420;border-radius:4px 0 0 4px;padding:2px 6px",
  "background:#26507f;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px");
