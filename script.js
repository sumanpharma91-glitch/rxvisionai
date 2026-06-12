const upload = document.getElementById('rxUpload');
const preview = document.getElementById('preview');
const runExtraction = document.getElementById('runExtraction');
const form = document.getElementById('rxForm');
const approveBtn = document.getElementById('approveBtn');
const copyBtn = document.getElementById('copyBtn');
const smartCleanBtn = document.getElementById('smartCleanBtn');
const jsonOutput = document.getElementById('jsonOutput');
const rawOcrText = document.getElementById('rawOcrText');

let uploadedImageDataUrl = null;

function clearFields() {
  ['patientName','dob','drugName','strength','quantity','refills','directions','prescriber','rxDate'].forEach(name => {
    if (form.elements[name]) form.elements[name].value = '';
  });
}

function setField(name, value) {
  const field = form.elements[name];
  if (field) field.value = value ? String(value).trim() : '';
}

function cleanText(text) {
  return text
    .replace(/\r/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizeOcr(text) {
  return text
    .replace(/\bLazenge\b/gi, 'Lozenge')
    .replace(/\bI\s*Manth\b/gi, '1 Month')
    .replace(/\bIMonth\b/gi, '1 Month')
    .replace(/\bO\s*mg\b/gi, '0 mg')
    .replace(/\bpo\b/gi, 'PO')
    .replace(/\bqid\b/gi, 'QID')
    .replace(/\bprn\b/gi, 'PRN')
    .replace(/\s+/g, ' ')
    .trim();
}

function findMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) return normalizeOcr(match[1].replace(/[:#]/g, '').trim());
  }
  return '';
}

function normalizeDate(value) {
  if (!value) return '';
  return value.replace(/[.]/g, '/').trim();
}

function extractPatientName(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const direct = findMatch(text, [
    /(?:patient|pt|name)\s*[:#-]?\s*([A-Z][A-Za-z' -]{2,60})(?=\s+(?:DOB|Date of Birth)|\n|$)/i,
    /(?:rx for)\s*[:#-]?\s*([A-Z][A-Za-z' -]{2,60})/i
  ]);
  if (direct && !/dob|date|phone|fax|address/i.test(direct)) return direct;

  // Try a likely patient line after pharmacy/header lines, avoiding doctor/pharmacy/med lines.
  const candidate = lines.find(line =>
    /^[A-Z][A-Za-z' -]+,?\s+[A-Z][A-Za-z' -]+/.test(line) &&
    !/pharmacy|doctor|dr\.?|clinic|phone|fax|date|rx|sig|qty|refill|mg|tablet|capsule|lozenge|cream|ointment/i.test(line)
  );
  return candidate ? candidate.replace(/\bDOB\b.*$/i, '').trim() : '';
}

function extractDirections(text) {
  const normalized = normalizeOcr(text);
  return findMatch(normalized, [
    /(?:sig|directions?|dir)\s*[:#-]?\s*([^\n]{8,180})/i,
    /\b(take\s+[^\n]{8,180})/i,
    /\b(use\s+[^\n]{8,180})/i,
    /\b(apply\s+[^\n]{8,180})/i,
    /\b(\d+\s+(?:tab|tabs|tablet|cap|capsule|lozenge)[^\n]{8,180})/i
  ]);
}

function extractDrugName(text, directions) {
  const commonDrugPattern = /\b(amoxicillin|atorvastatin|metformin|ramipril|amlodipine|rosuvastatin|pantoprazole|azithromycin|cephalexin|prednisone|salbutamol|levothyroxine|sertraline|escitalopram|naproxen|ibuprofen|acetaminophen|ciprofloxacin|benzocaine|menthol)\b/i;
  const common = findMatch(text, [commonDrugPattern]);
  if (common) return common;

  const lines = text.split('\n').map(line => normalizeOcr(line.trim())).filter(Boolean);
  const medLine = lines.find(line =>
    /\b(mg|mcg|g|ml|%|tab|tabs|tablet|cap|capsule|lozenge|cream|ointment|solution)\b/i.test(line) &&
    !/patient|address|phone|fax|date|dob|doctor|dr\.?|prescriber|pharmacy|signature/i.test(line)
  );
  if (medLine) {
    // Remove directions words and quantity fragments where possible.
    return medLine
      .replace(/\b(?:take|use|apply)\b.*$/i, '')
      .replace(/\bqty\b.*$/i, '')
      .replace(/\b#\s*\d+.*$/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  if (/lozenge/i.test(directions || '')) return 'Lozenge';
  return '';
}

function parsePrescriptionText(text) {
  const cleaned = cleanText(text);
  const normalized = normalizeOcr(cleaned);
  const lowerText = normalized.toLowerCase();

  const patientName = extractPatientName(cleaned);
  const dob = normalizeDate(findMatch(cleaned, [
    /(?:dob|date of birth)\s*[:#-]?\s*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i,
    /(?:dob|date of birth)\s*[:#-]?\s*([0-9]{4}[\/\-.][0-9]{1,2}[\/\-.][0-9]{1,2})/i
  ]));

  const rxDate = normalizeDate(findMatch(cleaned, [
    /(?:rx date|written|date)\s*[:#-]?\s*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i,
    /(?:rx date|written|date)\s*[:#-]?\s*([0-9]{4}[\/\-.][0-9]{1,2}[\/\-.][0-9]{1,2})/i
  ]));

  const quantity = findMatch(normalized, [
    /(?:qty|quantity|dispense)\s*[:#-]?\s*([0-9]{1,4})/i,
    /(?:#)\s*([0-9]{1,4})/i,
    /\b(?:no|number)\s*([0-9]{1,4})\b/i
  ]);

  const refills = findMatch(normalized, [
    /(?:refills?|repeats?)\s*[:#-]?\s*([0-9]{1,2}|none|zero)/i
  ]);

  const prescriber = findMatch(cleaned, [
    /(?:dr\.?|doctor|prescriber)\s*[:#-]?\s*([A-Z][A-Za-z'. -]{2,70})/i,
    /([A-Z][a-z]+\s+[A-Z][a-z]+\s+MD)\b/
  ]);

  const strength = findMatch(normalized, [
    /\b([0-9]+(?:\.[0-9]+)?\s*(?:mg|mcg|g|ml|units?|iu|%)\b)/i
  ]);

  const directions = extractDirections(cleaned);
  const drugName = extractDrugName(cleaned, directions);

  const fields = { patientName, dob, drugName, strength, quantity, refills, directions, prescriber, rxDate };
  return { ...fields, riskFlags: buildRiskFlags(fields, lowerText) };
}

function buildRiskFlags(fields, lowerText) {
  const flags = [];
  if (!fields.patientName) flags.push('Patient name not confidently detected. Field left blank instead of using sample data.');
  if (!fields.dob) flags.push('DOB not confidently detected.');
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
  clearFields();
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

function getValue(name) {
  return (form.elements[name]?.value || '').trim();
}

function formToJson() {
  return {
    patient: {
      name: getValue('patientName'),
      dob: getValue('dob')
    },
    medication: {
      drugName: getValue('drugName'),
      strength: getValue('strength'),
      quantity: getValue('quantity'),
      refills: getValue('refills'),
      directions: getValue('directions')
    },
    prescriber: getValue('prescriber'),
    prescriptionDate: getValue('rxDate'),
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
  clearFields();
  rawOcrText.style.display = 'none';
  jsonOutput.style.display = 'none';
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

  clearFields();
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

smartCleanBtn.addEventListener('click', (event) => {
  event.preventDefault();
  setField('directions', normalizeOcr(getValue('directions')));
  if (!getValue('drugName') && /lozenge/i.test(getValue('directions'))) setField('drugName', 'Lozenge');
  showJson();
  alert('Smart cleanup applied. This is rule-based for now; the next version can use a secure AI API backend.');
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
