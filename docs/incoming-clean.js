(function(){

  const $ = (id)=>document.getElementById(id);

  // Elements
  const incomingYard = $('incomingYard');
  const incomingGoScan = $('incomingGoScan');
  const incomingSummaryCard = $('incomingSummaryCard');
  const incomingSummaryText = $('incomingSummaryText');

  const scanSection = $('scanSection');
  const startScan = $('startScan');
  const stopScan = $('stopScan');

  const exportBtn = $('exportPickupCsv');

  const reelList = $('reelList');
  const reelCount = $('reelCount');

  const video = $('video');
  const banner = $('banner');

  // State
  let scanner = null;
  let sessionReels = [];
  let sessionSet = new Set();
  let armed = false;

  // --- Helpers ---
  function setBanner(kind, text){
    if(!banner) return;
    banner.hidden = false;
    banner.className = 'banner ' + kind;
    banner.textContent = text;
  }

  function normalize(s){
    return String(s || '').trim().toUpperCase();
  }

  function mmddyyyy(d){
    const mm = d.getMonth() + 1;
    const dd = d.getDate();
    const yy = String(d.getFullYear()).slice(-2);
    return `${mm}/${dd}/${yy}`;
  }

  function updateUI(){
    const hasAny = sessionReels.length > 0;
    exportBtn.disabled = !hasAny;
    reelCount.textContent = `(${sessionReels.length})`;
  }

  function renderSession(){
    reelList.innerHTML = '';
    sessionReels.forEach((r)=>{
      const div = document.createElement('div');
      div.className = 'item';
      div.textContent = r;
      reelList.appendChild(div);
    });
    updateUI();
  }

  function showSummary(){
    incomingSummaryText.innerHTML = `
      <div><b>Storage Yard:</b> ${incomingYard.value.trim()}</div>
    `;
    incomingSummaryCard.hidden = false;
  }

  // --- Scanner ---
  async function startCamera(){
    if(!window.ZXingBrowser){
      setBanner('bad', 'Scanner not loaded');
      return;
    }

    scanner = new ZXingBrowser.BrowserMultiFormatReader();

    const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
    const deviceId = devices?.[devices.length - 1]?.deviceId;

    await scanner.decodeFromVideoDevice(deviceId, video, (result) => {
      if (!result || !armed) return;

      const val = normalize(result.text);

      if(sessionSet.has(val)){
        setBanner('bad', 'Duplicate');
        return;
      }

      sessionSet.add(val);
      sessionReels.unshift(val);
      renderSession();

      setBanner('ok', 'Added');

      armed = false;
      startScan.disabled = false;
      startScan.textContent = 'Scan Next';
    });
  }

  async function stopCamera(){
    if(scanner){
      try{ await scanner.reset(); }catch{}
    }
    scanner = null;
  }

  // --- Export ---
  function exportIncoming(){
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
        "", "", "",
        incomingYard.value.trim(),
        mmddyyyy(now),
        reel,
        "", "", "", "",
        "", "", "", "",
        "", "", "", "",
        "", "", ""
      ]);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Incoming");

    const filename = `${mmddyyyy(now)}_Incoming.xlsx`;
    XLSX.writeFile(wb, filename);
  }

  // --- Events ---
  incomingYard?.addEventListener('input', ()=>{
    incomingGoScan.disabled = incomingYard.value.trim() === '';
  });

  incomingGoScan?.addEventListener('click', ()=>{
    incomingGoScan.hidden = true;
    showSummary();
    scanSection.hidden = false;
  });

  startScan?.addEventListener('click', async ()=>{
    startScan.disabled = true;
    startScan.textContent = 'Scanning…';
    armed = true;
    await startCamera();
  });

  stopScan?.addEventListener('click', async ()=>{
    armed = false;
    await stopCamera();
    startScan.disabled = false;
    startScan.textContent = 'Scan';
  });

  exportBtn?.addEventListener('click', exportIncoming);

})();
