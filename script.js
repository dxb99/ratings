const SHEET_PLAYERS = 'Players';
const SHEET_VERSION_VOTES = 'VersionVotes';
const SHEET_VERSION_RESULTS = 'VersionResults';

function doGet(){
  return json({ ok:true });
}

function doPost(e){
  const data = JSON.parse(e.postData.contents);
  const action = data.action;

  if(action === "getInitialData") return json(getInitialData());
  if(action === "getResults") return json({ ok:true, results:getComparisonResults() });
  if(action === "getRaterSubmission") return json(getRaterSubmission(data));
  if(action === "submitVersionRatings") return json(submitVersionRatings(data));
  if(action === "setupSheets") return json(setupSheets());

  return json({ ok:false, error:"Unknown action" });
}

function json(obj){
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet(name){
  return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
}

function getOrCreateSheet(name, headers){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);

  if(!sheet){
    sheet = ss.insertSheet(name);
  }

  if(sheet.getLastRow() === 0 && headers && headers.length){
    sheet.appendRow(headers);
  }

  return sheet;
}

function getVoteHeaders(){
  return [
    "Timestamp",
    "Version",
    "Rater",
    "RatedPlayer",
    "Overall",
    "Elimination",
    "Blitz",
    "CTF",
    "Combat",
    "Communication",
    "Decision",
    "Awareness",
    "Movement",
    "Impact",
    "FinalRating"
  ];
}

function getResultHeaders(){
  return [
    "Version",
    "Player",
    "FinalRating",
    "VoteCount",
    "UpdatedAt"
  ];
}

function setupSheets(){
  getOrCreateSheet(SHEET_PLAYERS, ["Name", "Skill", "Active"]);
  getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());
  getOrCreateSheet(SHEET_VERSION_RESULTS, getResultHeaders());

  return {
    ok:true,
    sheets:[SHEET_PLAYERS, SHEET_VERSION_VOTES, SHEET_VERSION_RESULTS]
  };
}

function getPlayers(){
  const sheet = getSheet(SHEET_PLAYERS);

  if(!sheet || sheet.getLastRow() < 2){
    return [];
  }

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 3).getValues();

  return rows
    .filter(row => row[0] && row[2] !== false)
    .map(row => ({
      name: row[0].toString().trim(),
      skill: Number(row[1]) || 0
    }));
}

function getInitialData(){
  setupSheets();

  return {
    ok:true,
    players:getPlayers(),
    results:getComparisonResults()
  };
}

function normalizeNumber(value){
  if(value === "" || value === null || typeof value === "undefined"){
    return null;
  }

  const numberValue = Number(value);

  if(isNaN(numberValue)){
    return null;
  }

  return Math.max(0, Math.min(10, numberValue));
}

function average(values){
  const cleaned = values
    .map(value => Number(value))
    .filter(value => !isNaN(value));

  if(!cleaned.length){
    return null;
  }

  return Math.round((cleaned.reduce((sum, value) => sum + value, 0) / cleaned.length) * 10) / 10;
}

function calculateFinalRating(version, rating){
  if(version === 1){
    return normalizeNumber(rating.overall);
  }

  if(version === 2){
    return average([
      normalizeNumber(rating.elimination),
      normalizeNumber(rating.blitz),
      normalizeNumber(rating.ctf)
    ]);
  }

  if(version === 3){
    return average([
      normalizeNumber(rating.combat),
      normalizeNumber(rating.communication),
      normalizeNumber(rating.decision),
      normalizeNumber(rating.awareness),
      normalizeNumber(rating.movement),
      normalizeNumber(rating.impact)
    ]);
  }

  return null;
}

function getActivePlayerSet(){
  const players = {};

  getPlayers().forEach(player => {
    players[player.name] = true;
  });

  return players;
}

function getRaterSubmission(data){
  const version = Number(data.version);
  const rater = data.rater ? data.rater.toString().trim() : "";

  if([1, 2, 3].indexOf(version) === -1){
    return { ok:false, error:"Invalid version" };
  }

  if(!rater){
    return { ok:false, error:"Missing rater" };
  }

  const sheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());

  if(sheet.getLastRow() < 2){
    return { ok:true, version:version, rater:rater, ratings:[] };
  }

  const normalizedRater = rater.toString().trim().toLowerCase();
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, getVoteHeaders().length)
    .getValues()
    .filter(row => Number(row[1]) === version && row[2] && row[2].toString().trim().toLowerCase() === normalizedRater);

  return {
    ok:true,
    version:version,
    rater:rater,
    ratings:rows.map(row => ({
      ratedPlayer: row[3],
      overall: row[4],
      elimination: row[5],
      blitz: row[6],
      ctf: row[7],
      combat: row[8],
      communication: row[9],
      decision: row[10],
      awareness: row[11],
      movement: row[12],
      impact: row[13],
      finalRating: row[14]
    }))
  };
}

function submitVersionRatings(data){
  const version = Number(data.version);
  const rater = data.rater ? data.rater.toString().trim() : "";
  const ratings = Array.isArray(data.ratings) ? data.ratings : [];
  const activePlayers = getActivePlayerSet();

  if([1, 2, 3].indexOf(version) === -1){
    return { ok:false, error:"Invalid version" };
  }

  if(!rater || !activePlayers[rater]){
    return { ok:false, error:"Select a valid rater" };
  }

  if(!ratings.length){
    return { ok:false, error:"No ratings submitted" };
  }

  const now = new Date();
  const cleanedRows = [];
  const seenPlayers = {};

  ratings.forEach(rating => {
    const ratedPlayer = rating && rating.ratedPlayer
      ? rating.ratedPlayer.toString().trim()
      : "";

    if(!ratedPlayer || ratedPlayer === rater || !activePlayers[ratedPlayer] || seenPlayers[ratedPlayer]){
      return;
    }

    const finalRating = calculateFinalRating(version, rating);

    if(finalRating === null){
      return;
    }

    seenPlayers[ratedPlayer] = true;

    cleanedRows.push([
      now,
      version,
      rater,
      ratedPlayer,
      version === 1 ? normalizeNumber(rating.overall) : "",
      version === 2 ? normalizeNumber(rating.elimination) : "",
      version === 2 ? normalizeNumber(rating.blitz) : "",
      version === 2 ? normalizeNumber(rating.ctf) : "",
      version === 3 ? normalizeNumber(rating.combat) : "",
      version === 3 ? normalizeNumber(rating.communication) : "",
      version === 3 ? normalizeNumber(rating.decision) : "",
      version === 3 ? normalizeNumber(rating.awareness) : "",
      version === 3 ? normalizeNumber(rating.movement) : "",
      version === 3 ? normalizeNumber(rating.impact) : "",
      finalRating
    ]);
  });

  if(!cleanedRows.length){
    return { ok:false, error:"No valid ratings submitted" };
  }

  const votesSheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());

  deleteExistingSubmission(version, rater);

  votesSheet
    .getRange(votesSheet.getLastRow() + 1, 1, cleanedRows.length, getVoteHeaders().length)
    .setValues(cleanedRows);

  recalculateVersionResults(version);

  return {
    ok:true,
    version:version,
    rater:rater,
    submittedCount:cleanedRows.length,
    results:getComparisonResults()
  };
}

function deleteExistingSubmission(version, rater){
  const sheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());

  if(sheet.getLastRow() < 2){
    return;
  }

  const normalizedRater = rater.toString().trim().toLowerCase();
  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, getVoteHeaders().length)
    .getValues();

  for(let i = rows.length - 1; i >= 0; i--){
    const row = rows[i];
    const rowVersion = Number(row[1]);
    const rowRater = row[2] ? row[2].toString().trim().toLowerCase() : "";

    if(rowVersion === Number(version) && rowRater === normalizedRater){
      sheet.deleteRow(i + 2);
    }
  }
}

function recalculateVersionResults(version){
  const votesSheet = getOrCreateSheet(SHEET_VERSION_VOTES, getVoteHeaders());
  const resultsSheet = getOrCreateSheet(SHEET_VERSION_RESULTS, getResultHeaders());

  if(votesSheet.getLastRow() < 2){
    return [];
  }

  const voteRows = votesSheet
    .getRange(2, 1, votesSheet.getLastRow() - 1, getVoteHeaders().length)
    .getValues()
    .filter(row => Number(row[1]) === Number(version));

  const grouped = {};

  voteRows.forEach(row => {
    const player = row[3] ? row[3].toString().trim() : "";
    const finalRating = normalizeNumber(row[14]);

    if(!player || finalRating === null){
      return;
    }

    if(!grouped[player]){
      grouped[player] = [];
    }

    grouped[player].push(finalRating);
  });

  const now = new Date();
  const output = Object.keys(grouped)
    .sort()
    .map(player => [
      version,
      player,
      average(grouped[player]),
      grouped[player].length,
      now
    ]);

  let existingRows = [];

  if(resultsSheet.getLastRow() > 1){
    existingRows = resultsSheet
      .getRange(2, 1, resultsSheet.getLastRow() - 1, getResultHeaders().length)
      .getValues()
      .filter(row => Number(row[0]) !== Number(version));

    resultsSheet
      .getRange(2, 1, resultsSheet.getLastRow() - 1, getResultHeaders().length)
      .clearContent();
  }

  const rowsToWrite = existingRows.concat(output);

  if(rowsToWrite.length){
    resultsSheet
      .getRange(2, 1, rowsToWrite.length, getResultHeaders().length)
      .setValues(rowsToWrite);
  }

  return output;
}

function getComparisonResults(){
  const sheet = getOrCreateSheet(SHEET_VERSION_RESULTS, getResultHeaders());
  const results = {
    version1: [],
    version2: [],
    version3: []
  };

  if(sheet.getLastRow() < 2){
    return results;
  }

  const rows = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, getResultHeaders().length)
    .getValues();

  rows.forEach(row => {
    const version = Number(row[0]);
    const player = row[1] ? row[1].toString().trim() : "";
    const finalRating = normalizeNumber(row[2]);
    const voteCount = Number(row[3]) || 0;

    if(!player || finalRating === null){
      return;
    }

    const item = {
      player:player,
      finalRating:finalRating,
      voteCount:voteCount
    };

    if(version === 1) results.version1.push(item);
    if(version === 2) results.version2.push(item);
    if(version === 3) results.version3.push(item);
  });

  Object.keys(results).forEach(key => {
    results[key].sort((a, b) => a.player.localeCompare(b.player));
  });

  return results;
}
