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
  const returnReelName = $('returnReelName');
  const insideFt = $('insideFt');
  const outsideFt = $('outsideFt');
  const totalFt = $('totalFt');
  const returnExport = $('returnExport');

  // Scan UI
  const startScan = $('startScan');
  const stopScan = $('stopScan');
  const flashBtn = $('flashBtn');
  const clearSession = $('clearSession');
  const exportPickupCsv = $('exportPickupCsv');
  const copyAllReels = $('copyAllReels');

  const video = $('video');
  const banner = $('banner');

  const lastScannedValue = $('lastScannedValue');
  const dismissLastScanned = $('dismissLastScanned');
  
  const reelList = $('reelList');
  const reelCount = $('reelCount');

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


  let lastSeenValue = '';
  let lastSeenAt = 0;


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
  }

  function updateReturn(){
    const i = Number(insideFt?.value || 0);
    const o = Number(outsideFt?.value || 0);
    const total = (Number.isFinite(i) ? i : 0) + (Number.isFinite(o) ? o : 0);
    if(totalFt) totalFt.value = total ? String(total) : '';
    const ok =
      returnReelName?.value.trim() &&
      (insideFt?.value.trim() !== '') &&
      (outsideFt?.value.trim() !== '');
    returnExport.disabled = !ok;
  }

  function updateScanUI(){
    dismissLastScanned.disabled = !lastScan;

    const hasAny = sessionReels.length > 0;
    exportPickupCsv.disabled = !(hasAny && mode === 'pickup');
    copyAllReels.disabled = !hasAny;
    clearSession.disabled = !hasAny;

    reelCount.textContent = `(${sessionReels.length})`;
  }

  function showLastScan(text){
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
      const deviceId = (devices && devices[0] && devices[0].deviceId) ? devices[0].deviceId : undefined;

      // Use the library helper to attach camera to the <video>
    await scanner.decodeFromVideoDevice(deviceId, video, (result, err, controls) => {
  // result shows up repeatedly while it remains in view; we accept “last seen”
  if(result && armed){
    const raw = (typeof result.getText === 'function') ? result.getText() : (result.text || '');
    const val = normalize(raw);

    if(looksLikeReelName(val)){
      const v = val;
      // Debounce: ignore the same code if we just saw it a moment ago
const nowMs = Date.now();
if (v === lastSeenValue && (nowMs - lastSeenAt) < 1200) return;
lastSeenValue = v;
lastSeenAt = nowMs;


      if(!sessionSet.has(v)){
        sessionSet.add(v);
        sessionReels.push(v);
        renderSession();

        showLastScan(v);
        setBanner('ok', 'Added to session');
        beep(2000, 120, 0.9);
      } else {
        setBanner('bad', 'Duplicate (already in session)');
        beep(800, 140, 0.7);
      }
    }
  }
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

  // --- Session list ---
  function renderSession(){
    reelList.innerHTML = '';
    for(const r of sessionReels){
      const div = document.createElement('div');
      div.className = 'item';
      div.textContent = r;
      reelList.appendChild(div);
    }
    updateScanUI();
  }

  function addLastScanToSession(){
    if(!lastScan) return;

    const v = lastScan;

    if(sessionSet.has(v)){
      setBanner('bad', 'Duplicate (already in session)');
      beep(800, 140, 0.7);
      return;
    }

    sessionSet.add(v);
    sessionReels.push(v);
    renderSession();

    setBanner('ok', 'Added to session');
    resetLastScan();
  }

  function clearSessionNow(){
    sessionReels = [];
    sessionSet = new Set();
    renderSession();
    resetLastScan();
    setIdleBanner();
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

  function exportPickup(){
    const now = new Date();
    const rows = [];

    rows.push(['Mode','Name','Company/Garage','Build','Reel']);
    for(const reel of sessionReels){
      rows.push(['Pick Up / Deliver', techName.value.trim(), company.value.trim(), build.value.trim(), reel]);
    }

    const csv = rows.map(r=>r.map(csvEscape).join(',')).join('\n');
    const filename = `RTU_${mmddyyyy(now)}_PickupDeliver.csv`;
    downloadText(filename, csv);
    setBanner('ok', 'Export created');
  }

  function exportReturn(){
    const now = new Date();
    const i = insideFt.value.trim();
    const o = outsideFt.value.trim();
    const t = totalFt.value.trim();

    const rows = [
      ['Mode','Reel Name','Inside Footage','Outside Footage','Total Footage'],
      ['Return', returnReelName.value.trim(), i, o, t],
    ];

    const csv = rows.map(r=>r.map(csvEscape).join(',')).join('\n');
    const filename = `RTU_${mmddyyyy(now)}_Return.csv`;
    downloadText(filename, csv);
    setBanner('ok', 'Export created');
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

  returnReelName?.addEventListener('input', updateReturn);
  insideFt?.addEventListener('input', updateReturn);
  outsideFt?.addEventListener('input', updateReturn);

  returnExport?.addEventListener('click', ()=>{
    if(returnExport.disabled) return;
    exportReturn();
  });

  startScan?.addEventListener('click', async ()=>{
    startScan.disabled = true;
    startScan.textContent = 'Scanning…';
    armed = true;
    await startCamera();
});


  stopScan?.addEventListener('click', async ()=>{
    await stopCamera();
  });

  flashBtn?.addEventListener('click', ()=>toggleTorch());

  dismissLastScanned?.addEventListener('click', ()=>resetLastScan());
  clearSession?.addEventListener('click', ()=>clearSessionNow());
  copyAllReels?.addEventListener('click', ()=>copyAll());
  exportPickupCsv?.addEventListener('click', ()=>exportPickup());

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

  // Boot
  setIdleBanner();
  updatePickupGo();
  updateReturn();
  renderSession();

})();
