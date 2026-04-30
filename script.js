const API_URL = "https://script.google.com/macros/s/AKfycbyOfQRKh_tj5sdISprAbO2GsS2dyjIE3u37woE2wjzORhWcenHi_FuKyUa20rKD0GpaZQ/exec";
const API_TIMEOUT_MS = 30000;

let allPlayers = [];
let latestResults = {};

const scaleOptions = [
  { label: "Low", value: 0 },
  { label: "Fair", value: 2.5 },
  { label: "Average", value: 5 },
  { label: "Good", value: 7.5 },
  { label: "Excellent", value: 10 }
];

const version3Categories = [
  {
    key: "combat",
    label: "Combat Skills",
    tip: "Aim, weapon control, ammo use, and winning fights.",
    theme: "combat"
  },
  {
    key: "communication",
    label: "Communication / Status Updates",
    tip: "Clear, useful updates without cluttering comms.",
    theme: "communication"
  },
  {
    key: "decision",
    label: "Decision Making",
    tip: "Smart choices on when to attack, defend, rotate, or support.",
    theme: "decision"
  },
  {
    key: "awareness",
    label: "Map Awareness",
    tip: "Knowledge of routes, pickups, player positions, and pressure.",
    theme: "awareness"
  },
  {
    key: "movement",
    label: "Movement / Speed",
    tip: "Dodging, wall runs, chasing, escaping, and reaching key areas quickly.",
    theme: "movement"
  },
  {
    key: "impact",
    label: "Team Impact",
    tip: "Overall contribution to team control, momentum, and wins.",
    theme: "impact"
  }
].sort((a, b) => a.label.localeCompare(b.label));

window.addEventListener("load", async () => {
  try{
    setupTabs();
    setupButtons();
    await loadInitialData();
    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("app").classList.remove("hidden");
  }catch(err){
    console.error(err);
    document.getElementById("loadingScreen").style.display = "none";
    await showModal("Startup error. Open console for details.", "alert");
  }
});

async function api(data){
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try{
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(data),
      signal: controller.signal
    });

    return await res.json();
  }finally{
    clearTimeout(timer);
  }
}

function showBusy(text = "WORKING"){
  const overlay = document.getElementById("busyOverlay");
  const busyText = document.getElementById("busyText");
  busyText.innerHTML = `${text}<span class="dots"></span>`;
  overlay.style.display = "flex";
}

function hideBusy(){
  document.getElementById("busyOverlay").style.display = "none";
}

function showModal(message, type = "alert"){
  return new Promise(resolve => {
    const modal = document.getElementById("customModal");
    const msg = document.getElementById("modalMessage");
    const confirmBtn = document.getElementById("modalConfirm");
    const cancelBtn = document.getElementById("modalCancel");

    msg.textContent = message;
    cancelBtn.style.display = type === "alert" ? "none" : "inline-flex";
    modal.style.display = "flex";

    const cleanup = value => {
      modal.style.display = "none";
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(value);
    };

    confirmBtn.onclick = () => cleanup(true);
    cancelBtn.onclick = () => cleanup(null);
  });
}

function setupTabs(){
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });
}

function showTab(tabId){
  document.querySelectorAll(".tabContent").forEach(tab => {
    tab.classList.toggle("active", tab.id === tabId);
  });

  document.querySelectorAll(".tabButton").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabId);
  });

  window.scrollTo({ top: 0, behavior: "instant" });

  if(tabId === "resultsTab"){
    renderResults();
  }
}

function setupButtons(){
  document.getElementById("submitVersion1Btn").onclick = () => submitVersion(1);
  document.getElementById("submitVersion2Btn").onclick = () => submitVersion(2);
  document.getElementById("submitVersion3Btn").onclick = () => submitVersion(3);
  document.getElementById("refreshResultsBtn").onclick = refreshResults;

  const infoBtn = document.getElementById("infoBtn");
  const infoPanel = document.getElementById("infoPanel");
  const closeBtn = document.getElementById("infoCloseBtn");

  infoBtn.onclick = e => {
    e.stopPropagation();
    infoPanel.classList.add("show");
  };

  closeBtn.onclick = e => {
    e.stopPropagation();
    infoPanel.classList.remove("show");
  };

  infoPanel.onclick = e => {
    if(e.target === infoPanel) infoPanel.classList.remove("show");
  };
}

async function loadInitialData(){
  showBusy("LOADING");

  try{
    const data = await api({ action: "getInitialData" });

    if(!data || !data.ok){
      throw new Error((data && data.error) || "Failed loading ratings data");
    }

    allPlayers = data.players || [];
    latestResults = data.results || {};
    renderAllVersions();
    renderResults();
  }finally{
    hideBusy();
  }
}

async function refreshResults(){
  showBusy("REFRESHING");

  try{
    const data = await api({ action: "getResults" });

    if(!data || !data.ok){
      throw new Error((data && data.error) || "Failed loading results");
    }

    latestResults = data.results || {};
    renderResults();
  }catch(err){
    await showModal(err.message || "Could not refresh results.", "alert");
  }finally{
    hideBusy();
  }
}

function renderAllVersions(){
  populateRaterSelects();
  renderVersion1Rows();
  renderVersion2Rows();
  renderVersion3Rows();
}

function populateRaterSelects(){
  document.querySelectorAll(".raterSelect").forEach(select => {
    const currentValue = select.value;
    select.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Select your name";
    placeholder.disabled = true;
    placeholder.selected = true;
    select.appendChild(placeholder);

    allPlayers
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(player => {
        const option = document.createElement("option");
        option.value = player.name;
        option.textContent = player.name;
        select.appendChild(option);
      });

    if(currentValue){
      select.value = currentValue;
    }
  });
}

function renderPlayerCell(player, index, selectedRater){
  const isSelf = selectedRater && player.name === selectedRater;
  return `
    <div class="playerCell">
      <span class="playerNumber">${index + 1}</span>
      <span class="playerName">${player.name}</span>
      ${isSelf ? `<span class="selfBadge">YOU</span>` : ""}
    </div>
  `;
}

function createNumericSlider(name, value = 5, disabled = false){
  return `
    <div class="sliderCell">
      <input class="valueBox" data-field="${name}" type="number" min="0" max="10" step="1" value="${value}" ${disabled ? "disabled" : ""}>
      <span class="rangeMin">0</span>
      <input class="ratingSlider numericSlider" data-field="${name}" type="range" min="0" max="10" step="1" value="${value}" ${disabled ? "disabled" : ""}>
      <span class="rangeMax">10</span>
    </div>
  `;
}

function bindNumericSliders(container){
  container.querySelectorAll(".sliderCell").forEach(cell => {
    const box = cell.querySelector(".valueBox");
    const slider = cell.querySelector(".ratingSlider");

    if(!box || !slider) return;

    slider.addEventListener("input", () => {
      box.value = slider.value;
    });

    box.addEventListener("input", () => {
      let value = parseInt(box.value, 10);
      if(Number.isNaN(value)) value = 0;
      value = Math.max(0, Math.min(10, value));
      box.value = value;
      slider.value = value;
    });
  });
}

function renderVersion1Rows(){
  const rows = document.getElementById("version1Rows");
  const selectedRater = document.getElementById("version1Rater").value;
  rows.innerHTML = "";

  allPlayers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((player, index) => {
      const isSelf = selectedRater && player.name === selectedRater;
      const row = document.createElement("div");
      row.className = "ratingRow version1Row";
      row.dataset.player = player.name;
      row.innerHTML = `
        ${renderPlayerCell(player, index, selectedRater)}
        ${createNumericSlider("overall", 5, isSelf)}
      `;
      rows.appendChild(row);
    });

  bindNumericSliders(rows);
}

function renderVersion2Rows(){
  const rows = document.getElementById("version2Rows");
  const selectedRater = document.getElementById("version2Rater").value;
  rows.innerHTML = "";

  allPlayers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((player, index) => {
      const isSelf = selectedRater && player.name === selectedRater;
      const row = document.createElement("div");
      row.className = "ratingRow version2Row";
      row.dataset.player = player.name;
      row.innerHTML = `
        ${renderPlayerCell(player, index, selectedRater)}
        ${createNumericSlider("elimination", 5, isSelf)}
        ${createNumericSlider("blitz", 5, isSelf)}
        ${createNumericSlider("ctf", 5, isSelf)}
      `;
      rows.appendChild(row);
    });

  bindNumericSliders(rows);
}

function getScaleOption(index){
  return scaleOptions[Math.max(0, Math.min(scaleOptions.length - 1, Number(index)))];
}

function createCategoryControl(category, disabled = false){
  return `
    <div class="categoryCell theme-${category.theme} untouched" data-category="${category.key}">
      <div class="categoryTop">
        <span class="categoryName">${category.label}</span>
        <span class="categoryTip" data-tip="${category.tip}">?</span>
      </div>
      <div class="categoryControl">
        <span class="categoryValue">-</span>
        <input class="ratingSlider categorySlider" data-category="${category.key}" type="range" min="0" max="4" step="1" value="2" data-rated="false" ${disabled ? "disabled" : ""}>
      </div>
      <div class="categoryScale">Not rated</div>
    </div>
  `;
}

function updateCategoryCell(cell, slider){
  const option = getScaleOption(slider.value);
  const value = cell.querySelector(".categoryValue");
  const label = cell.querySelector(".categoryScale");

  slider.dataset.rated = "true";
  slider.dataset.value = option.value;
  cell.classList.remove("untouched", "score-0", "score-1", "score-2", "score-3", "score-4");
  cell.classList.add("score-" + slider.value);
  value.textContent = option.value;
  label.textContent = option.label;
}

function renderVersion3Rows(){
  const rows = document.getElementById("version3Rows");
  const selectedRater = document.getElementById("version3Rater").value;
  rows.innerHTML = "";

  allPlayers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach((player, index) => {
      const isSelf = selectedRater && player.name === selectedRater;
      const row = document.createElement("div");
      row.className = "ratingRow version3Row";
      row.dataset.player = player.name;
      row.innerHTML = `
        ${renderPlayerCell(player, index, selectedRater)}
        <div class="categoriesGrid">
          ${version3Categories.map(category => createCategoryControl(category, isSelf)).join("")}
        </div>
      `;
      rows.appendChild(row);
    });

  rows.querySelectorAll(".categoryCell").forEach(cell => {
    const slider = cell.querySelector(".categorySlider");
    if(!slider || slider.disabled) return;
    slider.addEventListener("input", () => updateCategoryCell(cell, slider));
  });
}

document.addEventListener("change", e => {
  if(e.target.id === "version1Rater") renderVersion1Rows();
  if(e.target.id === "version2Rater") renderVersion2Rows();
  if(e.target.id === "version3Rater") renderVersion3Rows();
});

function getRaterForVersion(version){
  const select = document.getElementById(`version${version}Rater`);
  return select ? select.value : "";
}

function collectVersion1(){
  const rater = getRaterForVersion(1);
  if(!rater) return { ok: false, error: "Select your name before submitting Version 1." };

  const ratings = Array.from(document.querySelectorAll("#version1Rows .ratingRow"))
    .filter(row => row.dataset.player !== rater)
    .map(row => ({
      ratedPlayer: row.dataset.player,
      overall: Number(row.querySelector('.ratingSlider[data-field="overall"]').value)
    }));

  return { ok: true, version: 1, rater, ratings };
}

function collectVersion2(){
  const rater = getRaterForVersion(2);
  if(!rater) return { ok: false, error: "Select your name before submitting Version 2." };

  const ratings = Array.from(document.querySelectorAll("#version2Rows .ratingRow"))
    .filter(row => row.dataset.player !== rater)
    .map(row => ({
      ratedPlayer: row.dataset.player,
      elimination: Number(row.querySelector('.ratingSlider[data-field="elimination"]').value),
      blitz: Number(row.querySelector('.ratingSlider[data-field="blitz"]').value),
      ctf: Number(row.querySelector('.ratingSlider[data-field="ctf"]').value)
    }));

  return { ok: true, version: 2, rater, ratings };
}

function collectVersion3(){
  const rater = getRaterForVersion(3);
  if(!rater) return { ok: false, error: "Select your name before submitting Version 3." };

  const ratings = [];
  let missing = false;

  Array.from(document.querySelectorAll("#version3Rows .ratingRow"))
    .filter(row => row.dataset.player !== rater)
    .forEach(row => {
      const rating = { ratedPlayer: row.dataset.player };

      version3Categories.forEach(category => {
        const slider = row.querySelector(`.categorySlider[data-category="${category.key}"]`);
        if(!slider || slider.dataset.rated !== "true"){
          missing = true;
          return;
        }

        rating[category.key] = Number(slider.dataset.value);
      });

      ratings.push(rating);
    });

  if(missing){
    return { ok: false, error: "Please rate every Version 3 category before submitting." };
  }

  return { ok: true, version: 3, rater, ratings };
}

function collectVersion(version){
  if(version === 1) return collectVersion1();
  if(version === 2) return collectVersion2();
  return collectVersion3();
}

async function submitVersion(version){
  const data = collectVersion(version);

  if(!data.ok){
    await showModal(data.error, "alert");
    return;
  }

  const confirmed = await showModal(`Submit Version ${version} ratings for ${data.rater}?`, "confirm");
  if(!confirmed) return;

  showBusy("SUBMITTING");

  try{
    const res = await api({
      action: "submitVersionRatings",
      version: data.version,
      rater: data.rater,
      ratings: data.ratings
    });

    if(!res || !res.ok){
      throw new Error((res && res.error) || `Could not submit Version ${version}.`);
    }

    latestResults = res.results || latestResults;
    renderResults();
    await showModal(`Version ${version} submitted. ${res.submittedCount || data.ratings.length} players rated.`, "alert");
  }catch(err){
    await showModal(err.message || `Could not submit Version ${version}.`, "alert");
  }finally{
    hideBusy();
  }
}

function formatScore(value){
  const numberValue = Number(value);
  if(Number.isNaN(numberValue)) return "-";
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(1);
}

function getResultScore(playerName, version){
  const versionRows = latestResults && latestResults["version" + version]
    ? latestResults["version" + version]
    : [];
  const row = versionRows.find(item => item.player === playerName);
  return row ? Number(row.finalRating) : null;
}

function renderResults(){
  const container = document.getElementById("resultsRows");
  if(!container) return;

  container.innerHTML = "";

  if(!allPlayers.length){
    container.innerHTML = `<div class="emptyState">No players loaded yet.</div>`;
    return;
  }

  allPlayers
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(player => {
      const v1 = getResultScore(player.name, 1);
      const v2 = getResultScore(player.name, 2);
      const v3 = getResultScore(player.name, 3);
      const scores = [v1, v2, v3].filter(value => value !== null && !Number.isNaN(value));
      const average = scores.length
        ? scores.reduce((sum, value) => sum + value, 0) / scores.length
        : null;

      const row = document.createElement("div");
      row.className = "resultsRow";
      row.innerHTML = `
        <div class="resultsPlayer">${player.name}</div>
        <div>${formatScore(v1)}</div>
        <div>${formatScore(v2)}</div>
        <div>${formatScore(v3)}</div>
        <div class="resultsAverage">${formatScore(average)}</div>
      `;
      container.appendChild(row);
    });
}
