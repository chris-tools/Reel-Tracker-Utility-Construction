// ===== INCOMING MODE (CLEAN BUILD) =====

// --- Elements ---
const incomingState = document.getElementById('incomingState');
const incomingYard = document.getElementById('incomingYard');
const incomingBaba = document.getElementById('incomingBaba');

const incomingGoScan = document.getElementById('incomingGoScan');
const incomingReelList = document.getElementById('incomingReelList');
const incomingReelCount = document.getElementById('incomingReelCount');
const incomingExport = document.getElementById('incomingExport');

// --- Data ---
let incomingReels = [];

// ===== Intake Validation =====
function validateIncomingIntake() {
  const valid =
    incomingState.value !== '' &&
    incomingYard.value.trim() !== '' &&
    incomingBaba.value !== '';

  incomingGoScan.hidden = !valid;
  incomingGoScan.disabled = !valid;
}

// Attach listeners
incomingState.addEventListener('input', validateIncomingIntake);
incomingYard.addEventListener('input', validateIncomingIntake);
incomingBaba.addEventListener('input', validateIncomingIntake);

// ===== Add Reel =====
function addIncomingReel(value) {
  const v = value.trim().toUpperCase();
  if (!v) return;

  // Prevent duplicates
  if (incomingReels.includes(v)) {
    alert('Duplicate reel');
    return;
  }

  incomingReels.push(v);
  renderIncomingList();
}

// ===== Render List =====
function renderIncomingList() {
  incomingReelList.innerHTML = '';

  incomingReels.forEach((reel) => {
    const div = document.createElement('div');
    div.className = 'item';

    const span = document.createElement('span');
    span.textContent = reel;

    div.appendChild(span);
    incomingReelList.appendChild(div);
  });

  // Update count
  incomingReelCount.textContent = `(${incomingReels.length})`;

  // Enable export if reels exist
  const hasReels = incomingReels.length > 0;

incomingExport.disabled = !hasReels;
incomingExport.hidden = !hasReels;
}

incomingGoScan.addEventListener('click', () => {

  const scanSection = document.getElementById('scanSection');
  const mount = document.getElementById('incomingScannerMount');

  // Move scanner into Incoming page
  if (scanSection && mount) {
    mount.appendChild(scanSection);
    scanSection.hidden = false;
  }

  // Hide intake
  document.getElementById('incomingIntakeWrap').hidden = true;

  // Show session list
  document.getElementById('incomingSessionWrap').hidden = false;
});

validateIncomingIntake();
