import { 
  collection, doc, getDocs, setDoc, updateDoc, getDoc,
  addDoc, deleteDoc, query, orderBy, limit, onSnapshot
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

let map = null;
let allPlanets = [];
let markers = [];
let fleet = [];
let fleetMarkers = [];
let actionLog = [];
let activeTimerInterval = null;

let sanCredits = 5000;
let shipments = [];
let shipmentLayers = [];
let probes = [];
let probeLayers = [];
let hubRefills = [];
let hubRefillLayers = [];
let dss = null;
let dssMarker = null;

let unsubPlanets = null;
let unsubFleet = null;
let unsubShipments = null;
let unsubProbes = null;
let unsubSan = null;
let unsubNews = null;
let unsubOrder = null;
let unsubHubRefills = null;

const DANGER_STATUSES = ["Под угрозой", "Под атакой", "Оккупирована", "Потеряна"];
const SE_CONTROLLED = ["Столица", "Свободна"];
const GEO_ALLOWED = ["Столица", "Свободна", "Под угрозой", "Под атакой"];
const ALL_STATUSES = ["Столица", "Свободна", "Под угрозой", "Под атакой", "Оккупирована", "Потеряна"];
const PROTECTED_BASES = ["Super Earth", "Pathfinder-V"];
const HOUR_MS = 60 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RESUPPLY_HOURS_MAX = 12;
const SHIPMENT_COST = 500;
const CONVOY_COST = 3000;
const REWARD_NO_CONVOY = 4000;
const REWARD_WITH_CONVOY = 1500;
const TRAVEL_FROM_SUPER_EARTH = 3 * HOUR_MS;
const TRAVEL_FROM_HUB = 1 * HOUR_MS;
const MAX_CAPTURE_DAYS = 7;
const MAX_PROBES = 3;
const PROBE_TIME = 4 * HOUR_MS;

const HUB_SHIPMENT_COST_RESERVE = 25;
const HUB_REFILL_TIME = 2 * HOUR_MS;
const HUB_REFILL_BONUS = { ore: 20, fuel: 25, rare: 40 };

const DSS_ICON = "assets/poi/dss.png";
const DSS_BLOCKADE_MS = 4 * HOUR_MS;
const DSS_SURFACE_MS = 2 * HOUR_MS;
const DSS_ROTATION_CD = 40 * HOUR_MS;
const DSS_EXTERMINATUS_CD = 10 * DAY_MS;
const DSS_MAINTENANCE_MS = 48 * HOUR_MS;

const ORE_LIST = ["Титан","Кобальт","Астронит","Феррокристал","Никель","Вольтарит","Рубиконит","Палладий","Термолит"];
const FUEL_LIST = ["Водородное топливо","Метановый конденсат","Ионный концентрат","Крио-топливо","Кварковое топливо","Термоядерные стержни","Антиматерия","Е-711"];
const RARE_LIST = ["Кристаллы Элизиума","Тёмная материя","Квантовый лёд","Звёздный янтарь","Адаптивный концентрат","Пустотный камень","Гравитационные жемчужины"];

function dssSignature(d) {
  if (!d) return "";
  return [d.planet, d.status, d.ability, d.abilityUntil, d.resupplyUntil, d.readiness, d.captureMultiplier, d.lastRotation, d.lastExterminatus].join("|");
}

window.addEventListener("user-ready", function() {
  if (map) return;

  setTimeout(async () => {
    map = L.map("map", {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 3,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      zoomControl: false
    });

    const bounds = [[0, 0], [4000, 4000]];
    L.imageOverlay("assets/map.png", bounds).addTo(map);
    map.fitBounds(bounds);
    map.setMaxBounds(bounds);
    setTimeout(() => map.invalidateSize(), 100);

    const sectors = [
      { name: "Valdis", color: "#ff2a2a", coords: [[3414,589],[3531,716],[3632,846],[3729,999],[3565,1095],[3644,1248],[3701,1387],[3744,1530],[3357,1634],[3297,1457],[3237,1333],[3138,1177],[3045,1062],[2995,1008]] },
      { name: "L'estrade", color: "#ffe700", coords: [[3392,2806],[3343,2885],[3238,3026],[3134,3141],[3007,3254],[2867,3354],[2747,3423],[2635,3477],[2530,3518],[2418,3553],[2470,3745],[2629,3694],[2803,3618],[2906,3564],[3001,3729],[3111,3660],[3208,3590],[3295,3520],[3413,3411],[3490,3330],[3565,3241],[3643,3137],[3729,3001]] },
      { name: "Falstaff", color: "#ffe700", coords: [[3389,2804],[3339,2883],[3260,2993],[3204,3060],[3136,3133],[2713,2711],[2755,2665],[2784,2631],[2820,2583],[2856,2529],[2871,2504]] },
      { name: "Mirin", color: "#ffe700", coords: [[2852,2854],[2791,2911],[2733,2958],[2662,3009],[2605,3044],[2804,3388],[2865,3351],[2919,3315],[2983,3268],[3060,3204],[3133,3136]] }
    ];
    sectors.forEach(s => {
      L.polygon(s.coords, {
        color: s.color, weight: 1, opacity: 0.6,
        fillColor: s.color, fillOpacity: 0.18, interactive: false
      }).addTo(map);
    });

    function getTravelTime(fromName) {
      return fromName === "Super Earth" ? TRAVEL_FROM_SUPER_EARTH : TRAVEL_FROM_HUB;
    }
    function isFactoryHub(planet) {
      return planet && (planet.biome || "").toLowerCase() === "factory hub";
    }
    function isSEControlled(planet) {
      return planet && SE_CONTROLLED.includes(planet.status);
    }
    function isProtectedBase(name) {
      return PROTECTED_BASES.includes(name);
    }
    function rateFromDays(days) {
      if (!days || days <= 0) return 1;
      return 100 / ((days * DAY_MS) / HALF_HOUR_MS);
    }
    function updateCreditsUI() {
      const a = document.getElementById("san-credits");
      const b = document.getElementById("san-credits-funds");
      if (a) a.textContent = sanCredits;
      if (b) b.textContent = sanCredits;
    }
    function pickRandom(arr, minCount, maxCount) {
      const n = Math.floor(Math.random() * (maxCount - minCount + 1)) + minCount;
      const copy = [...arr].sort(() => Math.random() - 0.5);
      return copy.slice(0, Math.min(n, arr.length));
    }
    function buildSurveyResult() {
      return {
        ore: pickRandom(ORE_LIST, 1, 3),
        fuel: Math.random() < 0.8 ? pickRandom(FUEL_LIST, 1, 2) : [],
        rare: Math.random() < 0.5 ? pickRandom(RARE_LIST, 1, 2) : [],
        surveyedAt: Date.now()
      };
    }
    function isPopupOpen() {
      return !!(map && map._popup && map.hasLayer(map._popup));
    }
    function planetsSignature(list) {
      return JSON.stringify((list || []).map(p => [
        p.name, p.status, p.enemyPressure, p.superEarthControl,
        p.enemyCaptureDays, p.seCaptureDays, p.enemyMultiplier, p.hubReserves,
        p.geoSurvey ? p.geoSurvey.surveyedAt : null
      ]));
    }
    function fleetSignature(list) {
      return JSON.stringify((list || []).map(u => [u.id, u.planet, u.readiness, u.resupplyUntil]));
    }
    function getDivisionBonus(planetName) {
      let bonus = 0;
      fleet.filter(u => u.type !== "DSS" && u.planet === planetName).forEach(u => {
        if (u.type === "Helldivers") bonus += 30;
        if (u.type === "SEAF") bonus += 15;
      });
      return Math.min(100, bonus);
    }
    function updatePlanetControl() {
      allPlanets.forEach(planet => {
        const bonus = getDivisionBonus(planet.name);
        if (planet.status === "Под атакой") {
          const current = Number(planet.superEarthControl) || 0;
          if (bonus > current) planet.superEarthControl = bonus;
        } else {
          planet.superEarthControl = bonus;
        }
      });
    }
    async function syncDivisionBonusToFirestore() {
      for (const planet of allPlanets) {
        if (planet.status !== "Под атакой") continue;
        const bonus = getDivisionBonus(planet.name);
        const current = Number(planet.superEarthControl) || 0;
        if (bonus > current) {
          planet.superEarthControl = bonus;
          if (!planet.lastPressureTick) planet.lastPressureTick = Date.now();
          try {
            await updateDoc(doc(window.db, "planets", planet.name), {
              superEarthControl: bonus,
              lastPressureTick: planet.lastPressureTick
            });
          } catch (e) {}
        }
      }
    }
    function ensureHubReserves(planet) {
      if (isFactoryHub(planet) && (planet.hubReserves === undefined || planet.hubReserves === null)) {
        planet.hubReserves = 100;
      }
    }

    // ===== НОВОСТИ =====
    async function loadNews() {
      try {
        const snap = await getDoc(doc(window.db, "settings", "news"));
        let top = "ДОБРО ПОЖАЛОВАТЬ В AVID RP-SHERS · ЗА ДЕМОКРАТИЮ";
        let bottom = "СУПЕР-ЗЕМЛЯ НЕ СЛОМЛЕНА · УНИЧТОЖЬТЕ ВРАГОВ СВОБОДЫ";
        if (snap.exists()) {
          top = snap.data().top || top;
          bottom = snap.data().bottom || bottom;
        }
        applyNews(top, bottom);
        const ti = document.getElementById("news-top-input");
        const bi = document.getElementById("news-bottom-input");
        if (ti) ti.value = top;
        if (bi) bi.value = bottom;
      } catch (e) {}
    }
    function applyNews(top, bottom) {
      const safe = (t) => String(t || "").replace(/</g, "&lt;");
      const topTrack = document.getElementById("news-top-track");
      const bottomTrack = document.getElementById("news-bottom-track");
      if (topTrack) topTrack.innerHTML = `<span class="news-text">${safe(top)}</span>`;
      if (bottomTrack) bottomTrack.innerHTML = `<span class="news-text">${safe(bottom)}</span>`;
    }
    async function saveNews() {
      const top = document.getElementById("news-top-input")?.value?.trim() || "";
      const bottom = document.getElementById("news-bottom-input")?.value?.trim() || "";
      try {
        await setDoc(doc(window.db, "settings", "news"), { top, bottom, updatedAt: Date.now() });
        applyNews(top, bottom);
        await addLog("Freya обновила новости на карте");
        alert("Новости сохранены");
      } catch (e) { alert("Ошибка"); }
    }

    // ===== ГЛАВНЫЙ ПРИКАЗ =====
    async function loadMainOrder() {
      try {
        const snap = await getDoc(doc(window.db, "settings", "mainOrder"));
        const btnView = document.getElementById("btn-view-order");
        if (!snap.exists() || !snap.data().active) {
          if (btnView) btnView.style.display = "none";
          return null;
        }
        if (btnView) btnView.style.display = "block";
        return snap.data();
      } catch (e) { return null; }
    }
    function showMainOrder(data) {
      if (!data || !data.active) return;
      const overlay = document.getElementById("order-overlay");
      const title = document.getElementById("order-view-title");
      const textEl = document.getElementById("order-view-text");
      const img = document.getElementById("order-view-image");
      if (title) title.textContent = data.title || "ГЛАВНЫЙ ПРИКАЗ";
      if (textEl) textEl.textContent = data.text || "";
      if (img) {
        if (data.image) { img.src = data.image; img.style.display = "block"; }
        else { img.removeAttribute("src"); img.style.display = "none"; }
      }
      if (overlay) overlay.style.display = "flex";
    }
    async function publishMainOrder() {
      const title = document.getElementById("order-title")?.value?.trim() || "ГЛАВНЫЙ ПРИКАЗ";
      const text = document.getElementById("order-text")?.value?.trim() || "";
      const image = document.getElementById("order-image")?.value?.trim() || "";
      if (!text) { alert("Введите текст приказа"); return; }
      try {
        const data = { title, text, image, active: true, updatedAt: Date.now(), author: "Freya" };
        await setDoc(doc(window.db, "settings", "mainOrder"), data);
        await addLog("Freya опубликовала <b>Главный приказ</b>");
        showMainOrder(data);
        const btnView = document.getElementById("btn-view-order");
        if (btnView) btnView.style.display = "block";
        alert("Приказ опубликован");
      } catch (e) { alert("Ошибка"); }
    }
    async function clearMainOrder() {
      if (!confirm("Снять главный приказ?")) return;
      try {
        await setDoc(doc(window.db, "settings", "mainOrder"), {
          active: false, title: "", text: "", image: "", updatedAt: Date.now()
        });
        const overlay = document.getElementById("order-overlay");
        if (overlay) overlay.style.display = "none";
        const btnView = document.getElementById("btn-view-order");
        if (btnView) btnView.style.display = "none";
        await addLog("Freya сняла Главный приказ");
        alert("Приказ снят");
      } catch (e) { alert("Ошибка"); }
    }

    // ===== ПЛАНЕТЫ =====
    async function loadPlanets() {
      try {
        const snapshot = await getDocs(collection(window.db, "planets"));
        const now = Date.now();
        if (snapshot.empty) {
          const response = await fetch("planets.json");
          const planets = await response.json();
          for (const p of planets) {
            p.enemyPressure = p.enemyPressure ?? 0;
            p.superEarthControl = p.superEarthControl ?? 0;
            p.lastPressureTick = now;
            p.enemyCaptureDays = p.enemyCaptureDays ?? null;
            p.seCaptureDays = p.seCaptureDays ?? null;
            p.enemyMultiplier = p.enemyMultiplier ?? 1;
            p.geoSurvey = p.geoSurvey ?? null;
            if (isFactoryHub(p)) p.hubReserves = p.hubReserves ?? 100;
            await setDoc(doc(window.db, "planets", p.name), p);
          }
          allPlanets = planets;
        } else {
          allPlanets = [];
          for (const d of snapshot.docs) {
            const p = { ...d.data(), name: d.data().name || d.id };
            ensureHubReserves(p);
            if (p.enemyMultiplier === undefined) p.enemyMultiplier = 1;
            allPlanets.push(await processPlanetPressure(p, now));
          }
        }
      } catch (e) {
        console.error(e);
        try {
          const response = await fetch("planets.json");
          allPlanets = await response.json();
        } catch (e2) {}
      }
    }

    async function processPlanetPressure(planet, now) {
      if (planet.status !== "Под атакой") {
        if (!planet.lastPressureTick) {
          planet.lastPressureTick = now;
          try { await updateDoc(doc(window.db, "planets", planet.name), { lastPressureTick: now }); } catch (e) {}
        }
        return planet;
      }
      let enemy = Number(planet.enemyPressure) || 0;
      let control = Number(planet.superEarthControl) || 0;
      if (enemy <= 0 && control <= 0) {
        planet.lastPressureTick = now;
        return planet;
      }
      let lastTick = planet.lastPressureTick || now;
      const intervals = Math.floor((now - lastTick) / HALF_HOUR_MS);
      if (intervals <= 0) return planet;

      let mult = Math.max(1, Number(planet.enemyMultiplier) || 1);
      if (dss && dss.planet === planet.name && dss.ability === "surface" && dss.abilityUntil > now) {
        mult = Math.max(1, mult * 0.9);
      }
      let seMult = 1;
      if (dss && dss.planet === planet.name && dss.status !== "maintenance") {
        seMult = Math.max(1, Number(dss.captureMultiplier) || 1);
      }

      if (enemy > 0) enemy = Math.min(100, enemy + intervals * rateFromDays(planet.enemyCaptureDays) * mult);
      if (control > 0) control = Math.min(100, control + intervals * rateFromDays(planet.seCaptureDays) * seMult);
      lastTick += intervals * HALF_HOUR_MS;

      let newStatus = planet.status;
      let statusChanged = false;
      if (control >= 100 && enemy < 100) {
        newStatus = "Свободна"; enemy = 0; control = 0; statusChanged = true;
      } else if (enemy >= 100) {
        newStatus = "Оккупирована"; enemy = 0; control = 0; statusChanged = true;
      }

      planet.enemyPressure = +enemy.toFixed(2);
      planet.superEarthControl = +control.toFixed(2);
      planet.lastPressureTick = lastTick;
      planet.status = newStatus;

      try {
        await updateDoc(doc(window.db, "planets", planet.name), {
          enemyPressure: planet.enemyPressure,
          superEarthControl: planet.superEarthControl,
          lastPressureTick: lastTick,
          status: newStatus
        });
        if (statusChanged) {
          await addLog(newStatus === "Свободна"
            ? `Планета <b>${planet.name}</b> освобождена силами Супер-Земли!`
            : `Планета <b>${planet.name}</b> оккупирована врагом!`);
        }
      } catch (e) {}
      return planet;
    }

    function formatTime(ms) {
      if (ms <= 0) return "Захват завершён";
      if (!isFinite(ms)) return "—";
      const days = Math.floor(ms / DAY_MS);
      const hours = Math.floor((ms % DAY_MS) / HOUR_MS);
      const minutes = Math.floor((ms % HOUR_MS) / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      const parts = [];
      if (days > 0) parts.push(`${days}д`);
      if (hours > 0 || days > 0) parts.push(`${hours}ч`);
      parts.push(`${minutes}м`);
      parts.push(`${seconds}с`);
      return parts.join(" ");
    }
    function getRemainingMs(percent, lastTick, captureDays, mult = 1) {
      if (percent <= 0) return null;
      if (percent >= 100) return 0;
      const rate = rateFromDays(captureDays) * Math.max(1, mult);
      let totalMs = ((100 - percent) / rate) * HALF_HOUR_MS;
      const msInto = (Date.now() - (lastTick || Date.now())) % HALF_HOUR_MS;
      return Math.max(0, totalMs - msInto);
    }
    function getResupplyHours(readiness) {
      const r = Math.max(0, Math.min(100, Number(readiness) || 0));
      return +(RESUPPLY_HOURS_MAX * (100 - r) / 100).toFixed(2);
    }

    function renderHubReservesList() {
      const container = document.getElementById("hub-reserves-list");
      if (!container) return;
      const hubs = allPlanets.filter(p => isFactoryHub(p));
      if (!hubs.length) {
        container.innerHTML = "<div style='color:#666;font-size:13px;'>Нет Factory Hub</div>";
        return;
      }
      container.innerHTML = hubs.map(p => {
        const res = Number(p.hubReserves ?? 100);
        const cls = res < 25 ? "low" : res < 50 ? "mid" : "";
        return `<div class="hub-reserve-item">
          <strong>${p.name}</strong> · ${res.toFixed(0)}%
          <div class="hub-reserve-bar"><div class="hub-reserve-fill ${cls}" style="width:${res}%"></div></div>
        </div>`;
      }).join("");
    }

    // ===== SAN =====
    async function loadSanData() {
      try {
        const ref = doc(window.db, "players", "san");
        const snap = await getDoc(ref);
        if (!snap.exists()) {
          await setDoc(ref, { credits: 5000 });
          sanCredits = 5000;
        } else sanCredits = snap.data().credits ?? 5000;
        updateCreditsUI();
      } catch (e) { sanCredits = 5000; }
    }
    async function saveSanCredits() {
      try {
        await setDoc(doc(window.db, "players", "san"), { credits: sanCredits }, { merge: true });
        updateCreditsUI();
      } catch (e) {}
    }
    async function loadFundRequests() {
      try {
        const snapshot = await getDocs(collection(window.db, "fund_requests"));
        const list = [];
        snapshot.forEach(d => list.push({ id: d.id, ...d.data() }));
        list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        return list;
      } catch (e) { return []; }
    }
    async function renderMyFundRequests() {
      const container = document.getElementById("my-fund-requests");
      if (!container) return;
      const list = await loadFundRequests();
      if (!list.length) {
        container.innerHTML = "<div style='color:#666;font-size:13px;'>Запросов нет</div>";
        return;
      }
      container.innerHTML = list.map(r => {
        const color = r.status === "approved" ? "#4caf50" : r.status === "denied" ? "#ff2a2a" : "#ff9800";
        const label = r.status === "approved" ? "ОДОБРЕНО" : r.status === "denied" ? "ОТКЛОНЕНО" : "ОЖИДАЕТ";
        return `<div class="fund-request-item"><strong style="color:${color}">${label}</strong> · ${r.amount} ¢
          <div style="margin-top:4px;color:#aaa;">${r.comment || "—"}</div></div>`;
      }).join("");
    }
    async function renderAdminFundRequests() {
      const container = document.getElementById("admin-fund-requests");
      if (!container) return;
      const list = (await loadFundRequests()).filter(r => r.status === "pending");
      const cu = window.getCurrentUser();
      const isFreya = cu && (cu.name === "Freya" || cu.email === "freya@semail.com");
      if (!list.length) {
        container.innerHTML = "<div style='color:#666;font-size:13px;'>Нет активных запросов</div>";
        return;
      }
      container.innerHTML = "";
      list.forEach(r => {
        const div = document.createElement("div");
        div.className = "fund-request-item";
        div.innerHTML = `<strong>${r.amount} ¢</strong><div style="margin-top:4px;color:#aaa;">${r.comment || "—"}</div>`;
        if (isFreya) {
          const ok = document.createElement("button");
          ok.textContent = "Одобрить";
          ok.style.cssText = "margin-top:8px;margin-right:6px;background:#4caf50;color:#fff;border:none;padding:6px 10px;cursor:pointer;";
          ok.onclick = () => resolveFundRequest(r, true);
          const no = document.createElement("button");
          no.textContent = "Отклонить";
          no.style.cssText = "margin-top:8px;background:#ff2a2a;color:#fff;border:none;padding:6px 10px;cursor:pointer;";
          no.onclick = () => resolveFundRequest(r, false);
          div.appendChild(ok);
          div.appendChild(no);
        }
        container.appendChild(div);
      });
    }
    async function sendFundRequest() {
      const amount = parseInt(document.getElementById("fund-amount")?.value || "0");
      const comment = document.getElementById("fund-comment")?.value || "";
      if (!amount || amount < 100) { alert("Минимум 100 ¢"); return; }
      try {
        await addDoc(collection(window.db, "fund_requests"), {
          amount, comment, status: "pending", createdAt: Date.now(), from: "San"
        });
        await addLog(`San запросил <b>${amount} ¢</b> у Freya`);
        const ta = document.getElementById("fund-comment");
        if (ta) ta.value = "";
        await renderMyFundRequests();
        alert("Запрос отправлен Freya");
      } catch (e) { alert("Ошибка"); }
    }
    async function resolveFundRequest(req, approve) {
      try {
        if (approve) {
          const ref = doc(window.db, "players", "san");
          const snap = await getDoc(ref);
          let credits = snap.exists() ? (snap.data().credits ?? 0) : 0;
          credits += req.amount;
          sanCredits = credits;
          await setDoc(ref, { credits }, { merge: true });
          updateCreditsUI();
          await updateDoc(doc(window.db, "fund_requests", req.id), { status: "approved", resolvedAt: Date.now() });
          await addLog(`Freya одобрила запрос San на <b>${req.amount} ¢</b>`);
        } else {
          await updateDoc(doc(window.db, "fund_requests", req.id), { status: "denied", resolvedAt: Date.now() });
          await addLog(`Freya отклонила запрос San на <b>${req.amount} ¢</b>`);
        }
        await renderAdminFundRequests();
      } catch (e) { alert("Ошибка"); }
    }

    // ===== ПОСТАВКИ =====
    async function completeShipment(s) {
      const toPlanet = allPlanets.find(p => p.name === s.to);
      let destroyed = false;
      const dssProtects = dss
        && dss.ability === "blockade"
        && dss.abilityUntil > Date.now()
        && dss.planet === s.to;
      if (toPlanet && toPlanet.status === "Под атакой" && !s.convoy && !dssProtects) {
        if (Math.random() < 0.5) destroyed = true;
      }
      if (destroyed) {
        s.status = "destroyed";
        s.resultMessage = `Поставка ${s.from} → ${s.to} уничтожена врагом`;
        try {
          await updateDoc(doc(window.db, "shipments", s.id), {
            status: "destroyed", resultMessage: s.resultMessage, completedAt: Date.now()
          });
          await addLog(`Поставка <b>${s.from} → ${s.to}</b> уничтожена врагом (без конвоя)`);
        } catch (e) {}
        await renderShipmentResults();
        return s;
      }
      const reward = s.convoy ? REWARD_WITH_CONVOY : REWARD_NO_CONVOY;
      s.status = "delivered";
      s.resultMessage = `Поставка ${s.from} → ${s.to} успешно доставлена | +${reward} ¢`;
      sanCredits += reward;
      await saveSanCredits();
      try {
        await updateDoc(doc(window.db, "shipments", s.id), {
          status: "delivered", resultMessage: s.resultMessage, completedAt: Date.now()
        });
        if (toPlanet && toPlanet.status === "Под атакой") {
          const newControl = Math.min(100, (Number(toPlanet.superEarthControl) || 0) + 5);
          toPlanet.superEarthControl = newControl;
          toPlanet.lastPressureTick = toPlanet.lastPressureTick || Date.now();
          await updateDoc(doc(window.db, "planets", toPlanet.name), {
            superEarthControl: newControl, lastPressureTick: toPlanet.lastPressureTick
          });
          for (const unit of fleet.filter(u => u.type !== "DSS" && u.planet === s.to)) {
            const newR = Math.min(100, (Number(unit.readiness) || 0) + 15);
            unit.readiness = newR;
            await updateDoc(doc(window.db, "fleet", unit.id), { readiness: newR });
          }
          s.resultMessage += " (+5% СЗ, +15% дивизиям)";
          await updateDoc(doc(window.db, "shipments", s.id), { resultMessage: s.resultMessage });
          if (!isPopupOpen()) renderPlanets();
          renderFleetMarkers();
        }
        await addLog(`Поставка <b>${s.from} → ${s.to}</b> доставлена! +${reward} ¢`);
      } catch (e) {}
      await renderShipmentResults();
      return s;
    }
    async function loadShipments() {
      try {
        const snapshot = await getDocs(collection(window.db, "shipments"));
        const now = Date.now();
        shipments = [];
        for (const d of snapshot.docs) {
          let s = { id: d.id, ...d.data() };
          if (s.status === "in_transit" && s.arriveAt && now >= s.arriveAt) s = await completeShipment(s);
          if (s.status === "in_transit") shipments.push(s);
        }
        renderShipmentsOnMap();
        renderRoutesList();
        await renderShipmentResults();
      } catch (e) {}
    }
    function renderShipmentsOnMap() {
      shipmentLayers.forEach(l => map.removeLayer(l));
      shipmentLayers = [];
      const now = Date.now();
      shipments.forEach(s => {
        if (s.status !== "in_transit") return;
        const fromP = allPlanets.find(p => p.name === s.from);
        const toP = allPlanets.find(p => p.name === s.to);
        if (!fromP || !toP) return;
        const line = L.polyline([[fromP.y, fromP.x], [toP.y, toP.x]], {
          color: s.convoy ? "#00b4d8" : "#ff9800", weight: 2, opacity: 0.7, dashArray: "8 8"
        }).addTo(map);
        shipmentLayers.push(line);
        const travelMs = s.travelMs || getTravelTime(s.from);
        const start = s.departAt || (s.arriveAt - travelMs);
        const progress = Math.min(1, Math.max(0, (now - start) / travelMs));
        const lat = fromP.y + (toP.y - fromP.y) * progress;
        const lng = fromP.x + (toP.x - fromP.x) * progress;
        const cargoMarker = L.marker([lat, lng], {
          icon: L.icon({ iconUrl: "assets/poi/ressuply.png", iconSize: [28, 28], iconAnchor: [14, 14] })
        }).addTo(map);
        cargoMarker.bindTooltip(`${s.from} → ${s.to}${s.convoy ? " 🛡" : ""}`, { direction: "top" });
        shipmentLayers.push(cargoMarker);
        if (s.convoy) {
          const convoyMarker = L.marker([lat + 12, lng + 14], {
            icon: L.icon({ iconUrl: "assets/poi/sd.png", iconSize: [26, 26], iconAnchor: [13, 13] })
          }).addTo(map);
          convoyMarker.bindTooltip("Конвой", { direction: "top" });
          shipmentLayers.push(convoyMarker);
        }
      });
    }
    function renderRoutesList() {
      const container = document.getElementById("routes-list");
      if (!container) return;
      const active = shipments.filter(s => s.status === "in_transit");
      if (!active.length) {
        container.innerHTML = "<div style='color:#666;font-size:13px;'>Нет активных поставок</div>";
        return;
      }
      const now = Date.now();
      container.innerHTML = active.map(s => {
        const leftH = Math.max(0, (s.arriveAt - now) / HOUR_MS);
        return `<div class="route-item"><strong>${s.from} → ${s.to}</strong>
          <div style="margin-top:4px;">${s.convoy ? "🛡 Конвой" : "⚠ Без конвоя"} · ~${leftH.toFixed(1)} ч</div></div>`;
      }).join("");
    }
    async function renderShipmentResults() {
      const container = document.getElementById("shipment-results");
      if (!container) return;
      try {
        const snapshot = await getDocs(collection(window.db, "shipments"));
        const done = [];
        snapshot.forEach(d => {
          const s = { id: d.id, ...d.data() };
          if (s.status === "delivered" || s.status === "destroyed") done.push(s);
        });
        done.sort((a, b) => (b.completedAt || 0) - (a.createdAt || 0));
        done.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
        const recent = done.slice(0, 20);
        if (!recent.length) {
          container.innerHTML = "<div style='color:#666;font-size:13px;'>Пока нет завершённых поставок</div>";
          return;
        }
        container.innerHTML = recent.map(s => {
          const ok = s.status === "delivered";
          const color = ok ? "#4caf50" : "#ff2a2a";
          return `<div class="route-item" style="border-color:${color};">
            <strong style="color:${color};">${ok ? "ДОСТАВЛЕНО" : "УНИЧТОЖЕНО"}</strong>
            <div style="margin-top:4px;">${s.from} → ${s.to}</div>
            <div style="margin-top:4px;color:#aaa;font-size:12px;">${s.resultMessage || ""}</div></div>`;
        }).join("");
      } catch (e) {}
    }
    async function clearShipmentResults() {
      if (!confirm("Очистить результаты поставок?")) return;
      try {
        const snapshot = await getDocs(collection(window.db, "shipments"));
        const dels = [];
        snapshot.forEach(d => {
          const s = d.data();
          if (s.status === "delivered" || s.status === "destroyed") dels.push(deleteDoc(d.ref));
        });
        await Promise.all(dels);
        await renderShipmentResults();
      } catch (e) { alert("Ошибка"); }
    }
    function fillRouteSelects() {
      const fromSel = document.getElementById("route-from");
      const toSel = document.getElementById("route-to");
      if (!fromSel || !toSel) return;
      const fromVal = fromSel.value;
      const toVal = toSel.value;
      fromSel.innerHTML = "";
      toSel.innerHTML = "";
      allPlanets.filter(p => p.name === "Super Earth" || isFactoryHub(p)).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.name;
        const res = isFactoryHub(p) ? ` [${Number(p.hubReserves ?? 100).toFixed(0)}%]` : "";
        opt.textContent = p.name + (p.name === "Super Earth" ? " (3 ч)" : " (1 ч)" + res);
        fromSel.appendChild(opt);
      });
      allPlanets.filter(p => isSEControlled(p) || p.status === "Под атакой").forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = p.name + (p.status === "Под атакой" ? " ⚔" : "");
        toSel.appendChild(opt);
      });
      if (fromVal) fromSel.value = fromVal;
      if (toVal) toSel.value = toVal;
    }
    async function createShipment() {
      const from = document.getElementById("route-from")?.value;
      const to = document.getElementById("route-to")?.value;
      const withConvoy = document.getElementById("route-convoy")?.checked;
      if (!from || !to || from === to) { alert("Выберите разные планеты"); return; }
      const fromP = allPlanets.find(p => p.name === from);
      const toP = allPlanets.find(p => p.name === to);
      if (!fromP || !toP) return;
      if (!(fromP.name === "Super Earth" || isFactoryHub(fromP))) {
        alert("Только Super Earth или Factory Hub"); return;
      }
      if (!isSEControlled(toP) && toP.status !== "Под атакой") {
        alert("Недопустимая цель"); return;
      }
      if (isFactoryHub(fromP)) {
        const res = Number(fromP.hubReserves ?? 100);
        if (res < HUB_SHIPMENT_COST_RESERVE) {
          alert(`На ${from} мало резервов (${res.toFixed(0)}%). Нужно ≥ ${HUB_SHIPMENT_COST_RESERVE}%`);
          return;
        }
        fromP.hubReserves = res - HUB_SHIPMENT_COST_RESERVE;
        try {
          await updateDoc(doc(window.db, "planets", fromP.name), { hubReserves: fromP.hubReserves });
        } catch (e) { alert("Ошибка резервов"); return; }
        renderHubReservesList();
      }
      const cost = SHIPMENT_COST + (withConvoy ? CONVOY_COST : 0);
      if (sanCredits < cost) { alert(`Нужно ${cost} ¢`); return; }
      sanCredits -= cost;
      await saveSanCredits();
      const now = Date.now();
      const travelMs = getTravelTime(from);
      const shipment = {
        from, to, convoy: !!withConvoy, status: "in_transit",
        departAt: now, arriveAt: now + travelMs, travelMs, cost
      };
      try {
        const ref = await addDoc(collection(window.db, "shipments"), shipment);
        shipment.id = ref.id;
        shipments.push(shipment);
        await addLog(`${window.getCurrentUser()?.name || "San"} отправил поставку <b>${from} → ${to}</b> (−${cost} ¢)`);
        renderShipmentsOnMap();
        renderRoutesList();
        fillRouteSelects();
        alert(`Отправлено. Прибытие через ${travelMs / HOUR_MS} ч.`);
      } catch (e) {
        sanCredits += cost;
        await saveSanCredits();
        alert("Ошибка");
      }
    }

    // ===== HUB REFILL =====
    async function completeHubRefill(r) {
      const hub = allPlanets.find(p => p.name === r.to);
      const bonus = HUB_REFILL_BONUS[r.resourceType] || 20;
      if (hub && isFactoryHub(hub)) {
        const res = Math.min(100, (Number(hub.hubReserves) || 0) + bonus);
        hub.hubReserves = res;
        try {
          await updateDoc(doc(window.db, "planets", hub.name), { hubReserves: res });
        } catch (e) {}
      }
      r.status = "done";
      try {
        await updateDoc(doc(window.db, "hub_refills", r.id), { status: "done", completedAt: Date.now() });
        await addLog(`Niverma: конвой (${r.resourceType}) +${bonus}% на <b>${r.to}</b>`);
      } catch (e) {}
      renderHubReservesList();
      renderHubRefillActive();
      return r;
    }
    async function loadHubRefills() {
      try {
        const snapshot = await getDocs(collection(window.db, "hub_refills"));
        const now = Date.now();
        hubRefills = [];
        for (const d of snapshot.docs) {
          let r = { id: d.id, ...d.data() };
          if (r.status === "in_transit" && r.arriveAt && now >= r.arriveAt) r = await completeHubRefill(r);
          if (r.status === "in_transit") hubRefills.push(r);
        }
        renderHubRefillOnMap();
        renderHubRefillActive();
      } catch (e) {}
    }
    function renderHubRefillOnMap() {
      hubRefillLayers.forEach(l => map.removeLayer(l));
      hubRefillLayers = [];
      const now = Date.now();
      hubRefills.forEach(r => {
        if (r.status !== "in_transit") return;
        const fromP = allPlanets.find(p => p.name === r.from);
        const toP = allPlanets.find(p => p.name === r.to);
        if (!fromP || !toP) return;
        const line = L.polyline([[fromP.y, fromP.x], [toP.y, toP.x]], {
          color: "#2ecc71", weight: 2, opacity: 0.7, dashArray: "6 6"
        }).addTo(map);
        hubRefillLayers.push(line);
        const progress = Math.min(1, Math.max(0, (now - r.departAt) / (r.arriveAt - r.departAt)));
        const lat = fromP.y + (toP.y - fromP.y) * progress;
        const lng = fromP.x + (toP.x - fromP.x) * progress;
        const m = L.marker([lat, lng], {
          icon: L.icon({ iconUrl: "assets/poi/ressuply.png", iconSize: [24, 24], iconAnchor: [12, 12] })
        }).addTo(map);
        m.bindTooltip(`Ресурсы ${r.from} → ${r.to}`, { direction: "top" });
        hubRefillLayers.push(m);
      });
    }
    function renderHubRefillActive() {
      const container = document.getElementById("hub-refill-active");
      if (!container) return;
      if (!hubRefills.length) { container.innerHTML = ""; return; }
      const now = Date.now();
      container.innerHTML = hubRefills.map(r => {
        const left = Math.max(0, (r.arriveAt - now) / HOUR_MS);
        return `<div class="hub-refill-item"><strong>${r.from} → ${r.to}</strong> · ${r.resourceType} · ~${left.toFixed(1)} ч</div>`;
      }).join("");
    }
    function fillHubRefillSelects() {
      const fromSel = document.getElementById("hub-refill-from");
      const toSel = document.getElementById("hub-refill-to");
      if (!fromSel || !toSel) return;
      const fv = fromSel.value, tv = toSel.value;
      fromSel.innerHTML = "";
      toSel.innerHTML = "";
      allPlanets.filter(p => p.geoSurvey).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = p.name;
        fromSel.appendChild(opt);
      });
      allPlanets.filter(p => isFactoryHub(p)).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = `${p.name} (${Number(p.hubReserves ?? 100).toFixed(0)}%)`;
        toSel.appendChild(opt);
      });
      if (fv) fromSel.value = fv;
      if (tv) toSel.value = tv;
    }
    async function sendHubRefill() {
      const from = document.getElementById("hub-refill-from")?.value;
      const to = document.getElementById("hub-refill-to")?.value;
      const resourceType = document.getElementById("hub-refill-type")?.value || "ore";
      if (!from || !to) { alert("Выберите планеты"); return; }
      const fromP = allPlanets.find(p => p.name === from);
      const toP = allPlanets.find(p => p.name === to);
      if (!fromP?.geoSurvey) { alert("Планета не разведана"); return; }
      if (!isFactoryHub(toP)) { alert("Цель — Factory Hub"); return; }
      const survey = fromP.geoSurvey;
      if (resourceType === "ore" && !(survey.ore || []).length) { alert("Нет руды"); return; }
      if (resourceType === "fuel" && !(survey.fuel || []).length) { alert("Нет топлива"); return; }
      if (resourceType === "rare" && !(survey.rare || []).length) { alert("Нет редких"); return; }
      const now = Date.now();
      const refill = { from, to, resourceType, status: "in_transit", departAt: now, arriveAt: now + HUB_REFILL_TIME };
      try {
        const ref = await addDoc(collection(window.db, "hub_refills"), refill);
        refill.id = ref.id;
        hubRefills.push(refill);
        await addLog(`Niverma: конвой (${resourceType}) <b>${from} → ${to}</b> (2 ч)`);
        renderHubRefillOnMap();
        renderHubRefillActive();
        alert("Конвой отправлен (2 ч)");
      } catch (e) { alert("Ошибка"); }
    }

    // ===== PROBES =====
    async function completeProbe(p) {
      const planet = allPlanets.find(x => x.name === p.planet);
      const survey = buildSurveyResult();
      if (planet) {
        planet.geoSurvey = survey;
        try { await updateDoc(doc(window.db, "planets", planet.name), { geoSurvey: survey }); } catch (e) {}
      }
      p.status = "done";
      p.result = survey;
      try {
        await updateDoc(doc(window.db, "probes", p.id), { status: "done", result: survey, completedAt: Date.now() });
        await addLog(`Niverma: зонд на <b>${p.planet}</b> завершил разведку`);
      } catch (e) {}
      if (!isPopupOpen()) renderPlanets();
      renderProbesList();
      renderGeoResults();
      updateProbeSlots();
      fillClearGeoSelect();
      fillHubRefillSelects();
      return p;
    }
    async function loadProbes() {
      try {
        const snapshot = await getDocs(collection(window.db, "probes"));
        const now = Date.now();
        probes = [];
        for (const d of snapshot.docs) {
          let p = { id: d.id, ...d.data() };
          if (p.status === "active" && p.arriveAt && now >= p.arriveAt) p = await completeProbe(p);
          if (p.status === "active") probes.push(p);
        }
        renderProbesOnMap();
        renderProbesList();
        renderGeoResults();
        updateProbeSlots();
      } catch (e) {}
    }
    function renderProbesOnMap() {
      probeLayers.forEach(l => map.removeLayer(l));
      probeLayers = [];
      probes.forEach(p => {
        if (p.status !== "active") return;
        const planet = allPlanets.find(x => x.name === p.planet);
        if (!planet) return;
        const m = L.marker([planet.y - 20, planet.x - 20], {
          icon: L.icon({ iconUrl: "assets/poi/drone.png", iconSize: [28, 28], iconAnchor: [14, 14] })
        }).addTo(map);
        m.bindTooltip(`Зонд: ${p.planet}`, { direction: "top" });
        probeLayers.push(m);
      });
    }
    function updateProbeSlots() {
      const el = document.getElementById("probe-slots");
      if (!el) return;
      el.textContent = `${MAX_PROBES - probes.filter(p => p.status === "active").length}/${MAX_PROBES}`;
    }
    function fillGeoSelect() {
      const sel = document.getElementById("geo-planet");
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = "";
      allPlanets.filter(p => GEO_ALLOWED.includes(p.status)).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = p.name + (p.geoSurvey ? " ✓" : "");
        sel.appendChild(opt);
      });
      if (prev) sel.value = prev;
    }
    function fillClearGeoSelect() {
      const sel = document.getElementById("clear-geo-planet");
      if (!sel) return;
      const prev = sel.value;
      sel.innerHTML = "";
      const surveyed = allPlanets.filter(p => p.geoSurvey);
      if (!surveyed.length) {
        const opt = document.createElement("option");
        opt.value = "";
        opt.textContent = "Нет разведанных планет";
        sel.appendChild(opt);
        return;
      }
      surveyed.forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = p.name;
        sel.appendChild(opt);
      });
      if (prev) sel.value = prev;
    }
    function renderProbesList() {
      const container = document.getElementById("active-probes");
      if (!container) return;
      const active = probes.filter(p => p.status === "active");
      if (!active.length) {
        container.innerHTML = "<div style='color:#666;font-size:13px;'>Нет активных зондов</div>";
        return;
      }
      const now = Date.now();
      container.innerHTML = active.map(p => {
        const left = Math.max(0, (p.arriveAt - now) / HOUR_MS);
        return `<div class="probe-item"><strong>${p.planet}</strong><div style="margin-top:4px;">Осталось ~${left.toFixed(1)} ч</div></div>`;
      }).join("");
    }
    async function renderGeoResults() {
      const container = document.getElementById("geo-results");
      if (!container) return;
      const surveyed = allPlanets.filter(p => p.geoSurvey);
      if (!surveyed.length) {
        container.innerHTML = "<div style='color:#666;font-size:13px;'>Разведка ещё не проводилась</div>";
        return;
      }
      container.innerHTML = surveyed.map(p => {
        const g = p.geoSurvey;
        return `<div class="geo-result-item"><strong>${p.name}</strong>
          <div style="margin-top:6px;color:#ff9800;">⛏ Руда: ${(g.ore || []).join(", ") || "—"}</div>
          <div style="margin-top:4px;color:#00b4d8;">⛽ Топливо: ${(g.fuel || []).join(", ") || "—"}</div>
          <div style="margin-top:4px;color:#9b59b6;">✦ Редкие: ${(g.rare || []).join(", ") || "—"}</div></div>`;
      }).join("");
    }
    async function sendProbe() {
      const planetName = document.getElementById("geo-planet")?.value;
      if (!planetName) { alert("Выберите планету"); return; }
      const planet = allPlanets.find(p => p.name === planetName);
      if (!planet || !GEO_ALLOWED.includes(planet.status)) { alert("Нельзя отправить зонд"); return; }
      if (probes.filter(p => p.status === "active").length >= MAX_PROBES) { alert("Все слоты заняты"); return; }
      if (probes.some(p => p.status === "active" && p.planet === planetName)) { alert("Уже в пути"); return; }
      const now = Date.now();
      const probe = { planet: planetName, status: "active", departAt: now, arriveAt: now + PROBE_TIME };
      try {
        const ref = await addDoc(collection(window.db, "probes"), probe);
        probe.id = ref.id;
        probes.push(probe);
        await addLog(`Niverma отправила зонд на <b>${planetName}</b> (4 ч)`);
        renderProbesOnMap();
        renderProbesList();
        updateProbeSlots();
        alert("Зонд отправлен (4 ч)");
      } catch (e) { alert("Ошибка"); }
    }
    async function clearGeoResultsHistory() {
      if (!confirm("Удалить записи завершённых зондов?")) return;
      try {
        const snapshot = await getDocs(collection(window.db, "probes"));
        await Promise.all(snapshot.docs.filter(d => d.data().status === "done").map(d => deleteDoc(d.ref)));
        await renderGeoResults();
        await addLog(`${window.getCurrentUser()?.name || "Niverma"} очистила историю георазведки`);
        alert("История очищена");
      } catch (e) { alert("Ошибка"); }
    }
    async function clearPlanetGeo() {
      const name = document.getElementById("clear-geo-planet")?.value;
      if (!name) { alert("Нет планеты"); return; }
      if (!confirm(`Очистить ресурсы на ${name}?`)) return;
      const planet = allPlanets.find(p => p.name === name);
      if (!planet) return;
      planet.geoSurvey = null;
      try {
        await updateDoc(doc(window.db, "planets", name), { geoSurvey: null });
        await addLog(`Freya очистила георазведку на <b>${name}</b>`);
        if (!isPopupOpen()) renderPlanets();
        renderGeoResults();
        fillClearGeoSelect();
        fillGeoSelect();
        fillHubRefillSelects();
        alert("Очищено");
      } catch (e) { alert("Ошибка"); }
    }
    async function clearAllPlanetGeo() {
      if (!confirm("Очистить ресурсы на ВСЕХ планетах?")) return;
      try {
        for (const p of allPlanets) {
          if (p.geoSurvey) {
            p.geoSurvey = null;
            await updateDoc(doc(window.db, "planets", p.name), { geoSurvey: null });
          }
        }
        await addLog("Freya очистила георазведку на всех планетах");
        if (!isPopupOpen()) renderPlanets();
        renderGeoResults();
        fillClearGeoSelect();
        fillGeoSelect();
        fillHubRefillSelects();
        alert("Все ресурсы сброшены");
      } catch (e) { alert("Ошибка"); }
    }

    // ===== DSS (панель НЕ пересобирается на каждом тике) =====
    async function ensureDss() {
      const ref = doc(window.db, "fleet", "dss");
      const snap = await getDoc(ref);
      const now = Date.now();
      if (!snap.exists()) {
        dss = {
          id: "dss", name: "ДКС", type: "DSS", planet: "Super Earth",
          icon: DSS_ICON, readiness: 100, status: "idle",
          ability: null, abilityUntil: null,
          lastRotation: 0, lastExterminatus: 0,
          captureMultiplier: 1, lastTick: now, resupplyUntil: null
        };
        await setDoc(ref, dss);
      } else {
        dss = { id: "dss", ...snap.data() };
      }
      dss = await processDssTime(dss, now);
      renderDssMarker();
      renderDssPanel();
    }

    async function processDssTime(unit, now) {
      if (!unit) return unit;
      let changed = false;

      if (unit.status === "maintenance" && unit.resupplyUntil && now >= unit.resupplyUntil) {
        unit.readiness = 100;
        unit.status = "idle";
        unit.ability = null;
        unit.abilityUntil = null;
        unit.resupplyUntil = null;
        unit.lastTick = now;
        changed = true;
        try {
          await updateDoc(doc(window.db, "fleet", "dss"), {
            readiness: 100, status: "idle", ability: null, abilityUntil: null,
            resupplyUntil: null, lastTick: now
          });
        } catch (e) {}
      }

      if (unit.abilityUntil && now >= unit.abilityUntil && unit.status === "ability") {
        unit.status = "idle";
        unit.ability = null;
        unit.abilityUntil = null;
        changed = true;
        try {
          await updateDoc(doc(window.db, "fleet", "dss"), {
            status: "idle", ability: null, abilityUntil: null
          });
        } catch (e) {}
      }

      if (changed) {
        renderDssMarker();
        const fp = document.getElementById("fleet-panel");
        if (fp && fp.classList.contains("open")) renderDssPanel();
      }
      return unit;
    }

    function renderDssMarker() {
      if (dssMarker) { map.removeLayer(dssMarker); dssMarker = null; }
      if (!dss) return;
      const planet = allPlanets.find(p => p.name === dss.planet);
      if (!planet) return;
      dssMarker = L.marker([planet.y + 35, planet.x - 30], {
        icon: L.icon({ iconUrl: DSS_ICON, iconSize: [36, 36], iconAnchor: [18, 18] })
      }).addTo(map);
      const el = dssMarker.getElement();
      if (el) el.style.filter = "drop-shadow(0 0 10px rgba(255,231,0,0.95))";
      let tip = `ДКС · ${dss.planet}`;
      if (dss.status === "maintenance") tip += " (ТО)";
      else if (dss.ability) tip += ` · ${dss.ability}`;
      dssMarker.bindTooltip(tip, { direction: "top" });
    }

    function renderDssPanel() {
      const box = document.getElementById("dss-panel-body");
      if (!box || !dss) return;
      const now = Date.now();
      const inMaint = dss.status === "maintenance";
      const inAbility = dss.status === "ability" && dss.abilityUntil > now;
      let abilityLeft = inAbility ? ` · ещё ${((dss.abilityUntil - now) / HOUR_MS).toFixed(1)} ч` : "";
      let maintLeft = (inMaint && dss.resupplyUntil) ? ` · ещё ${((dss.resupplyUntil - now) / HOUR_MS).toFixed(1)} ч` : "";
      const rotReady = now - (dss.lastRotation || 0) >= DSS_ROTATION_CD;
      const extReady = now - (dss.lastExterminatus || 0) >= DSS_EXTERMINATUS_CD;
      const canAct = !inMaint && !inAbility;
      const prevPlanet = document.getElementById("dss-planet-select")?.value || dss.planet;

      box.innerHTML = `
        <div class="dss-box">
          <div class="dss-title">ДКС</div>
          <div class="dss-status">Планета: <b style="color:#ffe700">${dss.planet}</b></div>
          <div class="dss-status">Статус: ${inMaint ? "Тех-обслуживание" + maintLeft : inAbility ? (dss.ability + abilityLeft) : "Готов"}</div>
          <div class="dss-status">Боеготовность: ${Number(dss.readiness).toFixed(0)}%</div>
          <div class="dss-status">Множитель захвата СЗ: ×${Number(dss.captureMultiplier || 1).toFixed(2)}</div>
          <div class="dss-move-row">
            <select id="dss-planet-select"></select>
            <button id="btn-dss-move" ${inMaint ? "disabled" : ""}>Переместить</button>
          </div>
          <button class="dss-ability-btn" id="btn-dss-blockade" ${canAct ? "" : "disabled"}>Орбитальная блокада (4 ч)</button>
          <button class="dss-ability-btn" id="btn-dss-surface" ${canAct ? "" : "disabled"}>Контроль поверхности (2 ч)</button>
          <button class="dss-ability-btn" id="btn-dss-rotation" ${canAct && rotReady ? "" : "disabled"}>Экстренная ротация (+40% дивизиям)</button>
          <button class="dss-ability-btn" id="btn-dss-exterminatus" ${canAct && extReady ? "" : "disabled"}>Протокол: Экстерминатус</button>
          <button class="dss-ability-btn" id="btn-dss-maintenance" ${inMaint ? "disabled" : ""} style="border-color:#00b4d8;color:#00b4d8;">Уйти на ТО (48 ч, Super Earth)</button>
        </div>
      `;

      const sel = document.getElementById("dss-planet-select");
      if (sel) {
        allPlanets.forEach(p => {
          const opt = document.createElement("option");
          opt.value = p.name;
          opt.textContent = p.name;
          sel.appendChild(opt);
        });
        sel.value = prevPlanet || dss.planet;
      }
      document.getElementById("btn-dss-move")?.addEventListener("click", () => moveDss(sel?.value));
      document.getElementById("btn-dss-blockade")?.addEventListener("click", () => activateDssAbility("blockade", DSS_BLOCKADE_MS));
      document.getElementById("btn-dss-surface")?.addEventListener("click", () => activateDssAbility("surface", DSS_SURFACE_MS));
      document.getElementById("btn-dss-rotation")?.addEventListener("click", activateDssRotation);
      document.getElementById("btn-dss-exterminatus")?.addEventListener("click", activateDssExterminatus);
      document.getElementById("btn-dss-maintenance")?.addEventListener("click", startDssMaintenance);
    }

    async function moveDss(planetName) {
      if (!dss || !planetName || planetName === dss.planet) return;
      if (dss.status === "maintenance") { alert("ДКС на техобслуживании"); return; }
      const old = dss.planet;
      dss.planet = planetName;
      try {
        await updateDoc(doc(window.db, "fleet", "dss"), { planet: planetName });
        await addLog(`Nami переместила <b>ДКС</b>: ${old} → ${planetName}`);
        renderDssMarker();
        renderDssPanel();
      } catch (e) {
        dss.planet = old;
        alert("Ошибка");
      }
    }
    async function activateDssAbility(ability, durationMs) {
      if (!dss || dss.status === "maintenance") return;
      if (dss.status === "ability" && dss.abilityUntil > Date.now()) { alert("Способность уже активна"); return; }
      const until = Date.now() + durationMs;
      dss.status = "ability";
      dss.ability = ability;
      dss.abilityUntil = until;
      try {
        await updateDoc(doc(window.db, "fleet", "dss"), { status: "ability", ability, abilityUntil: until });
        const names = { blockade: "Орбитальная блокада", surface: "Контроль поверхности" };
        await addLog(`ДКС: <b>${names[ability] || ability}</b> на ${dss.planet}`);
        renderDssPanel();
        renderDssMarker();
      } catch (e) { alert("Ошибка"); }
    }
    async function activateDssRotation() {
      if (!dss || dss.status === "maintenance") return;
      if (Date.now() - (dss.lastRotation || 0) < DSS_ROTATION_CD) { alert("Кулдаун ротации (40 ч)"); return; }
      for (const unit of fleet.filter(u => u.type !== "DSS" && u.planet === dss.planet)) {
        const newR = Math.min(100, (Number(unit.readiness) || 0) + 40);
        unit.readiness = newR;
        try { await updateDoc(doc(window.db, "fleet", unit.id), { readiness: newR }); } catch (e) {}
      }
      dss.lastRotation = Date.now();
      try {
        await updateDoc(doc(window.db, "fleet", "dss"), { lastRotation: dss.lastRotation });
        await addLog(`ДКС: <b>Экстренная ротация</b> на ${dss.planet}`);
        renderFleetMarkers();
        renderFleetPanel();
        renderDssPanel();
      } catch (e) { alert("Ошибка"); }
    }
    async function activateDssExterminatus() {
      if (!dss || dss.status === "maintenance") return;
      if (Date.now() - (dss.lastExterminatus || 0) < DSS_EXTERMINATUS_CD) { alert("Кулдаун 10 дней"); return; }
      if (!confirm(`УНИЧТОЖИТЬ планету ${dss.planet}?`)) return;
      if (PROTECTED_BASES.includes(dss.planet)) { alert("Нельзя уничтожить эту планету"); return; }
      const planet = allPlanets.find(p => p.name === dss.planet);
      if (!planet) return;
      planet.status = "Потеряна";
      planet.enemyPressure = 0;
      planet.superEarthControl = 0;
      dss.lastExterminatus = Date.now();
      try {
        await updateDoc(doc(window.db, "planets", planet.name), { status: "Потеряна", enemyPressure: 0, superEarthControl: 0 });
        await updateDoc(doc(window.db, "fleet", "dss"), { lastExterminatus: dss.lastExterminatus });
        await addLog(`ДКС: <b>Экстерминатус</b> — <b>${planet.name}</b> потеряна`);
        if (!isPopupOpen()) renderPlanets();
        renderDssPanel();
      } catch (e) { alert("Ошибка"); }
    }
    async function startDssMaintenance() {
      if (!dss || dss.status === "maintenance") return;
      if (!confirm("Отправить ДКС на Super Earth на 48 ч ТО?")) return;
      const until = Date.now() + DSS_MAINTENANCE_MS;
      dss.planet = "Super Earth";
      dss.status = "maintenance";
      dss.ability = null;
      dss.abilityUntil = null;
      dss.resupplyUntil = until;
      try {
        await updateDoc(doc(window.db, "fleet", "dss"), {
          planet: "Super Earth", status: "maintenance",
          ability: null, abilityUntil: null, resupplyUntil: until
        });
        await addLog("ДКС ушла на <b>тех-обслуживание</b> (48 ч)");
        renderDssMarker();
        renderDssPanel();
      } catch (e) { alert("Ошибка"); }
    }

    // ===== REALTIME =====
    function startRealtimeListeners() {
      if (unsubPlanets) unsubPlanets();
      unsubPlanets = onSnapshot(collection(window.db, "planets"), async (snap) => {
        const now = Date.now();
        const fresh = [];
        for (const d of snap.docs) {
          const p = { ...d.data(), name: d.data().name || d.id };
          ensureHubReserves(p);
          if (p.enemyMultiplier === undefined) p.enemyMultiplier = 1;
          fresh.push(await processPlanetPressure(p, now));
        }
        const changed = planetsSignature(allPlanets) !== planetsSignature(fresh);
        allPlanets = fresh;
        updatePlanetControl();
        await syncDivisionBonusToFirestore();
        if (changed && !isPopupOpen()) renderPlanets();
        fillRouteSelects();
        fillGeoSelect();
        fillClearGeoSelect();
        fillHubRefillSelects();
        renderHubReservesList();
      }, (err) => console.error(err));

      if (unsubFleet) unsubFleet();
      unsubFleet = onSnapshot(collection(window.db, "fleet"), async (snap) => {
        const now = Date.now();
        const fresh = [];
        let incomingDss = null;
        for (const d of snap.docs) {
          const data = { id: d.id, ...d.data() };
          if (d.id === "dss" || data.type === "DSS") {
            incomingDss = data;
            continue;
          }
          fresh.push(await processUnitTime(data, now));
        }
        const changed = fleetSignature(fleet) !== fleetSignature(fresh);
        fleet = fresh;

        if (incomingDss) {
          const oldSig = dssSignature(dss);
          dss = await processDssTime(incomingDss, now);
          const newSig = dssSignature(dss);
          if (oldSig !== newSig) {
            renderDssMarker();
            const fp = document.getElementById("fleet-panel");
            // панель только при реальном изменении статуса/планеты/способности
            if (fp && fp.classList.contains("open")) renderDssPanel();
          }
        }

        updatePlanetControl();
        await syncDivisionBonusToFirestore();
        if (changed) {
          renderFleetMarkers();
          const fp = document.getElementById("fleet-panel");
          if (fp && fp.classList.contains("open")) renderFleetPanel();
        }
        if (changed && !isPopupOpen()) renderPlanets();
      }, (err) => console.error(err));

      if (unsubShipments) unsubShipments();
      unsubShipments = onSnapshot(collection(window.db, "shipments"), async (snap) => {
        const now = Date.now();
        const next = [];
        for (const d of snap.docs) {
          let s = { id: d.id, ...d.data() };
          if (s.status === "in_transit" && s.arriveAt && now >= s.arriveAt) s = await completeShipment(s);
          if (s.status === "in_transit") next.push(s);
        }
        shipments = next;
        renderShipmentsOnMap();
        renderRoutesList();
        await renderShipmentResults();
      }, (err) => console.error(err));

      if (unsubProbes) unsubProbes();
      unsubProbes = onSnapshot(collection(window.db, "probes"), async (snap) => {
        const now = Date.now();
        const next = [];
        for (const d of snap.docs) {
          let p = { id: d.id, ...d.data() };
          if (p.status === "active" && p.arriveAt && now >= p.arriveAt) p = await completeProbe(p);
          if (p.status === "active") next.push(p);
        }
        probes = next;
        renderProbesOnMap();
        renderProbesList();
        renderGeoResults();
        updateProbeSlots();
      }, (err) => console.error(err));

      if (unsubHubRefills) unsubHubRefills();
      unsubHubRefills = onSnapshot(collection(window.db, "hub_refills"), async (snap) => {
        const now = Date.now();
        const next = [];
        for (const d of snap.docs) {
          let r = { id: d.id, ...d.data() };
          if (r.status === "in_transit" && r.arriveAt && now >= r.arriveAt) r = await completeHubRefill(r);
          if (r.status === "in_transit") next.push(r);
        }
        hubRefills = next;
        renderHubRefillOnMap();
        renderHubRefillActive();
      }, (err) => console.error(err));

      if (unsubSan) unsubSan();
      unsubSan = onSnapshot(doc(window.db, "players", "san"), (snap) => {
        if (snap.exists()) {
          sanCredits = snap.data().credits ?? 0;
          updateCreditsUI();
        }
      }, (err) => console.error(err));

      if (unsubNews) unsubNews();
      unsubNews = onSnapshot(doc(window.db, "settings", "news"), (snap) => {
        if (!snap.exists()) return;
        applyNews(snap.data().top || "", snap.data().bottom || "");
      }, (err) => console.error(err));

      if (unsubOrder) unsubOrder();
      unsubOrder = onSnapshot(doc(window.db, "settings", "mainOrder"), (snap) => {
        const btnView = document.getElementById("btn-view-order");
        if (!snap.exists() || !snap.data().active) {
          if (btnView) btnView.style.display = "none";
          return;
        }
        if (btnView) btnView.style.display = "block";
      }, (err) => console.error(err));
    }

    // Лёгкий тик: БЕЗ renderDssPanel / renderFleetPanel
    setInterval(async () => {
      if (!map) return;
      const now = Date.now();
      try {
        for (let i = 0; i < fleet.length; i++) {
          fleet[i] = await processUnitTime(fleet[i], now);
        }
        if (dss) dss = await processDssTime(dss, now);
        for (let i = 0; i < allPlanets.length; i++) {
          allPlanets[i] = await processPlanetPressure(allPlanets[i], now);
        }
        if (shipments.some(s => s.status === "in_transit")) renderShipmentsOnMap();
        if (hubRefills.some(r => r.status === "in_transit")) renderHubRefillOnMap();
        for (const s of [...shipments]) {
          if (s.status === "in_transit" && s.arriveAt && now >= s.arriveAt) await completeShipment(s);
        }
        for (const p of [...probes]) {
          if (p.status === "active" && p.arriveAt && now >= p.arriveAt) await completeProbe(p);
        }
        for (const r of [...hubRefills]) {
          if (r.status === "in_transit" && r.arriveAt && now >= r.arriveAt) await completeHubRefill(r);
        }
      } catch (e) { console.error(e); }
    }, 2000);

    // ===== ФЛОТ =====
    async function loadFleet() {
      try {
        const snapshot = await getDocs(collection(window.db, "fleet"));
        const now = Date.now();
        if (snapshot.empty) {
          const initialFleet = [
            { id: "hd1", name: "Браво-Дельта 9", type: "Helldivers", planet: "Super Earth", icon: "assets/poi/hd.png", readiness: 100, lastTick: now, resupplyUntil: null },
            { id: "hd2", name: "Альфа-Гамма 3", type: "Helldivers", planet: "Super Earth", icon: "assets/poi/hd.png", readiness: 100, lastTick: now, resupplyUntil: null },
            { id: "hd3", name: "Сиерра-Омега 7", type: "Helldivers", planet: "Super Earth", icon: "assets/poi/hd.png", readiness: 100, lastTick: now, resupplyUntil: null },
            { id: "seaf1", name: "Танго-Эхо 2", type: "SEAF", planet: "Pathfinder-V", icon: "assets/poi/seafs.png", readiness: 100, lastTick: now, resupplyUntil: null },
            { id: "seaf2", name: "Новембер-Кило 5", type: "SEAF", planet: "Pathfinder-V", icon: "assets/poi/seafs.png", readiness: 100, lastTick: now, resupplyUntil: null },
            { id: "seaf3", name: "Зулу-Ромео 1", type: "SEAF", planet: "Pathfinder-V", icon: "assets/poi/seafs.png", readiness: 100, lastTick: now, resupplyUntil: null }
          ];
          for (const unit of initialFleet) await setDoc(doc(window.db, "fleet", unit.id), unit);
          fleet = initialFleet;
        } else {
          fleet = [];
          for (const d of snapshot.docs) {
            if (d.id === "dss" || d.data().type === "DSS") continue;
            fleet.push(await processUnitTime({ id: d.id, ...d.data() }, now));
          }
        }
        await ensureDss();
        updatePlanetControl();
        await syncDivisionBonusToFirestore();
        renderPlanets();
        renderFleetMarkers();
        renderFleetPanel();
        renderAdminPlanetList();
        fillRouteSelects();
        fillGeoSelect();
        fillClearGeoSelect();
        fillHubRefillSelects();
        renderHubReservesList();
      } catch (e) { console.error(e); }
    }
    async function processUnitTime(unit, now) {
      if (unit.resupplyUntil && now >= unit.resupplyUntil) {
        unit.readiness = 100;
        unit.resupplyUntil = null;
        unit.lastTick = now;
        try { await updateDoc(doc(window.db, "fleet", unit.id), { readiness: 100, resupplyUntil: null, lastTick: now }); } catch (e) {}
        return unit;
      }
      if (unit.resupplyUntil) return unit;
      if (isProtectedBase(unit.planet)) {
        if (!unit.lastTick) {
          unit.lastTick = now;
          try { await updateDoc(doc(window.db, "fleet", unit.id), { lastTick: now }); } catch (e) {}
        }
        return unit;
      }
      const planet = allPlanets.find(p => p.name === unit.planet);
      const isDanger = planet && DANGER_STATUSES.includes(planet.status);
      if (isDanger && unit.readiness > 0) {
        const decay = ((now - (unit.lastTick || now)) / HOUR_MS) * 5;
        if (decay > 0.01) {
          unit.readiness = Math.max(0, +(Number(unit.readiness) - decay).toFixed(2));
          unit.lastTick = now;
          try { await updateDoc(doc(window.db, "fleet", unit.id), { readiness: unit.readiness, lastTick: now }); } catch (e) {}
        }
      } else if (!unit.lastTick) {
        unit.lastTick = now;
        try { await updateDoc(doc(window.db, "fleet", unit.id), { lastTick: now }); } catch (e) {}
      }
      return unit;
    }
    async function loadLog() {
      try {
        const q = query(collection(window.db, "logs"), orderBy("timestamp", "desc"), limit(100));
        const snapshot = await getDocs(q);
        actionLog = [];
        snapshot.forEach(d => actionLog.push({ time: d.data().time, text: d.data().text }));
        renderLog();
      } catch (e) {}
    }

    await loadPlanets();
    await loadFleet();
    await loadSanData();
    await loadShipments();
    await loadProbes();
    await loadHubRefills();
    await loadLog();
    await loadNews();
    await loadMainOrder();
    startRealtimeListeners();

    function renderPlanets() {
      markers.forEach(m => map.removeLayer(m));
      markers = [];
      allPlanets.forEach(planet => {
        const isDanger = DANGER_STATUSES.includes(planet.status);
        const isAttack = planet.status === "Под атакой";
        const fillColor = isDanger ? "#ff2a2a" : "#ffe700";
        const glowColor = isDanger ? "rgba(255,42,42,0.6)" : "rgba(255,231,0,0.6)";
        const marker = L.circleMarker([planet.y, planet.x], {
          radius: 7, color: "#fff", weight: 2,
          fillColor, fillOpacity: 0.5, opacity: 1,
          className: isAttack ? "marker-attack" : ""
        }).addTo(map);
        const el = marker.getElement();
        if (el) el.style.filter = `drop-shadow(0 0 6px ${glowColor})`;
        let popupClass = isDanger ? "popup-danger" : "";
        if (isAttack) popupClass += " popup-attack";
        const enemy = Number(planet.enemyPressure) || 0;
        const control = Number(planet.superEarthControl) || 0;
        const lastTick = planet.lastPressureTick || Date.now();
        let mult = Math.max(1, Number(planet.enemyMultiplier) || 1);
        if (dss && dss.planet === planet.name && dss.ability === "surface" && dss.abilityUntil > Date.now()) {
          mult = Math.max(1, mult * 0.9);
        }
        let timersHtml = "";
        if (isAttack) {
          const enemyMs = getRemainingMs(enemy, lastTick, planet.enemyCaptureDays, mult);
          const seMult = (dss && dss.planet === planet.name && dss.status !== "maintenance")
            ? Math.max(1, Number(dss.captureMultiplier) || 1) : 1;
          const controlMs = getRemainingMs(control, lastTick, planet.seCaptureDays, seMult);
          timersHtml = `<div style="margin-top:10px;font-size:12px;line-height:1.6;" class="capture-timers" data-planet="${planet.name}">
            <div style="color:#ff2a2a">⏳ До оккупации: <b class="enemy-timer">${enemyMs === null ? "—" : formatTime(enemyMs)}</b></div>
            <div style="color:#ffe700">⏳ До освобождения: <b class="control-timer">${controlMs === null ? "—" : formatTime(controlMs)}</b></div>
            <div style="color:#ff6b6b;margin-top:4px;">Множитель натиска: ×${Number(planet.enemyMultiplier || 1)}</div>
          </div>`;
        }
        let hubHtml = isFactoryHub(planet)
          ? `<p><b>Резерв хаба:</b> ${Number(planet.hubReserves ?? 100).toFixed(0)}%</p>` : "";
        let geoHtml = "";
        if (planet.geoSurvey) {
          const g = planet.geoSurvey;
          geoHtml = `<div style="margin-top:10px;font-size:12px;border-top:1px solid #333;padding-top:8px;">
            <div style="color:#2ecc71;font-weight:700;">Георазведка</div>
            <div style="color:#ff9800;margin-top:4px;">⛏ ${(g.ore || []).join(", ") || "—"}</div>
            <div style="color:#00b4d8;margin-top:2px;">⛽ ${(g.fuel || []).join(", ") || "—"}</div>
            <div style="color:#9b59b6;margin-top:2px;">✦ ${(g.rare || []).join(", ") || "—"}</div></div>`;
        }
        marker.bindPopup(`
          ${planet.image ? `<img class="popup-image" src="${planet.image}" alt="${planet.name}">` : ""}
          <div class="popup-body">
            <h3>${planet.name}</h3>
            <p><b>Сектор:</b> ${planet.sector || "—"}</p>
            <p><b>Контроль:</b> ${planet.faction || "—"}</p>
            <p><b>Тип:</b> ${planet.biome || "—"}</p>
            <p><b>Статус:</b> ${planet.status}</p>
            ${hubHtml}
            <div style="margin:10px 0 4px 0;font-size:13px;"><span style="color:#ff2a2a">Натиск врага:</span> ${enemy}%</div>
            <div style="background:#222;height:6px;border-radius:3px;overflow:hidden;margin-bottom:8px;">
              <div style="width:${enemy}%;height:100%;background:#ff2a2a;"></div>
            </div>
            <div style="margin:4px 0;font-size:13px;"><span style="color:#ffe700">Контроль СЗ:</span> ${control}%</div>
            <div style="background:#222;height:6px;border-radius:3px;overflow:hidden;margin-bottom:6px;">
              <div style="width:${control}%;height:100%;background:#ffe700;"></div>
            </div>
            ${timersHtml}${geoHtml}
            <p style="margin-top:10px">${planet.description || ""}</p>
          </div>
        `, { className: popupClass });
        marker.on("popupopen", () => {
          if (activeTimerInterval) clearInterval(activeTimerInterval);
          if (planet.status !== "Под атакой") return;
          activeTimerInterval = setInterval(() => {
            const p = allPlanets.find(x => x.name === planet.name);
            if (!p || p.status !== "Под атакой") { clearInterval(activeTimerInterval); return; }
            const boxEl = document.querySelector(`.capture-timers[data-planet="${planet.name}"]`);
            if (!boxEl) return;
            let m = Math.max(1, Number(p.enemyMultiplier) || 1);
            if (dss && dss.planet === p.name && dss.ability === "surface" && dss.abilityUntil > Date.now()) m = Math.max(1, m * 0.9);
            const seM = (dss && dss.planet === p.name && dss.status !== "maintenance") ? Math.max(1, Number(dss.captureMultiplier) || 1) : 1;
            const eMs = getRemainingMs(Number(p.enemyPressure) || 0, p.lastPressureTick, p.enemyCaptureDays, m);
            const cMs = getRemainingMs(Number(p.superEarthControl) || 0, p.lastPressureTick, p.seCaptureDays, seM);
            const enemyT = boxEl.querySelector(".enemy-timer");
            const controlT = boxEl.querySelector(".control-timer");
            if (enemyT) enemyT.textContent = eMs === null ? "—" : formatTime(eMs);
            if (controlT) controlT.textContent = cMs === null ? "—" : formatTime(cMs);
          }, 1000);
        });
        marker.on("popupclose", () => {
          if (activeTimerInterval) { clearInterval(activeTimerInterval); activeTimerInterval = null; }
        });
        markers.push(marker);
      });
    }

    function renderFleetMarkers() {
      fleetMarkers.forEach(m => map.removeLayer(m));
      fleetMarkers = [];
      const byPlanet = {};
      fleet.filter(u => u.type !== "DSS").forEach(unit => {
        if (!byPlanet[unit.planet]) byPlanet[unit.planet] = [];
        byPlanet[unit.planet].push(unit);
      });
      Object.keys(byPlanet).forEach(planetName => {
        const planet = allPlanets.find(p => p.name === planetName);
        if (!planet) return;
        byPlanet[planetName].forEach((unit, index) => {
          const offset = (index - (byPlanet[planetName].length - 1) / 2) * 22;
          const m = L.marker([planet.y + offset, planet.x + 28], {
            icon: L.icon({ iconUrl: unit.icon, iconSize: [30, 30], iconAnchor: [15, 15] })
          }).addTo(map);
          const el = m.getElement();
          if (el) {
            el.style.filter = unit.type === "Helldivers"
              ? "drop-shadow(0 0 8px rgba(255,231,0,0.9))"
              : "drop-shadow(0 0 8px rgba(0,180,216,0.9))";
          }
          m.bindTooltip(unit.name + (unit.resupplyUntil ? " (пополнение...)" : ` (${Number(unit.readiness).toFixed(1)}%)`), { direction: "top" });
          fleetMarkers.push(m);
        });
      });
      renderDssMarker();
    }

    function renderFleetPanel() {
      const container = document.getElementById("fleet-list");
      if (!container) return;
      container.innerHTML = "";
      const now = Date.now();
      fleet.filter(u => u.type !== "DSS").forEach(unit => {
        const div = document.createElement("div");
        div.className = "fleet-item";
        const isResupplying = unit.resupplyUntil && now < unit.resupplyUntil;
        const readinessColor = unit.readiness > 60 ? "#4caf50" : unit.readiness > 30 ? "#ff9800" : "#f44336";
        const resupplyHours = getResupplyHours(unit.readiness);
        let resupplyInfo = "";
        if (isResupplying) {
          const left = Math.max(0, (unit.resupplyUntil - now) / HOUR_MS);
          resupplyInfo = `<div style="color:#00b4d8;margin:6px 0;">Пополнение: ~${left.toFixed(1)} ч.</div>`;
        }
        const planetData = allPlanets.find(p => p.name === unit.planet);
        const canResupplyHere =
          (unit.type === "SEAF" && unit.planet === "Pathfinder-V") ||
          (unit.type === "Helldivers" && (unit.planet === "Super Earth" || isFactoryHub(planetData)));
        div.innerHTML = `
          <strong>${unit.name}</strong>
          <div class="location">Сейчас: ${unit.planet}</div>
          <div style="margin:8px 0 4px 0;font-size:13px;">
            <span style="color:#ffe700;text-shadow:0 0 6px rgba(255,231,0,0.7);">Боеготовность:</span>
            <b style="color:${readinessColor}"> ${Number(unit.readiness).toFixed(1)}%</b>
          </div>
          <div style="background:#222;height:8px;border-radius:4px;overflow:hidden;margin-bottom:8px;">
            <div style="width:${unit.readiness}%;height:100%;background:${readinessColor};"></div>
          </div>
          ${resupplyInfo}`;
        if (!isResupplying) {
          const select = document.createElement("select");
          allPlanets.forEach(p => {
            const opt = document.createElement("option");
            opt.value = p.name; opt.textContent = p.name;
            if (p.name === unit.planet) opt.selected = true;
            select.appendChild(opt);
          });
          const moveBtn = document.createElement("button");
          moveBtn.textContent = "Переместить";
          moveBtn.onclick = () => moveUnit(unit, select.value);
          div.appendChild(select);
          div.appendChild(moveBtn);
          if (canResupplyHere && unit.readiness < 100) {
            const resupplyBtn = document.createElement("button");
            resupplyBtn.textContent = `Пополнение (${resupplyHours} ч)`;
            resupplyBtn.style.marginTop = "6px";
            resupplyBtn.style.background = "#4caf50";
            resupplyBtn.onclick = () => startResupply(unit);
            div.appendChild(resupplyBtn);
          }
        } else {
          const lock = document.createElement("div");
          lock.style.cssText = "color:#888;font-size:13px;";
          lock.textContent = "Дивизия на пополнении";
          div.appendChild(lock);
        }
        container.appendChild(div);
      });
    }

    async function moveUnit(unit, newPlanet) {
      if (newPlanet === unit.planet) return;
      if (newPlanet !== "Super Earth" && newPlanet !== "Pathfinder-V") {
        const onTarget = fleet.filter(f => f.planet === newPlanet);
        if (unit.type === "Helldivers" && onTarget.filter(f => f.type === "Helldivers").length >= 1) {
          alert("Макс. 1 HD"); return;
        }
        if (unit.type === "SEAF" && onTarget.filter(f => f.type === "SEAF").length >= 2) {
          alert("Макс. 2 SEAF"); return;
        }
      }
      if (newPlanet === "Pathfinder-V" && unit.type !== "SEAF") {
        alert("Только SEAF"); return;
      }
      const oldPlanet = unit.planet;
      unit.planet = newPlanet;
      unit.lastTick = Date.now();
      try {
        await updateDoc(doc(window.db, "fleet", unit.id), { planet: newPlanet, lastTick: unit.lastTick });
        await addLog(`${window.getCurrentUser()?.name} переместил <b>${unit.name}</b>: ${oldPlanet} → ${newPlanet}`);
        updatePlanetControl();
        await syncDivisionBonusToFirestore();
        if (!isPopupOpen()) renderPlanets();
        renderFleetMarkers();
        renderFleetPanel();
      } catch (e) {
        unit.planet = oldPlanet;
        alert("Ошибка");
      }
    }
    async function startResupply(unit) {
      const hours = getResupplyHours(unit.readiness);
      if (hours <= 0) { alert("Уже 100%"); return; }
      const until = Date.now() + hours * HOUR_MS;
      unit.resupplyUntil = until;
      try {
        await updateDoc(doc(window.db, "fleet", unit.id), { resupplyUntil: until });
        await addLog(`${window.getCurrentUser()?.name} отправил <b>${unit.name}</b> на пополнение (${hours} ч)`);
        renderFleetPanel();
        renderFleetMarkers();
      } catch (e) {
        unit.resupplyUntil = null;
        alert("Ошибка");
      }
    }

    // ===== ПАНЕЛИ =====
    const btnAdmin = document.getElementById("btn-admin");
    const btnFleet = document.getElementById("btn-fleet");
    const btnLogistics = document.getElementById("btn-logistics");
    const btnFunds = document.getElementById("btn-funds");
    const btnGeo = document.getElementById("btn-geo");
    const btnNews = document.getElementById("btn-news");
    const btnOrder = document.getElementById("btn-order");
    const btnFundApprove = document.getElementById("btn-fund-approve");
    const btnGeoClear = document.getElementById("btn-geo-clear");

    const adminPanel = document.getElementById("admin-panel");
    const fleetPanel = document.getElementById("fleet-panel");
    const logisticsPanel = document.getElementById("logistics-panel");
    const fundsPanel = document.getElementById("funds-panel");
    const geoPanel = document.getElementById("geo-panel");
    const newsPanel = document.getElementById("news-panel");
    const orderEditPanel = document.getElementById("order-edit-panel");
    const fundApprovePanel = document.getElementById("fund-approve-panel");
    const geoClearPanel = document.getElementById("geo-clear-panel");

    const user = window.getCurrentUser();
    if (user?.isAdmin && !user.isGuest) btnAdmin.style.display = "block";
    if (user && (user.name === "Nami" || user.email === "nami@semail.com")) btnFleet.style.display = "block";
    if (user && (user.name === "San" || user.email === "san@semail.com")) {
      if (btnLogistics) btnLogistics.style.display = "block";
      if (btnFunds) btnFunds.style.display = "block";
    }
    if (user && (user.name === "Niverma" || user.email === "niverma@semail.com")) {
      if (btnGeo) btnGeo.style.display = "block";
    }
    if (user && (user.name === "Freya" || user.email === "freya@semail.com")) {
      if (btnNews) btnNews.style.display = "block";
      if (btnOrder) btnOrder.style.display = "block";
      if (btnFundApprove) btnFundApprove.style.display = "block";
      if (btnGeoClear) btnGeoClear.style.display = "block";
    }

    btnAdmin?.addEventListener("click", () => {
      if (!window.getCurrentUser()?.isAdmin) return;
      renderAdminPlanetList();
      renderLog();
      adminPanel.classList.add("open");
    });
    btnFleet?.addEventListener("click", () => {
      renderFleetPanel();
      renderDssPanel();
      fleetPanel.classList.add("open");
    });
    btnLogistics?.addEventListener("click", () => {
      fillRouteSelects();
      renderHubReservesList();
      renderShipmentResults();
      logisticsPanel.classList.add("open");
    });
    btnFunds?.addEventListener("click", async () => {
      updateCreditsUI();
      await renderMyFundRequests();
      fundsPanel?.classList.add("open");
    });
    btnGeo?.addEventListener("click", () => {
      fillGeoSelect();
      fillHubRefillSelects();
      renderProbesList();
      renderGeoResults();
      renderHubRefillActive();
      updateProbeSlots();
      geoPanel?.classList.add("open");
    });
    btnNews?.addEventListener("click", async () => {
      await loadNews();
      newsPanel?.classList.add("open");
    });
    btnOrder?.addEventListener("click", async () => {
      try {
        const snap = await getDoc(doc(window.db, "settings", "mainOrder"));
        if (snap.exists()) {
          const d = snap.data();
          const t = document.getElementById("order-title");
          const tx = document.getElementById("order-text");
          const im = document.getElementById("order-image");
          if (t) t.value = d.title || "";
          if (tx) tx.value = d.text || "";
          if (im) im.value = d.image || "";
        }
      } catch (e) {}
      orderEditPanel?.classList.add("open");
    });
    btnFundApprove?.addEventListener("click", async () => {
      await renderAdminFundRequests();
      fundApprovePanel?.classList.add("open");
    });
    btnGeoClear?.addEventListener("click", () => {
      fillClearGeoSelect();
      geoClearPanel?.classList.add("open");
    });

    document.getElementById("btn-close-admin")?.addEventListener("click", () => adminPanel.classList.remove("open"));
    document.getElementById("btn-close-fleet")?.addEventListener("click", () => fleetPanel.classList.remove("open"));
    document.getElementById("btn-close-logistics")?.addEventListener("click", () => logisticsPanel.classList.remove("open"));
    document.getElementById("btn-close-funds")?.addEventListener("click", () => fundsPanel?.classList.remove("open"));
    document.getElementById("btn-close-geo")?.addEventListener("click", () => geoPanel?.classList.remove("open"));
    document.getElementById("btn-close-news")?.addEventListener("click", () => newsPanel?.classList.remove("open"));
    document.getElementById("btn-close-order-edit")?.addEventListener("click", () => orderEditPanel?.classList.remove("open"));
    document.getElementById("btn-close-fund-approve")?.addEventListener("click", () => fundApprovePanel?.classList.remove("open"));
    document.getElementById("btn-close-geo-clear")?.addEventListener("click", () => geoClearPanel?.classList.remove("open"));

    document.getElementById("btn-create-route")?.addEventListener("click", createShipment);
    document.getElementById("btn-clear-shipment-results")?.addEventListener("click", clearShipmentResults);
    document.getElementById("btn-send-fund-request")?.addEventListener("click", sendFundRequest);
    document.getElementById("btn-send-probe")?.addEventListener("click", sendProbe);
    document.getElementById("btn-hub-refill")?.addEventListener("click", sendHubRefill);
    document.getElementById("btn-clear-geo-results")?.addEventListener("click", clearGeoResultsHistory);
    document.getElementById("btn-clear-planet-geo")?.addEventListener("click", clearPlanetGeo);
    document.getElementById("btn-clear-all-geo")?.addEventListener("click", clearAllPlanetGeo);
    document.getElementById("btn-save-news")?.addEventListener("click", saveNews);
    document.getElementById("btn-publish-order")?.addEventListener("click", publishMainOrder);
    document.getElementById("btn-clear-order")?.addEventListener("click", clearMainOrder);
    document.getElementById("btn-view-order")?.addEventListener("click", async () => {
      const data = await loadMainOrder();
      if (data) showMainOrder(data);
    });
    document.getElementById("btn-close-order-view")?.addEventListener("click", () => {
      const overlay = document.getElementById("order-overlay");
      if (overlay) overlay.style.display = "none";
    });

    document.getElementById("admin-planet-search")?.addEventListener("input", () => renderAdminPlanetList());
    document.getElementById("admin-log-search")?.addEventListener("input", () => renderLog());

    function renderAdminPlanetList() {
      const container = document.getElementById("planet-list");
      if (!container) return;
      container.innerHTML = "";
      const currentUser = window.getCurrentUser();
      const isFreya = currentUser && (currentUser.name === "Freya" || currentUser.email === "freya@semail.com");
      const q = (document.getElementById("admin-planet-search")?.value || "").toLowerCase().trim();

      allPlanets
        .filter(p => !q || p.name.toLowerCase().includes(q) || (p.sector || "").toLowerCase().includes(q))
        .forEach(planet => {
          const div = document.createElement("div");
          div.className = "planet-item";
          const statusSelect = document.createElement("select");
          ALL_STATUSES.forEach(st => {
            const opt = document.createElement("option");
            opt.value = st; opt.textContent = st;
            if (st === planet.status) opt.selected = true;
            statusSelect.appendChild(opt);
          });
          statusSelect.addEventListener("change", async () => {
            const oldStatus = planet.status;
            planet.status = statusSelect.value;
            if (statusSelect.value === "Под атакой") planet.lastPressureTick = Date.now();
            try {
              const data = { status: statusSelect.value };
              if (statusSelect.value === "Под атакой") data.lastPressureTick = planet.lastPressureTick;
              await updateDoc(doc(window.db, "planets", planet.name), data);
              await addLog(`${currentUser.name} изменил статус <b>${planet.name}</b>: ${oldStatus} → ${statusSelect.value}`);
              updatePlanetControl();
              await syncDivisionBonusToFirestore();
              if (!isPopupOpen()) renderPlanets();
              fillRouteSelects();
              fillGeoSelect();
            } catch (e) {
              statusSelect.value = oldStatus;
              planet.status = oldStatus;
            }
          });
          div.innerHTML = `<strong>${planet.name}</strong>`;
          div.appendChild(document.createTextNode(" Статус: "));
          div.appendChild(statusSelect);

          if (isFreya) {
            const makeNum = (label, color, field, isDays, isMult) => {
              const block = document.createElement("div");
              block.style.marginTop = "6px";
              block.innerHTML = `<span style="color:${color};font-size:12px;">${label}</span>`;
              const input = document.createElement("input");
              input.type = "number";
              input.style.cssText = "width:70px;margin-left:6px;background:#111;color:#fff;border:1px solid #444;padding:4px;";
              if (isDays) {
                input.min = 0; input.max = MAX_CAPTURE_DAYS; input.step = 0.1;
                input.value = planet[field] ?? "";
                input.placeholder = "авто";
              } else if (isMult) {
                input.min = 1; input.max = 100; input.step = 1;
                input.value = planet[field] ?? 1;
              } else {
                input.min = 0; input.max = 100; input.step = 0.1;
                input.value = planet[field] ?? 0;
              }
              const btn = document.createElement("button");
              btn.textContent = "OK";
              btn.style.cssText = `margin-left:4px;padding:4px 8px;background:${color};color:${color === "#ffe700" || color === "#00b4d8" ? "#000" : "#fff"};border:none;cursor:pointer;`;
              btn.onclick = async () => {
                let val;
                if (isDays) {
                  val = parseFloat(input.value);
                  if (isNaN(val) || val <= 0) val = null;
                  else val = Math.min(MAX_CAPTURE_DAYS, Math.max(0.1, val));
                  input.value = val ?? "";
                } else if (isMult) {
                  val = parseInt(input.value) || 1;
                  val = Math.min(100, Math.max(1, val));
                  input.value = val;
                } else {
                  val = parseFloat(input.value);
                  if (isNaN(val)) val = 0;
                  val = Math.min(100, Math.max(0, +val.toFixed(2)));
                  input.value = val;
                }
                planet[field] = val;
                planet.lastPressureTick = Date.now();
                try {
                  await updateDoc(doc(window.db, "planets", planet.name), { [field]: val, lastPressureTick: planet.lastPressureTick });
                  await addLog(`Freya: ${label} <b>${planet.name}</b> → ${val ?? "авто"}`);
                  if (!isPopupOpen()) renderPlanets();
                  if (field === "hubReserves") renderHubReservesList();
                } catch (e) {}
              };
              block.appendChild(input);
              block.appendChild(btn);
              div.appendChild(block);
            };
            makeNum("Натиск %:", "#ff2a2a", "enemyPressure", false, false);
            makeNum("Контроль СЗ %:", "#ffe700", "superEarthControl", false, false);
            makeNum("Множитель натиска:", "#ff6b6b", "enemyMultiplier", false, true);
            makeNum("Дней до оккупации:", "#ff2a2a", "enemyCaptureDays", true, false);
            makeNum("Дней до освобождения:", "#ffe700", "seCaptureDays", true, false);
            if (isFactoryHub(planet)) {
              makeNum("Резерв хаба %:", "#00b4d8", "hubReserves", false, false);
            }
          }
          container.appendChild(div);
        });
    }

    async function addLog(text) {
      const currentUser = window.getCurrentUser();
      const now = new Date();
      const time = now.toLocaleString("ru-RU", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit"
      });
      try {
        await addDoc(collection(window.db, "logs"), {
          time, text, timestamp: now.getTime(), user: currentUser?.name || "Система"
        });
        actionLog.unshift({ time, text });
        if (actionLog.length > 100) actionLog.pop();
        renderLog();
      } catch (e) {}
    }
    function renderLog() {
      const container = document.getElementById("action-log");
      if (!container) return;
      const q = (document.getElementById("admin-log-search")?.value || "").toLowerCase().trim();
      const filtered = actionLog.filter(e =>
        !q || e.text.toLowerCase().includes(q) || (e.time || "").toLowerCase().includes(q)
      );
      container.innerHTML = filtered.map(e =>
        `<div class="log-entry"><span class="log-time">[${e.time}]</span> ${e.text}</div>`
      ).join("") || "<div style='color:#666'>Лог пуст</div>";
    }
    document.getElementById("btn-clear-log")?.addEventListener("click", async () => {
      if (!confirm("Очистить лог?")) return;
      try {
        const snapshot = await getDocs(collection(window.db, "logs"));
        await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));
        actionLog = [];
        renderLog();
      } catch (e) {}
    });

    let coordMode = false;
    document.addEventListener("keydown", e => {
      if (!e.key) return;
      if (e.key.toLowerCase() === "c") {
        coordMode = !coordMode;
        map.getContainer().style.cursor = coordMode ? "crosshair" : "";
      }
    });
    map.on("click", e => {
      if (!coordMode) return;
      console.log(`x: ${e.latlng.lng.toFixed(0)}, y: ${e.latlng.lat.toFixed(0)}`);
      L.popup().setLatLng(e.latlng).setContent(`x: ${e.latlng.lng.toFixed(0)}<br>y: ${e.latlng.lat.toFixed(0)}`).openOn(map);
    });

  }, 150);
});
