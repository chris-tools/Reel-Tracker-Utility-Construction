(function(){
  const $ = (id)=>document.getElementById(id);

  // Mode buttons
  const modePickupBtn = $('modePickupBtn');
  const modeReturnBtn = $('modeReturnBtn');
  
  // Sections
  const pickupSection = $('pickupSection');
  const returnSection = $('returnSection');
  const scanSection = $('scanSection');

  // Pickup fields
  const techName = $('techName');
  const company = $('company');
  const build = $('build');
  const pickupGoScan = $('pickupGoScan');

  // Return fields
  // Return fields
const returnName = $('returnName');
const returnCompany = $('returnCompany');
const returnReelName = $('returnReelName');
const fiberCount = $('fiberCount');
const returnLocation = $('returnLocation');

const insideFt = $('insideFt');
const outsideFt = $('outsideFt');
const totalFt = $('totalFt');
const returnExport = $('returnExport');
const returnAdd = $('returnAdd');
const returnSessionList = $('returnSessionList');
const returnSessionCount = $('returnSessionCount');
const returnEntryWrap = $('returnEntryWrap');


  // Scan UI
  const startScan = $('startScan');
  const stopScan = $('stopScan');
  const flashBtn = $('flashBtn');
  const clearSession = $('clearSession');
  const exportPickupCsv = $('exportPickupCsv');
  const copyAllReels = $('copyAllReels');
  const manualReelInput = $('manualReelInput');
  const manualAddBtn = $('manualAddBtn');

  const video = $('video');
  const banner = $('banner');

  const lastScannedValue = $('lastScannedValue');
  const dismissLastScanned = $('dismissLastScanned');
  
  const reelList = $('reelList');
  const reelCount = $('reelCount');

  // Undo UI (above Session list)
   const undoBar = $('undoBar');
   const undoText = $('undoText');
   const undoBtn  = $('undoBtn');

  // State
  let mode = null; // 'pickup' | 'return'
  let scanner = null;
  let cameraStream = null;
  let streamTrack = null;
  let torchSupported = false;
  let torchOn = false;

  let lastScan = '';
  let sessionReels = []; // keep order
  let sessionSet = new Set();
  let armed = false; // one scan per tap
  
  let clearConfirmArmed = false;
  let clearConfirmTimer = null;

  let lastSeenValue = '';
  let lastSeenAt = 0;
  let cameraWarmupUntil = 0;

  // Return session state (multi-reel)
let returnSession = []; // array of entries for this trip/session

  // Undo state (one-level undo)
let undoTimer = null;
let pendingUndoReel = null;

function showUndo(reel){
  pendingUndoReel = reel;

  if(undoText) undoText.textContent = `Removed: ${reel}`;
  if(undoBar) undoBar.hidden = false;

  if(undoTimer) clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    hideUndo();
  }, 4000);
}

function hideUndo(){
  if(undoTimer) clearTimeout(undoTimer);
  undoTimer = null;
  pendingUndoReel = null;
  if(undoBar) undoBar.hidden = true;
}

  // --- Small helpers ---
  function setBanner(kind, text){
    if(!banner) return;
    banner.hidden = false;
    banner.className = 'banner ' + kind;
    banner.textContent = text;
  }
  function setIdleBanner(){
    setBanner('idle', 'Scan status: Ready');
  }

  function normalize(s){
    return String(s || '').trim().toUpperCase();
  }

  // Reel name: allow letters+numbers, hyphen, slash. 7-20 chars.
  function looksLikeReelName(s){
    if(!s) return false;
    if(s.length < 5 || s.length > 40) return false;
    if(!/^[A-Z0-9\-\/]+$/.test(s)) return false;
    return true;
  }

function updatePickupGo(){
  const ok =
    techName?.value.trim() &&
    company?.value.trim() &&
    build?.value.trim();

  pickupGoScan.disabled = !ok;
  pickupGoScan.hidden = !ok;
}

function updateReturn(){
  const insideStr = insideFt?.value?.trim() ?? '';
  const outsideStr = outsideFt?.value?.trim() ?? '';

  // Only show Total once both fields have something (0 is allowed)
  if (insideStr !== '' && outsideStr !== '') {
    const i = Number(insideStr);
    const o = Number(outsideStr);
    const total = Math.abs((Number.isFinite(o) ? o : 0) - (Number.isFinite(i) ? i : 0));
    if (totalFt) totalFt.value = String(total);
  } else {
    if (totalFt) totalFt.value = '';
  }

  const sessionOk =
  (returnName?.value.trim() || '') &&
  (returnCompany?.value.trim() || '') &&
  (returnLocation?.value.trim() || '');

// Progressive reveal
if (returnEntryWrap) returnEntryWrap.hidden = !sessionOk;

const entryOk =
  sessionOk &&
  (returnReelName?.value.trim() || '') &&
  (fiberCount?.value.trim() !== '') &&
  (insideStr !== '') &&
  (outsideStr !== '');

  // Add is enabled when the current entry is complete
  if (returnAdd) returnAdd.disabled = !entryOk;

  // Done (Export) is enabled when there's at least 1 entry in the session
  if (returnExport) returnExport.disabled = !(returnSession.length > 0);
}

  function updateScanUI(){
   if (dismissLastScanned) dismissLastScanned.disabled = !lastScan;

    const hasAny = sessionReels.length > 0;
    exportPickupCsv.disabled = !(hasAny && mode === 'pickup');
    clearSession.disabled = !hasAny;

    reelCount.textContent = `(${sessionReels.length})`;
  }

 function showLastScan(text){
  if(!lastScannedValue) return; // Last Scanned card removed from HTML
  lastScannedValue.textContent = text || 'Nothing scanned yet';
  lastScannedValue.style.color = text ? '#111827' : '#6b7280';
}

  function resetLastScan(){
    lastScan = '';
    showLastScan('', false);
    updateScanUI();
  }

  // --- Audio beep (tiny + optional) ---
  let audioCtx = null;
  function ensureAudio(){
    if(audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if(!Ctx) return null;
    audioCtx = new Ctx();
    return audioCtx;
  }
  function beep(freq=1800, durationMs=120, gainValue=0.8){
    const ctx = ensureAudio();
    if(!ctx) return;
    if(ctx.state === 'suspended') { ctx.resume().catch(()=>{}); }

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.value = 0.0001;

    osc.connect(gain);
    gain.connect(ctx.destination);

    const now = ctx.currentTime;
    const dur = Math.max(0.04, durationMs/1000);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainValue), now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  // --- Camera / ZXing ---
  async function startCamera(){
    if(scanner) return;

    if(!window.ZXingBrowser){
      setBanner('bad', 'Scanner library not loaded (zxing-browser.min.js missing).');
      return;
    }

    scanner = new ZXingBrowser.BrowserMultiFormatReader();

    try{
     const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();

// Prefer a back/rear/environment camera if we can detect it from the label.
// Fallback: use the last camera in the list (often the rear cam on phones).
let preferred = null;
if (devices && devices.length) {
  preferred =
    devices.find(d => /back|rear|environment/i.test(d.label || '')) ||
    devices[devices.length - 1];
}
const deviceId = preferred?.deviceId;


          // Use the library helper to attach camera to the <video>
      await scanner.decodeFromVideoDevice(deviceId, video, (result, err) => {
        // result shows up repeatedly while it remains in view; we accept “last seen”
        if (!result || !armed) return;
        if (Date.now() < cameraWarmupUntil) return;

        const raw =
          (typeof result.getText === 'function')
            ? result.getText()
            : (result.text || '');

        const val = normalize(raw);

        // If it doesn't look like a reel name, ignore it (no beep / no stop)
        if (!looksLikeReelName(val)) return;

        const v = val;

        // Debounce: ignore the same code if we just saw it a moment ago
        const nowMs = Date.now();
        if (v === lastSeenValue && (nowMs - lastSeenAt) < 1200) return;
        lastSeenValue = v;
        lastSeenAt = nowMs;

        if (sessionSet.has(v)) {
          setBanner('bad', 'Duplicate (already in session)');
          beep(550, 220, 1.0);
          armed = false;
          stopCamera();
          startScan.disabled = false;
          startScan.textContent = 'Scan Next';
          return;
        }

        // Success (new reel)
        sessionSet.add(v);
        sessionReels.unshift(v);
        renderSession();

        showLastScan(v);
        setBanner('ok', 'Added to session');
        beep(2000, 120, 0.9);

        armed = false;
        stopCamera();
        startScan.disabled = false;
        startScan.textContent = 'Scan Next';
      });

      // Grab underlying stream for torch support
      cameraStream = video.srcObject;
      streamTrack = cameraStream && cameraStream.getVideoTracks ? cameraStream.getVideoTracks()[0] : null;

      torchSupported = false;
      if(streamTrack && streamTrack.getCapabilities){
        const caps = streamTrack.getCapabilities();
        torchSupported = !!caps.torch;
      }
      flashBtn.disabled = !torchSupported;

      stopScan.disabled = false;

      setIdleBanner();
    }catch(e){
      setBanner('bad', 'Camera error: ' + (e?.message || e));
      scanner = null;
    }
  }

  async function stopCamera(){
    try{
      if(scanner){
        try{ await scanner.reset(); }catch(_){}
      }
    }catch(_){}

    scanner = null;

    try{
      if(streamTrack) streamTrack.stop();
    }catch(_){}

    streamTrack = null;
    cameraStream = null;
    torchSupported = false;
    torchOn = false;
    flashBtn.disabled = true;

    stopScan.disabled = true;
    setBanner('idle', 'Scan stopped');
  }

  async function toggleTorch(){
    if(!torchSupported || !streamTrack) return;
    torchOn = !torchOn;
    try{
      await streamTrack.applyConstraints({ advanced: [{ torch: torchOn }] });
      flashBtn.textContent = torchOn ? 'Flashlight: ON' : 'Flashlight';
    }catch(_){
      // ignore
    }
  }

  function renderReturnSession(){
  if(!returnSessionList || !returnSessionCount) return;

  returnSessionList.innerHTML = '';

  returnSession.forEach((entry, index) => {
    const div = document.createElement('div');
    div.className = 'item';

    const left = document.createElement('span');
    left.textContent = `${entry.reel} — ${entry.total} ft`;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.className = 'reelRemoveBtn';

    removeBtn.addEventListener('click', () => {
      returnSession.splice(index, 1);
      renderReturnSession();
      updateReturn(); // refresh button enabled states
      setBanner('idle', 'Removed from return session');
    });

    div.appendChild(left);
    div.appendChild(removeBtn);
    returnSessionList.appendChild(div);
  });

  returnSessionCount.textContent = `(${returnSession.length})`;
}

  // --- Session list ---
 function renderSession(){
  reelList.innerHTML = '';

  sessionReels.forEach((r, index) => {
    const div = document.createElement('div');
    div.className = 'item';

    const nameSpan = document.createElement('span');
    nameSpan.textContent = r;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '✕';
    removeBtn.className = 'reelRemoveBtn';

    removeBtn.addEventListener('click', () => {
      removeReelAt(index);
    });

    div.appendChild(nameSpan);
    div.appendChild(removeBtn);
    reelList.appendChild(div);
  });

  updateScanUI();
}

  function addLastScanToSession(){
    if(!lastScan) return;

    const v = lastScan;

    if(sessionSet.has(v)){
      setBanner('bad', 'Duplicate (already in session)');
      beep(2000, 120, 0.9);

      return;
    }

    sessionSet.add(v);
    sessionReels.unshift(v);
    renderSession();

    setBanner('ok', 'Added to session');
    resetLastScan();
  }

  function clearSessionNow(){

  // Stop camera if running
    stopCamera();
    resetClearSessionConfirm();


  // Clear reels
  sessionReels = [];
  sessionSet = new Set();

  // Clear undo state
  if(undoTimer) clearTimeout(undoTimer);
  undoTimer = null;
  pendingUndoReel = null;
  if(undoBar) undoBar.hidden = true;

  // Reset scan button state
  if(startScan){
    startScan.disabled = false;
    startScan.textContent = 'Scan';
  }

  if(manualReelInput){
  manualReelInput.value = '';
  updateManualAddState();
}
  
  renderSession();
  setIdleBanner();
}

  function resetClearSessionConfirm(){
  clearConfirmArmed = false;
  if(clearConfirmTimer) clearTimeout(clearConfirmTimer);
  clearConfirmTimer = null;

  if(clearSession) clearSession.textContent = 'Clear Session';
}

function handleClearSessionClick(){
  const hasAny = sessionReels.length > 0;
  if(!hasAny) return;

  // First tap = arm
  if(!clearConfirmArmed){
    clearConfirmArmed = true;

    if(clearSession) clearSession.textContent = 'Tap again to CLEAR';
    setBanner('bad', 'Tap Clear Session again to confirm');

    if(clearConfirmTimer) clearTimeout(clearConfirmTimer);
    clearConfirmTimer = setTimeout(() => {
      resetClearSessionConfirm();
      setIdleBanner();
    }, 2500);

    return;
  }

  // Second tap = confirm
  resetClearSessionConfirm();
  clearSessionNow();
}

  function handleManualAdd(){
  if(!manualReelInput) return;

  const raw = manualReelInput.value;
  const v = normalize(raw);

  if(!v){
    setBanner('bad', 'Enter a reel name');
    return;
  }

  if(!looksLikeReelName(v)){
    setBanner('bad', 'Invalid reel name');
    return;
  }

  if(sessionSet.has(v)){
    setBanner('bad', 'Duplicate (already in session)');
    beep(550, 220, 1.0);
    return;
  }

  sessionSet.add(v);
  sessionReels.unshift(v);
  renderSession();

  setBanner('ok', 'Added to session');
  beep(2000, 120, 0.9);

    manualReelInput.value = '';
    updateManualAddState();
}

function updateManualAddState(){
  if(!manualReelInput || !manualAddBtn) return;

  const v = normalize(manualReelInput.value);

  const isValid =
    looksLikeReelName(v) &&
    !sessionSet.has(v);

  manualAddBtn.disabled = !isValid;
}
  
  function removeReelAt(index){
  if(index < 0 || index >= sessionReels.length) return;

  const removed = sessionReels.splice(index, 1)[0];
  sessionSet.delete(removed);

  renderSession();
  showUndo(removed);           // show Undo bar above the list
  setBanner('idle', 'Removed'); // keep the main banner calm/neutral
}

  function copyAll(){
    const text = sessionReels.join('\n');
    if(!text) return;
    navigator.clipboard?.writeText(text).then(()=>{
      setBanner('ok', 'Copied to clipboard');
    }).catch(()=>{
      setBanner('bad', 'Clipboard copy failed');
    });
  }

  // --- CSV export ---
  function csvEscape(v){
    const s = String(v ?? '');
    if(/[",\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  }

  function downloadText(filename, text, mime='text/csv'){
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);

    // Share sheet first (iOS), download fallback
    if(navigator.share){
      const file = new File([blob], filename, { type: mime });
      navigator.share({ files:[file], title: filename }).catch(()=>{});
    }

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 1000);
  }

  function mmddyyyy(d){
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    const yy = String(d.getFullYear());
    return `${mm}-${dd}-${yy}`;
  }

 function exportPickup() {
  const now = new Date();

  const headers = [
    "Mode","Name","Storage State","Storage Yard","Date Received",
    "Reel ID #","Size","Footage","BABA?","Manufacturer",
    "Assigned Y/N","Date Assigned","State Assigned","Assignment",
    "Contractor","Field Bin Y/N","Picked Up Y/N","Date Picked Up",
    "Notes","Notes 2","Helper"
  ];

  const data = [headers];

  for (const reel of sessionReels) {
   data.push([
  "Pick Up / Deliver",               // A
  techName.value.trim(),             // B
  null,                              // C
  null,                              // D
  null,                              // E
  reel,                              // F
  null,                              // G
  null,                              // H
  null,                              // I
  null,                              // J
  "Y",                               // K
  new Date(now),                     // L
  null,                              // M
  build.value.trim(),                // N
  company.value.trim(),              // O
  null,                              // P
  "Y",                               // Q
  new Date(now),                     // R
  null,                              // S
  null,                              // T
  null                               // U
]);
  }

  const ws = XLSX.utils.aoa_to_sheet(data);

  const thin = { style: "thin", color: { rgb: "000000" } };

  const headerStyle = {
    fill: { fgColor: { rgb: "1F2E44" } },
    font: { color: { rgb: "FFFFFF" }, bold: true },
    alignment: { horizontal: "center", vertical: "center" },
    border: { top: thin, bottom: thin, left: thin, right: thin }
  };

  const borderStyle = {
    border: { top: thin, bottom: thin, left: thin, right: thin }
  };

  const centerStyle = (base) => ({
    ...(base || {}),
    alignment: { horizontal: "center", vertical: "center" }
  });

  const leftDateStyle = (base) => ({
    ...(base || {}),
    alignment: { horizontal: "left", vertical: "center" },
    numFmt: "m/d/yyyy"
  });

  const range = XLSX.utils.decode_range(ws["!ref"]);

  // Header row (row 1)
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }

  // Data rows: borders + alignment
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;

      ws[addr].s = { ...(ws[addr].s || {}), ...borderStyle };

      // K & Q centered (K=10, Q=16)
      if (c === 10 || c === 16) ws[addr].s = centerStyle(ws[addr].s);

      // L & R left-aligned dates (L=11, R=17)
      if (c === 11 || c === 17) {
        ws[addr].s = leftDateStyle(ws[addr].s);
        if (ws[addr].v instanceof Date) ws[addr].t = "d";
      }
    }
  }

  // Auto-width columns
  const colWidths = new Array(headers.length).fill(10);
  for (let c = 0; c < headers.length; c++) {
    let maxLen = 0;
    for (let r = 0; r < data.length; r++) {
      const v = data[r][c];
      const s = v instanceof Date
        ? `${v.getMonth()+1}/${v.getDate()}/${v.getFullYear()}`
        : (v ?? "").toString();
      maxLen = Math.max(maxLen, s.length);
    }
    colWidths[c] = Math.min(Math.max(10, maxLen + 2), 45);
  }
  ws["!cols"] = colWidths.map(wch => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "RTU Export");

  const filename = `${mmddyyyy(now)}_PickupDeliver_${build.value.trim()}.xlsx`;

  // Create file in-memory
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const file = new File([blob], filename, { type: blob.type });

  // Share Sheet if supported, otherwise download fallback
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: filename })
      .then(() => setBanner("ok", "Export created"))
      .catch(() => setBanner("info", "Share canceled"));
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setBanner("ok", "Export created");
  }
}

function exportReturn(){
  const now = new Date();

  const headers = [
    'Name',
    'Company/Garage',
    'Location',
    'Reel Name',
    'Fiber Count',
    'Inside Footage',
    'Outside Footage',
    'Total Footage'
  ];

  const data = [
    headers,
    ...returnSession.map(e => ([
      e.name,
      e.company,
      e.location,
      e.reel,
      Number(e.fiber),
      Number(e.inside),
      Number(e.outside),
      Number(e.total)
    ]))
  ];

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Styling (simple + consistent)
  const thin = { style: "thin", color: { rgb: "000000" } };

  const headerStyle = {
    fill: { fgColor: { rgb: "1F2E44" } },
    font: { color: { rgb: "FFFFFF" }, bold: true },
    alignment: { horizontal: "center", vertical: "center" },
    border: { top: thin, bottom: thin, left: thin, right: thin }
  };

  const borderStyle = {
    border: { top: thin, bottom: thin, left: thin, right: thin }
  };

  const range = XLSX.utils.decode_range(ws["!ref"]);

  // Header row style
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) ws[addr].s = headerStyle;
  }

  // Borders on data cells
  for (let r = 1; r <= range.e.r; r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      if (!ws[addr]) continue;
      ws[addr].s = { ...(ws[addr].s || {}), ...borderStyle };
    }
  }

  // Auto-width columns
  const colWidths = new Array(headers.length).fill(10);
  for (let c = 0; c < headers.length; c++) {
    let maxLen = 0;
    for (let r = 0; r < data.length; r++) {
      const v = data[r][c];
      const s = (v ?? '').toString();
      maxLen = Math.max(maxLen, s.length);
    }
    colWidths[c] = Math.min(Math.max(10, maxLen + 2), 45);
  }
  ws["!cols"] = colWidths.map(wch => ({ wch }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "RTU Return");

  const filename = `RTU_${mmddyyyy(now)}_Return.xlsx`;

  // Write workbook to blob
  const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([wbout], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const file = new File([blob], filename, { type: blob.type });

  // Share Sheet if supported, otherwise download
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: filename })
      .then(() => setBanner("ok", "Export created"))
      .catch(() => setBanner("info", "Share canceled"));
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setBanner("ok", "Export created");
  }

  // Clear session after Done (Export)
  returnSession = [];
  renderReturnSession();
  updateReturn();
}
  // --- Mode switching ---
  function showMode(next){
    mode = next;

    // reset UI
    pickupSection.hidden = true;
    returnSection.hidden = true;
    scanSection.hidden = true;

    stopCamera();

    if(mode === 'pickup'){
      pickupSection.hidden = false;
      setBanner('idle', 'Pick Up / Deliver selected');
    }
    if(mode === 'return'){
      returnSection.hidden = false;
      setBanner('idle', 'Return selected');
    }
    showHowtoForMode(next);
  }

  function goScan(){
    scanSection.hidden = false;
    pickupSection.hidden = true;
    returnSection.hidden = true;

    setIdleBanner();
    renderSession();
  }

  // --- Wiring ---
  modePickupBtn?.addEventListener('click', ()=>showMode('pickup'));
  modeReturnBtn?.addEventListener('click', ()=>showMode('return'));

  techName?.addEventListener('input', updatePickupGo);
  company?.addEventListener('input', updatePickupGo);
  build?.addEventListener('input', updatePickupGo);

  pickupGoScan?.addEventListener('click', ()=>{
    if(pickupGoScan.disabled) return;
    goScan();
  });

 // Return listeners
returnName?.addEventListener('input', updateReturn);
returnCompany?.addEventListener('input', updateReturn);
returnReelName?.addEventListener('input', updateReturn);
fiberCount?.addEventListener('input', updateReturn);
returnLocation?.addEventListener('input', updateReturn);
insideFt?.addEventListener('input', updateReturn);
outsideFt?.addEventListener('input', updateReturn);

// Auto-next (Enter / Next key moves to the next field)
function wireAutoNext(fields){
  fields.forEach((el, idx) => {
    if(!el) return;
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const next = fields[idx + 1];
        if (next && typeof next.focus === 'function') next.focus();
      }
    });
  });
}

wireAutoNext([
  returnName,
  returnCompany,
  returnReelName,
  fiberCount,
  returnLocation,
  insideFt,
  outsideFt
]);

 returnAdd?.addEventListener('click', ()=>{
  if(returnAdd.disabled) return;

  const entry = {
    name: (returnName?.value || '').trim(),
    company: (returnCompany?.value || '').trim(),
    reel: (returnReelName?.value || '').trim(),
    fiber: (fiberCount?.value || '').trim(),
    location: (returnLocation?.value || '').trim(),
    inside: (insideFt?.value || '').trim(),
    outside: (outsideFt?.value || '').trim(),
    total: (totalFt?.value || '').trim()
  };

  returnSession.push(entry);
  renderReturnSession();

  // Clear only the per-reel fields for the next entry
  if (returnReelName) returnReelName.value = '';
  if (insideFt) insideFt.value = '';
  if (outsideFt) outsideFt.value = '';
  if (totalFt) totalFt.value = '';
  if (fiberCount) fiberCount.value = '';


  updateReturn();
  setBanner('ok', 'Added to return session');

  // Put cursor where Puff needs it next
  returnReelName?.focus();
});

returnExport?.addEventListener('click', ()=>{
  if(returnExport.disabled) return;
  exportReturn();
});


 startScan?.addEventListener('click', async ()=>{
  startScan.disabled = true;
  startScan.textContent = 'Scanning…';

  // Prevent “instant dup” on startup (stale frame / buffered decode)
  lastSeenValue = '';
  lastSeenAt = 0;
  cameraWarmupUntil = Date.now() + 400;

  armed = true;
  await startCamera();
});

 stopScan?.addEventListener('click', async ()=>{
  // User hit Finished while scanning (or after). Cleanly reset UI state.
  armed = false;
  await stopCamera();

  if(startScan){
    startScan.disabled = false;

    // If we were mid-scan, reset the label so the user can start again
    if (startScan.textContent === 'Scanning…') {
      startScan.textContent = (sessionReels.length > 0) ? 'Scan Next' : 'Scan';
    }
  }
});

  flashBtn?.addEventListener('click', ()=>toggleTorch());

  dismissLastScanned?.addEventListener('click', ()=>resetLastScan());
  clearSession?.addEventListener('click', ()=>handleClearSessionClick());
  manualAddBtn?.addEventListener('click', ()=>handleManualAdd());

  manualReelInput?.addEventListener('input', ()=>{
  updateManualAddState();
});

  manualReelInput?.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter'){
    e.preventDefault();
    handleManualAdd();
  }
});

  copyAllReels?.addEventListener('click', ()=>copyAll());
  exportPickupCsv?.addEventListener('click', ()=>exportPickup());

  undoBtn?.addEventListener('click', () => {
  if(!pendingUndoReel) return;

  const reel = pendingUndoReel;
  hideUndo();

  // Add back to bottom (your preference)
  if(!sessionSet.has(reel)){
    sessionSet.add(reel);
    sessionReels.unshift(reel);
    renderSession();
    setBanner('ok', 'Restored');
  }
});

  // PWA install hint
  let deferredPrompt = null;
  const installBtn = $('installBtn');

  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.hidden = false;
  });

  if (installBtn) {
    installBtn.addEventListener('click', async ()=>{
      if(!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt = null;
      installBtn.hidden = true;
    });
  }

  // Safety net: if the user navigates away / backgrounds the app, release the camera
  window.addEventListener('pagehide', ()=>{ stopCamera(); });
  document.addEventListener('visibilitychange', ()=>{
    if(document.hidden) stopCamera();
  });

  // ===== HOW-TO ACCORDION =====
const howtoPickupToggle = document.getElementById("howtoPickupToggle");
const howtoPickupBody   = document.getElementById("howtoPickupBody");

const howtoReturnsToggle = document.getElementById("howtoReturnsToggle");
const howtoReturnsBody   = document.getElementById("howtoReturnsBody");

function setupHowto(toggle, body) {
  if (!toggle || !body) return;

  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isOpen));
    body.hidden = isOpen;
  });
}

setupHowto(howtoPickupToggle, howtoPickupBody);
setupHowto(howtoReturnsToggle, howtoReturnsBody);

  // ===== HOW-TO VISIBILITY (MODE-AWARE) =====
const howtoPickupCard  = document.getElementById("howtoPickup");
const howtoReturnsCard = document.getElementById("howtoReturns");

function collapseHowtos() {
  // Collapse Pick Up / Deliver
  if (howtoPickupToggle && howtoPickupBody) {
    howtoPickupToggle.setAttribute("aria-expanded", "false");
    howtoPickupBody.hidden = true;
  }

  // Collapse Returns
  if (howtoReturnsToggle && howtoReturnsBody) {
    howtoReturnsToggle.setAttribute("aria-expanded", "false");
    howtoReturnsBody.hidden = true;
  }
}

function showHowtoForMode(modeName) {
  // modeName should be: 'pickup' | 'return' | null
  if (howtoPickupCard)  howtoPickupCard.hidden  = (modeName !== "pickup");
  if (howtoReturnsCard) howtoReturnsCard.hidden = (modeName !== "return");

  // Always collapse when switching modes (your requirement)
  collapseHowtos();
}

  // Boot
  setIdleBanner();
  updatePickupGo();
  updateReturn();
  renderSession();
  updateManualAddState();
  renderReturnSession();

})();
