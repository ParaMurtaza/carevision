/* ==========================================================================
   CareVision AI — script.js
   Powered by Murtaza
   ========================================================================== */

// ─── APPLICATION STATE ───
const state = {
  // Chat/Brief State
  chatStep: 0,
  symptoms: [],
  severity: 0,
  duration: 'Unknown',
  history: 'None reported',
  triageLevel: 'Awaiting Data',
  suggestedSpeciality: 'General Medicine',
  notes: '',
  chatTranscript: [
    { sender: 'ai', text: "Hello! I'm here to help gather information about your symptoms before your consultation. What is bothering you today?" }
  ],
  
  // Booking State
  selectedSpeciality: 'General Medicine',
  selectedDoctor: null,
  selectedDate: '',
  selectedTime: '',
  
  // Skincare State
  skincareResult: null,
  
  // Medicine Cart State
  cart: [],
  
  // Clinician workspace queue: loaded from the backend (CareVisionAPI.doctorQueue) - no demo patients
  ehrQueue: [],
  activeEhrPatientId: ''
};

// ─── DOCTORS DIRECTORY ───
const doctorsData = {
  'General Medicine': [
    { name: 'Dr. Alan Turing', rating: 4.9, fee: '₹500', avatar: 'AT', avail: 'Available Today' },
    { name: 'Dr. Grace Hopper', rating: 4.8, fee: '₹600', avatar: 'GH', avail: 'Available Tomorrow' }
  ],
  'Dermatology': [
    { name: 'Dr. Rosalind Franklin', rating: 4.7, fee: '₹700', avatar: 'RF', avail: 'Available Today' }
  ],
  'Cardiology': [
    { name: 'Dr. Christian Barnard', rating: 4.9, fee: '₹1200', avatar: 'CB', avail: 'Available Today' }
  ],
  'Pediatrics': [
    { name: 'Dr. Jonas Salk', rating: 4.8, fee: '₹400', avatar: 'JS', avail: 'Available Tomorrow' }
  ]
};

// ─── MEDICINE SHOP DATA ───
const medicinesCatalog = [
  { name: 'Paracetamol 650mg (Dolo)', category: 'Fever & Pain Relief', carevision: 15, competitor: 25 },
  { name: 'Amoxicillin 500mg', category: 'Antibiotic (Rx Required)', carevision: 85, competitor: 120 },
  { name: 'Atorvastatin 10mg (Lipitor)', category: 'Cholesterol Control (Rx)', carevision: 120, competitor: 180 },
  { name: 'Ibuprofen 400mg', category: 'Pain & Inflammation Relief', carevision: 20, competitor: 35 },
  { name: 'Metformin 500mg', category: 'Diabetes Management (Rx)', carevision: 45, competitor: 65 },
  { name: 'Cetirizine 10mg (Alerid)', category: 'Allergy Relief', carevision: 18, competitor: 30 }
];

// ─── DIABETES RISK ASSESSMENT QUIZ ───
const diabetesQuestions = [
  {
    q: "What is your age category?",
    options: [
      { text: "Under 40 years", points: 0 },
      { text: "40 - 49 years", points: 1 },
      { text: "50 - 59 years", points: 2 },
      { text: "60 years or older", points: 3 }
    ]
  },
  {
    q: "What is your biological sex?",
    options: [
      { text: "Female", points: 0 },
      { text: "Male (statistically higher baseline risk)", points: 1 }
    ]
  },
  {
    q: "Do you have a parent, brother, or sister with diabetes?",
    options: [
      { text: "No", points: 0 },
      { text: "Yes", points: 2 }
    ]
  },
  {
    q: "Have you ever been diagnosed with high blood pressure?",
    options: [
      { text: "No", points: 0 },
      { text: "Yes", points: 1 }
    ]
  },
  {
    q: "How physically active are you?",
    options: [
      { text: "Active (regular weekly workouts/sports)", points: 0 },
      { text: "Sedentary (mostly sitting, little exercise)", points: 1 }
    ]
  }
];
let currentQuizIndex = 0;
let quizScores = [];


// ─── INTERACTION UTILITIES (MODALS) ───
const modalOverlay = document.getElementById('modalOverlay');

function openModal(modalId) {
  modalOverlay.classList.add('active');
  // Hide all modals
  document.querySelectorAll('.modal-content').forEach(m => m.classList.remove('active'));
  // Show target modal
  const targetModal = document.getElementById(modalId);
  if (targetModal) targetModal.classList.add('active');
  
  // Specific Initializers
  if (modalId === 'bookingModal') {
    initBookingWizard();
  } else if (modalId === 'toolsModal') {
    calculateBMI();
    initDiabetesQuiz();
  } else if (modalId === 'medicinesModal') {
    renderMedicinesCatalog();
    renderCart();
  }
}

function closeModal() {
  modalOverlay.classList.remove('active');
  document.querySelectorAll('.modal-content').forEach(m => m.classList.remove('active'));
  stopWebcam();
}

// Close modal when clicking background overlay
if (modalOverlay) {
  modalOverlay.addEventListener('click', (e) => {
    if (e.target === modalOverlay) closeModal();
  });
}


// ─── SYMPTOM CHECKER / CHAT ENGINE ───
const chatInput  = document.getElementById('chatInput');
const sendBtn    = document.getElementById('chatSendBtn');
const chatMsgs   = document.getElementById('chatMessages');

// Brief components
const briefTriage = document.getElementById('briefTriage');
const briefSymptoms = document.getElementById('briefSymptoms');
const briefSeverityBar = document.getElementById('briefSeverityBar');
const briefSeverityText = document.getElementById('briefSeverityText');
const briefDuration = document.getElementById('briefDuration');
const briefDept = document.getElementById('briefDept');
const briefNotes = document.getElementById('briefNotes');
const briefBookBtn = document.getElementById('briefBookBtn');

/**
 * Append bubble message
 */
function appendMessage(text, who) {
  const wrapper = document.createElement('div');
  if (who === 'user') wrapper.style.alignSelf = 'flex-end';

  const label = document.createElement('div');
  label.className  = 'msg-label';
  label.textContent = who === 'ai' ? 'CareVision AI' : 'You';
  if (who === 'user') label.style.textAlign = 'right';

  const bubble = document.createElement('div');
  bubble.className = `msg msg-${who}`;
  bubble.textContent = text;

  wrapper.appendChild(label);
  wrapper.appendChild(bubble);
  chatMsgs.appendChild(wrapper);
  
  // Save transcript
  state.chatTranscript.push({ sender: who, text: text });

  chatMsgs.scrollTop = chatMsgs.scrollHeight;
}

/**
 * Handle AI logic flow and state update
 */
function processUserMessage(userText) {
  appendMessage(userText, 'user');
  chatInput.value = '';

  setTimeout(() => {
    let reply = '';
    const textLower = userText.toLowerCase();

    switch (state.chatStep) {
      case 0:
        // Extract symptoms
        const possibleSymptoms = ['fever', 'headache', 'cough', 'cold', 'stomach', 'vomit', 'chest pain', 'breath', 'rash', 'fatigue', 'weakness'];
        possibleSymptoms.forEach(s => {
          if (textLower.includes(s)) {
            state.symptoms.push(s);
          }
        });
        
        if (state.symptoms.length === 0) {
          state.symptoms.push('General malaise');
        }

        // Triage categorization
        if (textLower.includes('chest') || textLower.includes('breath') || textLower.includes('heart')) {
          state.triageLevel = 'High';
          state.suggestedSpeciality = 'Cardiology';
        } else if (textLower.includes('fever') || textLower.includes('stomach') || textLower.includes('vomit') || textLower.includes('nausea')) {
          state.triageLevel = 'Moderate';
          state.suggestedSpeciality = 'General Medicine';
        } else if (textLower.includes('skin') || textLower.includes('rash') || textLower.includes('spots')) {
          state.triageLevel = 'Low';
          state.suggestedSpeciality = 'Dermatology';
        } else {
          state.triageLevel = 'Low';
          state.suggestedSpeciality = 'General Medicine';
        }

        updateLiveBriefUI();

        reply = `Thank you. I have logged symptoms: ${state.symptoms.join(', ')}. Next, on a scale of 1–10 (10 being most painful), how severe is your discomfort?`;
        state.chatStep = 1;
        break;

      case 1:
        // Extract severity score
        const numMatch = userText.match(/\d+/);
        const score = numMatch ? parseInt(numMatch[0]) : 5;
        state.severity = Math.min(Math.max(score, 1), 10);
        
        // If severe pain combined with cardio cues, elevate triage
        if (state.severity >= 8 && state.suggestedSpeciality === 'Cardiology') {
          state.triageLevel = 'High';
        }

        updateLiveBriefUI();

        reply = `Understood. Symptom severity recorded as ${state.severity}/10. How long have you been experiencing this? (e.g. 2 days, 1 week)`;
        state.chatStep = 2;
        break;

      case 2:
        // Extract duration
        state.duration = userText.trim();
        
        updateLiveBriefUI();

        reply = `Got it, duration: ${state.duration}. Lastly, do you have any relevant medical history, allergies, or are you taking daily medication? (Type 'none' if not applicable)`;
        state.chatStep = 3;
        break;

      case 3:
        // Extract clinical history
        state.history = userText.trim();
        state.notes = `Patient describes onset of ${state.symptoms.join(', ')} rated at a severity of ${state.severity}/10 lasting for ${state.duration}. Medical History factors: ${state.history}.`;
        
        updateLiveBriefUI();
        
        // Enable booking
        if (briefBookBtn) briefBookBtn.removeAttribute('disabled');

        reply = "Excellent. I have updated your AI Clinical Case Brief. It is fully compiled and ready. Please click the **'Schedule Consult with Brief'** button in the sidebar to secure your specialist's appointment. Your brief will be sent over instantly.";
        state.chatStep = 4;
        break;

      default:
        reply = "Your diagnostic brief has been successfully compiled. You can click 'Schedule Consult with Brief' to book your consultation, or switch to the Clinician Dashboard using the widget in the bottom corner to review your case transcript.";
    }

    appendMessage(reply, 'ai');
  }, 800);
}

function updateLiveBriefUI() {
  if (!briefTriage) return;

  // 1. Triage Badge classes
  briefTriage.textContent = state.triageLevel;
  briefTriage.className = 'triage-badge';
  if (state.triageLevel === 'High') {
    briefTriage.classList.add('badge-red');
  } else if (state.triageLevel === 'Moderate') {
    briefTriage.classList.add('badge-orange');
  } else if (state.triageLevel === 'Low') {
    briefTriage.classList.add('badge-green');
  } else {
    briefTriage.classList.add('badge-gray');
  }

  // 2. Symptoms
  briefSymptoms.innerHTML = '';
  if (state.symptoms.length > 0) {
    state.symptoms.forEach(s => {
      const tag = document.createElement('span');
      tag.className = 'symptom-tag';
      tag.innerHTML = `&#10003; ${s}`;
      briefSymptoms.appendChild(tag);
    });
  } else {
    briefSymptoms.innerHTML = '<span class="no-data">None reported yet</span>';
  }

  // 3. Severity
  briefSeverityBar.style.width = `${state.severity * 10}%`;
  briefSeverityText.textContent = state.severity > 0 ? `${state.severity} / 10` : 'Not rated';
  
  // Color the bar based on severity
  if (state.severity >= 8) {
    briefSeverityBar.style.background = '#ef4444';
  } else if (state.severity >= 5) {
    briefSeverityBar.style.background = '#f97316';
  } else {
    briefSeverityBar.style.background = 'linear-gradient(90deg, var(--green-bright), var(--blue-bright))';
  }

  // 4. Duration & Speciality
  briefDuration.textContent = state.duration;
  briefDept.textContent = state.suggestedSpeciality;

  // 5. Notes
  if (state.notes) {
    briefNotes.textContent = state.notes;
  } else {
    briefNotes.textContent = 'Describe your symptoms in the chat. The AI will extract clinical details and formulate a doctor\'s brief in real time.';
  }
}

function handleChatSend() {
  const text = chatInput.value.trim();
  if (!text) return;
  processUserMessage(text);
}

if (sendBtn) sendBtn.addEventListener('click', handleChatSend);
if (chatInput) chatInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleChatSend();
});

// Setup click on "Schedule Consult with Brief" button
if (briefBookBtn) {
  briefBookBtn.addEventListener('click', () => {
    state.selectedSpeciality = state.suggestedSpeciality;
    openModal('bookingModal');
  });
}


// ─── DOCTOR CONSULTATION BOOKING WIZARD ───
let bookingStep = 1;

function initBookingWizard() {
  bookingStep = 1;
  goToBookingStep(1);
  
  // Select specialty card according to state.selectedSpeciality
  document.querySelectorAll('.speciality-card').forEach(card => {
    if (card.dataset.speciality === state.selectedSpeciality) {
      card.classList.add('active');
    } else {
      card.classList.remove('active');
    }
  });

  // Bind specialty card click event
  document.querySelectorAll('.speciality-card').forEach(card => {
    card.onclick = function() {
      document.querySelectorAll('.speciality-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.selectedSpeciality = card.dataset.speciality;
    };
  });
}

function goToBookingStep(step) {
  bookingStep = step;
  
  // Update step indicators
  document.querySelectorAll('.b-step').forEach((el, index) => {
    if (index + 1 === step) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Show proper pane
  document.querySelectorAll('.wizard-pane').forEach((el, index) => {
    if (index + 1 === step) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  });

  // Load resources depending on step
  if (step === 2) {
    loadDoctors();
  } else if (step === 3) {
    loadDateTimeSlots();
  }
}

function loadDoctors() {
  const container = document.getElementById('doctorListContainer');
  container.innerHTML = '';
  
  const docs = doctorsData[state.selectedSpeciality] || [];
  
  docs.forEach((doc, idx) => {
    const card = document.createElement('div');
    card.className = `doctor-card ${idx === 0 ? 'active' : ''}`;
    if (idx === 0) state.selectedDoctor = doc;

    card.innerHTML = `
      <div class="doc-info">
        <div class="doc-avatar">${doc.avatar}</div>
        <div class="doc-details">
          <h5>${doc.name}</h5>
          <p>${state.selectedSpeciality} Specialist</p>
          <div class="doc-rating">★ <span>${doc.rating} (Verified)</span></div>
        </div>
      </div>
      <div class="doc-meta">
        <div class="doc-fee">${doc.fee}</div>
        <div class="doc-avail">${doc.avail}</div>
      </div>
    `;

    card.onclick = () => {
      document.querySelectorAll('.doctor-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      state.selectedDoctor = doc;
    };

    container.appendChild(card);
  });
}

function loadDateTimeSlots() {
  const dateContainer = document.getElementById('dateChipsContainer');
  const timeContainer = document.getElementById('timeChipsContainer');
  dateContainer.innerHTML = '';
  timeContainer.innerHTML = '';

  // 1. Generate dates
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  for (let i = 0; i < 4; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const dayName = days[d.getDay()];
    const dateNum = d.getDate();
    const monthName = months[d.getMonth()];
    const dateString = `${dayName}, ${dateNum} ${monthName}`;
    
    const chip = document.createElement('div');
    chip.className = `date-chip ${i === 0 ? 'active' : ''}`;
    if (i === 0) state.selectedDate = dateString;
    chip.innerHTML = `${dayName} <span>${dateNum} ${monthName}</span>`;
    
    chip.onclick = () => {
      document.querySelectorAll('.date-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.selectedDate = dateString;
    };
    
    dateContainer.appendChild(chip);
  }

  // 2. Generate times
  const times = ['09:00 AM', '10:30 AM', '11:15 AM', '02:00 PM', '03:30 PM', '04:45 PM'];
  times.forEach((time, idx) => {
    const chip = document.createElement('div');
    chip.className = `time-chip ${idx === 0 ? 'active' : ''}`;
    if (idx === 0) state.selectedTime = time;
    chip.textContent = time;

    chip.onclick = () => {
      document.querySelectorAll('.time-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      state.selectedTime = time;
    };

    timeContainer.appendChild(chip);
  });
}

async function submitBooking() {
  // 1) must be logged in  2) save the appointment (with the AI brief) in MongoDB
  if (!CareVisionAPI.isLoggedIn()) { CareVisionAuth.open('Please log in to confirm your booking'); return; }
  let meetLink;
  try {
    const res = await CareVisionAPI.bookAppointment({
      doctorName: state.selectedDoctor.name,
      date: state.selectedDate,
      slot: state.selectedTime,
      symptomBrief: {
        symptoms: state.symptoms, severity: state.severity, duration: state.duration,
        history: state.history, triageLevel: state.triageLevel, notes: state.notes,
        chatLog: state.chatTranscript // lets the doctor read the AI conversation
      }
    });
    meetLink = res.appointment.meetLink;
  } catch (e) { alert(e.message); return; }

  const receipt = document.getElementById('bookingReceipt');
  const lobbyLink = document.getElementById('lobbyLink');
  
  const virtualLink = meetLink; // real Jitsi room link created by the server
  lobbyLink.href = virtualLink;
  
  receipt.innerHTML = `
    <div class="receipt-row"><span class="lbl">Specialist:</span><strong>${state.selectedDoctor.name}</strong></div>
    <div class="receipt-row"><span class="lbl">Speciality:</span><span>${state.selectedSpeciality}</span></div>
    <div class="receipt-row"><span class="lbl">Date / Time:</span><strong>${state.selectedDate} @ ${state.selectedTime}</strong></div>
    <div class="receipt-row"><span class="lbl">Assessment Brief:</span><span style="color:var(--green-light)">Attached &amp; Transmitted</span></div>
    <div class="receipt-row"><span class="lbl">Consultation Cost:</span><strong>${state.selectedDoctor.fee}</strong></div>
  `;

  // The doctor sees this booking in the Clinician Workspace, loaded from the backend.
  goToBookingStep(4);
}


// ─── HEALTH TOOLS (BMI & DIABETES) ───
function switchToolsTab(tab) {
  document.querySelectorAll('.tools-tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tools-tab-content').forEach(el => el.classList.remove('active'));

  if (tab === 'bmi') {
    document.querySelector('.tools-tab[onclick*="bmi"]').classList.add('active');
    document.getElementById('toolsTabBMI').classList.add('active');
  } else {
    document.querySelector('.tools-tab[onclick*="diabetes"]').classList.add('active');
    document.getElementById('toolsTabDiabetes').classList.add('active');
    initDiabetesQuiz();
  }
}

// BMI Calculator
function calculateBMI() {
  const hInput = document.getElementById('bmiHeight');
  const wInput = document.getElementById('bmiWeight');
  
  const height = parseFloat(hInput.value);
  const weight = parseFloat(wInput.value);

  document.getElementById('bmiHeightVal').textContent = height;
  document.getElementById('bmiWeightVal').textContent = weight;

  const heightM = height / 100;
  const bmi = (weight / (heightM * heightM)).toFixed(1);

  document.getElementById('bmiScoreText').textContent = bmi;
  
  const statusEl = document.getElementById('bmiStatusText');
  const adviceEl = document.getElementById('bmiAdviceText');
  
  if (bmi < 18.5) {
    statusEl.textContent = 'Underweight';
    statusEl.style.color = '#60a5fa';
    adviceEl.textContent = 'Your BMI indicates underweight. We recommend speaking with a general physician or dietitian to guide your muscle mass and caloric nutrition strategy.';
  } else if (bmi >= 18.5 && bmi < 24.9) {
    statusEl.textContent = 'Normal';
    statusEl.style.color = 'var(--green-light)';
    adviceEl.textContent = 'Your BMI is in the healthy range. Maintaining a balanced diet and exercising regularly supports cardiovascular and metabolic longevity.';
  } else if (bmi >= 25 && bmi < 29.9) {
    statusEl.textContent = 'Overweight';
    statusEl.style.color = '#fb923c';
    adviceEl.textContent = 'Your BMI shows overweight. Incorporating active cardiovascular exercises and tracking daily sugar intake can prevent metabolic transitions.';
  } else {
    statusEl.textContent = 'Obese';
    statusEl.style.color = '#ef4444';
    adviceEl.textContent = 'BMI indicates clinical obesity. We recommend checking HbA1c indices, consulting our endocrinology specialists, and mapping lifestyle care plans.';
  }
}

// Diabetes Quiz Controller
function initDiabetesQuiz() {
  currentQuizIndex = 0;
  quizScores = new Array(diabetesQuestions.length).fill(0);
  
  document.getElementById('diabetesQuizResult').style.display = 'none';
  document.getElementById('diabetesQuizContainer').style.display = 'block';
  document.querySelector('.quiz-footer').style.display = 'flex';
  
  renderQuizQuestion();
}

function renderQuizQuestion() {
  const container = document.getElementById('diabetesQuizContainer');
  const currentQ = diabetesQuestions[currentQuizIndex];
  
  container.innerHTML = `
    <div class="diabetes-quiz-slide">
      <h5>Question ${currentQuizIndex + 1} of ${diabetesQuestions.length}</h5>
      <h4 style="margin-top:0.5rem;font-weight:600">${currentQ.q}</h4>
      <div class="quiz-options">
        ${currentQ.options.map((opt, idx) => `
          <div class="quiz-option" data-points="${opt.points}" onclick="selectQuizOption(${idx}, ${opt.points})">
            <div class="quiz-dot"></div>
            <span>${opt.text}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Toggle prev button visibility
  document.getElementById('quizPrevBtn').style.display = currentQuizIndex > 0 ? 'inline-block' : 'none';
  document.getElementById('quizNextBtn').textContent = currentQuizIndex === diabetesQuestions.length - 1 ? 'See Results' : 'Next Question \u2192';
}

function selectQuizOption(optionIdx, points) {
  document.querySelectorAll('.quiz-option').forEach((el, idx) => {
    if (idx === optionIdx) {
      el.classList.add('selected');
    } else {
      el.classList.remove('selected');
    }
  });

  quizScores[currentQuizIndex] = points;
}

function prevQuizQuestion() {
  if (currentQuizIndex > 0) {
    currentQuizIndex--;
    renderQuizQuestion();
  }
}

function nextQuizQuestion() {
  // Enforce selecting an option
  const activeSelected = document.querySelector('.quiz-option.selected');
  if (!activeSelected) {
    alert('Please choose an answer option to proceed.');
    return;
  }

  if (currentQuizIndex < diabetesQuestions.length - 1) {
    currentQuizIndex++;
    renderQuizQuestion();
  } else {
    showQuizResults();
  }
}

function showQuizResults() {
  document.getElementById('diabetesQuizContainer').style.display = 'none';
  document.querySelector('.quiz-footer').style.display = 'none';
  
  const totalPoints = quizScores.reduce((a, b) => a + b, 0);
  const maxPoints = 8;
  const riskPct = Math.round((totalPoints / maxPoints) * 100);
  
  document.getElementById('diabetesQuizResult').style.display = 'block';
  document.getElementById('diabetesRiskPct').textContent = `${riskPct}%`;
  
  // Update gauge circle offset
  // Circumference = 2 * PI * r = 2 * 3.14159 * 40 = 251.2
  const circ = 251.2;
  const strokeOffset = circ - (riskPct / 100) * circ;
  const meter = document.getElementById('diabetesRiskMeter');
  meter.style.strokeDashoffset = strokeOffset;

  const category = document.getElementById('diabetesRiskCategory');
  const advice = document.getElementById('diabetesRiskAdvice');

  if (riskPct < 25) {
    category.textContent = 'Low Risk';
    category.style.color = 'var(--green-light)';
    meter.style.stroke = 'var(--green-bright)';
    advice.textContent = 'Excellent. Your glycemic biomarkers and habits reflect low risk index. Continue focusing on metabolic balance and regular physiological activities.';
  } else if (riskPct >= 25 && riskPct < 60) {
    category.textContent = 'Moderate Risk';
    category.style.color = '#fb923c';
    meter.style.stroke = '#fb923c';
    advice.textContent = 'Your results suggest moderate indicators. We recommend monitoring carbohydrate/refined food counts, committing to weekly cardio, and tracking clinical glucose benchmarks.';
  } else {
    category.textContent = 'High Risk';
    category.style.color = '#ef4444';
    meter.style.stroke = '#ef4444';
    advice.textContent = 'Alert: High glycemic/demographic markers detected. We suggest tracking standard HbA1c scores, reviewing dietary components with a physician, and scheduling a consulting slot.';
  }
}

function restartDiabetesQuiz() {
  initDiabetesQuiz();
}


// ─── AI SKINCARE SCANNER SIMULATOR ───
let cameraStream = null;

function runSkincareScan() {
  const startBtn = document.getElementById('startScanBtn');
  const scanLogs = document.getElementById('scanLogs');
  const laser = document.getElementById('scannerLaser');
  const simulatedFace = document.getElementById('simulatedFace');
  const webcamStream = document.getElementById('webcamStream');

  startBtn.setAttribute('disabled', 'true');
  laser.classList.add('active');

  // Attempt to start webcam
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        cameraStream = stream;
        webcamStream.srcObject = stream;
        webcamStream.style.display = 'block';
        simulatedFace.style.backgroundImage = 'none'; // Hide default gradient
      })
      .catch(err => {
        console.warn("Camera access denied or unavailable, fallback to simulator", err);
      });
  }

  const logs = [
    'Initializing camera lens...',
    'Extracting facial outline...',
    'Mapping dermis topography...',
    'Calculating moisture indices...',
    'Scanning sebum secretion zones...',
    'Diagnosing capillary hyper-reactivity...',
    'Finalizing diagnostic scores...'
  ];

  let logIdx = 0;
  const interval = setInterval(() => {
    if (logIdx < logs.length) {
      scanLogs.textContent = logs[logIdx];
      logIdx++;
    } else {
      clearInterval(interval);
      laser.classList.remove('active');
      stopWebcam();
      showSkincareResults();
    }
  }, 600);
}

function stopWebcam() {
  const webcamStream = document.getElementById('webcamStream');
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  if (webcamStream) {
    webcamStream.style.display = 'none';
    webcamStream.srcObject = null;
  }
  const simulatedFace = document.getElementById('simulatedFace');
  if (simulatedFace) {
    simulatedFace.style.backgroundImage = 'radial-gradient(circle, rgba(34,197,94,0.15) 0%, transparent 70%)';
  }
  const scanLogs = document.getElementById('scanLogs');
  if (scanLogs) scanLogs.textContent = 'Camera ready...';
}

function showSkincareResults() {
  document.getElementById('scanControls').style.display = 'none';
  
  const score = Math.floor(Math.random() * 20) + 75; // 75 - 95
  const hyd = Math.floor(Math.random() * 30) + 50; // 50 - 80%
  const seb = Math.floor(Math.random() * 25) + 25; // 25 - 50%
  const red = Math.floor(Math.random() * 15) + 10; // 10 - 25%

  document.getElementById('skinScoreVal').textContent = score;
  
  document.getElementById('skinHydration').textContent = `${hyd}%`;
  document.getElementById('skinHydrationBar').style.width = `${hyd}%`;

  document.getElementById('skinSebum').textContent = `${seb}%`;
  document.getElementById('skinSebumBar').style.width = `${seb}%`;

  document.getElementById('skinRedness').textContent = `${red}%`;
  document.getElementById('skinRednessBar').style.width = `${red}%`;

  const adviceText = document.getElementById('skinAdviceText');
  if (hyd < 60) {
    adviceText.textContent = 'Your hydration levels are sub-optimal. Mild sebaceous activation noticed in the T-zone. Recommended: Hyaluronic acid serum, lightweight gel-based moisturizers, and avoiding stripping alcohols.';
  } else if (seb > 40) {
    adviceText.textContent = 'Moderately high sebum readings around nasal sectors. Hydration margins look good. Suggest incorporating a Salicylic Acid (BHA) cleanser, Niacinamide serum, and a matte moisturizer.';
  } else {
    adviceText.textContent = 'Excellent overall skin parameters! Maintain normal hydration levels with a ceramide-rich barrier moisturizer, broad-spectrum sunscreen (SPF 50), and gentle cleansing cycles.';
  }

  document.getElementById('scanResults').style.display = 'block';
}

function resetSkincareScanner() {
  document.getElementById('scanResults').style.display = 'none';
  document.getElementById('scanControls').style.display = 'block';
  document.getElementById('startScanBtn').removeAttribute('disabled');
}


// ─── MEDICINE SHOP COMPARISON & CART ───
function renderMedicinesCatalog() {
  const container = document.getElementById('medListContainer');
  container.innerHTML = '';
  
  medicinesCatalog.forEach((med, idx) => {
    const item = document.createElement('div');
    item.className = 'med-item';
    item.innerHTML = `
      <div class="med-details">
        <h5>${med.name}</h5>
        <p>${med.category}</p>
      </div>
      <div style="display:flex; align-items:center">
        <div class="med-price-comp">
          <div class="med-price-row">CareVision: <span class="carevision">₹${med.carevision}</span></div>
          <div class="med-price-row">Sample market price: <span class="competitor">₹${med.competitor}</span></div>
        </div>
        <button onclick="addMedicineToCart(${idx})">Add +</button>
      </div>
    `;
    container.appendChild(item);
  });
}

function filterMedicines() {
  const search = document.getElementById('medSearchInput').value.toLowerCase();
  const container = document.getElementById('medListContainer');
  container.innerHTML = '';

  const filtered = medicinesCatalog.filter(m => m.name.toLowerCase().includes(search) || m.category.toLowerCase().includes(search));
  
  if (filtered.length === 0) {
    container.innerHTML = `<p class="empty-cart-msg" style="margin-top: 2rem">No medicines found matching search query.</p>`;
    return;
  }

  filtered.forEach((med) => {
    // Find absolute index in catalog
    const baseIdx = medicinesCatalog.findIndex(m => m.name === med.name);
    const item = document.createElement('div');
    item.className = 'med-item';
    item.innerHTML = `
      <div class="med-details">
        <h5>${med.name}</h5>
        <p>${med.category}</p>
      </div>
      <div style="display:flex; align-items:center">
        <div class="med-price-comp">
          <div class="med-price-row">CareVision: <span class="carevision">₹${med.carevision}</span></div>
          <div class="med-price-row">Sample market price: <span class="competitor">₹${med.competitor}</span></div>
        </div>
        <button onclick="addMedicineToCart(${baseIdx})">Add +</button>
      </div>
    `;
    container.appendChild(item);
  });
}

function addMedicineToCart(idx) {
  const med = medicinesCatalog[idx];
  const cartItem = state.cart.find(item => item.name === med.name);
  
  if (cartItem) {
    cartItem.qty += 1;
  } else {
    state.cart.push({ name: med.name, carevision: med.carevision, competitor: med.competitor, qty: 1 });
  }
  renderCart();
}

function removeCartItem(idx) {
  state.cart.splice(idx, 1);
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cartItemsContainer');
  const summary = document.getElementById('cartSummary');
  container.innerHTML = '';
  
  if (state.cart.length === 0) {
    container.innerHTML = `<p class="empty-cart-msg">Your cart is empty.</p>`;
    summary.style.display = 'none';
    return;
  }

  let totalCV = 0;
  let totalComp = 0;

  state.cart.forEach((item, idx) => {
    totalCV += item.carevision * item.qty;
    totalComp += item.competitor * item.qty;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div>
        <strong>${item.name}</strong> <span style="color:var(--text-muted)">x${item.qty}</span>
      </div>
      <div>
        <span>₹${item.carevision * item.qty}</span>
        <span class="remove" onclick="removeCartItem(${idx})">&times;</span>
      </div>
    `;
    container.appendChild(row);
  });

  const savings = totalComp - totalCV;

  document.getElementById('cartSubtotal').textContent = `₹${totalCV.toFixed(2)}`;
  document.getElementById('cartSavingsNote').textContent = `You saved ₹${savings.toFixed(2)} vs sample vendor prices`;
  summary.style.display = 'block';
}

function checkoutMedicines() {
  alert(`Checkout simulated successfully!\nTotal paid: ${document.getElementById('cartSubtotal').textContent}\nOrder confirmed for home sample delivery.`);
  state.cart = [];
  closeModal();
}


// ─── CLINICIAN WORKSPACE (doctor EHR) - connected to the backend ───
// Data comes from CareVisionAPI.doctorQueue(); closing a case calls CareVisionAPI.completeCase().
// Everything a patient typed (name, symptoms, chat) is inserted with textContent, never innerHTML,
// so a malicious patient cannot run script in the doctor's browser.
const doctorDashboard = document.getElementById('doctorDashboard');
let prescriptionsList = [];

const dom = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

// Opened by the Clinician Portal buttons and right after a doctor logs in. Doctors only.
function openClinicianWorkspace() {
  const user = CareVisionAPI.getUser();
  if (!user) return CareVisionAuth.open('Clinician Portal - doctors only. Please log in with your clinic account.', 'login', 'doctor');
  if (user.role !== 'doctor') return CV.toast('The Clinician Portal is for doctors. Patients can use "My Dashboard".', 'warn');
  doctorDashboard.classList.add('active');
  document.body.classList.add('ehr-open');   // hides patient-only floating buttons
  initDoctorDashboard();
}

function closeClinicianWorkspace() {
  doctorDashboard.classList.remove('active');
  document.body.classList.remove('ehr-open');
}

async function initDoctorDashboard() {
  prescriptionsList = [];
  const list = document.getElementById('ehrQueue');
  list.replaceChildren(dom('li', 'empty-list', 'Loading patients...'));
  try {
    const { queue } = await CareVisionAPI.doctorQueue();
    state.ehrQueue = queue.map(toEhrPatient);
  } catch (e) {
    state.ehrQueue = [];
    CV.toast('Could not load your queue: ' + e.message, 'bad');
  }
  if (!state.ehrQueue.some(p => p.id === state.activeEhrPatientId)) {
    state.activeEhrPatientId = state.ehrQueue.length ? state.ehrQueue[0].id : '';
  }
  renderEhrQueue();
  loadEhrActivePatient();
}

// appointment (from the API) -> the shape the workspace UI uses
function toEhrPatient(a) {
  const b = a.symptomBrief || {};
  const u = a.userId || {};
  return {
    id: a._id, userId: u._id, name: u.name || 'Patient', email: u.email || '', phone: u.phone || '',
    date: a.date, slot: a.slot, meetLink: a.meetLink,
    symptoms: b.symptoms && b.symptoms.length ? b.symptoms : ['General consultation'],
    severity: b.severity || 0, duration: b.duration || 'Not given', history: b.history || 'None reported',
    triageLevel: b.triageLevel || 'Low', notes: b.notes || '', chatLog: b.chatLog || []
  };
}

function renderEhrQueue() {
  const container = document.getElementById('ehrQueue');
  container.replaceChildren();
  if (!state.ehrQueue.length) {
    container.append(dom('li', 'empty-list', 'No patients waiting. 🎉'));
    return;
  }
  state.ehrQueue.forEach(p => {
    const item = dom('li', `patient-queue-item ${p.id === state.activeEhrPatientId ? 'active' : ''}`);
    const dot = p.triageLevel === 'High' ? 'red' : p.triageLevel === 'Moderate' ? 'orange' : 'green';
    const meta = dom('div', 'pq-meta');
    meta.append(dom('span', 'pq-name', p.name), dom('span', 'pq-symptom', p.symptoms.join(', ')));
    item.append(meta, dom('div', `pq-dot ${dot}`));
    item.onclick = () => {
      state.activeEhrPatientId = p.id;
      document.querySelectorAll('.patient-queue-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      loadEhrActivePatient();
    };
    container.appendChild(item);
  });
}

function loadEhrActivePatient() {
  const patient = state.ehrQueue.find(p => p.id === state.activeEhrPatientId);
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  const pill = document.getElementById('ehrPatientTriage');
  const join = document.getElementById('ehrJoinBtn');
  const logContainer = document.getElementById('ehrChatLog');
  const records = document.getElementById('ehrRecords');

  document.getElementById('ehrDiagInput').value = '';
  document.getElementById('ehrLabsInput').value = '';
  prescriptionsList = [];
  renderEhrPrescriptionBuilder();

  if (!patient) {   // empty queue
    set('ehrPatientName', 'No patient selected');
    set('ehrPatientMeta', 'Select a patient from the queue');
    pill.textContent = 'No active case'; pill.className = 'triage-status-pill';
    set('ehrSymptomsText', '-'); set('ehrSeverityText', '-'); set('ehrDurationText', '-');
    set('ehrInferenceText', 'Patients who book a consultation with you will appear in the queue.');
    join.hidden = true;
    logContainer.replaceChildren(dom('span', 'empty-list', 'No chat transcript.'));
    records.replaceChildren(dom('span', 'empty-list', 'No patient selected.'));
    return;
  }

  set('ehrPatientName', patient.name);
  set('ehrPatientMeta', `${patient.date} at ${patient.slot} · ${patient.email}${patient.phone ? ' · ' + patient.phone : ''} · Case CV-${String(patient.id).slice(-6).toUpperCase()}`);
  pill.textContent = `${patient.triageLevel} Triage Risk`;
  pill.className = 'triage-status-pill ' + (patient.triageLevel === 'High' ? 'badge-red' : patient.triageLevel === 'Moderate' ? 'badge-orange' : 'badge-green');

  set('ehrSymptomsText', patient.symptoms.join(', '));
  set('ehrSeverityText', patient.severity ? `${patient.severity} / 10` : 'Not given');
  set('ehrDurationText', patient.duration);
  set('ehrInferenceText', patient.notes || 'No AI summary was attached to this booking.');

  join.href = patient.meetLink || '#';
  join.hidden = !patient.meetLink;

  logContainer.replaceChildren();
  if (patient.chatLog.length) {
    patient.chatLog.forEach(log => {
      const row = dom('div', 'log-row');
      row.append(dom('span', `sender ${log.sender}`, log.sender === 'ai' ? 'CareVision AI:' : 'Patient:'), document.createTextNode(' '), dom('span', 'text', log.text));
      logContainer.appendChild(row);
    });
  } else {
    logContainer.appendChild(dom('span', 'empty-list', 'No chat transcript available.'));
  }

  loadEhrRecords(patient);
}

// The patient's AI analyses / reports / uploads (only available for patients who booked with this doctor)
async function loadEhrRecords(patient) {
  const box = document.getElementById('ehrRecords');
  box.replaceChildren(dom('span', 'empty-list', 'Loading patient records...'));
  try {
    const { results, reports } = await CareVisionAPI.patientRecords(patient.userId);
    if (state.activeEhrPatientId !== patient.id) return;   // doctor already clicked another patient
    box.replaceChildren();
    const names = { imaging: '🩻 Scan / report analysis', skin: '🌸 Skin analysis', report: '📄 AI Health Report' };
    results.forEach(r => {
      const row = dom('div', 'log-row');
      row.append(dom('strong', null, names[r.agent] || r.agent), document.createTextNode(` ${r.urgency ? '(' + r.urgency + ') ' : ''}- ${r.summary || ''} `));
      if (r.agent === 'report') {
        const v = dom('a', null, 'View report'); v.href = '#';
        v.onclick = (e) => { e.preventDefault(); Recommend.showReport(r.result); };
        row.append(v);
      }
      box.appendChild(row);
    });
    reports.forEach(r => {
      const row = dom('div', 'log-row');
      row.append(dom('strong', null, `📎 ${r.originalName}`), document.createTextNode(` - ${r.aiSummary || ''} ${(r.findings || []).join('; ')}`));
      box.appendChild(row);
    });
    if (!box.children.length) box.appendChild(dom('span', 'empty-list', 'This patient has no AI reports or uploads yet.'));
  } catch (e) {
    box.replaceChildren(dom('span', 'empty-list', e.message));
  }
}

function addMedToEhrPrescription() {
  const medSelect = document.getElementById('ehrMedSelect');
  const dosageInput = document.getElementById('ehrDosageInput');
  const med = medSelect.value;
  const dosage = dosageInput.value.trim();

  if (!med) { CV.toast('Select a medication first.', 'warn'); return; }
  if (!dosage) { CV.toast('Enter the dosage instructions (e.g. once daily).', 'warn'); return; }

  prescriptionsList.push({ med: med, dosage: dosage });
  medSelect.value = '';
  dosageInput.value = '';
  renderEhrPrescriptionBuilder();
}

function removeEhrPrescribedItem(idx) {
  prescriptionsList.splice(idx, 1);
  renderEhrPrescriptionBuilder();
}

function renderEhrPrescriptionBuilder() {
  const container = document.getElementById('ehrPrescriptionsList');
  container.replaceChildren();
  if (prescriptionsList.length === 0) {
    container.appendChild(dom('p', 'empty-list', 'No medications prescribed yet.'));
    return;
  }
  prescriptionsList.forEach((item, idx) => {
    const row = dom('div', 'prescription-item');
    const left = dom('div');
    left.append(dom('strong', null, item.med), document.createTextNode(' — '), dom('span', null, item.dosage));
    const rm = dom('span', 'remove', '×');
    rm.onclick = () => removeEhrPrescribedItem(idx);
    row.append(left, rm);
    container.appendChild(row);
  });
}

// Saves the diagnosis + prescription in MongoDB; the patient sees it in their dashboard.
async function submitClinicalCase() {
  const patient = state.ehrQueue.find(p => p.id === state.activeEhrPatientId);
  if (!patient) { CV.toast('Select a patient from the queue first.', 'warn'); return; }
  const diag = document.getElementById('ehrDiagInput').value.trim();
  if (!diag) { CV.toast('Please enter the diagnosis before closing the case.', 'warn'); return; }

  const btn = document.getElementById('ehrSubmitBtn');
  btn.disabled = true;
  try {
    await CareVisionAPI.completeCase(patient.id, {
      diagnosis: diag,
      prescription: prescriptionsList.map(i => `${i.med} - ${i.dosage}`),
      followUp: document.getElementById('ehrLabsInput').value.trim()
    });
    CV.toast(`Case closed for ${patient.name}. The prescription is now in their dashboard.`, 'good');
    state.ehrQueue = state.ehrQueue.filter(p => p.id !== patient.id);
    state.activeEhrPatientId = state.ehrQueue.length ? state.ehrQueue[0].id : '';
    renderEhrQueue();
    loadEhrActivePatient();
  } catch (e) {
    CV.toast(e.message, 'bad');
  } finally {
    btn.disabled = false;
  }
}


// ─── BIND SERVICES TO MODAL WINDOWS ───
document.addEventListener('DOMContentLoaded', () => {
  const servicesMap = {
    'service-consultation': 'bookingModal',
    'service-medicines': 'medicinesModal',
    // labs, scans, care plans, corporate and skincare are handled in js/services.js
    'service-trackers': 'toolsModal'
  };

  Object.entries(servicesMap).forEach(([cardId, modalId]) => {
    const card = document.getElementById(cardId);
    if (card) {
      card.addEventListener('click', () => {
        // Preset specialities based on click mapping where helpful
        if (cardId === 'service-skincare') {
          state.selectedSpeciality = 'Dermatology';
        } else if (cardId === 'service-scans') {
          state.selectedSpeciality = 'General Medicine';
        }
        
        // Show proper tab inside Tools Hub modal
        if (modalId === 'toolsModal') {
          if (cardId === 'service-labs' || cardId === 'service-care-plans') {
            switchToolsTab('diabetes');
          } else {
            switchToolsTab('bmi');
          }
        }

        openModal(modalId);
      });
    }
  });

  // Setup landing page links
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href || href.length < 2) return; // plain "#" links are wired in js/ui.js
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Set Nav scroll actions
  const navEl = document.querySelector('nav');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      navEl.style.boxShadow = '0 4px 30px rgba(0,0,0,0.4)';
    } else {
      navEl.style.boxShadow = 'none';
    }
  });

  // Observe statistics numbers
  const statNums = document.querySelectorAll('.stat-num');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateCounter(entry.target);
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.5 });
    statNums.forEach(el => observer.observe(el));
  }
});

/**
 * Animate a statistics value
 */
function animateCounter(el) {
  const raw    = el.textContent.trim();
  const numStr = raw.match(/[\d.]+/);
  if (!numStr) return;

  const target   = parseFloat(numStr[0]);
  const suffix   = raw.replace(numStr[0], '');
  const duration = 1500;
  const start    = performance.now();

  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    const current  = (target * eased).toFixed(target % 1 !== 0 ? 1 : 0);
    el.textContent = current + suffix;
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}
