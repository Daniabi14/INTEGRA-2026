// Food Coordinator Dashboard JavaScript

let scanner = null;
let allColleges = [];
let allTokens = [];
let teamsById = new Map();
let isProcessingScan = false;
let lastScannedTokenId = null;
let lastScannedTime = 0;
const SCAN_DEBOUNCE_MS = 5000; // Ignore same token for 5 seconds
let allowFoodDelete = true; // controlled by admin setting

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await requireAuth();

        // Check if user is food coordinator
        const user = auth.currentUser;
        const email = user.email || '';
        const foodEmails = ['food@integra2026.com', 'food_co@integra.com'];

        let isFoodCoord = false;

        // 1) Hard-coded emails
        if (foodEmails.includes(email)) {
            isFoodCoord = true;
        }

        // 2) Check collection by UID
        if (!isFoodCoord) {
            const foodCoordDoc = await db.collection('foodCoordinators').doc(user.uid).get();
            if (foodCoordDoc.exists) {
                isFoodCoord = true;
            }
        }

        // 3) Fallback: check by email
        if (!isFoodCoord && email) {
            const foodByEmail = await db.collection('foodCoordinators')
                .where('email', '==', email)
                .limit(1)
                .get();
            if (!foodByEmail.empty) {
                isFoodCoord = true;
            }
        }

        if (!isFoodCoord) {
            window.location.href = 'login.html';
            return;
        }

        // Load admin settings for food dashboard (e.g., delete toggle)
        try {
            const settingsDoc = await db.collection('adminSettings').doc('main').get();
            if (settingsDoc.exists) {
                const settings = settingsDoc.data();
                // If setting is explicitly false, disable delete; otherwise allow
                allowFoodDelete = settings.foodDeleteEnabled !== false;
            }
        } catch (settingsError) {
            console.error('Error loading food settings:', settingsError);
            allowFoodDelete = true;
        }

        // Load data
        await loadColleges();
        await loadRedeemedTokens();

        // Setup event listeners
        setupEventListeners();

        // Real-time updates
        setupRealtimeUpdates();

    } catch (error) {
        console.error('Error loading food dashboard:', error);
        window.location.href = 'login.html';
    }
});

// Load colleges
async function loadColleges() {
    try {
        // Fetch tokens + teams once to avoid N+1 team lookups
        const [tokensSnapshot, teamsSnapshot] = await Promise.all([
            db.collection('foodTokens').get(),
            db.collection('teams').get()
        ]);
        allTokens = tokensSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        teamsById = new Map(teamsSnapshot.docs.map(doc => [doc.id, doc.data()]));

        const tableBody = document.getElementById('collegeTableBody');
        tableBody.innerHTML = '';

        if (allTokens.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #6b7280;">No food tokens found. Food tokens are created when teams register.</td></tr>';
            return;
        }

        // Aggregate by college to avoid duplicates, and compute totals
        const collegeData = {};
        let missingTeams = 0;
        let grandTotalTokens = 0;
        let grandTotalRedeemed = 0;

        for (const token of allTokens) {
            if (!token.teamId) {
                missingTeams++;
                continue;
            }

            const team = teamsById.get(token.teamId);
            if (team) {
                const collegeName = team.collegeName || 'Unknown College';

                if (!collegeData[collegeName]) {
                    collegeData[collegeName] = {
                        tokenCount: 0,
                        redeemed: 0
                    };
                }

                const tCount = token.tokenCount || 0;
                const tRedeemed = token.redeemed || 0;

                collegeData[collegeName].tokenCount += tCount;
                collegeData[collegeName].redeemed += tRedeemed;

                grandTotalTokens += tCount;
                grandTotalRedeemed += tRedeemed;
            } else {
                missingTeams++;
            }
        }

        if (Object.keys(collegeData).length === 0) {
            tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #6b7280;">No college data found. Teams may not be linked to food tokens.</td></tr>';
            if (missingTeams > 0) {
                console.warn(`${missingTeams} food tokens have missing team references`);
            }
            return;
        }

        // Update totals summary
        const totalSpan = document.getElementById('foodTotalTokens');
        const redeemedSpan = document.getElementById('foodTotalRedeemed');
        const remainingSpan = document.getElementById('foodTotalRemaining');
        const grandRemaining = grandTotalTokens - grandTotalRedeemed;
        if (totalSpan) totalSpan.textContent = grandTotalTokens;
        if (redeemedSpan) redeemedSpan.textContent = grandTotalRedeemed;
        if (remainingSpan) remainingSpan.textContent = grandRemaining;

        // Display aggregated data
        for (const [college, data] of Object.entries(collegeData)) {
            const remaining = data.tokenCount - data.redeemed;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${college}</td>
                <td>${data.tokenCount}</td>
                <td>${data.redeemed}</td>
                <td>${remaining}</td>
            `;
            tableBody.appendChild(row);
        }

        // Apply current search filter if any
        applyFoodCollegeSearchFilter();

    } catch (error) {
        console.error('Error loading colleges:', error);
        const tableBody = document.getElementById('collegeTableBody');
        tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem; color: #ef4444;">Error loading data. Please check console for details.</td></tr>';
        showToast('Error loading college data', 'error');
    }
}

// Load redeemed tokens
async function loadRedeemedTokens() {
    try {
        // Load from redemptions collection for individual redemption records
        const redemptionsSnapshot = await db.collection('foodRedemptions')
            .orderBy('redeemedAt', 'desc')
            .limit(100)
            .get();

        const tableBody = document.getElementById('redeemedTableBody');
        tableBody.innerHTML = '';

        if (redemptionsSnapshot.empty) {
            // No individual redemption records yet – fall back to foodTokens.redeemed per token
            const tokensCheck = await db.collection('foodTokens').limit(1).get();
            if (tokensCheck.empty) {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #6b7280;">No food tokens found. Food tokens are created when teams register.</td></tr>';
                return;
            }

            const tokensSnapshot = await db.collection('foodTokens')
                .where('redeemed', '>', 0)
                .get();

            if (tokensSnapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem; color: #6b7280;">No tokens have been redeemed yet.</td></tr>';
                return;
            }

            // One row per token with redeemed count and a delete/reset action (if allowed)
            for (const tokenDoc of tokensSnapshot.docs) {
                const token = tokenDoc.data();
                const team = token.teamId ? (teamsById.get(token.teamId) || { collegeName: 'Unknown' }) : { collegeName: 'Unknown' };

                const canDelete = allowFoodDelete;
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>
                        ${token.regId || '-'}
                        ${canDelete ? `<button class="action-btn reject mobile-delete-btn" onclick="resetTokenRedemption('${tokenDoc.id}')">Delete</button>` : ''}
                    </td>
                    <td>${team.collegeName || '-'}</td>
                    <td>${tokenDoc.id}</td>
                    <td>${formatDate(token.redeemedAt)}</td>
                    <td>
                        ${canDelete ? `<button class="action-btn reject" onclick="resetTokenRedemption('${tokenDoc.id}')">Delete</button>` : '<span style="color:#6b7280;font-size:0.85rem;">Disabled</span>'}
                    </td>
                `;
                tableBody.appendChild(row);
            }
            return;
        }

        // Display individual redemption records (redemptionsSnapshot is not empty here)
        for (const doc of redemptionsSnapshot.docs) {
            const redemption = doc.data();
            const canDelete = allowFoodDelete;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>
                    ${redemption.regId}
                    ${canDelete ? `<button class="action-btn reject mobile-delete-btn" onclick="deleteRedemption('${doc.id}')">Delete</button>` : ''}
                </td>
                <td>${redemption.collegeName}</td>
                <td>${redemption.tokenId}</td>
                <td>${formatDate(redemption.redeemedAt)}</td>
                <td>
                    ${canDelete ? `<button class="action-btn reject" onclick="deleteRedemption('${doc.id}')">Delete</button>` : '<span style="color:#6b7280;font-size:0.85rem;">Disabled</span>'}
                </td>
            `;
            tableBody.appendChild(row);
        }

        // Apply redeemed search filter if any
        applyFoodRedeemedSearchFilter();

    } catch (error) {
        console.error('Error loading redeemed tokens:', error);
    }
}

// Start scanner
async function startScanner() {
    const scannerContainer = document.getElementById('qr-reader');
    const startBtn = document.getElementById('startScannerBtn');
    const stopBtn = document.getElementById('stopScannerBtn');
    const scanResult = document.getElementById('scanResult');

    if (!scannerContainer) {
        showToast('Scanner container not found', 'error');
        return;
    }

    // Check if library is loaded (try multiple possible namespaces)
    const Html5QrcodeClass = window.Html5Qrcode || window.html5Qrcode || Html5Qrcode;
    if (typeof Html5QrcodeClass === 'undefined') {
        showToast('QR scanner library not loaded. Check your connection.', 'error');
        if (scanResult) scanResult.innerHTML = '<div class="scan-result error">QR scanner library failed to load. Please refresh the page.</div>';
        return;
    }

    try {
        startBtn.disabled = true;
        if (scanResult) scanResult.innerHTML = '<div class="scan-result info">Requesting camera access...</div>';

        // Get available cameras
        let cameras;
        try {
            cameras = await Html5QrcodeClass.getCameras();
            console.log('Cameras retrieved:', cameras);
        } catch (camError) {
            console.error('Error getting cameras:', camError);
            const errorMsg = camError.message || String(camError);
            if (errorMsg.includes('NotAllowedError') || errorMsg.includes('Permission')) {
                throw new Error('Camera permission denied. Please allow camera access in your browser settings.');
            } else if (errorMsg.includes('NotFoundError') || errorMsg.includes('no camera')) {
                throw new Error('No camera found on this device.');
            } else if (errorMsg.includes('NotReadableError') || errorMsg.includes('in use')) {
                throw new Error('Camera is in use by another application. Please close it and try again.');
            } else if (errorMsg.includes('NotSecureContext')) {
                throw new Error('Camera requires HTTPS. Please use HTTPS or localhost.');
            } else {
                throw new Error('Failed to access camera: ' + errorMsg);
            }
        }

        if (!cameras || cameras.length === 0) {
            throw new Error('No camera found. Please ensure your device has a camera and it is not in use.');
        }

        // Log camera structure for debugging
        console.log('Number of cameras:', cameras.length);
        cameras.forEach((cam, idx) => {
            console.log(`Camera ${idx}:`, cam);
        });

        // Find the best camera (prefer back/rear camera)
        // Camera objects may have 'id' or 'deviceId' property
        let cameraId = null;
        let selectedCamera = null;

        // Helper to get camera ID from camera object - try all possible properties
        const getCameraId = (camera) => {
            if (!camera) return null;
            // Try common property names
            return camera.id ||
                camera.deviceId ||
                camera.cameraId ||
                (camera.device && camera.device.deviceId) ||
                (typeof camera === 'string' ? camera : null);
        };

        // First, try to find back/rear camera
        const backCamera = cameras.find(c => {
            const label = (c.label || c.name || '').toLowerCase();
            return label.includes('back') || label.includes('rear') || label.includes('environment');
        });

        if (backCamera) {
            const id = getCameraId(backCamera);
            if (id) {
                selectedCamera = backCamera;
                cameraId = id;
                console.log('Selected back camera:', backCamera.label || backCamera.name, 'ID:', id);
            }
        }

        // Fallback to first available camera
        if (!cameraId && cameras[0]) {
            const id = getCameraId(cameras[0]);
            if (id) {
                selectedCamera = cameras[0];
                cameraId = id;
                console.log('Selected first camera:', cameras[0].label || cameras[0].name, 'ID:', id);
            }
        }

        // If still no ID, try using the camera object directly or use constraints
        if (!cameraId) {
            console.warn('Could not extract camera ID, will try with constraints object');
            // We'll use constraints object as fallback in the start() call
        }

        // Validate camera ID (but allow null if we'll use constraints)
        if (cameraId && typeof cameraId === 'string' && cameraId.trim() === '') {
            console.error('Camera ID is empty string');
            cameraId = null;
        }

        if (!cameraId) {
            console.log('No camera ID extracted, will use constraints: { facingMode: "environment" }');
        }

        if (scanResult) scanResult.innerHTML = '<div class="scan-result info">Starting scanner...</div>';

        scanner = new Html5QrcodeClass("qr-reader");

        try {
            // Determine what to pass to start() - camera ID or constraints
            let startConfig;

            if (cameraId && typeof cameraId === 'string' && cameraId.trim() !== '') {
                startConfig = cameraId;
                console.log('Starting scanner with camera ID:', cameraId);
            } else {
                // Use constraints object as fallback
                startConfig = { facingMode: "environment" };
                console.log('Starting scanner with constraints:', startConfig);
            }

            await scanner.start(
                startConfig,
                {
                    fps: 5,
                    qrbox: { width: 250, height: 250 }
                },
                (decodedText) => {
                    handleQRScan(decodedText);
                },
                () => { /* ignore scan failures (no QR in frame) */ }
            );
        } catch (startError) {
            console.error('Error in scanner.start():', startError);
            const startMsg = startError.message || String(startError);
            if (startMsg.includes('NotAllowedError') || startMsg.includes('Permission')) {
                throw new Error('Camera permission denied. Please allow camera access.');
            } else if (startMsg.includes('NotReadableError')) {
                throw new Error('Camera is in use by another application.');
            } else {
                throw new Error('Failed to start scanner: ' + startMsg);
            }
        }

        startBtn.style.display = 'none';
        stopBtn.style.display = 'inline-block';
        if (scanResult) scanResult.innerHTML = '<div class="scan-result info">Scanner started. Point camera at QR code.</div>';

    } catch (err) {
        console.error('Error starting scanner:', err);
        const msg = err.message || String(err);
        showToast('Scanner error: ' + msg, 'error');
        if (scanResult) {
            scanResult.innerHTML = '<div class="scan-result error">' +
                '<strong>Error:</strong> ' + msg + '<br><br>' +
                '<small>Tips: Use HTTPS (or localhost), allow camera permission, and ensure no other app is using the camera.</small></div>';
        }
        if (scanner) {
            try {
                await scanner.stop().catch(() => { });
                await scanner.clear().catch(() => { });
            } catch (_) { }
            scanner = null;
        }
    } finally {
        startBtn.disabled = false;
    }
}

// Stop scanner
function stopScanner() {
    if (scanner) {
        scanner.stop().then(() => {
            scanner.clear();
            scanner = null;
            document.getElementById('startScannerBtn').style.display = 'inline-block';
            document.getElementById('stopScannerBtn').style.display = 'none';
            document.getElementById('scanResult').innerHTML = '';
        }).catch((err) => {
            console.error('Error stopping scanner:', err);
        });
    }
}

// Handle QR scan - with lock, debounce, pause-on-scan, and atomic transaction
async function handleQRScan(qrData) {
    const scanResult = document.getElementById('scanResult');

    if (isProcessingScan) return;
    isProcessingScan = true;

    try {
        let data;
        try {
            data = JSON.parse(qrData);
        } catch (e) {
            if (scanResult) scanResult.innerHTML = '<div class="scan-result error">Invalid QR code</div>';
            return;
        }

        if (!data.teamId || !data.tokenId) {
            if (scanResult) scanResult.innerHTML = '<div class="scan-result error">Invalid QR code</div>';
            return;
        }

        const now = Date.now();
        if (lastScannedTokenId === data.tokenId && (now - lastScannedTime) < SCAN_DEBOUNCE_MS) {
            return;
        }

        const user = auth.currentUser;
        if (!user) {
            if (scanResult) scanResult.innerHTML = '<div class="scan-result error">Not logged in</div>';
            return;
        }

        if (scanner && typeof scanner.pause === 'function') {
            try {
                scanner.pause(false);
            } catch (_) { }
        }

        const tokenRef = db.collection('foodTokens').doc(data.tokenId);
        let tokenData = null;
        let newRedeemed = 0;
        let redeemCount = 0;

        await db.runTransaction(async (transaction) => {
            const tokenDoc = await transaction.get(tokenRef);
            if (!tokenDoc.exists) {
                throw new Error('TOKEN_NOT_FOUND');
            }

            const token = tokenDoc.data();
            const redeemed = token.redeemed || 0;
            const tokenCount = token.tokenCount || 0;

            if (redeemed >= tokenCount) {
                // All tokens are already redeemed for this QR
                throw new Error('LIMIT_EXCEEDED');
            }

            // Redeem all remaining tokens in a single scan
            redeemCount = tokenCount - redeemed;
            newRedeemed = redeemed + redeemCount;
            tokenData = { ...token, regId: token.regId, tokenCount };

            transaction.update(tokenRef, {
                redeemed: firebase.firestore.FieldValue.increment(redeemCount),
                redeemedAt: firebase.firestore.FieldValue.serverTimestamp(),
                scannerId: user.uid
            });
        });

        const teamDoc = await db.collection('teams').doc(data.teamId).get();
        const team = teamDoc.exists ? teamDoc.data() : { collegeName: 'Unknown' };

        await db.collection('foodRedemptions').add({
            tokenId: data.tokenId,
            teamId: data.teamId,
            regId: tokenData.regId,
            collegeName: team.collegeName,
            redeemedAt: firebase.firestore.FieldValue.serverTimestamp(),
            scannerId: user.uid,
            redeemedCount: redeemCount || 1
        });

        lastScannedTokenId = data.tokenId;
        lastScannedTime = Date.now();

        if (scanResult) {
            const totalTokens = tokenData.tokenCount;
            const remainingTokens = totalTokens - newRedeemed;
            scanResult.innerHTML = `
                <div class="scan-result success">
                    Token(s) redeemed successfully!<br>
                    College: ${team.collegeName}<br>
                    Total tokens for this team: ${totalTokens}<br>
                    Redeemed in this scan: ${redeemCount}<br>
                    Remaining tokens: ${remainingTokens} / ${totalTokens}
                </div>
            `;
        }

        // Also show a toast with total + remaining so it's clearly visible
        const totalTokens = tokenData.tokenCount;
        const remainingTokens = totalTokens - newRedeemed;
        showToast(
            `Redeemed ${redeemCount} food token(s). Remaining: ${remainingTokens}/${totalTokens}.`,
            'success'
        );

        await loadColleges();
        await loadRedeemedTokens();

        setTimeout(() => {
            stopScanner();
        }, 2000);

    } catch (error) {
        if (scanner && typeof scanner.resume === 'function') {
            try {
                scanner.resume();
            } catch (_) { }
        }

        if (error.message === 'TOKEN_NOT_FOUND') {
            if (scanResult) scanResult.innerHTML = '<div class="scan-result error">Token not found</div>';
        } else if (error.message === 'LIMIT_EXCEEDED') {
            if (scanResult) scanResult.innerHTML = '<div class="scan-result error">All tokens already redeemed for this QR</div>';
        } else {
            console.error('Error handling QR scan:', error);
            if (scanResult) scanResult.innerHTML = '<div class="scan-result error">Error processing QR code. Try again.</div>';
        }
    } finally {
        isProcessingScan = false;
    }
}

// Setup event listeners
function setupEventListeners() {
    const startBtn = document.getElementById('startScannerBtn');
    if (startBtn) {
        startBtn.addEventListener('click', startScanner);
    }

    const stopBtn = document.getElementById('stopScannerBtn');
    if (stopBtn) {
        stopBtn.addEventListener('click', stopScanner);
    }

    const searchColleges = document.getElementById('searchFoodColleges');
    if (searchColleges) {
        searchColleges.addEventListener('input', debounce(applyFoodCollegeSearchFilter, 300));
    }

    const searchRedeemed = document.getElementById('searchFoodRedeemed');
    if (searchRedeemed) {
        searchRedeemed.addEventListener('input', debounce(applyFoodRedeemedSearchFilter, 300));
    }
}

// Setup real-time updates
function setupRealtimeUpdates() {
    db.collection('foodTokens').onSnapshot(() => {
        loadColleges();
        loadRedeemedTokens();
    });
}

// Delete legacy / token-based redemption (no foodRedemptions record)
async function resetTokenRedemption(tokenId) {
    if (!confirm('Delete this redemption and reset redeemed count for this token?')) {
        return;
    }

    try {
        const tokenRef = db.collection('foodTokens').doc(tokenId);
        await tokenRef.update({
            redeemed: 0,
            redeemedAt: null,
            scannerId: null
        });

        // Also remove any foodRedemptions docs that might reference this token, if they exist
        const redemptionsSnapshot = await db.collection('foodRedemptions')
            .where('tokenId', '==', tokenId)
            .get();

        const batch = db.batch();
        redemptionsSnapshot.forEach(doc => batch.delete(doc.ref));
        if (!redemptionsSnapshot.empty) {
            await batch.commit();
        }

        showToast('Redemption reset and counts updated.', 'success');
        await loadColleges();
        await loadRedeemedTokens();
    } catch (error) {
        console.error('Error resetting token redemption:', error);
        showToast('Error deleting redemption. Check console for details.', 'error');
    }
}

// Expose helper for inline onclick
window.resetTokenRedemption = resetTokenRedemption;

// Delete a redemption record and adjust counts
async function deleteRedemption(redemptionId) {
    if (!confirm('Delete this redemption record and restore its tokens?')) {
        return;
    }

    try {
        const redemptionRef = db.collection('foodRedemptions').doc(redemptionId);

        await db.runTransaction(async (transaction) => {
            const redemptionDoc = await transaction.get(redemptionRef);
            if (!redemptionDoc.exists) {
                throw new Error('REDEMPTION_NOT_FOUND');
            }

            const redemption = redemptionDoc.data();
            const tokenId = redemption.tokenId;
            const redeemedCount = redemption.redeemedCount || 0;

            if (!tokenId || !redeemedCount) {
                // Nothing to adjust – just delete the record
                transaction.delete(redemptionRef);
                return;
            }

            const tokenRef = db.collection('foodTokens').doc(tokenId);
            const tokenDoc = await transaction.get(tokenRef);
            if (!tokenDoc.exists) {
                // Token doc missing, just delete redemption
                transaction.delete(redemptionRef);
                return;
            }

            const token = tokenDoc.data();
            const currentRedeemed = token.redeemed || 0;
            const newRedeemed = Math.max(0, currentRedeemed - redeemedCount);

            transaction.update(tokenRef, {
                redeemed: newRedeemed
            });
            transaction.delete(redemptionRef);
        });

        showToast('Redemption deleted and counts updated.', 'success');
        await loadColleges();
        await loadRedeemedTokens();
    } catch (error) {
        console.error('Error deleting redemption:', error);
        showToast('Error deleting redemption. Check console for details.', 'error');
    }
}

// Make deleteRedemption available to inline onclick
window.deleteRedemption = deleteRedemption;

// Filtering helpers
function applyFoodCollegeSearchFilter() {
    const input = document.getElementById('searchFoodColleges');
    if (!input) return;
    const term = input.value.toLowerCase();
    const rows = document.querySelectorAll('#collegeTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

function applyFoodRedeemedSearchFilter() {
    const input = document.getElementById('searchFoodRedeemed');
    if (!input) return;
    const term = input.value.toLowerCase();
    const rows = document.querySelectorAll('#redeemedTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}
