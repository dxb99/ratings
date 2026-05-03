const API_URL = "https://script.google.com/macros/s/AKfycbyOfQRKh_tj5sdISprAbO2GsS2dyjIE3u37woE2wjzORhWcenHi_FuKyUa20rKD0GpaZQ/exec";
const API_TIMEOUT_MS = 30000;

let allPlayers = [];
let latestResults = {};
let latestStatus = [];
let savedSubmissionState = {
  1: false,
  2: false,
  3: false
};
let ratingsLocked = false;
let currentResultsSort = {
  key: "player",
  direction: "asc"
};
let busyActive = false;

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
    label: "COMBAT SKILLS",
    tip: "Aim, weapon control, ammo use, and winning fights.",
    theme: "combat"
  },
  {
    key: "communication",
    label: "COMMUNICATION / STATUS UPDATES",
    tip: "Clear, useful updates without cluttering comms.",
    theme: "communication"
  },
  {
    key: "decision",
    label: "DECISION MAKING",
    tip: "Smart choices on when to attack, defend, rotate, or support.",
    theme: "decision"
  },
  {
    key: "awareness",
    label: "MAP AWARENESS",
    tip: "Knowledge of routes, pickups, player positions, and pressure.",
    theme: "awareness"
  },
  {
    key: "movement",
    label: "MOVEMENT / SPEED",
    tip: "Dodging, wall runs, chasing, escaping, and reaching key areas quickly.",
    theme: "movement"
  },
  {
    key: "impact",
    label: "TEAM IMPACT",
    tip: "Overall contribution to team control, momentum, and wins.",
    theme: "impact"
  }
].sort((a, b) => a.label.localeCompare(b.label));

window.addEventListener("load", async () => {
  try{
    setupTabs();
    setupButtons();
    setupStartupRetry();
    await loadInitialData();
    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("app").classList.remove("hidden");
  }catch(err){
    console.error(err);
    document.getElementById("loadingScreen").style.display = "none";
    showStartupError();
  }
});

function setupStartupRetry(){
  const retryBtn = document.getElementById("startupRetryBtn");
  if(!retryBtn) return;

  retryBtn.onclick = () => {
    window.location.reload();
  };
}

function showStartupError(){
  const errorScreen = document.getElementById("startupErrorScreen");
  if(errorScreen){
    errorScreen.style.display = "flex";
  }
}

function getSaveFailedMessage(action){
  return `${action} DID NOT COMPLETE\n\nThe server did not confirm this change. Please try again before leaving this page.`;
}

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
  busyActive = true;
  busyText.innerHTML = `${text}<span class="dots"></span>`;
  overlay.style.display = "flex";
  document.body.classList.add("busyActive");
}

function hideBusy(){
  busyActive = false;
  document.getElementById("busyOverlay").style.display = "none";
  document.body.classList.remove("busyActive");
}

function showModal(message, type = "alert", withInput = false, inputType = "password", inputPlaceholder = "Enter password"){
  return new Promise(resolve => {
    const modal = document.getElementById("customModal");
    const msg = document.getElementById("modalMessage");
    const confirmBtn = document.getElementById("modalConfirm");
    const cancelBtn = document.getElementById("modalCancel");
    const input = document.getElementById("modalInput");

    msg.textContent = message;
    cancelBtn.style.display = type === "alert" ? "none" : "inline-flex";

    if(input){
      input.style.display = withInput ? "block" : "none";
      input.type = inputType;
      input.placeholder = inputPlaceholder;
      input.value = "";
    }

    modal.style.display = "flex";

    if(withInput && input){
      setTimeout(() => input.focus(), 0);
    }

    const cleanup = value => {
      modal.style.display = "none";
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(value);
    };

    confirmBtn.onclick = () => cleanup(withInput && input ? input.value : true);
    cancelBtn.onclick = () => cleanup(null);
  });
}

function showInfoModal(html){
  return new Promise(resolve => {
    const modal = document.getElementById("customModal");
    const msg = document.getElementById("modalMessage");
    const confirmBtn = document.getElementById("modalConfirm");
    const cancelBtn = document.getElementById("modalCancel");
    const input = document.getElementById("modalInput");

    msg.innerHTML = html;
    modal.classList.add("infoModalOpen");
    cancelBtn.style.display = "none";

    if(input){
      input.style.display = "none";
      input.value = "";
    }

    modal.style.display = "flex";

    const cleanup = () => {
      modal.style.display = "none";
      modal.classList.remove("infoModalOpen");
      msg.innerHTML = "";
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      resolve(true);
    };

    confirmBtn.onclick = cleanup;
    cancelBtn.onclick = cleanup;
  });
}

const versionInfoMessages = {
  1: `
    <div class="versionInfoModal">
      <h3>V1 AVG</h3>
      <p>Version 1 uses one overall 0-10 score per player. Example: Xan rates Malcolm as 8. Other players rate Malcolm as 7, 9, 6, and 8. V1 AVG adds all submitted Version 1 scores for Malcolm: 8 + 7 + 9 + 6 + 8 = 38. Then it divides by 5 votes, so Malcolm's V1 AVG is 7.6.</p>
      <h3>V1 MED</h3>
      <p>Version 1 uses one overall 0-10 score per player. V1 MED sorts Malcolm's submitted Version 1 scores from lowest to highest and uses the middle score. Example: Xan and others give Malcolm 5, 6, 7, 8, and 10. The middle score is 7, so Malcolm's V1 MED is 7. If the middle scores are 7 and 8, the median is halfway between them: 7.5.</p>
    </div>
  `,
  2: `
    <div class="versionInfoModal">
      <h3>V2 AVG</h3>
      <p>Version 2 uses three mode scores: Elimination, Blitz, and CTF. First, each rater's three scores become one Version 2 score. Example: Xan rates Malcolm 6 in Elimination, 5 in Blitz, and 7 in CTF. That becomes (6 + 5 + 7) / 3 = 6. V2 AVG then averages Malcolm's final Version 2 scores from all voters.</p>
      <h3>V2 MED</h3>
      <p>Version 2 uses Elimination, Blitz, and CTF. First, each rater's three mode scores become one Version 2 score for Malcolm. Example: Xan's 6, 5, and 7 becomes 6. V2 MED then sorts Malcolm's final Version 2 scores from all voters. Example final scores: 5, 5, 6, 7, 8. The middle is 6, so Malcolm's V2 MED is 6.</p>
    </div>
  `,
  3: `
    <div class="versionInfoModal">
      <h3>V3 AVG</h3>
      <p>Version 3 uses six category scores: Combat, Communication, Decision, Awareness, Movement, and Impact. First, each rater's six category scores become one Version 3 score. Example: Xan gives Malcolm 10, 7.5, 7.5, 5, 10, and 7.5. That becomes 47.5 / 6 = 7.9. V3 AVG then averages Malcolm's final Version 3 scores from all voters.</p>
      <h3>V3 MED</h3>
      <p>Version 3 uses six category scores. First, each rater's six scores become one Version 3 score for Malcolm. Example: Xan's six category scores give Malcolm a final Version 3 score of 7.9. V3 MED then sorts Malcolm's final Version 3 scores from all voters. Example final scores: 5.8, 6.7, 6.7, 7.9, 8.3. The middle is 6.7, so Malcolm's V3 MED is 6.7.</p>
      <h3>V3 WEIGHTED</h3>
      <p>V3 Weighted uses the same six Version 3 categories, but some categories count more than others. Example: Xan rates Malcolm in Combat, Communication, Decision, Awareness, Movement, and Impact. Combat affects the score more than Communication because Combat has more weight.</p>
      <div class="versionInfoWeights">
        <span>COMBAT SKILLS <strong>22%</strong></span>
        <span>MOVEMENT / SPEED <strong>18%</strong></span>
        <span>MAP AWARENESS <strong>18%</strong></span>
        <span>DECISION MAKING <strong>17%</strong></span>
        <span>TEAM IMPACT <strong>15%</strong></span>
        <span>COMMUNICATION <strong>10%</strong></span>
      </div>
    </div>
  `
};

function setupTabs(){
  document.querySelectorAll("[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      if(busyActive) return;
      showTab(btn.dataset.tab);
    });
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

  if(tabId === "statusTab"){
    refreshStatus();
  }
}

function setupButtons(){
  document.getElementById("submitVersion1Btn").onclick = () => submitVersion(1);
  document.getElementById("submitVersion2Btn").onclick = () => submitVersion(2);
  document.getElementById("submitVersion3Btn").onclick = () => submitVersion(3);
  document.getElementById("resetVersion1Btn").onclick = () => resetVersion(1);
  document.getElementById("resetVersion2Btn").onclick = () => resetVersion(2);
  document.getElementById("resetVersion3Btn").onclick = () => resetVersion(3);
  document.getElementById("clearSavedVersion1Btn").onclick = () => clearSavedVersion(1);
  document.getElementById("clearSavedVersion2Btn").onclick = () => clearSavedVersion(2);
  document.getElementById("clearSavedVersion3Btn").onclick = () => clearSavedVersion(3);
  document.getElementById("refreshResultsBtn").onclick = refreshResults;
  document.getElementById("refreshStatusBtn").onclick = refreshStatus;
  document.getElementById("ratingsLockToggleBtn").onclick = toggleRatingsLock;
  document.getElementById("applyFinalRatingsBtn").onclick = applyFinalRatingsToPlayers;
  setupResultsSorting();

  const infoBtn = document.getElementById("infoBtn");
  const infoPanel = document.getElementById("infoPanel");
  const closeBtn = document.getElementById("infoCloseBtn");
  const homeInfoBtn = document.getElementById("homeInfoBtn");
  const homeInfoPanel = document.getElementById("homeInfoPanel");
  const homeInfoCloseBtn = document.getElementById("homeInfoCloseBtn");

  document.querySelectorAll("[data-version-info]").forEach(btn => {
    const openVersionInfo = e => {
      e.stopPropagation();
      e.preventDefault();

      const version = btn.dataset.versionInfo;
      showInfoModal(versionInfoMessages[version] || "<p>No information available.</p>");
    };

    btn.addEventListener("click", openVersionInfo);
    btn.addEventListener("keydown", e => {
      if(e.key === "Enter" || e.key === " "){
        openVersionInfo(e);
      }
    });
  });

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

  if(homeInfoBtn && homeInfoPanel && homeInfoCloseBtn){
    homeInfoBtn.onclick = e => {
      e.stopPropagation();
      homeInfoPanel.classList.add("show");
    };

    homeInfoCloseBtn.onclick = e => {
      e.stopPropagation();
      homeInfoPanel.classList.remove("show");
    };

    homeInfoPanel.onclick = e => {
      if(e.target === homeInfoPanel) homeInfoPanel.classList.remove("show");
    };
  }
}

function setupResultsSorting(){
  document.querySelectorAll(".resultsSortBtn").forEach(btn => {
    btn.onclick = () => {
      const key = btn.dataset.sort;

      if(currentResultsSort.key === key){
        currentResultsSort.direction =
          currentResultsSort.direction === "asc" ? "desc" : "asc";
      }else{
        currentResultsSort.key = key;
        currentResultsSort.direction = "asc";
      }

      renderResults();
    };
  });

  const mobileSelect = document.getElementById("mobileResultsSortSelect");
  const mobileDirection = document.getElementById("mobileResultsSortDirection");

  if(mobileSelect){
    mobileSelect.onchange = () => {
      currentResultsSort.key = mobileSelect.value;
      currentResultsSort.direction = "asc";
      renderResults();
    };
  }

  if(mobileDirection){
    mobileDirection.onclick = () => {
      currentResultsSort.direction =
        currentResultsSort.direction === "asc" ? "desc" : "asc";
      renderResults();
    };
  }
}

async function loadInitialData(){
  const data = await api({ action: "getInitialData" });

  if(!data || !data.ok){
    throw new Error((data && data.error) || "Failed loading ratings data");
  }

  allPlayers = data.players || [];
  latestResults = data.results || {};
  latestStatus = data.status || [];
  ratingsLocked = !!data.ratingsLocked;
  renderAllVersions();
  renderResults();
  renderStatus();
  updateSubmitButtons();
  updateRatingsLockUi();
}

function setAllRaterSelects(rater){
  document.querySelectorAll(".raterSelect").forEach(select => {
    if(select.value !== rater){
      select.value = rater;
    }
  });
}

function updateSubmitButtons(){
  [1, 2, 3].forEach(version => {
    const btn = document.getElementById(`submitVersion${version}Btn`);
    const clearSavedBtn = document.getElementById(`clearSavedVersion${version}Btn`);
    if(!btn || !clearSavedBtn) return;

    btn.textContent = savedSubmissionState[version]
      ? `UPDATE VERSION ${version}`
      : `SUBMIT VERSION ${version}`;

    btn.disabled = ratingsLocked;
    clearSavedBtn.disabled = ratingsLocked;
    clearSavedBtn.style.display = savedSubmissionState[version] ? "inline-flex" : "none";
  });
}

function updateRatingsLockUi(){
  const lockBtn = document.getElementById("ratingsLockToggleBtn");

  if(lockBtn){
    lockBtn.textContent = ratingsLocked ? "UNLOCK RATINGS" : "LOCK RATINGS";
    lockBtn.classList.toggle("ratingsLocked", ratingsLocked);
  }

  updateSubmitButtons();
}

async function refreshResults(){
  if(busyActive) return;

  showBusy("REFRESHING");

  try{
    const data = await api({ action: "getResults" });

    if(!data || !data.ok){
      throw new Error((data && data.error) || "Failed loading results");
    }

    latestResults = data.results || {};
    if(typeof data.ratingsLocked !== "undefined"){
      ratingsLocked = !!data.ratingsLocked;
      updateRatingsLockUi();
    }
    renderResults();
  }catch(err){
    await showModal(err.message || "Could not refresh results.", "alert");
  }finally{
    hideBusy();
  }
}

async function refreshStatus(){
  if(busyActive) return;

  showBusy("REFRESHING STATUS");

  try{
    const data = await api({ action: "getStatus" });

    if(!data || !data.ok){
      throw new Error((data && data.error) || "Failed loading status");
    }

    latestStatus = data.status || [];
    if(typeof data.ratingsLocked !== "undefined"){
      ratingsLocked = !!data.ratingsLocked;
      updateRatingsLockUi();
    }
    renderStatus();
  }catch(err){
    await showModal(err.message || "Could not refresh status.", "alert");
  }finally{
    hideBusy();
  }
}

async function requestAdminPassword(message){
  const password = await showModal(
    message,
    "confirm",
    true,
    "password",
    "Admin password"
  );

  return password || null;
}

async function toggleRatingsLock(){
  if(busyActive) return;

  const nextLocked = !ratingsLocked;
  const actionLabel = nextLocked ? "lock" : "unlock";
  const confirmed = await showModal(
    `${nextLocked ? "Lock" : "Unlock"} ratings?`,
    "confirm"
  );

  if(!confirmed) return;

  const password = await requestAdminPassword(`Enter admin password to ${actionLabel} ratings.`);
  if(!password) return;

  showBusy(nextLocked ? "LOCKING" : "UNLOCKING");

  try{
    const res = await api({
      action: "setRatingsLock",
      locked: nextLocked,
      password: password
    });

    if(!res || !res.ok){
      throw new Error((res && res.error) || "Could not update ratings lock");
    }

    ratingsLocked = !!res.ratingsLocked;
    updateRatingsLockUi();

    await showModal(ratingsLocked ? "Ratings are now locked." : "Ratings are now unlocked.", "alert");
  }catch(err){
    await showModal(err.message || "Could not update ratings lock.", "alert");
  }finally{
    hideBusy();
  }
}

function formatStatusBadge(hasVoted){
  return `<span class="statusBadge ${hasVoted ? "yes" : "no"}">${hasVoted ? "YES" : "NO"}</span>`;
}

function renderStatus(){
  const container = document.getElementById("statusRows");
  if(!container) return;

  container.innerHTML = "";

  const rows = Array.isArray(latestStatus) ? latestStatus : [];

  if(!rows.length){
    container.innerHTML = `<div class="emptyState">No player status loaded yet.</div>`;
    return;
  }

  rows
    .slice()
    .sort((a, b) => a.player.localeCompare(b.player))
    .forEach(status => {
      const row = document.createElement("div");
      row.className = "statusRow";
      row.innerHTML = `
        <div class="statusPlayer" data-label="Player">${status.player}</div>
        <div data-label="Voted">${status.votedVersions || "None"}</div>
        <div data-label="V1">${formatStatusBadge(!!status.v1Voted)}</div>
        <div data-label="V1 Updates">${status.v1Updates || 0}</div>
        <div data-label="V1 Clears">${status.v1Clears || 0}</div>
        <div data-label="V2">${formatStatusBadge(!!status.v2Voted)}</div>
        <div data-label="V2 Updates">${status.v2Updates || 0}</div>
        <div data-label="V2 Clears">${status.v2Clears || 0}</div>
        <div data-label="V3">${formatStatusBadge(!!status.v3Voted)}</div>
        <div data-label="V3 Updates">${status.v3Updates || 0}</div>
        <div data-label="V3 Clears">${status.v3Clears || 0}</div>
      `;
      container.appendChild(row);
    });
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

function getNumericSliderLabel(name){
  const labels = {
    overall: "Overall Rating",
    elimination: "Elimination",
    blitz: "Blitz",
    ctf: "CTF"
  };

  return labels[name] || name;
}

function createNumericSlider(name, value = 5, disabled = false, isRated = false){
  return `
    <div class="sliderCell ${isRated ? "numericRated" : "numericUntouched"}" data-slider-label="${getNumericSliderLabel(name)}">
      <input class="valueBox" data-field="${name}" type="number" min="0" max="10" step="1" value="${isRated ? value : ""}" placeholder="-" ${disabled ? "disabled" : ""}>
      <span class="rangeMin">0</span>
      <input class="ratingSlider numericSlider" data-field="${name}" type="range" min="0" max="10" step="1" value="${value}" data-rated="${isRated ? "true" : "false"}" ${disabled ? "disabled" : ""}>
      <span class="rangeMax">10</span>
    </div>
  `;
}

function markNumericRated(cell, value){
  if(!cell) return;

  if(value === "" || value === null || typeof value === "undefined"){
    return;
  }

  const box = cell.querySelector(".valueBox");
  const slider = cell.querySelector(".ratingSlider");

  if(!box || !slider) return;

  const cleaned = Math.max(0, Math.min(10, Number(value)));

  if(Number.isNaN(cleaned)) return;

  box.value = cleaned;
  slider.value = cleaned;
  slider.dataset.rated = "true";
  cell.classList.remove("numericUntouched", "score-0", "score-1", "score-2", "score-3", "score-4");
  cell.classList.add("numericRated", getNumericScoreClass(cleaned));
}

function getNumericScoreClass(value){
  const numeric = Number(value);

  if(numeric <= 1) return "score-0";
  if(numeric <= 3) return "score-1";
  if(numeric <= 6) return "score-2";
  if(numeric <= 8) return "score-3";
  return "score-4";
}

function bindNumericSliders(container){
  container.querySelectorAll(".sliderCell").forEach(cell => {
    const box = cell.querySelector(".valueBox");
    const slider = cell.querySelector(".ratingSlider");

    if(!box || !slider) return;

    slider.addEventListener("input", () => {
      markNumericRated(cell, slider.value);
    });

    box.addEventListener("input", () => {
      let value = parseInt(box.value, 10);
      if(Number.isNaN(value)){
        box.value = "";
        slider.dataset.rated = "false";
        cell.classList.remove("numericRated", "score-0", "score-1", "score-2", "score-3", "score-4");
        cell.classList.add("numericUntouched");
        return;
      }

      value = Math.max(0, Math.min(10, value));
      markNumericRated(cell, value);
    });
  });
}

async function resetVersion(version){
  if(busyActive) return;

  const confirmed = await showModal(
    `Clear the Version ${version} form on this screen? Saved ratings in the sheet will not be deleted.`,
    "confirm"
  );

  if(!confirmed) return;

  rerenderVersion(version);
}

async function clearSavedVersion(version){
  if(busyActive) return;

  if(ratingsLocked){
    await showModal("Ratings are locked. Ask an admin to unlock ratings first.", "alert");
    return;
  }

  const rater = getRaterForVersion(version);

  if(!rater){
    await showModal(`Select your name before clearing saved Version ${version} ratings.`, "alert");
    return;
  }

  const confirmed = await showModal(
    `Clear saved Version ${version} ratings for ${rater}? This will remove that version from the Results comparison until it is submitted again.`,
    "confirm"
  );

  if(!confirmed) return;

  showBusy("CLEARING SAVED RATINGS");

  try{
    const res = await api({
      action: "clearVersionSubmission",
      version: version,
      rater: rater
    });

    if(!res || !res.ok){
      throw new Error((res && res.error) || `Could not clear saved Version ${version}.`);
    }

    savedSubmissionState[version] = false;
    latestResults = res.results || latestResults;
    latestStatus = res.status || latestStatus;
    rerenderVersion(version);
    updateSubmitButtons();
    renderResults();
    renderStatus();

    await showModal(`SAVED DATA CLEARED\n\nVersion ${version} saved ratings were removed for ${rater}. You can rate and submit this version again now.`, "alert");
  }catch(err){
    await showModal(err.message || getSaveFailedMessage("CLEAR SAVED RATINGS"), "alert");
  }finally{
    hideBusy();
  }
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
  if(e.target.classList.contains("raterSelect")){
    handleRaterChange(e.target.value);
  }
});

function rerenderVersion(version){
  if(version === 1) renderVersion1Rows();
  if(version === 2) renderVersion2Rows();
  if(version === 3) renderVersion3Rows();
}

async function handleRaterChange(rater){
  if(busyActive) return;

  if(!rater) return;

  setAllRaterSelects(rater);
  savedSubmissionState = { 1: false, 2: false, 3: false };
  renderAllVersions();
  updateSubmitButtons();

  showBusy("LOADING SAVED RATINGS");

  try{
    const responses = await Promise.all([1, 2, 3].map(version => {
      return api({
        action: "getRaterSubmission",
        version: version,
        rater: rater
      });
    }));

    responses.forEach(res => {
      if(res && res.ok && Array.isArray(res.ratings) && res.ratings.length){
        savedSubmissionState[res.version] = true;
        applySavedSubmission(res.version, res.ratings);
      }
    });

    updateSubmitButtons();
  }catch(err){
    console.warn("Saved rating load failed", err);
  }finally{
    hideBusy();
  }
}

function applySavedSubmission(version, ratings){
  const byPlayer = {};

  ratings.forEach(rating => {
    if(rating && rating.ratedPlayer){
      byPlayer[rating.ratedPlayer] = rating;
    }
  });

  const rows = document.querySelectorAll(`#version${version}Rows .ratingRow`);

  rows.forEach(row => {
    const rating = byPlayer[row.dataset.player];
    if(!rating) return;

    if(version === 1){
      const cell = row.querySelector('.sliderCell');
      markNumericRated(cell, rating.overall);
    }

    if(version === 2){
      ["elimination", "blitz", "ctf"].forEach(field => {
        const slider = row.querySelector(`.ratingSlider[data-field="${field}"]`);
        const cell = slider ? slider.closest(".sliderCell") : null;
        markNumericRated(cell, rating[field]);
      });
    }

    if(version === 3){
      version3Categories.forEach(category => {
        const slider = row.querySelector(`.categorySlider[data-category="${category.key}"]`);
        const cell = slider ? slider.closest(".categoryCell") : null;
        const value = Number(rating[category.key]);
        const optionIndex = scaleOptions.findIndex(option => Number(option.value) === value);

        if(slider && cell && optionIndex !== -1){
          slider.value = optionIndex;
          updateCategoryCell(cell, slider);
        }
      });
    }
  });
}

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
      overall: row.querySelector('.ratingSlider[data-field="overall"]').dataset.rated === "true"
        ? Number(row.querySelector('.ratingSlider[data-field="overall"]').value)
        : null
    }));

  if(ratings.some(rating => rating.overall === null)){
    return { ok: false, error: "Please rate every Version 1 player before submitting." };
  }

  return { ok: true, version: 1, rater, ratings };
}

function collectVersion2(){
  const rater = getRaterForVersion(2);
  if(!rater) return { ok: false, error: "Select your name before submitting Version 2." };

  const ratings = Array.from(document.querySelectorAll("#version2Rows .ratingRow"))
    .filter(row => row.dataset.player !== rater)
    .map(row => ({
      ratedPlayer: row.dataset.player,
      elimination: row.querySelector('.ratingSlider[data-field="elimination"]').dataset.rated === "true"
        ? Number(row.querySelector('.ratingSlider[data-field="elimination"]').value)
        : null,
      blitz: row.querySelector('.ratingSlider[data-field="blitz"]').dataset.rated === "true"
        ? Number(row.querySelector('.ratingSlider[data-field="blitz"]').value)
        : null,
      ctf: row.querySelector('.ratingSlider[data-field="ctf"]').dataset.rated === "true"
        ? Number(row.querySelector('.ratingSlider[data-field="ctf"]').value)
        : null
    }));

  if(ratings.some(rating => rating.elimination === null || rating.blitz === null || rating.ctf === null)){
    return { ok: false, error: "Please rate every Version 2 mode before submitting." };
  }

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
  if(busyActive) return;

  if(ratingsLocked){
    await showModal("Ratings are locked. Ask an admin to unlock ratings first.", "alert");
    return;
  }

  const data = collectVersion(version);

  if(!data.ok){
    await showModal(data.error, "alert");
    return;
  }

  const actionLabel = savedSubmissionState[version] ? "Update" : "Submit";
  const confirmed = await showModal(`${actionLabel} Version ${version} ratings for ${data.rater}?`, "confirm");
  if(!confirmed) return;

  showBusy(savedSubmissionState[version] ? "UPDATING" : "SUBMITTING");

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

    const doneLabel = savedSubmissionState[version] ? "updated" : "submitted";
    latestResults = res.results || latestResults;
    latestStatus = res.status || latestStatus;
    savedSubmissionState[version] = true;
    updateSubmitButtons();
    renderResults();
    renderStatus();
    await showModal(`SAVED SUCCESSFULLY\n\nVersion ${version} ratings were ${doneLabel} for ${data.rater}. ${res.submittedCount || data.ratings.length} players rated.`, "alert");
  }catch(err){
    await showModal(err.message || getSaveFailedMessage(`VERSION ${version} SAVE`), "alert");
  }finally{
    hideBusy();
  }
}

function formatScore(value){
  if(value === "" || value === null || typeof value === "undefined"){
    return "-";
  }

  const numberValue = Number(value);

  if(Number.isNaN(numberValue)) return "-";

  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(1);
}

function averageScores(values){
  const cleaned = values
    .map(value => {
      if(value === "" || value === null || typeof value === "undefined") return null;
      const numberValue = Number(value);
      return Number.isNaN(numberValue) ? null : numberValue;
    })
    .filter(value => value !== null);

  if(!cleaned.length) return null;

  return cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length;
}

function medianScore(values){
  const cleaned = values
    .map(value => {
      if(value === "" || value === null || typeof value === "undefined") return null;
      const numberValue = Number(value);
      return Number.isNaN(numberValue) ? null : numberValue;
    })
    .filter(value => value !== null)
    .slice()
    .sort((a, b) => a - b);

  if(!cleaned.length) return null;

  const middle = Math.floor(cleaned.length / 2);

  if(cleaned.length % 2){
    return cleaned[middle];
  }

  return (cleaned[middle - 1] + cleaned[middle]) / 2;
}

function getResultItem(playerName, version){
  const versionRows = latestResults && latestResults["version" + version]
    ? latestResults["version" + version]
    : [];

  return versionRows.find(item => item.player === playerName) || null;
}

function getResultNumber(item, key){
  if(!item) return null;

  if(item[key] === "" || item[key] === null || typeof item[key] === "undefined"){
    return null;
  }

  const value = Number(item[key]);

  return Number.isNaN(value) ? null : value;
}

function getResultAverage(item){
  return getResultNumber(item, "averageRating") ?? getResultNumber(item, "finalRating");
}

function getResultMedian(item){
  return getResultNumber(item, "medianRating");
}

function getFinalRatingMethodLabel(method){
  const labels = {
    v1Avg: "Version 1 Average",
    v1Med: "Version 1 Median",
    v2Avg: "Version 2 Average",
    v2Med: "Version 2 Median",
    v3Avg: "Version 3 Average",
    v3Med: "Version 3 Median",
    weighted: "Version 3 Weighted"
  };

  return labels[method] || method;
}

async function applyFinalRatingsToPlayers(){
  if(busyActive) return;

  const select = document.getElementById("finalRatingMethodSelect");
  const method = select ? select.value : "";
  const label = getFinalRatingMethodLabel(method);

  if(!method){
    await showModal("Select a rating method before applying ratings.", "alert");
    return;
  }

  const confirmed = await showModal(
    `Apply ${label} to the Players sheet? A backup will be created first.`,
    "confirm"
  );

  if(!confirmed) return;

  const password = await requestAdminPassword("Enter admin password to apply ratings.");

  if(!password) return;

  showBusy("APPLYING");

  try{
    const res = await api({
      action: "applyFinalRatingsToPlayers",
      method: method,
      password: password
    });

    if(!res || !res.ok){
      throw new Error((res && res.error) || "Could not apply ratings");
    }

    allPlayers = res.players || allPlayers;
    latestResults = res.results || latestResults;
    latestStatus = res.status || latestStatus;

    renderAllVersions();
    renderResults();
    renderStatus();

    await showModal(
      `PLAYERS UPDATED SUCCESSFULLY\n\nPlayers sheet was updated using ${res.methodLabel || label}. Backup created: ${res.backupSheet}.`,
      "alert"
    );
  }catch(err){
    await showModal(err.message || getSaveFailedMessage("APPLY TO PLAYERS"), "alert");
  }finally{
    hideBusy();
  }
}

function updateResultsSortHeaders(){
  document.querySelectorAll(".resultsSortBtn").forEach(btn => {
    const isActive = btn.dataset.sort === currentResultsSort.key;
    btn.classList.toggle("active", isActive);
    btn.setAttribute(
      "data-sort-label",
      currentResultsSort.direction === "asc" ? "\u25B2" : "\u25BC"
    );
  });

  const mobileSelect = document.getElementById("mobileResultsSortSelect");
  const mobileDirection = document.getElementById("mobileResultsSortDirection");

  if(mobileSelect){
    mobileSelect.value = currentResultsSort.key;
  }

  if(mobileDirection){
    mobileDirection.textContent = currentResultsSort.direction === "asc" ? "\u25B2" : "\u25BC";
  }
}

function buildResultRows(){
  return allPlayers
    .slice()
    .map(player => {
      const v1 = getResultItem(player.name, 1);
      const v2 = getResultItem(player.name, 2);
      const v3 = getResultItem(player.name, 3);
      const versionAverages = [
        getResultAverage(v1),
        getResultAverage(v2),
        getResultAverage(v3)
      ];
      const versionMedians = [
        getResultMedian(v1),
        getResultMedian(v2),
        getResultMedian(v3)
      ];

      return {
        player: player.name,
        v1Avg: versionAverages[0],
        v1Med: versionMedians[0],
        v2Avg: versionAverages[1],
        v2Med: versionMedians[1],
        v3Avg: versionAverages[2],
        v3Med: versionMedians[2],
        weighted: getResultNumber(v3, "weightedScore")
      };
    });
}

function compareResultRows(a, b){
  const key = currentResultsSort.key;
  const direction = currentResultsSort.direction === "asc" ? 1 : -1;

  if(key === "player"){
    return a.player.localeCompare(b.player) * direction;
  }

  const aValue = a[key];
  const bValue = b[key];
  const aMissing = aValue === null || Number.isNaN(aValue);
  const bMissing = bValue === null || Number.isNaN(bValue);

  if(aMissing && bMissing){
    return a.player.localeCompare(b.player);
  }

  if(aMissing) return 1;
  if(bMissing) return -1;

  if(aValue < bValue) return -1 * direction;
  if(aValue > bValue) return 1 * direction;
  return a.player.localeCompare(b.player);
}

function renderResults(){
  const container = document.getElementById("resultsRows");
  if(!container) return;

  container.innerHTML = "";

  if(!allPlayers.length){
    container.innerHTML = `<div class="emptyState">No players loaded yet.</div>`;
    updateResultsSortHeaders();
    return;
  }

  updateResultsSortHeaders();

  buildResultRows()
    .sort(compareResultRows)
    .forEach(player => {
      const row = document.createElement("div");
      row.className = "resultsRow";
      row.innerHTML = `
        <div class="resultsPlayer" data-label="Player">${player.player}</div>
        <div data-label="V1 Average">${formatScore(player.v1Avg)}</div>
        <div data-label="V1 Median">${formatScore(player.v1Med)}</div>
        <div data-label="V2 Average">${formatScore(player.v2Avg)}</div>
        <div data-label="V2 Median">${formatScore(player.v2Med)}</div>
        <div data-label="V3 Average">${formatScore(player.v3Avg)}</div>
        <div data-label="V3 Median">${formatScore(player.v3Med)}</div>
        <div data-label="V3 Weighted">${formatScore(player.weighted)}</div>
      `;
      container.appendChild(row);
    });
}
