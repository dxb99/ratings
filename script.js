const API_URL = "https://script.google.com/macros/s/AKfycbwhOi84b1_5S95OM2fANahXJi_8e4ARzikvKvFv9aU6Z0d-AM1w50MzplebCP0fr2utAg/exec";
const APP_TIME_ZONE = "Asia/Dubai";
const APP_TIME_ZONE_LABEL = "GST";
const API_TIMEOUT_MS = 30000;

let allPlayers = [];
let currentRatingStatus = null;

const RATING_SCALE_OPTIONS = [
  { label: "Low", value: 0 },
  { label: "Fair", value: 2.5 },
  { label: "Average", value: 5 },
  { label: "Good", value: 7.5 },
  { label: "Excellent", value: 10 }
];

const RATING_CATEGORIES = [
  {
    key: "combat",
    label: "Combat Skills",
    tip: "Aim, weapon control, ammo use, and winning fights.",
    theme: "green"
  },
  {
    key: "comms",
    label: "Communication / Status Updates",
    tip: "Clear, useful updates without cluttering comms.",
    theme: "purple"
  },
  {
    key: "objective",
    label: "Decision Making",
    tip: "Smart choices on when to attack, defend, rotate, or support.",
    theme: "gold"
  },
  {
    key: "awareness",
    label: "Map Awareness",
    tip: "Knowledge of routes, pickups, player positions, and pressure.",
    theme: "blue"
  },
  {
    key: "movement",
    label: "Movement / Speed",
    tip: "Dodging, wall runs, chasing, escaping, and reaching key areas quickly.",
    theme: "green"
  },
  {
    key: "impact",
    label: "Team Impact",
    tip: "Overall contribution to team control, momentum, and wins.",
    theme: "purple"
  }
];

window.addEventListener("load", async () => {
  sessionStorage.removeItem("adminPass");

  try{
    setupRatingsTab();
    await loadPlayers();
    await refreshRatingStatus();
    updateAdminBar();

    document.getElementById("adminLockBtn").onclick = clearAdminSession;
    document.getElementById("loadingScreen").style.display = "none";
    document.getElementById("app").classList.remove("hidden");
  }catch(err){
    console.error(err);
    await showModal("Startup error. Open console (F12).", "alert");
  }
});

async function api(data){
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try{
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify(data),
      signal: controller.signal
    });

    return await res.json();
  }finally{
    clearTimeout(timeout);
  }
}

function escapeModalText(value){
  return value
    .toString()
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setModalMessage(element, message){
  const text = (message || "").toString();

  if(text.startsWith("⚠")){
    element.innerHTML = `<span class="modalWarningIcon">⚠</span>${escapeModalText(text.slice(1).trim())}`;
    return;
  }

  element.textContent = text;
}

function showModal(message, type = "alert", confirmText = "Confirm", cancelText = "Cancel", withInput = false, inputType = "password", inputPlaceholder = "Enter password"){
  return new Promise(resolve => {
    const modal = document.getElementById("customModal");
    const msg = document.getElementById("modalMessage");
    const confirmBtn = document.getElementById("modalConfirm");
    const cancelBtn = document.getElementById("modalCancel");
    const input = document.getElementById("modalInput");

    setModalMessage(msg, message);
    confirmBtn.innerHTML = confirmText === "Confirm" ? "✓" : confirmText;
    cancelBtn.innerHTML = cancelText === "Cancel" ? "x" : cancelText;

    input.style.display = withInput ? "block" : "none";
    input.type = inputType;
    input.placeholder = inputPlaceholder;
    input.value = "";

    modal.style.display = "flex";
    cancelBtn.style.display = type === "alert" ? "none" : "inline-flex";

    const cleanup = () => {
      modal.style.display = "none";
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
    };

    confirmBtn.onclick = () => {
      const value = withInput ? input.value : true;
      cleanup();
      resolve(value);
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
  });
}

function showBusy(text = "LOADING"){
  const overlay = document.getElementById("busyOverlay");
  const label = document.getElementById("busyText");

  if(label) label.innerHTML = `${text}<span class="dots"></span>`;
  if(overlay) overlay.style.display = "flex";
}

function hideBusy(){
  const overlay = document.getElementById("busyOverlay");
  if(overlay) overlay.style.display = "none";
}

async function getAdminPassword(){
  const stored = sessionStorage.getItem("adminPass");
  if(stored) return stored;

  while(true){
    const pass = await showModal("Enter Admin Password", "confirm", "Confirm", "Cancel", true);
    if(!pass) return null;

    const test = await api({
      action: "verifyAdminPassword",
      password: pass
    });

    if(test && test.ok){
      sessionStorage.setItem("adminPass", pass);
      updateAdminBar();
      return pass;
    }

    await showModal("Wrong password. Try again.", "alert");
  }
}

function clearAdminSession(){
  sessionStorage.removeItem("adminPass");
  updateAdminBar();
}

function isAdminUnlocked(){
  return !!sessionStorage.getItem("adminPass");
}

function updateAdminBar(){
  const status = document.getElementById("adminStatus");
  const lockBtn = document.getElementById("adminLockBtn");
  const pass = sessionStorage.getItem("adminPass");

  if(!status || !lockBtn) return;

  if(pass){
    status.textContent = "ADMIN MODE ACTIVE";
    lockBtn.style.display = "inline-flex";
    document.body.classList.remove("admin-locked");
    document.body.classList.add("admin-unlocked");
  }else{
    status.textContent = "LOCKED";
    lockBtn.style.display = "none";
    document.body.classList.remove("admin-unlocked");
    document.body.classList.add("admin-locked");
  }

  status.onclick = async () => {
    if(isAdminUnlocked()) return;
    await getAdminPassword();
  };
}

async function loadPlayers(){
  const data = await api({ action: "getInitialData" });

  if(!data || !data.ok){
    throw new Error("Failed loading players");
  }

  allPlayers = data.players || [];
  renderRatingsPreview();
}

function setupRatingsTab(){
  document.getElementById("submitRatingsBtn").onclick = submitRatings;
  document.getElementById("requestRatingCodeBtn").onclick = requestRatingCode;
  document.getElementById("setupRatingSheetsBtn").onclick = setupRatingSheets;
  document.getElementById("manualVotingToggleBtn").onclick = toggleManualVotingWindow;
  document.getElementById("applyRatingsBtn").onclick = applyRatingsToPlayers;
  document.getElementById("ratingsAddPlayerBtn").onclick = addRatingsPlayer;
  document.getElementById("ratingsRemovePlayerBtn").onclick = removeRatingsPlayer;

  const infoBtn = document.getElementById("ratingsInfoBtn");
  const infoTooltip = document.getElementById("ratingsInfoTooltip");
  const infoCloseBtn = document.getElementById("ratingsInfoCloseBtn");
  const raterSelect = document.getElementById("ratingsRaterSelect");

  infoBtn.onclick = e => {
    e.stopPropagation();
    infoTooltip.classList.toggle("show");
  };

  infoTooltip.onclick = e => {
    if(e.target === infoTooltip) infoTooltip.classList.remove("show");
  };

  infoCloseBtn.onclick = e => {
    e.stopPropagation();
    infoTooltip.classList.remove("show");
  };

  raterSelect.onchange = async () => {
    renderRatingsPreview();
    await refreshRatingStatus(raterSelect.value);
  };
}

function formatRatingDate(dateValue){
  if(!dateValue) return "";

  const date = new Date(dateValue);
  if(Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    month: "numeric",
    day: "numeric",
    year: "numeric"
  }).format(date);
}

function formatRatingDateTime(dateValue, label = APP_TIME_ZONE_LABEL){
  const dateText = formatRatingDate(dateValue);
  return dateText ? `${dateText} ${label}` : "";
}

function formatBackendRatingStatus(status){
  if(!status || !status.ok){
    return {
      isOpen: false,
      title: "Voting status unavailable",
      detail: "Refresh and try again."
    };
  }

  const zoneLabel = status.timeZoneLabel || APP_TIME_ZONE_LABEL;
  const openDate = formatRatingDateTime(status.opensAt, zoneLabel);
  const closeDate = formatRatingDateTime(status.closesAt, zoneLabel);
  const applyDate = formatRatingDateTime(status.appliesAt, zoneLabel);

  if(status.manualOverride){
    return {
      isOpen: true,
      title: "Manual voting is open",
      detail: "Admin override is active until manually locked."
    };
  }

  if(status.hasVoted){
    return {
      isOpen: status.isOpen,
      title: "You already voted this cycle",
      detail: applyDate ? `New ratings apply ${applyDate}.` : "Your vote has been recorded."
    };
  }

  if(status.isOpen){
    return {
      isOpen: true,
      title: "Voting is open",
      detail: `Closes ${closeDate}. New ratings apply ${applyDate}.`
    };
  }

  const days = Number(status.daysUntilOpen || 0);

  return {
    isOpen: false,
    title: `Voting opens in ${days} ${days === 1 ? "day" : "days"}`,
    detail: `${status.name || "Next voting"}: ${openDate} - ${closeDate}`
  };
}

function formatRatingNumber(value){
  if(value === "" || value === null || typeof value === "undefined") return "-";

  const numeric = Number(value);
  if(Number.isNaN(numeric)) return "-";

  return Number.isInteger(numeric) ? String(numeric) : numeric.toFixed(1);
}

function updateManualVotingButton(){
  const btn = document.getElementById("manualVotingToggleBtn");
  if(!btn) return;

  const manualOpen = currentRatingStatus && currentRatingStatus.manualOverride;

  btn.textContent = manualOpen ? "LOCK VOTING" : "UNLOCK VOTING";
  btn.classList.toggle("btn-orange", !!manualOpen);
  btn.classList.toggle("btn-blue", !manualOpen);
}

function updateRatingsSubmitButton(isSubmitted = false){
  const submitBtn = document.getElementById("submitRatingsBtn");
  if(!submitBtn) return;

  submitBtn.classList.toggle("ratingsSubmitBtnSubmitted", isSubmitted);
  submitBtn.disabled = isSubmitted;
  submitBtn.innerHTML = isSubmitted
    ? `<span class="ratingsSubmitIcon">✓</span><span>RATINGS SUBMITTED</span>`
    : `<span class="ratingsSubmitIcon">✓</span><span>SUBMIT RATINGS</span>`;
}

async function refreshRatingStatus(rater = ""){
  try{
    const res = await api({
      action: "getRatingStatus",
      rater: rater
    });

    currentRatingStatus = res && res.ok ? res : null;
  }catch(err){
    currentRatingStatus = null;
  }

  renderRatingsPreview();
  updateManualVotingButton();
}

function getRatingsCodeFormValues(){
  return {
    rater: document.getElementById("ratingsRaterSelect").value,
    email: document.getElementById("ratingsEmailInput").value.trim(),
    code: document.getElementById("ratingsCodeInput").value.trim()
  };
}

async function requestRatingCode(){
  const values = getRatingsCodeFormValues();
  const statusEl = document.getElementById("ratingsCodeStatus");

  if(!values.rater){
    showModal("Select your name before requesting a code.", "alert");
    return;
  }

  if(!values.email){
    showModal("Enter your email address before requesting a code.", "alert");
    return;
  }

  showBusy("REQUESTING CODE");

  try{
    const res = await api({
      action: "requestRatingCode",
      rater: values.rater,
      email: values.email
    });

    if(!res || !res.ok){
      showModal((res && res.error) || "Could not request voting code.", "alert");
      return;
    }

    statusEl.textContent = `Code sent to ${values.email}. It expires in 1 hour.`;
    showModal("Voting code sent. Check your email.", "alert");
  }catch(err){
    showModal("Could not request voting code.", "alert");
  }finally{
    hideBusy();
  }
}

async function setupRatingSheets(){
  const pass = await requireAdmin();
  if(!pass) return;

  showBusy("SETTING UP");

  try{
    const res = await api({
      action: "setupRatingSheets",
      password: pass
    });

    if(!res || !res.ok){
      showModal((res && res.error) || "Could not setup rating sheets.", "alert");
      return;
    }

    showModal("Rating sheets are ready.", "alert");
  }finally{
    hideBusy();
  }
}

async function requireAdmin(){
  if(!isAdminUnlocked()){
    const pass = await getAdminPassword();
    return pass;
  }

  return getAdminPassword();
}

async function toggleManualVotingWindow(){
  const pass = await requireAdmin();
  if(!pass) return;

  const manualOpen = currentRatingStatus && currentRatingStatus.manualOverride;
  const enabled = !manualOpen;
  const confirmed = await showModal(
    enabled ? "Unlock voting until an admin manually locks it?" : "Lock manual voting now?",
    "confirm"
  );

  if(!confirmed) return;

  showBusy("UPDATING VOTING");

  try{
    const res = await api({
      action: "setManualVotingWindow",
      password: pass,
      enabled: enabled
    });

    if(!res || !res.ok){
      showModal((res && res.error) || "Could not update manual voting.", "alert");
      return;
    }

    await refreshRatingStatus(document.getElementById("ratingsRaterSelect").value || "");
    showModal(enabled ? "Voting unlocked until manually locked." : "Manual voting locked.", "alert");
  }finally{
    hideBusy();
  }
}

async function applyRatingsToPlayers(){
  const confirmed = await showModal(
    "Apply latest rating skills to the Players sheet? A backup will be created first.",
    "confirm"
  );

  if(!confirmed) return;

  const pass = await requireAdmin();
  if(!pass) return;

  showBusy("APPLYING");

  try{
    const res = await api({
      action: "applyLatestRatingsToPlayers",
      password: pass
    });

    if(!res || !res.ok){
      showModal((res && res.error) || "Could not apply ratings.", "alert");
      return;
    }

    allPlayers = res.players || allPlayers;
    renderRatingsPreview();

    showModal(`Ratings applied. ${res.updatedCount || 0} players updated. Backup: ${res.backupSheet || "created"}.`, "alert");
  }finally{
    hideBusy();
  }
}

async function addRatingsPlayer(){
  const pass = await requireAdmin();
  if(!pass) return;

  const name = await showModal("Enter player name", "confirm", "Confirm", "Cancel", true, "text", "Player name");
  if(!name) return;

  const skillValue = await showModal("Enter starting skill number", "confirm", "Confirm", "Cancel", true, "number", "0-10");
  if(skillValue === null) return;

  const skill = parseFloat(skillValue);

  if(Number.isNaN(skill)){
    showModal("Skill must be a number.", "alert");
    return;
  }

  showBusy("ADDING PLAYER");

  try{
    const res = await api({
      action: "addRatingPlayer",
      password: pass,
      name: name,
      skill: skill
    });

    if(!res || !res.ok){
      showModal((res && res.error) || "Could not add player.", "alert");
      return;
    }

    allPlayers = res.players || allPlayers;
    renderRatingsPreview();
    showModal("Player added to ratings.", "alert");
  }finally{
    hideBusy();
  }
}

async function removeRatingsPlayer(){
  const pass = await requireAdmin();
  if(!pass) return;

  const name = await showModal("Enter player name to remove from active ratings", "confirm", "Confirm", "Cancel", true, "text", "Player name");
  if(!name) return;

  showBusy("REMOVING PLAYER");

  try{
    const res = await api({
      action: "deactivateRatingPlayer",
      password: pass,
      name: name
    });

    if(!res || !res.ok){
      showModal((res && res.error) || "Could not remove player.", "alert");
      return;
    }

    allPlayers = res.players || allPlayers;
    renderRatingsPreview();
    showModal("Player removed from active ratings.", "alert");
  }finally{
    hideBusy();
  }
}

function renderRatingsPreview(){
  const raterSelect = document.getElementById("ratingsRaterSelect");
  const rows = document.getElementById("ratingsRows");
  const statusText = document.getElementById("ratingsStatusText");
  const statusDate = document.getElementById("ratingsStatusDate");
  const tableShell = document.querySelector(".ratingsTableShell");
  const tableHeader = document.querySelector(".ratingsTableHeader");
  const raterCard = document.querySelector(".ratingsRaterCard");
  const submitWrap = document.querySelector(".ratingsSubmitWrap");

  if(!raterSelect || !rows) return;

  const players = Array.isArray(allPlayers) ? [...allPlayers] : [];
  const status = formatBackendRatingStatus(currentRatingStatus);
  const isVotingOpen = currentRatingStatus ? !!currentRatingStatus.isOpen : false;
  const hasSubmittedRatings = !!(currentRatingStatus && currentRatingStatus.hasVoted);

  statusText.textContent = status.title;
  statusDate.textContent = status.detail;
  tableShell.classList.toggle("ratingsReadOnlyMode", !isVotingOpen);
  raterCard.style.display = isVotingOpen ? "" : "none";
  submitWrap.style.display = isVotingOpen ? "" : "none";
  updateRatingsSubmitButton(hasSubmittedRatings);

  tableHeader.innerHTML = isVotingOpen
    ? `<div>PLAYER</div><div class="ratingsCategoryHeader">OVERALL CATEGORIES <span>Low to Excellent</span></div>`
    : `<div>PLAYER</div><div>CURRENT SKILL</div><div>CATEGORY AVERAGE</div><div>VOTES</div>`;

  const selectedRater = raterSelect.value;

  raterSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Select your name";
  placeholder.disabled = true;
  placeholder.selected = true;
  raterSelect.appendChild(placeholder);

  players
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .forEach(player => {
      const option = document.createElement("option");
      option.value = player.name;
      option.textContent = player.name;
      raterSelect.appendChild(option);
    });

  if(selectedRater) raterSelect.value = selectedRater;

  rows.innerHTML = "";

  if(players.length === 0){
    rows.innerHTML = `<div class="ratingsEmpty">No players loaded yet.</div>`;
    return;
  }

  if(!isVotingOpen){
    renderRatingsReadOnlyRows(players);
    return;
  }

  renderRatingsVotingRows(players, selectedRater);
}

function renderRatingsReadOnlyRows(players){
  const rows = document.getElementById("ratingsRows");
  const latestRows = currentRatingStatus && Array.isArray(currentRatingStatus.latestRatings)
    ? currentRatingStatus.latestRatings
    : [];
  const latestByPlayer = {};

  latestRows.forEach(rating => {
    if(rating && rating.player) latestByPlayer[rating.player] = rating;
  });

  rows.innerHTML = "";

  players
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .forEach((player, index) => {
      const latest = latestByPlayer[player.name] || {};
      const row = document.createElement("div");
      row.className = "ratingsRow ratingsReadOnlyRow";

      row.innerHTML = `
        <div class="ratingsPlayerCell">
          <span class="ratingsPlayerNumber">${index + 1}</span>
          <span class="ratingsPlayerName">${player.name}</span>
        </div>
        <div class="ratingsReadonlyValue">
          <span class="ratingsReadonlyLabel">Current Skill</span>
          <strong>${formatRatingNumber(player.skill)}</strong>
        </div>
        <div class="ratingsReadonlyValue ratingsReadonlyCategories">
          <span class="ratingsReadonlyLabel">Category Average</span>
          <strong>${formatRatingNumber(latest.finalSkill)}</strong>
        </div>
        <div class="ratingsReadonlyValue">
          <span class="ratingsReadonlyLabel">Votes</span>
          <strong>${formatRatingNumber(latest.voteCount)}</strong>
        </div>
      `;

      rows.appendChild(row);
    });
}

function getScaleOptionByIndex(index){
  return RATING_SCALE_OPTIONS[Math.max(0, Math.min(RATING_SCALE_OPTIONS.length - 1, Number(index)))];
}

function createRatingCategoryControl(category, isSelf){
  return `
    <div class="ratingsCategoryCell ratingsTheme-${category.theme} ratingsUntouched" data-category="${category.key}">
      <div class="ratingsCategoryTop">
        <span class="ratingsCategoryName">${category.label}</span>
        <span class="ratingsCategoryTip" data-tip="${category.tip}">?</span>
      </div>
      <div class="ratingsCategoryControl">
        <span class="ratingsValueBox" data-value="">-</span>
        <input
          class="ratingsSlider ratingsCategorySlider"
          type="range"
          min="0"
          max="4"
          step="1"
          value="2"
          data-category="${category.key}"
          data-rated="false"
          ${isSelf ? "disabled" : ""}
        >
      </div>
      <div class="ratingsCategoryLabel">Not rated</div>
    </div>
  `;
}

function updateCategoryControl(cell, slider){
  const option = getScaleOptionByIndex(slider.value);
  const box = cell.querySelector(".ratingsValueBox");
  const label = cell.querySelector(".ratingsCategoryLabel");
  const scoreClass = "ratingsScore-" + slider.value;

  slider.dataset.rated = "true";
  slider.dataset.value = option.value;
  cell.classList.remove("ratingsUntouched", "ratingsScore-0", "ratingsScore-1", "ratingsScore-2", "ratingsScore-3", "ratingsScore-4");
  cell.classList.add(scoreClass);

  if(box){
    box.textContent = option.value;
    box.dataset.value = option.value;
  }

  if(label) label.textContent = option.label;
}

function renderRatingsVotingRows(players, selectedRater){
  const rows = document.getElementById("ratingsRows");
  rows.innerHTML = "";

  players
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .forEach((player, index) => {
      const row = document.createElement("div");
      row.className = "ratingsRow";
      row.setAttribute("data-player", player.name);

      const isSelf = selectedRater && selectedRater === player.name;
      if(isSelf) row.classList.add("ratingsSelfRow");

      row.innerHTML = `
        <div class="ratingsPlayerCell">
          <span class="ratingsPlayerNumber">${index + 1}</span>
          <span class="ratingsPlayerName">${player.name}</span>
          ${isSelf ? `<span class="ratingsSelfBadge">YOU</span>` : ""}
        </div>
        <div class="ratingsCategoriesGrid">
          ${RATING_CATEGORIES.map(category => createRatingCategoryControl(category, isSelf)).join("")}
        </div>
      `;

      row.querySelectorAll(".ratingsCategoryCell").forEach(cell => {
        const slider = cell.querySelector(".ratingsCategorySlider");
        if(!slider || isSelf) return;

        slider.addEventListener("input", () => updateCategoryControl(cell, slider));
      });

      rows.appendChild(row);
    });
}

function collectRatingsFormData(){
  const raterSelect = document.getElementById("ratingsRaterSelect");
  const rows = Array.from(document.querySelectorAll("#ratingsRows .ratingsRow"));

  if(!raterSelect || !raterSelect.value){
    return { ok: false, error: "Select your name before submitting ratings." };
  }

  const ratings = [];

  rows.forEach(row => {
    const player = row.getAttribute("data-player");
    if(!player || player === raterSelect.value) return;

    const categoryRatings = {};

    RATING_CATEGORIES.forEach(category => {
      const slider = row.querySelector(`.ratingsCategorySlider[data-category="${category.key}"]`);
      categoryRatings[category.key] = slider && slider.dataset.rated === "true"
        ? Number(slider.dataset.value)
        : null;
    });

    ratings.push({
      ratedPlayer: player,
      ...categoryRatings
    });
  });

  const validValues = RATING_SCALE_OPTIONS.map(option => option.value);
  const invalid = ratings.length === 0 || ratings.some(r =>
    RATING_CATEGORIES.some(category => !validValues.includes(r[category.key]))
  );

  if(invalid){
    return { ok: false, error: "Please rate every category for every player before submitting." };
  }

  return {
    ok: true,
    rater: raterSelect.value,
    ratings: ratings
  };
}

function submitRatingsPreview(formData){
  const data = formData || collectRatingsFormData();

  if(!data.ok){
    showModal(data.error, "alert");
    return;
  }

  showModal(`Offline preview saved for ${data.rater}. ${data.ratings.length} players rated.`, "alert");
}

async function submitRatings(){
  const formData = collectRatingsFormData();
  const codeValues = getRatingsCodeFormValues();

  if(!formData.ok){
    showModal(formData.error, "alert");
    return;
  }

  if(!codeValues.code){
    showModal("Enter your one-hour voting code before submitting.", "alert");
    return;
  }

  showBusy("SUBMITTING");

  try{
    const res = await api({
      action: "submitRatings",
      rater: formData.rater,
      code: codeValues.code,
      ratings: formData.ratings
    });

    if(!res || !res.ok){
      showModal((res && res.error) || "Could not submit ratings.", "alert");
      return;
    }

    await refreshRatingStatus(formData.rater);
    updateRatingsSubmitButton(true);
    showModal(`Ratings submitted successfully. ${res.submittedCount || formData.ratings.length} players rated.`, "alert");
  }catch(err){
    submitRatingsPreview(formData);
  }finally{
    hideBusy();
  }
}
