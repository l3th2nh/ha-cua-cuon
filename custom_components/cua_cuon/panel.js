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
.times .miss{color:var(--faint)}
.rel{font-size:11.5px;color:var(--faint);margin-top:3px;font-family:var(--mono)}
.rel .flag{color:var(--bad)}
.rel .manual{color:var(--accent)}
.rel .swipehint{color:var(--open)}
.item.gap{border-style:dashed;border-color:var(--line-strong)}

/* ---- vuốt sang trái để chốt hành trình bị hở ---- */
.swipe{position:relative;overflow:hidden;border-radius:var(--radius);touch-action:pan-y}
.swipe .item{position:relative;z-index:1;transition:transform .18s ease;will-change:transform;
  -webkit-user-select:none;user-select:none}
.swipe.open .item{transform:translateX(-138px)}
.swipe-act{position:absolute;top:0;right:0;bottom:0;width:138px;border:0;border-radius:var(--radius);
  background:color-mix(in srgb,var(--closed) 24%,var(--panel-2));color:var(--closed);cursor:pointer;
  font-family:inherit;font-size:12.5px;font-weight:700;line-height:1.35;padding:0 10px;
  display:flex;align-items:center;justify-content:center;gap:7px}
.swipe-act:hover{background:color-mix(in srgb,var(--closed) 36%,var(--panel-2))}
.swipe-act b{font-size:17px;font-weight:700}
.dur{font-family:var(--mono);font-size:13px;font-weight:600;color:var(--text);background:var(--panel-2);
  border:1px solid var(--line);border-radius:10px;padding:7px 10px;flex:none;white-space:nowrap}
.item.live .dur{color:var(--open);border-color:color-mix(in srgb,var(--open) 35%,var(--line))}
.dur.long{color:var(--bad);border-color:color-mix(in srgb,var(--bad) 35%,var(--line))}

.alert{background:color-mix(in srgb,var(--bad) 16%,var(--panel));border:1px solid var(--bad);
  border-radius:13px;padding:12px 14px;margin:0 0 12px;font-size:13px;line-height:1.55;color:var(--text)}
.alert b{color:var(--bad)}

/* ---- sức khỏe cảm biến ---- */
.health{background:var(--panel);border:1px solid var(--line);border-radius:13px;padding:11px 13px;margin:0 0 12px;
  font-size:12.5px;line-height:1.55;color:var(--muted)}
.health b{color:var(--text);font-weight:600}
.health code{font-family:var(--mono);font-size:11.5px;background:var(--panel-2);border:1px solid var(--line);
  border-radius:6px;padding:1px 6px;color:var(--accent)}
.health .hd{display:flex;align-items:center;gap:7px;color:var(--text);font-weight:600;font-size:13px;margin-bottom:5px}
.health.warn{border-color:color-mix(in srgb,var(--bad) 38%,var(--line));
  background:color-mix(in srgb,var(--bad) 8%,var(--panel))}
.health.warn .hd{color:var(--bad)}
.health p{margin:6px 0 0}
.health .ok{color:var(--closed);font-weight:600}
.health .no{color:var(--bad);font-weight:600}
.health .err{font-family:var(--mono);font-size:11px;color:var(--bad);word-break:break-word;
  background:rgba(0,0,0,.25);border-radius:6px;padding:5px 8px;margin-top:6px;display:block}
.health .row{display:flex;gap:8px;margin-top:9px;flex-wrap:wrap}
.health .row .btn{padding:7px 11px;font-size:12.5px}

.empty{text-align:center;padding:56px 20px;color:var(--faint)}
.empty .big{font-size:44px;opacity:.5}
.empty h3{color:var(--muted);font-weight:600;margin:14px 0 6px;font-size:17px}
.empty p{margin:0;font-size:14px;line-height:1.55}
.warnbox{background:color-mix(in srgb,var(--bad) 10%,var(--panel));border:1px solid color-mix(in srgb,var(--bad) 30%,var(--line));
  border-radius:12px;padding:10px 13px;margin:0 0 14px;font-size:12.5px;line-height:1.5}
</style>`;

const SWIPE_W = 138;  // bề rộng nút lộ ra khi vuốt trái (khớp CSS .swipe-act)

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
      <div id="alert"></div>
      <div id="hero"></div>
      <div id="health"></div>
      <div id="notify"></div>
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
    this.$("#view").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-finish]");
      if (btn) this._finish(btn.getAttribute("data-finish"));
    });
    this.$("#notify").addEventListener("click", (e) => {
      if (e.target.closest("#testnoti")) this._testNotify();
    });
    this._wireSwipe();
  }

  /** Vuốt trái trên 1 dòng bị hở -> lộ nút "Kết thúc hành trình". */
  _wireSwipe() {
    const view = this.$("#view");
    let box = null, x0 = 0, y0 = 0, axis = null, dx = 0;

    view.addEventListener("pointerdown", (e) => {
      const wrap = e.target.closest(".swipe");
      if (!wrap || e.target.closest(".swipe-act")) return;
      box = wrap; x0 = e.clientX; y0 = e.clientY; axis = null; dx = 0;
      try { view.setPointerCapture(e.pointerId); } catch {}  // giữ mạch vuốt khi ngón đi ra ngoài
    });

    view.addEventListener("pointermove", (e) => {
      if (!box) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (axis === null) {
        if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
        axis = Math.abs(mx) > Math.abs(my) ? "x" : "y";
        if (axis === "y") { box = null; return; }  // cuộn dọc -> nhả ra cho trang cuộn
        box.querySelector(".item").style.transition = "none";
      }
      const base = box.classList.contains("open") ? -SWIPE_W : 0;
      dx = Math.max(-SWIPE_W, Math.min(0, base + mx));
      box.querySelector(".item").style.transform = `translateX(${dx}px)`;
    });

    const release = () => {
      if (!box) return;
      const item = box.querySelector(".item");
      item.style.transition = "";
      item.style.transform = "";
      if (axis === "x") {
        const opened = dx < -SWIPE_W / 2;
        this._closeSwipes(opened ? box : null);
        box.classList.toggle("open", opened);
      }
      box = null; axis = null;
    };
    view.addEventListener("pointerup", release);
    view.addEventListener("pointercancel", release);
    view.addEventListener("pointerleave", release);
  }

  _closeSwipes(keep) {
    this.shadowRoot.querySelectorAll(".swipe.open").forEach((n) => {
      if (n !== keep) n.classList.remove("open");
    });
  }
  _swipeBusy() { return !!this.shadowRoot.querySelector(".swipe.open"); }

  async _finish(key) {
    try {
      await this._hass.connection.sendMessagePromise({ type: "cua_cuon/finish", key });
    } catch {}
    this._closeSwipes(null);
    await this._load();
  }

  async _init() {
    this._ready = true;
    await this._load();
    if (this._poll) clearInterval(this._poll);
    if (this._tick) clearInterval(this._tick);
    // đang lộ nút "Kết thúc hành trình" thì hoãn tự làm mới, kẻo vẽ lại làm mất nút
    this._poll = setInterval(() => { if (!this._swipeBusy()) this._load(); }, 5000);
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
  /** "08:13:40 15/08" — mốc thời gian đầy đủ để đối chiếu với log bên ngoài. */
  _stamp(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const t = this._two;
    return `${t(d.getHours())}:${t(d.getMinutes())}:${t(d.getSeconds())} ${t(d.getDate())}/${t(d.getMonth() + 1)}`;
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
    if (!s.open) return null;               // hở điểm đầu -> không tính được
    const start = new Date(s.open).getTime();
    if (isNaN(start)) return null;
    const end = s.close ? new Date(s.close).getTime() : Date.now();
    return Math.max(0, (end - start) / 1000);
  }
  /** Mốc đại diện của 1 lượt (dùng để sắp nhóm theo ngày và làm khóa). */
  _key(s) { return s.open || s.close; }
  /** Lượt bị hở: thiếu điểm đầu hoặc điểm cuối -> cho phép vuốt trái chốt tay. */
  _gap(s) { return !s.open || !s.close; }
  /** Lượt đang mở thật (dòng đầu + tích hợp đang báo mở). */
  _isLive(s, index) { return index === 0 && !!this._data.open && !!s.open && !s.close; }

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

  /**
   * Thẻ "sức khỏe cảm biến": HA đang thấy cảm biến ở trạng thái nào và nhận tin lần cuối lúc nào.
   * Nếu mốc này CŨ HƠN log trong app SmartLife -> lỗi nằm ở đường truyền vào HA
   * (Matter/Tuya), không phải ở tích hợp này.
   */
  _renderHealth() {
    const d = this._data;
    if (!d.sensor) return "";
    const raw = d.sensor_state;
    const dead = raw == null || raw === "unavailable" || raw === "unknown";
    const changed = d.sensor_changed ? new Date(d.sensor_changed) : null;
    const stale = changed ? (Date.now() - changed.getTime()) / 3600000 : null; // giờ
    const warn = dead || (stale != null && stale >= 12);
    const stamp = this._stamp(d.sensor_changed);
    const label = dead ? "MẤT KẾT NỐI" : raw === "on" ? "mở" : raw === "off" ? "đóng" : raw;

    return `<div class="health${warn ? " warn" : ""}">
      <div class="hd">${warn ? "⚠" : "📡"} Cảm biến</div>
      <code>${d.sensor}</code> · trạng thái HA đang thấy: <b>${label}</b><br>
      HA nhận tin lần cuối: <b>${stamp}</b>${changed ? ` · ${this._rel(d.sensor_changed)}` : ""}
      ${d.patched ? `<p>🔁 Đã tự vá <b>${d.patched}</b> lần lệch trạng thái.</p>` : ""}
      ${
        warn
          ? `<p>Nếu app SmartLife có log mới hơn mốc trên thì <b>sự kiện không vào tới HA</b> —
             lỗi ở tích hợp đưa cảm biến vào HA (Matter/Zemismart hoặc Tuya cloud), không phải ở
             màn hình này. Thử: Settings → Devices &amp; Services → tích hợp đó → <b>Reload</b>.</p>`
          : ""
      }
    </div>`;
  }

  /**
   * Thẻ "sức khỏe kênh thông báo": dịch vụ notify còn tồn tại không, lần gửi gần nhất
   * thành công hay lỗi gì. Kèm nút gửi thử để tách bạch "tích hợp không gọi" với
   * "gọi rồi nhưng điện thoại không nhận".
   */
  _renderNotify() {
    const d = this._data;
    const last = d.notify_last;
    const missing = d.notify_service && !d.notify_exists;
    const failed = last && last.ok === false;
    const warn = missing || failed || !d.notify_service || d.ready === false;

    const rows = [];
    rows.push(
      d.notify_service
        ? `<code>${d.notify_service}</code> · ${
            d.notify_exists
              ? `<span class="ok">dịch vụ còn tồn tại</span>`
              : `<span class="no">KHÔNG CÒN dịch vụ này trong HA</span>`
          }`
        : `<span class="no">Chưa chọn dịch vụ thông báo</span>`
    );
    if (last) {
      rows.push(
        `Lần gửi cuối: <b>${this._stamp(last.at)}</b> · ${
          last.ok ? `<span class="ok">thành công</span>` : `<span class="no">THẤT BẠI</span>`
        }`
      );
    } else {
      rows.push(`Lần gửi cuối: <b>chưa gửi lần nào</b> kể từ khi HA khởi động`);
    }
    if (d.ready === false) rows.push(`<span class="no">⚠ Tích hợp chưa đồng bộ xong</span>`);

    return `<div class="health${warn ? " warn" : ""}">
      <div class="hd">${warn ? "⚠" : "🔔"} Thông báo</div>
      ${rows.join("<br>")}
      ${last && last.err ? `<span class="err">${last.err}</span>` : ""}
      ${
        missing
          ? `<p>Điện thoại đã đăng ký lại nên <b>tên dịch vụ đổi</b>. Vào
             <b>Configure</b> chọn lại đúng <code>notify.mobile_app_…</code> đang có.</p>`
          : ""
      }
      <div class="row"><button class="btn" id="testnoti">🔔 Gửi thử</button></div>
    </div>`;
  }

  async _testNotify() {
    const btn = this.$("#testnoti");
    if (btn) { btn.disabled = true; btn.textContent = "Đang gửi…"; }
    let res = null;
    try {
      res = await this._hass.connection.sendMessagePromise({ type: "cua_cuon/test_notify" });
    } catch (e) {
      res = { ok: false, err: String(e) };
    }
    await this._load();
    alert(
      res && res.ok
        ? "Đã gửi xong, HA không báo lỗi.\n\nNếu điện thoại KHÔNG rung/hiện gì thì vấn đề nằm ở app HA trên máy (quyền thông báo, Focus, tiết kiệm pin) chứ không phải ở HA."
        : `Gửi THẤT BẠI.\n\n${(res && res.err) || "không rõ lỗi"}`
    );
  }

  _renderStats() {
    const today = this._dayKey(new Date().toISOString());
    const list = (this._data.sessions || []).filter((s) => this._dayKey(this._key(s)) === today);
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
    const live = this._isLive(s, index);
    const gap = this._gap(s);
    const key = this._key(s);
    const secs = this._seconds(s);
    const alertMin = Number(this._data.alert_minutes || 0);
    const long = alertMin > 0 && secs != null && secs >= alertMin * 60;

    const from = s.open ? this._hm(s.open) : `<span class="miss">—</span>`;
    const to = s.close
      ? this._hm(s.close)
      : live
      ? `<span class="now">đang mở</span>`
      : `<span class="miss">—</span>`;

    const notes = [`#${total - index}`, this._rel(key)];
    if (Number(s.alerts)) notes.push(`<span class="flag">⏰ ${s.alerts} lần nhắc</span>`);
    if (s.manual) notes.push(`<span class="manual">✍ chốt tay</span>`);
    else if (gap) notes.push(`<span class="swipehint">← vuốt để chốt</span>`);

    const item = `<div class="item${live ? " live" : ""}${gap && !live ? " gap" : ""}">
      <div class="ic">${live ? OPEN_IC : GARAGE}</div>
      <div class="meta">
        <div class="times">${from}<span class="arrow">→</span>${to}</div>
        <div class="rel">${notes.join(" · ")}</div>
      </div>
      <span class="dur${long ? " long" : ""}">${this._dur(secs)}</span>
    </div>`;

    if (!gap) return item;
    return `<div class="swipe" data-key="${key}">
      <button class="swipe-act" data-finish="${key}"><b>✓</b><span>Kết thúc<br>hành trình</span></button>
      ${item}
    </div>`;
  }

  _render() {
    const sessions = this._data.sessions || [];
    const n = sessions.length;
    this.$("#alert").innerHTML =
      this._data.ready === false
        ? `<div class="alert">⛔ <b>Tích hợp chưa đồng bộ xong</b> — nó đang <b>KHÔNG xử lý</b>
             sự kiện đóng/mở nào, nên nhật ký lẫn thông báo đều đứng im.<br>
             Xử lý: Settings → Devices &amp; Services → <b>Cửa cuốn</b> → ⋮ → <b>Reload</b>.</div>`
        : "";
    this.$("#hero").innerHTML = this._renderHero();
    this.$("#health").innerHTML = this._renderHealth();
    this.$("#notify").innerHTML = this._renderNotify();
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
      const key = this._dayKey(this._key(s));
      let g = groups[groups.length - 1];
      if (!g || g.key !== key) groups.push((g = { key, rows: [] }));
      g.rows.push({ s, i });
    });

    const wasOpen = [...this.shadowRoot.querySelectorAll(".swipe.open")].map((el) => el.dataset.key);

    view.innerHTML = groups
      .map((g) => {
        const durs = g.rows.map((r) => this._seconds(r.s)).filter((v) => v != null);
        const total = durs.reduce((a, b) => a + b, 0);
        return `<div class="day"><h2>${this._dayLabel(g.key)}</h2>
            <span>${g.rows.length} lượt · tổng ${this._dur(total)}</span></div>
          <div class="list">${g.rows.map((r) => this._renderRow(r.s, r.i, n)).join("")}</div>`;
      })
      .join("");

    // giữ nguyên dòng đang lộ nút sau khi vẽ lại
    wasOpen.forEach((k) => {
      const el = this.shadowRoot.querySelector(`.swipe[data-key="${CSS.escape(k)}"]`);
      if (el) el.classList.add("open");
    });
  }
}

if (!customElements.get("cua-cuon-panel")) {
  customElements.define("cua-cuon-panel", CuaCuonPanel);
}
console.info("%c CỬA CUỐN %c panel v5 ", "background:#6aa9ff;color:#0f1420;border-radius:4px 0 0 4px;padding:2px 6px",
  "background:#26507f;color:#fff;border-radius:0 4px 4px 0;padding:2px 6px");
