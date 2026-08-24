import { 
  collection, doc, getDocs, setDoc, updateDoc, getDoc,
  addDoc, deleteDoc, query, orderBy, limit
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

const DANGER_STATUSES = ["Под угрозой", "Под атакой", "Оккупирована", "Потеряна"];
const SE_CONTROLLED = ["Столица", "Свободна"];
const GEO_ALLOWED = ["Столица", "Свободна", "Под угрозой", "Под атакой"];
const ALL_STATUSES = ["Столица", "Свободна", "Под угрозой", "Под атакой", "Оккупирована", "Потеряна"];
const HOUR_MS = 60 * 60 * 1000;
const HALF_HOUR_MS = 30 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const RESUPPLY_HOURS_MAX = 12;
const SHIPMENT_COST = 500;
const CONVOY_COST = 3000;
const DELIVERY_REWARD = 1500;
const TRAVEL_FROM_SUPER_EARTH = 3 * HOUR_MS;
const TRAVEL_FROM_HUB = 1 * HOUR_MS;
const MAX_CAPTURE_DAYS = 7;
const MAX_PROBES = 3;
const PROBE_TIME = 4 * HOUR_MS;

const ORE_LIST = ["Титан","Кобальт","Астронит","Феррокристал","Никель","Вольтарит","Рубиконит","Палладий","Термолит"];
const FUEL_LIST = ["Водородное топливо","Метановый конденсат","Ионный концентрат","Крио-топливо","Кварковое топливо","Термоядерные стержни","Антиматерия","Е-711"];
const RARE_LIST = ["Кристаллы Элизиума","Тёмная материя","Квантовый лёд","Звёздный янтарь","Адаптивный концентрат","Пустотный камень","Гравитационные жемчужины"];

window.addEventListener("user-ready", function() {
  if (map) return;

  setTimeout(async () => {
    map = L.map('map', {
      crs: L.CRS.Simple,
      minZoom: -2,
      maxZoom: 3,
      zoomSnap: 0.25,
      zoomDelta: 0.25,
      zoomControl: false
    });

    const bounds = [[0, 0], [4000, 4000]];
    L.imageOverlay('assets/map.png', bounds).addTo(map);
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

    // ===== НОВОСТИ =====
    async function loadNews() {
      try {
        const ref = doc(window.db, "settings", "news");
        const snap = await getDoc(ref);
        let top = "ДОБРО ПОЖАЛОВАТЬ В AVID RP-SHERS · ЗА ДЕМОКРАТИЮ";
        let bottom = "СУПЕР-ЗЕМЛЯ НЕ СЛОМЛЕНА · УНИЧТОЖЬТЕ ВРАГОВ СВОБОДЫ";
        if (snap.exists()) {
          top = snap.data().top || top;
          bottom = snap.data().bottom || bottom;
        }
        applyNews(top, bottom);
        const topInput = document.getElementById("news-top-input");
        const bottomInput = document.getElementById("news-bottom-input");
        if (topInput) topInput.value = top;
        if (bottomInput) bottomInput.value = bottom;
      } catch (e) { console.error(e); }
    }

    function applyNews(top, bottom) {
      const topTrack = document.getElementById("news-top-track");
      const bottomTrack = document.getElementById("news-bottom-track");
      const safe = (t) => String(t || "").replace(/</g, "&lt;");
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
      } catch (e) {
        console.error(e);
        alert("Ошибка сохранения");
      }
    }

    // ===== ГЛАВНЫЙ ПРИКАЗ =====
    async function loadMainOrder() {
      try {
        const ref = doc(window.db, "settings", "mainOrder");
        const snap = await getDoc(ref);
        const btnView = document.getElementById("btn-view-order");
        if (!snap.exists() || !snap.data().active) {
          if (btnView) btnView.style.display = "none";
          return null;
        }
        if (btnView) btnView.style.display = "block";
        return snap.data();
      } catch (e) {
        console.error(e);
        return null;
      }
    }

    function showMainOrder(data) {
      if (!data || !data.active) return;
      const overlay = document.getElementById("order-overlay");
      const title = document.getElementById("order-view-title");
      const text = document.getElementById("order-view-text");
      const img = document.getElementById("order-view-image");
      if (title) title.textContent = data.title || "ГЛАВНЫЙ ПРИКАЗ";
      if (text) text.textContent = data.text || "";
      if (img) {
        if (data.image) {
          img.src = data.image;
          img.style.display = "block";
        } else {
          img.removeAttribute("src");
          img.style.display = "none";
        }
      }
      if (overlay) overlay.style.display = "flex";
    }

    async function publishMainOrder() {
      const title = document.getElementById("order-title")?.value?.trim() || "ГЛАВНЫЙ ПРИКАЗ";
      const text = document.getElementById("order-text")?.value?.trim() || "";
      const image = document.getElementById("order-image")?.value?.trim() || "";
      if (!text) {
        alert("Введите текст приказа");
        return;
      }
      try {
        const data = {
          title, text, image,
          active: true,
          updatedAt: Date.now(),
          author: "Freya"
        };
        await setDoc(doc(window.db, "settings", "mainOrder"), data);
        await addLog("Freya опубликовала <b>Главный приказ</b>");
        showMainOrder(data);
        const btnView = document.getElementById("btn-view-order");
        if (btnView) btnView.style.display = "block";
        alert("Приказ опубликован");
      } catch (e) {
        console.error(e);
        alert("Ошибка");
      }
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
      } catch (e) {
        alert("Ошибка");
      }
    }

    // ===== ПЛАНЕТЫ =====
    async function loadPlanets() {
      try {
        const snapshot = await getDocs(collection(window.db, "planets"));
        const now = Date.now();
        if (snapshot.empty) {
          const response = await fetch('planets.json');
          const planets = await response.json();
          for (const p of planets) {
            p.enemyPressure = p.enemyPressure ?? 0;
            p.superEarthControl = p.superEarthControl ?? 0;
            p.lastPressureTick = now;
            p.enemyCaptureDays = p.enemyCaptureDays ?? null;
            p.seCaptureDays = p.seCaptureDays ?? null;
            p.geoSurvey = p.geoSurvey ?? null;
            await setDoc(doc(window.db, "planets", p.name), p);
          }
          allPlanets = planets;
        } else {
          allPlanets = [];
          for (const d of snapshot.docs) {
            allPlanets.push(await processPlanetPressure(d.data(), now));
          }
        }
      } catch (e) {
        console.error(e);
        const response = await fetch('planets.json');
        allPlanets = await response.json();
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
      let enemy = planet.enemyPressure || 0;
      let control = planet.superEarthControl || 0;
      if (enemy <= 0 && control <= 0) {
        planet.lastPressureTick = now;
        return planet;
      }
      let lastTick = planet.lastPressureTick || now;
      const intervals = Math.floor((now - lastTick) / HALF_HOUR_MS);
      if (intervals <= 0) return planet;

      if (enemy > 0) enemy = Math.min(100, enemy + intervals * rateFromDays(planet.enemyCaptureDays));
      if (control > 0) control = Math.min(100, control + intervals * rateFromDays(planet.seCaptureDays));
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
          renderPlanets();
          fillRouteSelects();
          fillGeoSelect();
        }
      } catch (e) { console.error(e); }
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

    function getRemainingMs(percent, lastTick, captureDays) {
      if (percent <= 0) return null;
      if (percent >= 100) return 0;
      const rate = rateFromDays(captureDays);
      let totalMs = ((100 - percent) / rate) * HALF_HOUR_MS;
      const msInto = (Date.now() - (lastTick || Date.now())) % HALF_HOUR_MS;
      return Math.max(0, totalMs - msInto);
    }

    function getResupplyHours(readiness) {
      const r = Math.max(0, Math.min(100, Number(readiness) || 0));
      return +(RESUPPLY_HOURS_MAX * (100 - r) / 100).toFixed(2);
    }

    function getDivisionBonus(planetName) {
      let bonus = 0;
      fleet.filter(u => u.planet === planetName).forEach(u => {
        if (u.type === "Helldivers") bonus += 30;
        if (u.type === "SEAF") bonus += 15;
      });
      return Math.min(100, bonus);
    }

    function updatePlanetControl() {
      allPlanets.forEach(planet => {
        const bonus = getDivisionBonus(planet.name);
        if (planet.status !== "Под атакой") planet.superEarthControl = bonus;
        else planet.superEarthControl = Math.max(planet.superEarthControl || 0, bonus);
      });
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
      } catch (e) {
        console.error(e);
        sanCredits = 5000;
      }
    }

    async function saveSanCredits() {
      try {
        await setDoc(doc(window.db, "players", "san"), { credits: sanCredits }, { merge: true });
        updateCreditsUI();
      } catch (e) { console.error(e); }
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
      if (!list.length) {
        container.innerHTML = "<div style='color:#666;font-size:13px;'>Нет активных запросов</div>";
        return;
      }
      container.innerHTML = "";
      list.forEach(r => {
        const div = document.createElement("div");
        div.className = "fund-request-item";
        div.innerHTML = `<strong>${r.amount} ¢</strong><div style="margin-top:4px;color:#aaa;">${r.comment || "—"}</div>`;
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
          sanCredits += req.amount;
          await saveSanCredits();
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
      if (toPlanet && toPlanet.status === "Под атакой" && !s.convoy) {
        if (Math.random() >= 0.2) destroyed = true;
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

      s.status = "delivered";
      s.resultMessage = `Поставка ${s.from} → ${s.to} успешно доставлена`;
      sanCredits += DELIVERY_REWARD;
      await saveSanCredits();
      s.resultMessage += ` | +${DELIVERY_REWARD} ¢`;

      try {
        await updateDoc(doc(window.db, "shipments", s.id), {
          status: "delivered", resultMessage: s.resultMessage, completedAt: Date.now()
        });
        if (toPlanet && toPlanet.status === "Под атакой") {
          const newControl = Math.min(100, (toPlanet.superEarthControl || 0) + 5);
          toPlanet.superEarthControl = newControl;
          toPlanet.lastPressureTick = toPlanet.lastPressureTick || Date.now();
          await updateDoc(doc(window.db, "planets", toPlanet.name), {
            superEarthControl: newControl, lastPressureTick: toPlanet.lastPressureTick
          });
          for (const unit of fleet.filter(u => u.planet === s.to)) {
            const newR = Math.min(100, (unit.readiness || 0) + 15);
            unit.readiness = newR;
            await updateDoc(doc(window.db, "fleet", unit.id), { readiness: newR });
          }
          s.resultMessage += " (+5% СЗ, +15% дивизиям)";
          await updateDoc(doc(window.db, "shipments", s.id), { resultMessage: s.resultMessage });
          await addLog(`Поставка <b>${s.from} → ${s.to}</b> доставлена! +${DELIVERY_REWARD} ¢`);
          renderPlanets();
          renderFleetMarkers();
          renderFleetPanel();
        } else {
          await addLog(`Поставка <b>${s.from} → ${s.to}</b> доставлена! +${DELIVERY_REWARD} ¢`);
        }
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
      } catch (e) { console.error(e); }
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

    // ===== NIVERMA =====
    async function completeProbe(p) {
      const planet = allPlanets.find(x => x.name === p.planet);
      const survey = {
        ore: pickRandom(ORE_LIST, 1, 3),
        fuel: pickRandom(FUEL_LIST, 1, 2),
        rare: pickRandom(RARE_LIST, 0, 2),
        surveyedAt: Date.now()
      };
      if (planet) {
        planet.geoSurvey = survey;
        try {
          await updateDoc(doc(window.db, "planets", planet.name), { geoSurvey: survey });
        } catch (e) { console.error(e); }
      }
      p.status = "done";
      p.result = survey;
      try {
        await updateDoc(doc(window.db, "probes", p.id), {
          status: "done", result: survey, completedAt: Date.now()
        });
        await addLog(`Niverma: зонд на <b>${p.planet}</b> завершил разведку`);
      } catch (e) {}
      renderPlanets();
      renderProbesList();
      renderGeoResults();
      updateProbeSlots();
      fillClearGeoSelect();
      return p;
    }

    async function loadProbes() {
      try {
        const snapshot = await getDocs(collection(window.db, "probes"));
        const now = Date.now();
        probes = [];
        for (const d of snapshot.docs) {
          let p = { id: d.id, ...d.data() };
          if (p.status === "active" && p.arriveAt && now >= p.arriveAt) {
            p = await completeProbe(p);
          }
          if (p.status === "active") probes.push(p);
        }
        renderProbesOnMap();
        renderProbesList();
        renderGeoResults();
        updateProbeSlots();
      } catch (e) { console.error(e); }
    }

    function renderProbesOnMap() {
      probeLayers.forEach(l => map.removeLayer(l));
      probeLayers = [];
      probes.forEach(p => {
        if (p.status !== "active") return;
        const planet = allPlanets.find(x => x.name === p.planet);
        if (!planet) return;
        const m = L.marker([planet.y - 20, planet.x - 20], {
          icon: L.icon({
            iconUrl: "assets/poi/drone.png",
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          })
        }).addTo(map);
        m.bindTooltip(`Зонд: ${p.planet}`, { direction: "top" });
        probeLayers.push(m);
      });
    }

    function updateProbeSlots() {
      const el = document.getElementById("probe-slots");
      if (!el) return;
      const used = probes.filter(p => p.status === "active").length;
      el.textContent = `${MAX_PROBES - used}/${MAX_PROBES}`;
    }

    function fillGeoSelect() {
      const sel = document.getElementById("geo-planet");
      if (!sel) return;
      sel.innerHTML = "";
      allPlanets.filter(p => GEO_ALLOWED.includes(p.status)).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = p.name + (p.geoSurvey ? " ✓" : "");
        sel.appendChild(opt);
      });
    }

    function fillClearGeoSelect() {
      const sel = document.getElementById("clear-geo-planet");
      if (!sel) return;
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
        return `<div class="probe-item"><strong>${p.planet}</strong>
          <div style="margin-top:4px;">Осталось ~${left.toFixed(1)} ч</div></div>`;
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
        return `<div class="geo-result-item">
          <strong>${p.name}</strong>
          <div style="margin-top:6px;color:#ff9800;">⛏ Руда: ${(g.ore || []).join(", ") || "—"}</div>
          <div style="margin-top:4px;color:#00b4d8;">⛽ Топливо: ${(g.fuel || []).join(", ") || "—"}</div>
          <div style="margin-top:4px;color:#9b59b6;">✦ Редкие: ${(g.rare || []).join(", ") || "—"}</div>
        </div>`;
      }).join("");
    }

    async function sendProbe() {
      const planetName = document.getElementById("geo-planet")?.value;
      if (!planetName) { alert("Выберите планету"); return; }
      const planet = allPlanets.find(p => p.name === planetName);
      if (!planet || !GEO_ALLOWED.includes(planet.status)) {
        alert("На эту планету нельзя отправить зонд");
        return;
      }
      if (probes.filter(p => p.status === "active").length >= MAX_PROBES) {
        alert("Все 3 слота зондов заняты");
        return;
      }
      if (probes.some(p => p.status === "active" && p.planet === planetName)) {
        alert("Зонд на эту планету уже в пути");
        return;
      }
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
        alert("Зонд отправлен. Разведка займёт 4 часа.");
      } catch (e) {
        console.error(e);
        alert("Ошибка");
      }
    }

    async function clearGeoResultsHistory() {
      if (!confirm("Удалить записи завершённых зондов из истории?")) return;
      try {
        const snapshot = await getDocs(collection(window.db, "probes"));
        const dels = [];
        snapshot.forEach(d => {
          if (d.data().status === "done") dels.push(deleteDoc(d.ref));
        });
        await Promise.all(dels);
        await renderGeoResults();
        await addLog(`${window.getCurrentUser()?.name || "Niverma"} очистила историю георазведки`);
        alert("История очищена");
      } catch (e) {
        console.error(e);
        alert("Ошибка");
      }
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
        renderPlanets();
        renderGeoResults();
        fillClearGeoSelect();
        fillGeoSelect();
        alert("Очищено");
      } catch (e) { alert("Ошибка"); }
    }

    async function clearAllPlanetGeo() {
      if (!confirm("Очистить ресурсы георазведки на ВСЕХ планетах?")) return;
      try {
        for (const p of allPlanets) {
          if (p.geoSurvey) {
            p.geoSurvey = null;
            await updateDoc(doc(window.db, "planets", p.name), { geoSurvey: null });
          }
        }
        await addLog("Freya очистила георазведку на всех планетах");
        renderPlanets();
        renderGeoResults();
        fillClearGeoSelect();
        fillGeoSelect();
        alert("Все ресурсы сброшены");
      } catch (e) { alert("Ошибка"); }
    }

    setInterval(async () => {
      if (!map) return;
      const now = Date.now();

      let planetsChanged = false;
      for (let i = 0; i < allPlanets.length; i++) {
        const before = allPlanets[i].status;
        allPlanets[i] = await processPlanetPressure(allPlanets[i], now);
        if (allPlanets[i].status !== before) planetsChanged = true;
      }
      if (planetsChanged) {
        renderPlanets();
        fillRouteSelects();
        fillGeoSelect();
      }

      let fleetChanged = false;
      for (let i = 0; i < fleet.length; i++) {
        const before = fleet[i].readiness;
        fleet[i] = await processUnitTime(fleet[i], now);
        if (fleet[i].readiness !== before) fleetChanged = true;
      }
      if (fleetChanged) {
        renderFleetMarkers();
        const fp = document.getElementById("fleet-panel");
        if (fp && fp.classList.contains("open")) renderFleetPanel();
      }

      let needShip = false;
      shipments.forEach(s => {
        if (s.status === "in_transit" && s.arriveAt && now >= s.arriveAt) needShip = true;
      });
      if (needShip) await loadShipments();
      else if (shipments.length) renderShipmentsOnMap();

      let needProbe = false;
      probes.forEach(p => {
        if (p.status === "active" && p.arriveAt && now >= p.arriveAt) needProbe = true;
      });
      if (needProbe) await loadProbes();
      else {
        renderProbesList();
        updateProbeSlots();
      }
    }, 3000);

    function renderRoutesList() {
      const container = document.getElementById("routes-list");
      if (!container) return;
      const active = shipments.filter(s => s.status === "in_transit");
      if (!active.length) {
        container.innerHTML = "<div style='color:#666; font-size:13px;'>Нет активных поставок</div>";
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
        done.sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
        const recent = done.slice(0, 20);
        if (!recent.length) {
          container.innerHTML = "<div style='color:#666; font-size:13px;'>Пока нет завершённых поставок</div>";
          return;
        }
        container.innerHTML = recent.map(s => {
          const ok = s.status === "delivered";
          const color = ok ? "#4caf50" : "#ff2a2a";
          return `<div class="route-item" style="border-color:${color};">
            <strong style="color:${color};">${ok ? "ДОСТАВЛЕНО" : "УНИЧТОЖЕНО"}</strong>
            <div style="margin-top:4px;">${s.from} → ${s.to}</div>
            <div style="margin-top:4px; color:#aaa; font-size:12px;">${s.resultMessage || ""}</div></div>`;
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
      fromSel.innerHTML = "";
      toSel.innerHTML = "";
      allPlanets.filter(p => p.name === "Super Earth" || isFactoryHub(p)).forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = p.name + (p.name === "Super Earth" ? " (3 ч)" : " (1 ч)");
        fromSel.appendChild(opt);
      });
      allPlanets.filter(p => isSEControlled(p) || p.status === "Под атакой").forEach(p => {
        const opt = document.createElement("option");
        opt.value = p.name;
        opt.textContent = p.name + (p.status === "Под атакой" ? " ⚔" : "");
        toSel.appendChild(opt);
      });
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
        alert(`Отправлено. Прибытие через ${travelMs / HOUR_MS} ч.`);
      } catch (e) {
        sanCredits += cost;
        await saveSanCredits();
        alert("Ошибка");
      }
    }

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
          for (const d of snapshot.docs) fleet.push(await processUnitTime(d.data(), now));
        }
        updatePlanetControl();
        renderPlanets();
        renderFleetMarkers();
        renderFleetPanel();
        renderAdminPlanetList();
        fillRouteSelects();
        fillGeoSelect();
        fillClearGeoSelect();
      } catch (e) { console.error(e); }
    }

    async function processUnitTime(unit, now) {
      if (unit.resupplyUntil && now >= unit.resupplyUntil) {
        unit.readiness = 100;
        unit.resupplyUntil = null;
        unit.lastTick = now;
        await updateDoc(doc(window.db, "fleet", unit.id), { readiness: 100, resupplyUntil: null, lastTick: now });
        return unit;
      }
      if (unit.resupplyUntil) return unit;
      const planet = allPlanets.find(p => p.name === unit.planet);
      const isDanger = planet && DANGER_STATUSES.includes(planet.status);
      if (isDanger && unit.readiness > 0) {
        const decay = ((now - (unit.lastTick || now)) / HOUR_MS) * 5;
        if (decay > 0.01) {
          unit.readiness = Math.max(0, +(unit.readiness - decay).toFixed(2));
          unit.lastTick = now;
          await updateDoc(doc(window.db, "fleet", unit.id), { readiness: unit.readiness, lastTick: now });
        }
      } else if (!unit.lastTick) {
        unit.lastTick = now;
        await updateDoc(doc(window.db, "fleet", unit.id), { lastTick: now });
      }
      return unit;
    }

    async function loadLog() {
      try {
        const q = query(collection(window.db, "logs"), orderBy("timestamp", "desc"), limit(50));
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
    await loadLog();
    await loadNews();
    await loadMainOrder();

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

        const enemy = planet.enemyPressure || 0;
        const control = planet.superEarthControl || 0;
        const lastTick = planet.lastPressureTick || Date.now();
        let timersHtml = "";
        if (isAttack) {
          const enemyMs = getRemainingMs(enemy, lastTick, planet.enemyCaptureDays);
          const controlMs = getRemainingMs(control, lastTick, planet.seCaptureDays);
          timersHtml = `<div style="margin-top:10px; font-size:12px; line-height:1.6;" class="capture-timers" data-planet="${planet.name}">
            <div style="color:#ff2a2a">⏳ До оккупации: <b class="enemy-timer">${enemyMs === null ? "—" : formatTime(enemyMs)}</b></div>
            <div style="color:#ffe700">⏳ До освобождения: <b class="control-timer">${controlMs === null ? "—" : formatTime(controlMs)}</b></div>
          </div>`;
        }

        let geoHtml = "";
        if (planet.geoSurvey) {
          const g = planet.geoSurvey;
          geoHtml = `<div style="margin-top:10px; font-size:12px; border-top:1px solid #333; padding-top:8px;">
            <div style="color:#2ecc71; font-weight:700;">Георазведка</div>
            <div style="color:#ff9800; margin-top:4px;">⛏ ${(g.ore || []).join(", ") || "—"}</div>
            <div style="color:#00b4d8; margin-top:2px;">⛽ ${(g.fuel || []).join(", ") || "—"}</div>
            <div style="color:#9b59b6; margin-top:2px;">✦ ${(g.rare || []).join(", ") || "—"}</div>
          </div>`;
        }

        marker.bindPopup(`
          ${planet.image ? `<img class="popup-image" src="${planet.image}" alt="${planet.name}">` : ""}
          <div class="popup-body">
            <h3>${planet.name}</h3>
            <p><b>Сектор:</b> ${planet.sector || "—"}</p>
            <p><b>Контроль:</b> ${planet.faction || "—"}</p>
            <p><b>Тип:</b> ${planet.biome || "—"}</p>
            <p><b>Статус:</b> ${planet.status}</p>
            <div style="margin: 10px 0 4px 0; font-size: 13px;"><span style="color:#ff2a2a">Натиск врага:</span> ${enemy}%</div>
            <div style="background:#222; height:6px; border-radius:3px; overflow:hidden; margin-bottom:8px;">
              <div style="width:${enemy}%; height:100%; background:#ff2a2a;"></div>
            </div>
            <div style="margin: 4px 0; font-size: 13px;"><span style="color:#ffe700">Контроль СЗ:</span> ${control}%</div>
            <div style="background:#222; height:6px; border-radius:3px; overflow:hidden; margin-bottom:6px;">
              <div style="width:${control}%; height:100%; background:#ffe700;"></div>
            </div>
            ${timersHtml}
            ${geoHtml}
            <p style="margin-top:10px">${planet.description}</p>
          </div>
        `, { className: popupClass });

        marker.on("popupopen", () => {
          if (activeTimerInterval) clearInterval(activeTimerInterval);
          if (planet.status !== "Под атакой") return;
          activeTimerInterval = setInterval(() => {
            const p = allPlanets.find(x => x.name === planet.name);
            if (!p || p.status !== "Под атакой") { clearInterval(activeTimerInterval); return; }
            const box = document.querySelector(`.capture-timers[data-planet="${planet.name}"]`);
            if (!box) return;
            const eMs = getRemainingMs(p.enemyPressure || 0, p.lastPressureTick, p.enemyCaptureDays);
            const cMs = getRemainingMs(p.superEarthControl || 0, p.lastPressureTick, p.seCaptureDays);
            const enemyT = box.querySelector(".enemy-timer");
            const controlT = box.querySelector(".control-timer");
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
      fleet.forEach(unit => {
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
              ? "drop-shadow(0 0 8px rgba(255, 231, 0, 0.9))"
              : "drop-shadow(0 0 8px rgba(0, 180, 216, 0.9))";
          }
          m.bindTooltip(unit.name + (unit.resupplyUntil ? " (пополнение...)" : ` (${Number(unit.readiness).toFixed(1)}%)`), { direction: "top" });
          fleetMarkers.push(m);
        });
      });
    }

    function renderFleetPanel() {
      const container = document.getElementById("fleet-list");
      if (!container) return;
      container.innerHTML = "";
      const now = Date.now();
      fleet.forEach(unit => {
        const div = document.createElement("div");
        div.className = "fleet-item";
        const isResupplying = unit.resupplyUntil && now < unit.resupplyUntil;
        const readinessColor = unit.readiness > 60 ? "#4caf50" : unit.readiness > 30 ? "#ff9800" : "#f44336";
        const resupplyHours = getResupplyHours(unit.readiness);
        let resupplyInfo = "";
        if (isResupplying) {
          const left = Math.max(0, (unit.resupplyUntil - now) / HOUR_MS);
          resupplyInfo = `<div style="color:#00b4d8; margin: 6px 0;">Пополнение: ~${left.toFixed(1)} ч.</div>`;
        }
        const planetData = allPlanets.find(p => p.name === unit.planet);
        const canResupplyHere =
          (unit.type === "SEAF" && unit.planet === "Pathfinder-V") ||
          (unit.type === "Helldivers" && (unit.planet === "Super Earth" || isFactoryHub(planetData)));

        div.innerHTML = `
          <strong>${unit.name}</strong>
          <div class="location">Сейчас: ${unit.planet}</div>
          <div style="margin: 8px 0 4px 0; font-size: 13px;">
            <span style="color: #ffe700; text-shadow: 0 0 6px rgba(255, 231, 0, 0.7);">Боеготовность:</span>
            <b style="color:${readinessColor}"> ${Number(unit.readiness).toFixed(1)}%</b>
          </div>
          <div style="background:#222; height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
            <div style="width: ${unit.readiness}%; height: 100%; background: ${readinessColor};"></div>
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
          lock.style.cssText = "color:#888; font-size:13px;";
          lock.textContent = "Дивизия на пополнении";
          div.appendChild(lock);
        }
        container.appendChild(div);
      });
    }

    async function moveUnit(unit, newPlanet) {
      if (newPlanet === unit.planet) return;
      if (unit.readiness <= 0) { alert("Небоеспособна"); return; }
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
        renderPlanets();
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
    const adminPanel = document.getElementById("admin-panel");
    const fleetPanel = document.getElementById("fleet-panel");
    const logisticsPanel = document.getElementById("logistics-panel");
    const fundsPanel = document.getElementById("funds-panel");
    const geoPanel = document.getElementById("geo-panel");
    const newsPanel = document.getElementById("news-panel");
    const orderEditPanel = document.getElementById("order-edit-panel");
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
    }

    btnAdmin?.addEventListener("click", async () => {
      if (!window.getCurrentUser()?.isAdmin) return;
      adminPanel.classList.add("open");
      const cu = window.getCurrentUser();
      if (cu && (cu.name === "Freya" || cu.email === "freya@semail.com")) {
        await renderAdminFundRequests();
        fillClearGeoSelect();
      }
    });
    btnFleet?.addEventListener("click", () => fleetPanel.classList.add("open"));
    btnLogistics?.addEventListener("click", () => {
      fillRouteSelects();
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
      renderProbesList();
      renderGeoResults();
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

    document.getElementById("btn-close-admin")?.addEventListener("click", () => adminPanel.classList.remove("open"));
    document.getElementById("btn-close-fleet")?.addEventListener("click", () => fleetPanel.classList.remove("open"));
    document.getElementById("btn-close-logistics")?.addEventListener("click", () => logisticsPanel.classList.remove("open"));
    document.getElementById("btn-close-funds")?.addEventListener("click", () => fundsPanel?.classList.remove("open"));
    document.getElementById("btn-close-geo")?.addEventListener("click", () => geoPanel?.classList.remove("open"));
    document.getElementById("btn-close-news")?.addEventListener("click", () => newsPanel?.classList.remove("open"));
    document.getElementById("btn-close-order-edit")?.addEventListener("click", () => orderEditPanel?.classList.remove("open"));
    document.getElementById("btn-create-route")?.addEventListener("click", createShipment);
    document.getElementById("btn-clear-shipment-results")?.addEventListener("click", clearShipmentResults);
    document.getElementById("btn-send-fund-request")?.addEventListener("click", sendFundRequest);
    document.getElementById("btn-send-probe")?.addEventListener("click", sendProbe);
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

    function renderAdminPlanetList() {
      const container = document.getElementById("planet-list");
      if (!container) return;
      container.innerHTML = "";
      const currentUser = window.getCurrentUser();
      const isFreya = currentUser && (currentUser.name === "Freya" || currentUser.email === "freya@semail.com");

      allPlanets.forEach(planet => {
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
            renderPlanets();
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
          const makeNum = (label, color, field, isDays) => {
            const block = document.createElement("div");
            block.style.marginTop = "6px";
            block.innerHTML = `<span style="color:${color}; font-size:12px;">${label}</span>`;
            const input = document.createElement("input");
            input.type = "number";
            input.style.cssText = "width:60px; margin-left:6px; background:#111; color:#fff; border:1px solid #444; padding:4px;";
            if (isDays) {
              input.min = 0; input.max = MAX_CAPTURE_DAYS; input.step = 0.5;
              input.value = planet[field] ?? "";
              input.placeholder = "авто";
            } else {
              input.min = 0; input.max = 100;
              input.value = planet[field] || 0;
            }
            const btn = document.createElement("button");
            btn.textContent = "OK";
            btn.style.cssText = `margin-left:4px; padding:4px 8px; background:${color}; color:${color === "#ffe700" ? "#000" : "#fff"}; border:none; cursor:pointer;`;
            btn.onclick = async () => {
              let val;
              if (isDays) {
                val = parseFloat(input.value);
                if (isNaN(val) || val <= 0) val = null;
                else val = Math.min(MAX_CAPTURE_DAYS, Math.max(0.1, val));
                input.value = val ?? "";
              } else {
                val = Math.min(100, Math.max(0, parseInt(input.value) || 0));
                input.value = val;
              }
              planet[field] = val;
              planet.lastPressureTick = Date.now();
              try {
                await updateDoc(doc(window.db, "planets", planet.name), { [field]: val, lastPressureTick: planet.lastPressureTick });
                await addLog(`Freya: ${label} <b>${planet.name}</b> → ${val ?? "авто"}`);
                renderPlanets();
              } catch (e) {}
            };
            block.appendChild(input);
            block.appendChild(btn);
            div.appendChild(block);
          };
          makeNum("Натиск %:", "#ff2a2a", "enemyPressure", false);
          makeNum("Контроль СЗ %:", "#ffe700", "superEarthControl", false);
          makeNum("Дней до оккупации:", "#ff2a2a", "enemyCaptureDays", true);
          makeNum("Дней до освобождения:", "#ffe700", "seCaptureDays", true);
        }
        container.appendChild(div);
      });
    }

    async function addLog(text) {
      const currentUser = window.getCurrentUser();
      const now = new Date();
      const time = now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      try {
        await addDoc(collection(window.db, "logs"), {
          time, text, timestamp: now.getTime(), user: currentUser?.name || "Система"
        });
        actionLog.unshift({ time, text });
        if (actionLog.length > 50) actionLog.pop();
        renderLog();
      } catch (e) {}
    }

    function renderLog() {
      const container = document.getElementById("action-log");
      if (!container) return;
      container.innerHTML = actionLog.map(e =>
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