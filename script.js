const upload = document.getElementById('rxUpload');
const preview = document.getElementById('preview');
const runExtraction = document.getElementById('runExtraction');
const form = document.getElementById('rxForm');
const approveBtn = document.getElementById('approveBtn');
const copyBtn = document.getElementById('copyBtn');
const jsonOutput = document.getElementById('jsonOutput');

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
    safetyNote: 'Prototype only. Verify against original prescription before use.'
  };
}

function showJson() {
  jsonOutput.style.display = 'block';
  jsonOutput.textContent = JSON.stringify(formToJson(), null, 2);
}

upload.addEventListener('change', () => {
  const file = upload.files[0];
  if (!file) return;

  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = () => {
      preview.classList.remove('empty');
      preview.innerHTML = `<img src="${reader.result}" alt="Uploaded prescription preview" />`;
    };
    reader.readAsDataURL(file);
  } else {
    preview.classList.remove('empty');
    preview.textContent = `${file.name} uploaded. PDF preview not shown in this simple MVP.`;
  }
});

runExtraction.addEventListener('click', () => {
  showJson();
  alert('Demo extraction complete. Replace this simulation with OCR/API integration in the next build.');
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
