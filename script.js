const upload = document.getElementById('rxUpload');
const preview = document.getElementById('preview');
const runExtraction = document.getElementById('runExtraction');
const form = document.getElementById('rxForm');
const approveBtn = document.getElementById('approveBtn');
const copyBtn = document.getElementById('copyBtn');
const jsonOutput = document.getElementById('jsonOutput');
const rawOcrText = document.getElementById('rawOcrText');

let uploadedImageDataUrl = null;

function setField(name, value) {
  const field = form.elements[name];
  if (field && value) field.value = value.trim();
}

function cleanText(text) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return match[1].replace(/[:#]/g, '').trim();
  }
  return '';
}

function parsePrescriptionText(text) {
  const lowerText = text.toLowerCase();

  const patientName = findMatch(text, [
    /(?:patient|pt|name)\s*[:#-]?\s*([A-Z][A-Za-z' -]{2,60})/i,
    /(?:rx for)\s*[:#-]?\s*([A-Z][A-Za-z' -]{2,60})/i
  ]);

  const dob = findMatch(text, [
    /(?:dob|date of birth)\s*[:#-]?\s*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i,
    /(?:dob|date of birth)\s*[:#-]?\s*([0-9]{4}[\/\-.][0-9]{1,2}[\/\-.][0-9]{1,2})/i
  ]);

  const rxDate = findMatch(text, [
    /(?:date|rx date|written)\s*[:#-]?\s*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i,
    /(?:date|rx date|written)\s*[:#-]?\s*([0-9]{4}[\/\-.][0-9]{1,2}[\/\-.][0-9]{1,2})/i
  ]);

  const quantity = findMatch(text, [
    /(?:qty|quantity|dispense)\s*[:#-]?\s*([0-9]{1,4})/i,
    /(?:#)\s*([0-9]{1,4})/i
  ]);

  const refills = findMatch(text, [
    /(?:refills?|repeats?)\s*[:#-]?\s*([0-9]{1,2}|none|zero)/i
  ]);

  const prescriber = findMatch(text, [
    /(?:dr\.?|doctor|prescriber)\s*[:#-]?\s*([A-Z][A-Za-z'. -]{2,70})/i
  ]);

  const strength = findMatch(text, [
    /\b([0-9]+(?:\.[0-9]+)?\s*(?:mg|mcg|g|ml|units?|iu|%)\b)/i
  ]);

  const sig = findMatch(text, [
    /(?:sig|directions?|dir|take)\s*[:#-]?\s*([^\n]{8,160})/i,
    /\b(take\s+[^\n]{8,160})/i,
    /\b(use\s+[^\n]{8,160})/i,
    /\b(apply\s+[^\n]{8,160})/i
  ]);

  const commonDrugPattern = /\b(amoxicillin|atorvastatin|metformin|ramipril|amlodipine|rosuvastatin|pantoprazole|azithromycin|cephalexin|prednisone|salbutamol|levothyroxine|sertraline|escitalopram|naproxen|ibuprofen|acetaminophen)\b/i;
  let drugName = findMatch(text, [commonDrugPattern]);

  if (!drugName) {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const likelyDrugLine = lines.find(line =>
      /\b(mg|mcg|g|ml|tab|tabs|tablet|cap|capsule|cream|ointment|solution)\b/i.test(line) &&
      !/patient|address|phone|fax|date|dob|doctor|prescriber|pharmacy/i.test(line)
    );
    if (likelyDrugLine) {
      drugName = likelyDrugLine.replace(/\b[0-9]+(?:\.[0-9]+)?\s*(mg|mcg|g|ml|%)\b.*$/i, '').trim();
    }
  }

  return {
    patientName,
    dob,
    drugName,
    strength,
    quantity,
    refills,
    directions: sig,
    prescriber,
    rxDate,
    riskFlags: buildRiskFlags({ patientName, dob, drugName, strength, quantity, refills, directions: sig, prescriber, rxDate }, lowerText)
  };
}

function buildRiskFlags(fields, lowerText) {
  const flags = [];
  if (!fields.patientName) flags.push('Patient name not confidently detected.');
  if (!fields.drugName) flags.push('Drug name not confidently detected.');
  if (!fields.strength) flags.push('Strength not confidently detected.');
  if (!fields.directions) flags.push('Directions/SIG not confidently detected.');
  if (!fields.prescriber) flags.push('Prescriber not confidently detected.');
  if (/(narcotic|opioid|morphine|hydromorphone|oxycodone|fentanyl|methadone|stimulant|amphetamine|methylphenidate|benzodiazepine|lorazepam|clonazepam|diazepam)/i.test(lowerText)) {
    flags.push('Possible controlled/high-risk medication wording detected. Manual review required.');
  }
  flags.push('OCR output must be verified against the original prescription before use.');
  return flags;
}

function applyParsedFields(parsed) {
  setField('patientName', parsed.patientName);
  setField('dob', parsed.dob);
  setField('drugName', parsed.drugName);
  setField('strength', parsed.strength);
  setField('quantity', parsed.quantity);
  setField('refills', parsed.refills);
  setField('directions', parsed.directions);
  setField('prescriber', parsed.prescriber);
  setField('rxDate', parsed.rxDate);

  const flagsBox = document.querySelector('.flags');
  if (flagsBox && parsed.riskFlags) {
    flagsBox.innerHTML = `<h3>Review Flags</h3>${parsed.riskFlags.map(flag => `<p>⚠ ${flag}</p>`).join('')}`;
  }
}

function formToJson() {
  const data = new FormData(form);
  return {
    patient: {
      name: data.get('patientName'),
      dob: data.get('dob')
    },
    medication: {
      drugName: data.get('drugName'),
      strength: data.get('strength'),
      quantity: data.get('quantity'),
      refills: data.get('refills'),
      directions: data.get('directions')
    },
    prescriber: data.get('prescriber'),
    prescriptionDate: data.get('rxDate'),
    verificationStatus: 'requires_pharmacist_review',
    safetyNote: 'Prototype only. Verify every field against the original prescription before use.'
  };
}

function showJson() {
  jsonOutput.style.display = 'block';
  jsonOutput.textContent = JSON.stringify(formToJson(), null, 2);
}

upload.addEventListener('change', () => {
  const file = upload.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    preview.classList.remove('empty');
    preview.textContent = 'Please upload a clear JPG or PNG image for this browser OCR demo.';
    uploadedImageDataUrl = null;
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    uploadedImageDataUrl = reader.result;
    preview.classList.remove('empty');
    preview.innerHTML = `<img src="${reader.result}" alt="Uploaded prescription preview" />`;
  };
  reader.readAsDataURL(file);
});

runExtraction.addEventListener('click', async () => {
  if (!uploadedImageDataUrl) {
    alert('Please upload a clear prescription image first.');
    return;
  }

  runExtraction.disabled = true;
  runExtraction.textContent = 'Reading image... 0%';
  rawOcrText.style.display = 'block';
  rawOcrText.textContent = 'OCR running. This may take 10–30 seconds...';

  try {
    const result = await Tesseract.recognize(uploadedImageDataUrl, 'eng', {
      logger: message => {
        if (message.status === 'recognizing text') {
          runExtraction.textContent = `Reading image... ${Math.round(message.progress * 100)}%`;
        }
      }
    });

    const text = cleanText(result.data.text || '');
    rawOcrText.textContent = text || 'No readable text detected. Try a clearer image with better lighting.';

    const parsed = parsePrescriptionText(text);
    applyParsedFields(parsed);
    showJson();
  } catch (error) {
    console.error(error);
    alert('OCR failed. Try a clearer JPG/PNG image or redeploy with internet access for Tesseract.js.');
  } finally {
    runExtraction.disabled = false;
    runExtraction.textContent = 'Run Real OCR';
  }
});

approveBtn.addEventListener('click', (event) => {
  event.preventDefault();
  showJson();
  jsonOutput.textContent = jsonOutput.textContent.replace('requires_pharmacist_review', 'reviewed_by_pharmacist');
  alert('Marked as reviewed for demo purposes.');
});

copyBtn.addEventListener('click', async (event) => {
  event.preventDefault();
  showJson();
  try {
    await navigator.clipboard.writeText(jsonOutput.textContent);
    alert('JSON copied.');
  } catch (error) {
    alert('Copy failed. You can manually select the JSON text.');
  }
});
