/* ==========================================================================
   reports.js - "Upload report" modal. Sends file to /api/reports and shows
   the AI summary returned by the backend.
   ========================================================================== */
(() => {
  function build() {
    const wrap = document.createElement('div');
    wrap.id = 'cvReportOverlay';
    wrap.className = 'cv-overlay';
    wrap.innerHTML = `
      <div class="cv-box">
        <button class="cv-close" id="cvRepClose" aria-label="Close">&times;</button>
        <h3>Upload medical report</h3>
        <p class="cv-note">PDF, JPG, PNG or TXT, up to 5 MB. AI will flag values outside the normal range.</p>
        <select id="cvRepType">
          <option>Blood test</option><option>X-ray</option><option>Prescription</option><option>General</option>
        </select>
        <input type="file" id="cvRepFile" accept=".pdf,.png,.jpg,.jpeg,.txt" />
        <p class="cv-error" id="cvRepError"></p>
        <button class="btn-primary cv-submit" id="cvRepSubmit">Upload &amp; analyse</button>
        <div id="cvRepResult"></div>
      </div>`;
    document.body.appendChild(wrap);

    document.getElementById('cvRepClose').onclick = () => wrap.classList.remove('open');
    document.getElementById('cvRepSubmit').onclick = upload;

    // Floating launcher button
    const btn = document.createElement('button');
    btn.className = 'cv-fab';
    btn.textContent = '📂 Upload Report';
    btn.onclick = () => {
      if (!CareVisionAPI.isLoggedIn()) return CareVisionAuth.open('Please log in to upload reports');
      wrap.classList.add('open');
    };
    document.body.appendChild(btn);
  }

  async function upload() {
    const err = document.getElementById('cvRepError');
    const out = document.getElementById('cvRepResult');
    err.textContent = ''; out.innerHTML = '';
    const file = document.getElementById('cvRepFile').files[0];
    if (!file) { err.textContent = 'Choose a file first'; return; }
    out.textContent = 'Analysing...';
    try {
      const { report } = await CareVisionAPI.uploadReport(file, document.getElementById('cvRepType').value);
      const items = report.findings.map(f => `<li>${f}</li>`).join('');
      out.innerHTML = `<div class="cv-result"><strong>AI summary:</strong> ${report.aiSummary}<ul>${items}</ul>
        <small>AI assistance only - not a diagnosis.</small></div>`;
    } catch (e) { out.textContent = ''; err.textContent = e.message; }
  }

  document.addEventListener('DOMContentLoaded', build);
})();
