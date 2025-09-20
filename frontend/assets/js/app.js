// NHS GP Booking System Frontend Logic
// Notes:
// - All handlers are bound programmatically to satisfy CSP (no inline JS)
// - Demo mode: auto-generates a valid NHS number and uses mock booking response

(function () {
  const API_BASE_URL = window.location.origin;
  let currentStep = 1;
  let selectedSlot = null;
  let bookedAppointment = null;
  let selectedCareType = null;
  let selectedCondition = null;
  let selectedConditionLabel = null;

  const mockJwtToken = 'demo-jwt-token-for-testing';

  function getEl(id) { return document.getElementById(id); }

  function updateProgress() {
    const progress = (currentStep / 6) * 100;
    const fill = getEl('progressFill');
    if (fill) fill.style.width = progress + '%';
  }

  function nextStep() {
    const currentStepEl = getEl(`step${currentStep}`);
    if (currentStepEl) currentStepEl.classList.remove('active');
    currentStep++;
    const nextStepEl = getEl(`step${currentStep}`);
    if (nextStepEl) nextStepEl.classList.add('active');
    updateProgress();
    if (currentStep === 3) fillReasonPreset();
  }

  function goToStep(targetStep) {
    const currentStepEl = getEl(`step${currentStep}`);
    if (currentStepEl) currentStepEl.classList.remove('active');
    currentStep = targetStep;
    const nextStepEl = getEl(`step${currentStep}`);
    if (nextStepEl) nextStepEl.classList.add('active');
    updateProgress();
    if (currentStep === 3) fillReasonPreset();
  }

  function prevStep() {
    const currentStepEl = getEl(`step${currentStep}`);
    if (currentStepEl) currentStepEl.classList.remove('active');
    currentStep--;
    const prevStepEl = getEl(`step${currentStep}`);
    if (prevStepEl) prevStepEl.classList.add('active');
    updateProgress();
  }

  function selectCareType(careType) {
    document.querySelectorAll('.care-type-card').forEach(card => card.classList.remove('selected'));
    const selectedCard = document.querySelector(`[data-care-type="${careType}"]`);
    if (selectedCard) selectedCard.classList.add('selected');
    selectedCareType = careType;
    if (careType === 'routine') selectedConditionLabel = 'Annual checkup';
    // For annual physical/checkup (routine), skip Step 2 and go straight to Step 3 (select GP)
    if (careType === 'routine') {
      setTimeout(() => {
        goToStep(3);
        const gpSelect = getEl('gpPractice');
        if (gpSelect) gpSelect.focus();
      }, 300);
      return;
    }
    setTimeout(nextStep, 300);
  }

  function filterConditions() {
    const input = getEl('conditionSearch');
    const term = (input?.value || '').toLowerCase();
    document.querySelectorAll('.condition-option').forEach(opt => {
      const text = opt.textContent?.toLowerCase() || '';
      opt.style.display = text.includes(term) ? 'flex' : 'none';
    });
  }

  function showAllConditions() {
    const all = getEl('allConditions');
    const common = getEl('commonConditions');
    const btn = getEl('showAllBtn');
    const showingAll = all && all.style.display !== 'none';
    if (all && common && btn) {
      if (showingAll) {
        all.style.display = 'none';
        common.style.display = 'block';
        btn.textContent = 'Show all conditions (a-z)';
      } else {
        all.style.display = 'block';
        common.style.display = 'none';
        btn.textContent = 'Show common conditions';
      }
      setupConditionHandlers();
    }
  }

  function setupConditionHandlers() {
    document.querySelectorAll('.condition-option').forEach(row => {
      row.addEventListener('click', () => {
        const input = row.querySelector('input[name="condition"]');
        if (input) {
          input.checked = true;
          selectedCondition = input.value;
          const span = row.querySelector('span');
          selectedConditionLabel = span ? (span.textContent || input.value) : input.value;
          const btn = getEl('conditionNextBtn');
          if (btn) btn.disabled = false;
        }
      });
    });
  }

  function fillReasonPreset() {
    const presetEl = getEl('reasonPreset');
    const hiddenReason = getEl('reasonForAppointment');
    if (!presetEl || !hiddenReason) return;
    const text = selectedCareType === 'routine' ? 'Annual checkup' : (selectedConditionLabel || '');
    presetEl.value = text;
    hiddenReason.value = text;
  }

  function validateNHSNumber(nhsNumber) {
    if (!/^\d{10}$/.test(nhsNumber)) return false;
    const digits = nhsNumber.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
    const checkDigit = 11 - (sum % 11);
    const expected = checkDigit === 11 ? 0 : checkDigit === 10 ? 0 : checkDigit;
    return expected === digits[9];
  }

  // Generate a random valid NHS number (mock/demo)
  function generateValidNHSNumber() {
    // Keep trying until the generated number passes validation
    // (Very fast; probability of invalid is low)
    while (true) {
      const nine = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
      let sum = 0;
      for (let i = 0; i < 9; i++) sum += nine[i] * (10 - i);
      let checkDigit = 11 - (sum % 11);
      if (checkDigit === 11) checkDigit = 0;
      if (checkDigit === 10) checkDigit = 0; // match our validator behavior
      const nhs = nine.join('') + String(checkDigit);
      if (validateNHSNumber(nhs)) return nhs;
    }
  }

  async function searchSlots() {
    const patientData = JSON.parse(sessionStorage.getItem('patientData') || '{}');
    const dateRangeEl = getEl('dateRange');
    const dateRange = dateRangeEl ? parseInt(dateRangeEl.value || '7') : 7;
    const loading = getEl('loadingSlots');
    const results = getEl('slotsResults');
    if (loading) loading.style.display = 'block';
    if (results) results.style.display = 'none';

    const fromDate = new Date().toISOString().split('T')[0];
    const toDate = new Date(Date.now() + dateRange * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    try {
      const response = await fetch(`${API_BASE_URL}/api/appointments/availability?` + new URLSearchParams({
        gpPracticeODSCode: patientData.gpPractice,
        fromDate,
        toDate,
        duration: 15
      }), { headers: { 'X-Request-ID': generateRequestId() } });

      const data = await response.json();
      if (data.success && data.data && data.data.slots) {
        displaySlots(data.data.slots);
      } else {
        throw new Error(data.error || 'No slots returned');
      }
    } catch (err) {
      console.error('Error searching slots:', err);
      displayMockSlots();
    } finally {
      if (loading) loading.style.display = 'none';
      if (results) results.style.display = 'block';
    }
  }

  function displaySlots(slots) {
    const container = getEl('availableSlots');
    if (!container) return;
    if (!slots || slots.length === 0) {
      container.innerHTML = '<div class="alert alert-warning">No available appointments found for the selected period. Please try a different date range or contact your GP practice directly.</div>';
      return;
    }
    container.innerHTML = slots.map(slot => `
      <div class="slot-card" data-slot-id="${slot.id}">
        <div class="slot-time">${formatDateTime(slot.start)}</div>
        <div class="slot-practitioner">${slot.practitioner ? (slot.practitioner.display || 'GP') : 'General Practice'}</div>
        <div style="font-size: 0.8rem; color: #666; margin-top: 0.5rem;">Duration: 15 minutes</div>
      </div>
    `).join('');
  }

  function displayMockSlots() {
    const mockSlots = [
      { id: 'slot-1', start: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000).toISOString(), practitioner: { display: 'Dr. Sarah Smith' } },
      { id: 'slot-2', start: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 10.5 * 60 * 60 * 1000).toISOString(), practitioner: { display: 'Dr. James Wilson' } },
      { id: 'slot-3', start: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000 + 14 * 60 * 60 * 1000).toISOString(), practitioner: { display: 'Dr. Emily Johnson' } },
      { id: 'slot-4', start: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000 + 11.25 * 60 * 60 * 1000).toISOString(), practitioner: { display: 'Dr. Michael Brown' } }
    ];
    displaySlots(mockSlots);
  }

  function selectSlot(slotId, element) {
    document.querySelectorAll('.slot-card').forEach(card => card.classList.remove('selected'));
    if (element) element.classList.add('selected');
    selectedSlot = slotId;
    const cta = getEl('selectTimeBtn');
    if (cta) cta.disabled = false;
  }

  function displayAppointmentSummary(appointment) {
    const patientData = JSON.parse(sessionStorage.getItem('patientData') || '{}');
    const practiceNames = { 'A12345': 'Example Medical Centre', 'B67890': 'Community Health Practice', 'C11111': 'Riverside Surgery' };
    const el = getEl('appointmentSummary');
    if (!el) return;
    el.innerHTML = `
      <h3>Appointment Details</h3>
      <div style="background: #f8f9fa; padding: 1rem; border-radius: 4px; margin: 1rem 0;">
        <p><strong>Appointment ID:</strong> ${appointment.appointment.id}</p>
        <p><strong>Date & Time:</strong> ${formatDateTime(appointment.appointment.start)}</p>
        <p><strong>GP Practice:</strong> ${practiceNames[patientData.gpPractice] || patientData.gpPractice}</p>
        <p><strong>Type:</strong> ${patientData.appointmentType}</p>
        <p><strong>Duration:</strong> 15 minutes</p>
        <p><strong>Reason:</strong> ${patientData.reasonForAppointment}</p>
      </div>
      <h3>Practice Notifications</h3>
      <div style="background: #e8f5e8; padding: 1rem; border-radius: 4px; margin: 1rem 0;">
        ${appointment.notifications.map(n => `<p>✅ ${n.method.toUpperCase()}: ${n.success ? 'Sent successfully' : 'Failed to send'}</p>`).join('')}
      </div>
      <p style="font-size: 0.9rem; color: #666; margin-top: 1rem;">Your GP practice has been automatically notified of this booking via secure NHS systems. Please arrive 10 minutes before your appointment time.</p>
    `;
  }

  function formatDateTime(dateTimeString) {
    const date = new Date(dateTimeString);
    return date.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function generateRequestId() {
    return 'req-' + Math.random().toString(36).substr(2, 9);
  }

  function createMockAppointment() {
    return {
      appointment: {
        id: 'APT-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
        start: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'booked'
      },
      notifications: [ { method: 'email', success: true }, { method: 'mesh', success: true } ]
    };
  }

  function showError(message) {
    const errorContainer = getEl('errorContainer');
    if (!errorContainer) return;
    errorContainer.innerHTML = `<div class="alert alert-error">${message}</div>`;
    setTimeout(() => { errorContainer.innerHTML = ''; }, 5000);
  }

  function downloadAppointment() {
    const patientData = JSON.parse(sessionStorage.getItem('patientData') || '{}');
    const practiceNames = { 'A12345': 'Example Medical Centre', 'B67890': 'Community Health Practice', 'C11111': 'Riverside Surgery' };
    const text = `\nNHS GP Appointment Confirmation\n\nAppointment ID: ${bookedAppointment.appointment.id}\\nDate & Time: ${formatDateTime(bookedAppointment.appointment.start)}\nGP Practice: ${practiceNames[patientData.gpPractice]}\nType: ${patientData.appointmentType}\nReason: ${patientData.reasonForAppointment}\n\nPlease arrive 10 minutes before your appointment time.\nBring photo ID and any relevant medical documents.\n\nThis appointment has been booked via the NHS Digital GP Connect system.`.trim();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nhs-appointment-${bookedAppointment.appointment.id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function bookAnother() {
    currentStep = 1;
    selectedSlot = null;
    bookedAppointment = null;
    selectedCareType = null;
    selectedCondition = null;
    sessionStorage.clear();
    document.querySelectorAll('.step').forEach(step => step.classList.remove('active'));
    const step1 = getEl('step1');
    if (step1) step1.classList.add('active');
    const pf = getEl('patientForm');
    const cf = getEl('contactForm');
    pf && pf.reset();
    cf && cf.reset();
    document.querySelectorAll('.care-type-card').forEach(card => card.classList.remove('selected'));
    document.querySelectorAll('input[name="condition"]').forEach(radio => { radio.checked = false; });
    const btn = getEl('conditionNextBtn');
    if (btn) btn.disabled = true;
    updateProgress();
  }

  function bindGlobalHandlers() {
    document.querySelectorAll('.care-type-card').forEach(card => {
      const type = card.getAttribute('data-care-type');
      card.addEventListener('click', () => selectCareType(type || ''));
    });
    const conditionSearch = getEl('conditionSearch');
    conditionSearch && conditionSearch.addEventListener('input', filterConditions);
    const showAllBtn = getEl('showAllBtn');
    showAllBtn && showAllBtn.addEventListener('click', showAllConditions);
    const step2BackBtn = getEl('step2BackBtn');
    step2BackBtn && step2BackBtn.addEventListener('click', prevStep);
    const conditionNextBtn = getEl('conditionNextBtn');
    conditionNextBtn && conditionNextBtn.addEventListener('click', () => { if (selectedCondition) nextStep(); });
    const patientForm = getEl('patientForm');
    patientForm && patientForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const preset = (getEl('reasonPreset')?.value || '').trim();
      const extra = (getEl('reasonExtra')?.value || '').trim();
      const combinedReason = (preset + (extra ? ` — ${extra}` : '')).trim();
      const hiddenReason = getEl('reasonForAppointment');
      if (hiddenReason) hiddenReason.value = combinedReason;

      if (!combinedReason || combinedReason.length < 10) {
        showError('Please provide a brief description (at least 10 characters).');
        return;
      }

      const formData = new FormData(patientForm);
      const patientData = Object.fromEntries(formData);
      if (!validateNHSNumber(patientData.nhsNumber)) { showError('Invalid NHS number format. Please check and try again.'); return; }
      sessionStorage.setItem('patientData', JSON.stringify(patientData));
      sessionStorage.setItem('careType', selectedCareType || '');
      sessionStorage.setItem('condition', selectedConditionLabel || selectedCondition || '');
      nextStep();
      searchSlots();
    });
    const dateRange = getEl('dateRange');
    dateRange && dateRange.addEventListener('change', searchSlots);
    const slotsContainer = getEl('availableSlots');
    if (slotsContainer) {
      slotsContainer.addEventListener('click', (e) => {
        const card = (e.target instanceof Element) ? e.target.closest('.slot-card') : null;
        if (card) selectSlot(card.getAttribute('data-slot-id') || '', card);
      });
    }
    const step4BackBtn = getEl('step4BackBtn');
    step4BackBtn && step4BackBtn.addEventListener('click', prevStep);
    const contactForm = getEl('contactForm');
    contactForm && contactForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = contactForm.querySelector('button[type="submit"]');
      if (submitBtn) { submitBtn.textContent = 'Booking...'; submitBtn.disabled = true; }
      await new Promise(r => setTimeout(r, 1500));
      bookedAppointment = createMockAppointment();
      displayAppointmentSummary(bookedAppointment);
      nextStep();
    });
    const downloadBtn = getEl('downloadBtn');
    downloadBtn && downloadBtn.addEventListener('click', downloadAppointment);
    const bookAnotherBtn = getEl('bookAnotherBtn');
    bookAnotherBtn && bookAnotherBtn.addEventListener('click', bookAnother);
  }

  document.addEventListener('DOMContentLoaded', function () {
    updateProgress();
    setupConditionHandlers();
    bindGlobalHandlers();

    // Prefill NHS number for demo and make it read-only
    const nhsInput = getEl('nhsNumber');
    if (nhsInput) {
      nhsInput.value = generateValidNHSNumber();
      nhsInput.readOnly = true;
    }
  });
})();


