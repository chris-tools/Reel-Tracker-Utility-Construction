const $ = (id)=>document.getElementById(id);

const incomingState = $('incomingState');
const incomingYard = $('incomingYard');
const incomingBaba = $('incomingBaba');

const incomingGoScan = $('incomingGoScan');
const incomingScannerMount = $('incomingScannerMount');

const incomingReelList = $('incomingReelList');
const incomingReelCount = $('incomingReelCount');
const incomingExport = $('incomingExport');

const scanSection = $('scanSection');

let incomingReels = [];

// Enable scan button
function updateIncoming(){
  const ok =
    incomingState.value &&
    incomingYard.value.trim() &&
    incomingBaba.value;

  incomingGoScan.hidden = !ok;
}

incomingState.addEventListener('input', updateIncoming);
incomingYard.addEventListener('input', updateIncoming);
incomingBaba.addEventListener('input', updateIncoming);

// Start scanning
incomingGoScan.addEventListener('click', () => {

  incomingScannerMount.appendChild(scanSection);
  scanSection.hidden = false;

  $('incomingIntakeCard').hidden = true;
  incomingGoScan.hidden = true;
});

// Add reel (manual or scan hook later)
function addReel(v){
  if(!v) return;

  incomingReels.unshift(v);

  const div = document.createElement('div');
  div.className = 'item';
  div.textContent = v;

  incomingReelList.appendChild(div);

  incomingReelCount.textContent = `(${incomingReels.length})`;

  incomingExport.disabled = incomingReels.length === 0;
}
