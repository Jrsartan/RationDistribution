// ═══════════════════════════════════════════════
//  RationSetu - Main JavaScript File
//  Handles: Fingerprint, Weight, UI, Alerts
// ═══════════════════════════════════════════════

// ─────────────────────────────────────────────
// FINGERPRINT FUNCTIONS
// ─────────────────────────────────────────────

let fingerprintVerified = false;
let scanInterval = null;

function scanFingerprint() {
    const statusDiv = document.getElementById('fingerStatus');
    const scanBtn   = document.getElementById('scanBtn');

    if (!statusDiv) return;

    // Reset
    fingerprintVerified = false;
    document.getElementById('addUserSection').style.display = 'none';

    // Show scanning status
    statusDiv.className = 'finger-status scanning';
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '🔄 Scanning... Please place your finger on sensor';

    if (scanBtn) {
        scanBtn.disabled = true;
        scanBtn.textContent = '🔄 Scanning...';
    }

    // Send scan command to Flask
    fetch('/api/scan_fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(response => response.json())
    .then(data => {
        console.log('Scan initiated:', data);
        if (data.status === 'demo_mode') {
            // Demo mode - simulate success
            setTimeout(() => {
                statusDiv.className = 'finger-status success';
                statusDiv.innerHTML = '✅ Fingerprint Verified! (Demo Mode) ID: 1';
                fingerprintVerified = true;
                showAddUserSection('1');
                resetScanButton();
            }, 2000);
        } else {
            // Real ESP32 mode - poll for result
            pollFingerprintStatus();
        }
    })
    .catch(error => {
        console.error('Error:', error);
        statusDiv.className = 'finger-status error';
        statusDiv.innerHTML = '❌ Connection Error. Running in Demo Mode.';
        // Demo fallback
        setTimeout(() => {
            fingerprintVerified = true;
            showAddUserSection('1');
            resetScanButton();
        }, 2000);
    });
}


// Poll fingerprint status from ESP32
function pollFingerprintStatus() {
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds timeout

    scanInterval = setInterval(() => {
        fetch('/api/fingerprint_status')
        .then(response => response.json())
        .then(data => {
            attempts++;

            if (data.verified) {
                clearInterval(scanInterval);
                const statusDiv = document.getElementById('fingerStatus');
                statusDiv.className = 'finger-status success';
                statusDiv.innerHTML = '✅ Fingerprint Verified! ID: ' + data.id;
                fingerprintVerified = true;
                showAddUserSection(data.id);
                resetScanButton();

            } else if (attempts >= maxAttempts) {
                clearInterval(scanInterval);
                const statusDiv = document.getElementById('fingerStatus');
                statusDiv.className = 'finger-status error';
                statusDiv.innerHTML = '❌ Timeout! Fingerprint not recognized. Try again.';
                resetScanButton();
            }
        })
        .catch(error => {
            clearInterval(scanInterval);
            console.error('Polling error:', error);
        });
    }, 1000);
}


// Show Add User section after fingerprint verified
function showAddUserSection(fingerId) {
    const section = document.getElementById('addUserSection');
    const fingerIdInput = document.getElementById('fingerIdDisplay');

    if (section) {
        section.style.display = 'block';
    }
    if (fingerIdInput) {
        fingerIdInput.textContent = fingerId;
    }

    // Store finger ID in session storage
    sessionStorage.setItem('fingerId', fingerId);
}


// Reset scan button
function resetScanButton() {
    const scanBtn = document.getElementById('scanBtn');
    if (scanBtn) {
        scanBtn.disabled = false;
        scanBtn.textContent = '🖐 Scan Fingerprint';
    }
}


// Check fingerprint before going to add user
function checkAndProceed() {
    if (!fingerprintVerified) {
        showAlert('warning', '⚠️ Please scan fingerprint first!');
        return;
    }
    const fingerId = sessionStorage.getItem('fingerId') || '0';
    window.location.href = '/add_user?finger_id=' + fingerId;
}


// ─────────────────────────────────────────────
// ENROLL FINGERPRINT
// ─────────────────────────────────────────────

function enrollFingerprint(fingerId) {
    const statusDiv = document.getElementById('enrollStatus');

    if (statusDiv) {
        statusDiv.className = 'finger-status scanning';
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = '🔄 Enrolling fingerprint ID: ' + fingerId + 
                              '<br>Place finger on sensor...';
    }

    fetch('/api/enroll_fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ finger_id: fingerId })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Enroll response:', data);
        if (statusDiv) {
            statusDiv.className = 'finger-status success';
            statusDiv.innerHTML = '✅ Fingerprint enrolled with ID: ' + data.id;
        }
    })
    .catch(error => {
        console.error('Enroll error:', error);
        if (statusDiv) {
            statusDiv.className = 'finger-status error';
            statusDiv.innerHTML = '❌ Enrollment failed. Try again.';
        }
    });
}


// ─────────────────────────────────────────────
// WEIGHT / LOAD CELL FUNCTIONS
// ─────────────────────────────────────────────

let weightInterval = null;

function startWeightMonitor() {
    const weightDisplay = document.getElementById('weightVal');
    if (!weightDisplay) return;

    weightInterval = setInterval(() => {
        fetch('/api/get_weight')
        .then(response => response.json())
        .then(data => {
            weightDisplay.textContent = data.weight + ' kg';

            // Check if target weight reached
            const targetWeight = parseFloat(
                document.getElementById('targetWeight')?.textContent || 0
            );
            const currentWeight = parseFloat(data.weight);

            if (targetWeight > 0 && currentWeight >= targetWeight * 0.95) {
                showAlert('success', '✅ Target weight reached! Dispensing complete.');
                clearInterval(weightInterval);
            }
        })
        .catch(error => {
            weightDisplay.textContent = 'Sensor Error';
        });
    }, 1500);
}


function stopWeightMonitor() {
    if (weightInterval) {
        clearInterval(weightInterval);
        weightInterval = null;
    }
}


function tareScale() {
    fetch('/api/tare_scale', { method: 'POST' })
    .then(response => response.json())
    .then(data => {
        showAlert('success', '⚖️ Scale tared (zeroed) successfully!');
    })
    .catch(error => {
        showAlert('error', '❌ Could not tare scale.');
    });
}


// ─────────────────────────────────────────────
// RATION DISTRIBUTION FUNCTIONS
// ─────────────────────────────────────────────

function selectCommodity(commodityId) {
    // Highlight selected row
    document.querySelectorAll('.ration-row').forEach(row => {
        row.style.background = '';
    });

    const selectedRow = document.getElementById('row_' + commodityId);
    if (selectedRow) {
        selectedRow.style.background = 'rgba(106, 90, 205, 0.1)';
    }

    // Focus quantity input
    const qtyInput = document.getElementById('qty_' + commodityId);
    if (qtyInput) {
        qtyInput.focus();
        qtyInput.style.background = '#e8f5e9';
    }

    // Reset other qty inputs
    document.querySelectorAll('.qty-input').forEach(input => {
        if (input.id !== 'qty_' + commodityId) {
            input.style.background = '';
        }
    });
}


function submitRation(commodityId, commodityName, eligibilityQty) {
    const qtyInput = document.getElementById('qty_' + commodityId);
    const qty = parseFloat(qtyInput?.value || 0);

    // Validation
    if (!qty || qty <= 0) {
        showAlert('warning', '⚠️ Please enter a valid quantity!');
        return;
    }

    if (qty > eligibilityQty) {
        showAlert('warning', 
            '⚠️ Quantity ' + qty + ' exceeds eligibility of ' + eligibilityQty + '!');
        return;
    }

    // Confirm before submitting
    const confirmed = confirm(
        '📦 Confirm Ration Distribution:\n' +
        'Commodity : ' + commodityName + '\n' +
        'Quantity  : ' + qty + ' kg\n\n' +
        'Proceed?'
    );

    if (!confirmed) return;

    // Set hidden input and submit form
    const hiddenQty = document.getElementById('hidden_qty_' + commodityId);
    if (hiddenQty) hiddenQty.value = qty;

    document.getElementById('form_' + commodityId).submit();
}


function calculateAmount(qty, rate) {
    const amount = qty * rate;
    const amountDisplay = document.getElementById('calculatedAmount');
    if (amountDisplay) {
        amountDisplay.textContent = '₹ ' + amount.toFixed(2);
    }
    return amount;
}


// ─────────────────────────────────────────────
// ALERT / NOTIFICATION SYSTEM
// ─────────────────────────────────────────────

function showAlert(type, message) {
    // Remove existing alerts
    const existingAlert = document.getElementById('customAlert');
    if (existingAlert) existingAlert.remove();

    // Create alert
    const alert = document.createElement('div');
    alert.id = 'customAlert';
    alert.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        padding: 15px 25px;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 600;
        z-index: 9999;
        max-width: 350px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
        cursor: pointer;
    `;

    // Colors by type
    const colors = {
        success : { bg: '#4CAF50', color: '#fff' },
        error   : { bg: '#f44336', color: '#fff' },
        warning : { bg: '#ff9800', color: '#fff' },
        info    : { bg: '#2196F3', color: '#fff' }
    };

    const colorSet = colors[type] || colors.info;
    alert.style.background = colorSet.bg;
    alert.style.color       = colorSet.color;
    alert.textContent       = message;

    // Click to dismiss
    alert.onclick = () => alert.remove();

    document.body.appendChild(alert);

    // Auto dismiss after 4 seconds
    setTimeout(() => {
        if (alert.parentNode) {
            alert.style.animation = 'slideOut 0.3s ease';
            setTimeout(() => alert.remove(), 300);
        }
    }, 4000);
}


// ─────────────────────────────────────────────
// SIDEBAR TOGGLE
// ─────────────────────────────────────────────

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('mainContent');

    if (!sidebar) return;

    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        sidebar.style.width = '0';
        sidebar.style.padding = '0';
        sidebar.style.overflow = 'hidden';
    } else {
        sidebar.style.width = '230px';
        sidebar.style.padding = '20px 15px';
        sidebar.style.overflow = 'visible';
    }
}


// ─────────────────────────────────────────────
// PASSWORD VALIDATION
// ─────────────────────────────────────────────

function validatePasswordForm() {
    const newPass     = document.getElementById('new_password')?.value;
    const confirmPass = document.getElementById('confirm_password')?.value;

    if (!newPass || !confirmPass) {
        showAlert('warning', '⚠️ Please fill all fields!');
        return false;
    }

    if (newPass.length < 6) {
        showAlert('warning', '⚠️ Password must be at least 6 characters!');
        return false;
    }

    if (newPass !== confirmPass) {
        showAlert('error', '❌ New passwords do not match!');
        return false;
    }

    return true;
}


// ─────────────────────────────────────────────
// TABLE SEARCH FUNCTION
// ─────────────────────────────────────────────

function searchTable(inputId, tableId) {
    const input  = document.getElementById(inputId);
    const filter = input.value.toUpperCase();
    const table  = document.getElementById(tableId);
    const rows   = table?.getElementsByTagName('tr');

    if (!rows) return;

    for (let i = 1; i < rows.length; i++) {
        const cells = rows[i].getElementsByTagName('td');
        let found = false;

        for (let j = 0; j < cells.length; j++) {
            if (cells[j].textContent.toUpperCase().includes(filter)) {
                found = true;
                break;
            }
        }

        rows[i].style.display = found ? '' : 'none';
    }
}


// ─────────────────────────────────────────────
// DELETE USER FUNCTION
// ─────────────────────────────────────────────

function deleteUser(userId) {
    const confirmed = confirm(
        '🗑️ Are you sure you want to delete this user?\n' +
        'This action cannot be undone!'
    );

    if (!confirmed) return;

    fetch('/api/delete_user/' + userId, { method: 'DELETE' })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            showAlert('success', '✅ User deleted successfully!');
            // Remove row from table
            const row = document.getElementById('user_row_' + userId);
            if (row) {
                row.style.animation = 'fadeOut 0.3s ease';
                setTimeout(() => row.remove(), 300);
            }
        } else {
            showAlert('error', '❌ Failed to delete user.');
        }
    })
    .catch(error => {
        showAlert('error', '❌ Error: ' + error.message);
    });
}


// ─────────────────────────────────────────────
// PRINT RECEIPT FUNCTION
// ─────────────────────────────────────────────

function printReceipt() {
    const printContent = document.getElementById('receiptSection');
    if (!printContent) return;

    const originalBody  = document.body.innerHTML;
    document.body.innerHTML = printContent.innerHTML;
    window.print();
    document.body.innerHTML = originalBody;
    location.reload();
}


// ─────────────────────────────────────────────
// PAGE LOADER
// ─────────────────────────────────────────────

function showLoader() {
    const loader = document.getElementById('pageLoader');
    if (loader) loader.style.display = 'flex';
}

function hideLoader() {
    const loader = document.getElementById('pageLoader');
    if (loader) loader.style.display = 'none';
}


// ─────────────────────────────────────────────
// CSS ANIMATIONS (injected via JS)
// ─────────────────────────────────────────────

const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to   { transform: translateX(0);   opacity: 1; }
    }
    @keyframes slideOut {
        from { transform: translateX(0);   opacity: 1; }
        to   { transform: translateX(100%); opacity: 0; }
    }
    @keyframes fadeOut {
        from { opacity: 1; }
        to   { opacity: 0; }
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(-10px); }
        to   { opacity: 1; transform: translateY(0);     }
    }
`;
document.head.appendChild(style);


// ─────────────────────────────────────────────
// ON PAGE LOAD
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', function () {

    // Auto-fill finger ID if coming from manage_users
    const urlParams   = new URLSearchParams(window.location.search);
    const fingerIdParam = urlParams.get('finger_id');
    const fingerInput   = document.getElementById('finger_id');

    if (fingerIdParam && fingerInput) {
        fingerInput.value = fingerIdParam;
    }

    // Start weight monitor on payment page
    if (document.getElementById('weightVal')) {
        startWeightMonitor();
    }

    // Hamburger toggle
    const hamburger = document.getElementById('hamburgerBtn');
    if (hamburger) {
        hamburger.addEventListener('click', toggleSidebar);
    }

    // Password form validation
    const pwdForm = document.getElementById('passwordForm');
    if (pwdForm) {
        pwdForm.addEventListener('submit', function (e) {
            if (!validatePasswordForm()) {
                e.preventDefault();
            }
        });
    }

    // Search box (if exists)
    const searchBox = document.getElementById('searchBox');
    if (searchBox) {
        searchBox.addEventListener('keyup', function () {
            searchTable('searchBox', 'usersTable');
        });
    }

    console.log('✅ RationSetu JS Loaded Successfully');
});