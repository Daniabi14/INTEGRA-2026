// Admin Dashboard JavaScript

let allTeams = [];
let allPayments = [];
let allFoodTokens = [];
let allLots = [];
let registrationsSearchBound = false;
let credentialsSearchBound = false;

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    try {
        const user = await requireAuth();
        const userRole = await checkUserRole(user.uid);
        const email = user.email || '';

        // Allow access if:
        // 1) Role in users collection is 'admin'
        // 2) Email is in hard-coded admin list
        // 3) There is a document in 'admins' collection with userId or email
        const adminEmails = ['admin@integra2026.com', 'admin@integra.com'];

        let isAdmin = false;

        // 1) Role-based
        if (userRole === 'admin') {
            isAdmin = true;
        }

        // 2) Hard-coded emails
        if (!isAdmin && adminEmails.includes(email)) {
            isAdmin = true;
        }

        // 3) Check admins collection by UID
        if (!isAdmin) {
            const adminDoc = await db.collection('admins').doc(user.uid).get();
            if (adminDoc.exists) {
                isAdmin = true;
            }
        }

        // 4) Fallback: check admins collection by email
        if (!isAdmin && email) {
            const adminByEmail = await db.collection('admins')
                .where('email', '==', email)
                .limit(1)
                .get();
            if (!adminByEmail.empty) {
                isAdmin = true;
            }
        }

        if (!isAdmin) {
            window.location.href = 'login.html';
            return;
        }

        // Load core data (teams) first, then parallelize the rest
        await loadOverviewData(); // populates allTeams
        await loadRegistrations(); // renders using allTeams

        await Promise.all([
            loadLots(),
            loadFoodData(),
            loadSettings(),
            loadCredentials()
        ]);

        // Setup tabs
        setupTabs();

        // Setup event listeners
        setupEventListeners();

        // Real-time updates
        setupRealtimeUpdates();

    } catch (error) {
        console.error('Error loading admin dashboard:', error);
        window.location.href = 'login.html';
    }
});

// Load overview data
async function loadOverviewData() {
    try {
        const teamsSnapshot = await db.collection('teams').get();
        allTeams = teamsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderOverviewFromTeams();

    } catch (error) {
        console.error('Error loading overview:', error);
    }
}

function renderOverviewFromTeams() {
    const totalTeams = allTeams.length;
    const verified = allTeams.filter(t => (t.paymentStatus || '').toLowerCase() === 'verified').length;
    const pending = allTeams.filter(t => (t.paymentStatus || '').toLowerCase() === 'pending').length;
    const revenue = allTeams
        .filter(t => (t.paymentStatus || '').toLowerCase() === 'verified')
        .reduce((sum, t) => sum + (t.amount || 0), 0);

    const totalTeamsEl = document.getElementById('totalTeams');
    const verifiedEl = document.getElementById('verifiedTeams');
    const pendingEl = document.getElementById('pendingTeams');
    const revenueEl = document.getElementById('totalRevenue');

    if (totalTeamsEl) totalTeamsEl.textContent = totalTeams;
    if (verifiedEl) verifiedEl.textContent = verified;
    if (pendingEl) pendingEl.textContent = pending;
    if (revenueEl) revenueEl.textContent = revenue;
}

// Load registrations
async function loadRegistrations() {
    try {
        const tableBody = document.getElementById('registrationsTableBody');
        tableBody.innerHTML = '';

        allTeams.forEach(team => {
            const status = (team.paymentStatus || 'pending').toLowerCase();

            // Build actions based on current status
            let actionsHtml = '';
            if (status === 'pending') {
                actionsHtml += `
                    <button class="action-btn verify" onclick="verifyPayment('${team.id}')">Verify</button>
                    <button class="action-btn reject" onclick="rejectPayment('${team.id}')">Reject</button>
                `;
            } else if (status === 'verified') {
                actionsHtml += `
                    <button class="action-btn reject" onclick="unverifyPayment('${team.id}')">Unverify</button>
                `;
            } else if (status === 'rejected') {
                actionsHtml += `
                    <button class="action-btn verify" onclick="verifyPayment('${team.id}')">Verify</button>
                `;
            }

            // Remove button should be available for all statuses
            actionsHtml += `
                <button class="action-btn reject" onclick="deleteRegistration('${team.id}')">Remove</button>
            `;
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${team.regId}</td>
                <td>${team.teamLead}</td>
                <td>${team.collegeName}</td>
                <td>${team.phone}</td>
                <td>${formatEventsForDisplay(team.events || []).join(', ')}</td>
                <td>₹${team.amount}</td>
                <td><span class="status-badge ${status}">${status}</span></td>
                <td>${actionsHtml}</td>
            `;
            tableBody.appendChild(row);
        });

        // Setup search and filter
        setupSearchAndFilter();

    } catch (error) {
        console.error('Error loading registrations:', error);
    }
}

// Setup search and filter
function setupSearchAndFilter() {
    const searchInput = document.getElementById('searchRegistrations');
    const filterSelect = document.getElementById('filterStatus');

    if (!searchInput || !filterSelect) return;
    if (registrationsSearchBound) return;
    registrationsSearchBound = true;

    const filterTable = () => {
        const searchTerm = searchInput.value.toLowerCase();
        const statusFilter = filterSelect.value;
        const rows = document.querySelectorAll('#registrationsTableBody tr');

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            const status = row.querySelector('.status-badge')?.textContent.toLowerCase() || '';

            const matchesSearch = text.includes(searchTerm);
            const matchesStatus = statusFilter === 'all' || status === statusFilter;

            row.style.display = matchesSearch && matchesStatus ? '' : 'none';
        });
    };

    searchInput.addEventListener('input', debounce(filterTable, 300));
    filterSelect.addEventListener('change', filterTable);
}

// Verify payment
async function verifyPayment(teamId) {
    try {
        await db.collection('teams').doc(teamId).update({
            paymentStatus: 'verified'
        });

        await db.collection('payments')
            .where('teamId', '==', teamId)
            .get()
            .then(snapshot => {
                snapshot.forEach(doc => {
                    doc.ref.update({
                        status: 'verified',
                        verifiedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                });
            });

        // Send email with credentials
        const teamDoc = await db.collection('teams').doc(teamId).get();
        const teamData = teamDoc.data();

        // Use email as username and team lead phone as password by default
        let password = teamData.phone || generatePassword();
        let username = teamData.email;

        // Check if credentials already exist in Firestore
        const credsDoc = await db.collection('credentials').doc(teamData.regId).get();
        if (credsDoc.exists) {
            const creds = credsDoc.data();
            password = creds.password;
            username = creds.username || username;
        } else {
            // Store credentials
            await db.collection('credentials').doc(teamData.regId).set({
                email: teamData.email,
                username: username,
                password: password,
                regId: teamData.regId,
                college: teamData.collegeName,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }

        // Create user account WITHOUT logging out admin:
        // Use a secondary Firebase app instance so admin stays signed in.
        try {
            const secondaryName = 'secondary-auth';
            const secondaryApp = firebase.apps?.find(a => a.name === secondaryName) || firebase.initializeApp(firebaseConfig, secondaryName);
            const secondaryAuth = secondaryApp.auth();
            await secondaryAuth.createUserWithEmailAndPassword(teamData.email, password);
            await secondaryAuth.signOut();
        } catch (error) {
            // User might already exist; that's OK.
            if (error?.code !== 'auth/email-already-in-use') {
                console.warn('Could not create auth user:', error);
            }
        }

        // Send credentials to team lead AND all participant emails
        await sendCredentialsToAllParticipants(teamData, username, password);

        showToast('Payment verified and credentials sent', 'success');
        await loadRegistrations();
        await loadOverviewData();

    } catch (error) {
        console.error('Error verifying payment:', error);
        showToast('Error verifying payment', 'error');
    }
}

async function sendCredentialsToAllParticipants(teamData, username, password) {
    const regId = teamData.regId;
    const baseEmail = (teamData.email || '').trim();

    const emails = new Set();
    if (baseEmail) emails.add(baseEmail.toLowerCase());

    if (Array.isArray(teamData.participants)) {
        teamData.participants.forEach(p => {
            const e = (p && p.email ? String(p.email).trim() : '').toLowerCase();
            if (e) emails.add(e);
        });
    }

    const emailList = Array.from(emails).filter(validateEmail);
    if (emailList.length === 0) {
        // At least log the credentials so admin can share manually
        logRegistrationCredentials(teamData.email || '-', regId, password, teamData, username);
        return;
    }

    const results = await Promise.allSettled(
        emailList.map((toEmail) => sendRegistrationEmail(toEmail, regId, password, teamData, username))
    );

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const fail = results.length - ok;
    if (fail > 0) {
        console.warn(`Credentials email: ${ok} sent, ${fail} failed`, results);
    }
}

// Reject payment
async function rejectPayment(teamId) {
    if (!confirm('Are you sure you want to reject this payment?')) {
        return;
    }

    try {
        await db.collection('teams').doc(teamId).update({
            paymentStatus: 'rejected'
        });

        showToast('Payment rejected', 'success');
        await loadRegistrations();
        await loadOverviewData();

    } catch (error) {
        console.error('Error rejecting payment:', error);
        showToast('Error rejecting payment', 'error');
    }
}

// Unverify payment (set back to pending)
async function unverifyPayment(teamId) {
    if (!confirm('Set this registration back to pending (unverify)?')) {
        return;
    }

    try {
        // Update team status
        await db.collection('teams').doc(teamId).update({
            paymentStatus: 'pending'
        });

        // Update related payments
        const paymentsSnapshot = await db.collection('payments')
            .where('teamId', '==', teamId)
            .get();

        const batch = db.batch();
        paymentsSnapshot.forEach(doc => {
            batch.update(doc.ref, {
                status: 'pending',
                verifiedAt: null
            });
        });
        await batch.commit();

        showToast('Registration set back to pending', 'success');
        await loadRegistrations();
        await loadOverviewData();
    } catch (error) {
        console.error('Error unverifying payment:', error);
        showToast('Error unverifying payment', 'error');
    }
}

// Completely delete a registration and related records
async function deleteRegistration(teamId) {
    if (!confirm('This will permanently remove this registration and related records (participants, payments, food tokens, lots, credentials). Continue?')) {
        return;
    }

    try {
        const teamRef = db.collection('teams').doc(teamId);
        const teamDoc = await teamRef.get();
        if (!teamDoc.exists) {
            showToast('Team not found', 'error');
            return;
        }
        const team = teamDoc.data();
        const regId = team.regId;

        const ops = [];

        // Team
        ops.push({ type: 'delete', ref: teamRef });

        // Participants
        const participantsSnapshot = await db.collection('participants')
            .where('teamId', '==', teamId)
            .get();
        participantsSnapshot.forEach(doc => {
            ops.push({ type: 'delete', ref: doc.ref });
        });

        // Payments
        const paymentsSnapshot = await db.collection('payments')
            .where('teamId', '==', teamId)
            .get();
        paymentsSnapshot.forEach(doc => {
            ops.push({ type: 'delete', ref: doc.ref });
        });

        // Food tokens
        const tokensSnapshot = await db.collection('foodTokens')
            .where('teamId', '==', teamId)
            .get();
        tokensSnapshot.forEach(doc => {
            ops.push({ type: 'delete', ref: doc.ref });
        });

        // Lots
        const lotsSnapshot = await db.collection('lots')
            .where('teamId', '==', teamId)
            .get();
        lotsSnapshot.forEach(doc => {
            ops.push({ type: 'delete', ref: doc.ref });
        });

        // Credentials (by regId)
        if (regId) {
            const credRef = db.collection('credentials').doc(regId);
            ops.push({ type: 'delete', ref: credRef });
        }

        // Execute in batches of 500
        const BATCH_SIZE = 500;
        for (let i = 0; i < ops.length; i += BATCH_SIZE) {
            const batch = db.batch();
            const chunk = ops.slice(i, i + BATCH_SIZE);
            chunk.forEach(op => {
                if (op.type === 'delete') {
                    batch.delete(op.ref);
                }
            });
            await batch.commit();
        }

        showToast('Registration and related records removed', 'success');
        await loadOverviewData();
        await loadRegistrations();
    } catch (error) {
        console.error('Error deleting registration:', error);
        showToast('Error deleting registration', 'error');
    }
}

// Generate password
function generatePassword() {
    const length = 8;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
}

// Load lots
async function loadLots() {
    try {
        const lotsSnapshot = await db.collection('lots').get();
        allLots = lotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const events = [
            'Project Expo', 'HackBlitz', 'BrandCraft', 'Web Solutions',
            'Digital Link', 'Software Showcase', 'BrainBytes', 'ReelRush', 'Digital Don'
        ];

        const container = document.getElementById('eventLotsContainer');
        container.innerHTML = '';

        events.forEach(eventName => {
            const eventLots = allLots.filter(lot => lot.eventName === eventName);

            if (eventLots.length === 0) return; // Skip events with no lots

            // Group by college + lotNumber so same college appears in one row
            const grouped = {};
            eventLots.forEach(lot => {
                const key = `${lot.collegeName || 'Unknown'}|${lot.lotNumber || '-'}`;
                if (!grouped[key]) {
                    grouped[key] = {
                        collegeName: lot.collegeName || 'Unknown',
                        lotNumber: lot.lotNumber || '-',
                        names: [],
                        phones: []
                    };
                }
                if (lot.participantName) {
                    grouped[key].names.push(lot.participantName);
                }
                if (lot.participantPhone) {
                    grouped[key].phones.push(lot.participantPhone);
                }
            });

            const groupedRowsHtml = Object.values(grouped).map(group => `
                <tr>
                    <td>${group.collegeName}</td>
                    <td>${group.lotNumber}</td>
                    <td>${group.names.length ? group.names.join(', ') : '-'}</td>
                    <td>${group.phones.length ? group.phones.join(', ') : '-'}</td>
                </tr>
            `).join('');

            const eventSection = document.createElement('div');
            eventSection.className = 'event-lots-section';
            eventSection.innerHTML = `
                <h3>${eventName} (${eventLots.length} participants)</h3>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>College</th>
                                <th>Lot Number</th>
                                <th>Participant Name(s)</th>
                                <th>Participant Phone(s)</th>
                            </tr>
                        </thead>
                        <tbody id="lots-${eventName.replace(/\s+/g, '-')}">
                            ${groupedRowsHtml}
                        </tbody>
                    </table>
                </div>
            `;
            container.appendChild(eventSection);
        });

    } catch (error) {
        console.error('Error loading lots:', error);
    }
}

// Auto assign lots
async function autoAssignLots() {
    if (!confirm('This will clear all existing lots and assign new lot numbers to all verified teams. Continue?')) {
        return;
    }

    try {
        // First, delete all existing lots (handle batches of 500 for Firestore limit)
        const existingLotsSnapshot = await db.collection('lots').get();
        const docsToDelete = existingLotsSnapshot.docs;

        // Delete in batches of 500
        for (let i = 0; i < docsToDelete.length; i += 500) {
            const deleteBatch = db.batch();
            const chunk = docsToDelete.slice(i, i + 500);
            chunk.forEach(doc => {
                deleteBatch.delete(doc.ref);
            });
            await deleteBatch.commit();
        }

        const verifiedTeams = allTeams.filter(t => t.paymentStatus === 'verified');
        const events = [
            'Project Expo', 'HackBlitz', 'BrandCraft', 'Web Solutions',
            'Digital Link', 'Software Showcase', 'BrainBytes', 'ReelRush', 'Digital Don'
        ];

        let lotCounter = {};

        // Initialize lot counters for each event
        events.forEach(event => {
            lotCounter[event] = 1;
        });

        // Track assigned lot numbers per college per event
        // Key: "collegeName|eventName" -> lotNumber
        const collegeEventLots = {};

        // Collect all operations. Use Map for participant updates so we only update each participant ONCE.
        const operations = [];
        const participantUpdatesMap = new Map(); // participantDocId -> { ref, lotNumber }

        for (const team of verifiedTeams) {
            // Get all participants for this team
            const participantsSnapshot = await db.collection('participants')
                .where('teamId', '==', team.id)
                .get();

            const teamLotNumbers = {};
            const collegeName = team.collegeName;

            // Group participants by their events
            const eventParticipants = {}; // { eventName: [participant1, participant2, ...] }

            for (const participantDoc of participantsSnapshot.docs) {
                const participant = { ...participantDoc.data(), docRef: participantDoc.ref };
                const participantEvents = participant.events || [];

                for (const eventName of participantEvents) {
                    if (!eventParticipants[eventName]) {
                        eventParticipants[eventName] = [];
                    }
                    eventParticipants[eventName].push(participant);
                }
            }

            // Assign lot numbers - same college + same event = same lot number
            for (const eventName of Object.keys(eventParticipants)) {
                const participants = eventParticipants[eventName];
                const collegeEventKey = `${collegeName}|${eventName}`;

                let lotNumber;

                // Check if this college already has a lot number for this event
                if (collegeEventLots[collegeEventKey]) {
                    lotNumber = collegeEventLots[collegeEventKey];
                } else {
                    lotNumber = lotCounter[eventName];
                    collegeEventLots[collegeEventKey] = lotNumber;
                    lotCounter[eventName]++;
                }

                if (!teamLotNumbers[eventName]) {
                    teamLotNumbers[eventName] = [];
                }
                if (!teamLotNumbers[eventName].includes(lotNumber)) {
                    teamLotNumbers[eventName].push(lotNumber);
                }

                for (const participant of participants) {
                    const lotRef = db.collection('lots').doc();
                    operations.push({
                        type: 'set',
                        ref: lotRef,
                        data: {
                            eventName: eventName,
                            teamId: team.id,
                            collegeName: collegeName,
                            lotNumber: lotNumber,
                            participantName: participant.name,
                            participantPhone: participant.phone || '',
                            assignedAt: firebase.firestore.FieldValue.serverTimestamp()
                        }
                    });

                    // Accumulate lotNumber per participant (one update per participant later)
                    if (participant.docRef) {
                        const key = participant.docRef.id;
                        if (!participantUpdatesMap.has(key)) {
                            participantUpdatesMap.set(key, {
                                ref: participant.docRef,
                                lotNumber: { ...(participant.lotNumber || {}) }
                            });
                        }
                        participantUpdatesMap.get(key).lotNumber[eventName] = lotNumber;
                    }
                }
            }

            const teamRef = db.collection('teams').doc(team.id);
            operations.push({
                type: 'update',
                ref: teamRef,
                data: { lotNumbers: teamLotNumbers }
            });
        }

        // Add exactly one update per participant (no duplicate doc updates in batch)
        for (const { ref, lotNumber } of participantUpdatesMap.values()) {
            operations.push({
                type: 'update',
                ref: ref,
                data: { lotNumber: lotNumber }
            });
        }

        // Execute operations in batches of 500 (Firestore limit)
        const BATCH_SIZE = 500;
        for (let i = 0; i < operations.length; i += BATCH_SIZE) {
            const batch = db.batch();
            const chunk = operations.slice(i, i + BATCH_SIZE);

            for (const op of chunk) {
                if (op.type === 'set') {
                    batch.set(op.ref, op.data);
                } else if (op.type === 'update') {
                    batch.update(op.ref, op.data);
                }
            }

            await batch.commit();
        }
        showToast('Lots assigned successfully', 'success');
        await loadLots();

    } catch (error) {
        console.error('Error assigning lots:', error);
        showToast('Error assigning lots: ' + (error.message || 'Unknown error'), 'error');
    }
}

// Load food data
async function loadFoodData() {
    try {
        const tokensSnapshot = await db.collection('foodTokens').get();
        allFoodTokens = tokensSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const tableBody = document.getElementById('foodTableBody');
        tableBody.innerHTML = '';

        // Avoid N+1 reads: use allTeams already loaded in overview
        const teamMap = new Map(allTeams.map(t => [t.id, t]));

        for (const token of allFoodTokens) {
            const team = token.teamId ? teamMap.get(token.teamId) : null;
            if (!team) continue;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${token.tokenCount}</td>
                <td>${token.regId}</td>
                <td>${team.teamLead || '-'}</td>
                <td>${team.collegeName || '-'}</td>
                <td>${token.redeemed || 0}/${token.tokenCount}</td>
            `;
            tableBody.appendChild(row);
        }

    } catch (error) {
        console.error('Error loading food data:', error);
    }
}

// Load settings
async function loadSettings() {
    try {
        const settingsDoc = await db.collection('adminSettings').doc('main').get();
        if (settingsDoc.exists) {
            const settings = settingsDoc.data();

            if (settings.paymentQRUrl) {
                document.getElementById('paymentQRUrl').value = settings.paymentQRUrl;
            }

            if (settings.venue) {
                document.getElementById('venueInput').value = settings.venue;
            }

            if (settings.instructions) {
                document.getElementById('instructionsInput').value = settings.instructions;
            }

            // Food coordinator delete toggle
            const foodDeleteCheckbox = document.getElementById('foodDeleteEnabled');
            if (foodDeleteCheckbox) {
                // Default: allow delete when setting is missing
                foodDeleteCheckbox.checked = settings.foodDeleteEnabled !== false;
            }

            // Load event timings
            const events = [
                'Project Expo', 'HackBlitz', 'BrandCraft', 'Web Solutions',
                'Digital Link', 'Software Showcase', 'BrainBytes', 'ReelRush', 'Digital Don'
            ];

            const timingsContainer = document.getElementById('eventTimingsContainer');
            timingsContainer.innerHTML = '';

            events.forEach(eventName => {
                const timingDiv = document.createElement('div');
                timingDiv.className = 'form-group';
                timingDiv.innerHTML = `
                    <label>${eventName} Timing</label>
                    <input type="text" class="event-timing" data-event="${eventName}" 
                           value="${settings.eventTimings?.[eventName] || ''}" 
                           placeholder="e.g., 10:00 AM - 12:00 PM">
                `;
                timingsContainer.appendChild(timingDiv);
            });
        }

        // Load feedback settings
        await loadFeedbackSettings();
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

// Load feedback settings
async function loadFeedbackSettings() {
    try {
        const settingsDoc = await db.collection('adminSettings').doc('main').get();
        if (settingsDoc.exists) {
            const settings = settingsDoc.data();

            const feedbackEnabled = document.getElementById('feedbackEnabled');
            const feedbackQuestions = document.getElementById('feedbackQuestions');

            if (feedbackEnabled) {
                feedbackEnabled.checked = settings.feedbackEnabled || false;
            }

            if (feedbackQuestions && settings.feedbackQuestions) {
                if (Array.isArray(settings.feedbackQuestions)) {
                    feedbackQuestions.value = settings.feedbackQuestions.join('\n');
                } else {
                    feedbackQuestions.value = settings.feedbackQuestions;
                }
            }
        }
    } catch (error) {
        console.error('Error loading feedback settings:', error);
    }
}

// Save settings
async function saveSettings(e) {
    e.preventDefault();

    try {
        const paymentQRUrl = document.getElementById('paymentQRUrl').value;
        const venue = document.getElementById('venueInput').value;
        const instructions = document.getElementById('instructionsInput').value;
        const foodDeleteEnabled = document.getElementById('foodDeleteEnabled').checked;
        const timingInputs = document.querySelectorAll('.event-timing');
        const eventTimings = {};

        timingInputs.forEach(input => {
            const eventName = input.getAttribute('data-event');
            eventTimings[eventName] = input.value;
        });

        await db.collection('adminSettings').doc('main').set({
            paymentQRUrl,
            venue,
            instructions,
            eventTimings,
            foodDeleteEnabled,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        showToast('Settings updated successfully', 'success');

    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Error saving settings', 'error');
    }
}

// Save feedback settings
async function saveFeedbackSettings(e) {
    e.preventDefault();

    try {
        const feedbackEnabled = document.getElementById('feedbackEnabled').checked;
        const feedbackQuestionsText = document.getElementById('feedbackQuestions').value.trim();

        if (!feedbackQuestionsText) {
            showToast('Please enter feedback questions', 'error');
            return;
        }

        // Split questions by newline and filter empty lines
        const feedbackQuestions = feedbackQuestionsText
            .split('\n')
            .map(q => q.trim())
            .filter(q => q.length > 0);

        await db.collection('adminSettings').doc('main').set({
            feedbackEnabled: feedbackEnabled,
            feedbackQuestions: feedbackQuestions,
            feedbackUpdatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        showToast('Feedback settings saved successfully', 'success');

    } catch (error) {
        console.error('Error saving feedback settings:', error);
        showToast('Error saving feedback settings', 'error');
    }
}

// Load feedback
async function loadFeedback() {
    try {
        const feedbackSnapshot = await db.collection('feedback').get();
        const tableBody = document.getElementById('feedbackTableBody');
        tableBody.innerHTML = '';

        if (feedbackSnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No feedback submitted yet</td></tr>';
            return;
        }

        feedbackSnapshot.forEach(doc => {
            const feedback = doc.data();
            const row = document.createElement('tr');

            // Format responses
            let responsesHTML = '';
            if (feedback.responses && typeof feedback.responses === 'object') {
                responsesHTML = Object.entries(feedback.responses)
                    .map(([question, answer]) => `<strong>${question}:</strong> ${answer}`)
                    .join('<br>');
            } else {
                // Legacy format
                responsesHTML = `
                    ${feedback.rating ? `<strong>Rating:</strong> ${feedback.rating}/5<br>` : ''}
                    ${feedback.experience ? `<strong>Experience:</strong> ${feedback.experience}<br>` : ''}
                    ${feedback.suggestions ? `<strong>Suggestions:</strong> ${feedback.suggestions}` : ''}
                `;
            }

            row.innerHTML = `
                <td>${feedback.email || '-'}</td>
                <td>${feedback.collegeName || '-'}</td>
                <td>${feedback.rating != null ? feedback.rating : '-'}/5</td>
                <td style="max-width: 400px; word-wrap: break-word;">${responsesHTML || '-'}</td>
                <td>${formatDate(feedback.submittedAt)}</td>
            `;
            tableBody.appendChild(row);
        });

        showToast('Feedback loaded', 'success');

    } catch (error) {
        console.error('Error loading feedback:', error);
        showToast('Error loading feedback', 'error');
    }
}

// Export reports
async function exportReport(reportType) {
    try {
        let data = [];
        let filename = '';

        switch (reportType) {
            case 'registrations':
                data = allTeams.map(team => ({
                    'Reg ID': team.regId,
                    'College': team.collegeName,
                    'Team Lead': team.teamLead,
                    'Email': team.email,
                    'Phone': team.phone,
                    'Participants': team.participantCount,
                    'Staff': team.staffCount || 0,
                    'Events': formatEventsForDisplay(team.events || []).join(', '),
                    'Amount': team.amount,
                    'Payment Status': team.paymentStatus,
                    'Transaction ID': team.transactionId,
                    'Created At': formatDate(team.createdAt)
                }));
                filename = 'registrations.csv';
                break;

            case 'payments':
                const paymentsSnapshot = await db.collection('payments').get();
                data = paymentsSnapshot.docs.map(doc => {
                    const payment = doc.data();
                    return {
                        'Team ID': payment.teamId,
                        'Amount': payment.amount,
                        'Transaction ID': payment.transactionId,
                        'Status': payment.status,
                        'Created At': formatDate(payment.createdAt),
                        'Verified At': formatDate(payment.verifiedAt)
                    };
                });
                filename = 'payments.csv';
                break;

            case 'food':
                data = allFoodTokens.map(token => ({
                    'Reg ID': token.regId,
                    'Token Count': token.tokenCount,
                    'Redeemed': token.redeemed || 0,
                    'Remaining': (token.tokenCount || 0) - (token.redeemed || 0)
                }));
                filename = 'food_summary.csv';
                break;

            case 'tokens':
                const tokensSnapshot = await db.collection('foodTokens').get();
                data = tokensSnapshot.docs.map(doc => {
                    const token = doc.data();
                    return {
                        'Token ID': doc.id,
                        'Reg ID': token.regId,
                        'Team ID': token.teamId,
                        'Token Count': token.tokenCount,
                        'Redeemed': token.redeemed || 0
                    };
                });
                filename = 'food_tokens.csv';
                break;

            case 'lots':
                data = allLots.map(lot => ({
                    'Event': lot.eventName,
                    'College': lot.collegeName,
                    'Lot Number': lot.lotNumber,
                    'Participant Name': lot.participantName || '-',
                    'Participant Phone': lot.participantPhone || '-',
                    'Assigned At': formatDate(lot.assignedAt)
                }));
                filename = 'event_lots.csv';
                break;

            case 'attendance':
                data = allLots.filter(lot => lot.attendance).map(lot => ({
                    'Event': lot.eventName,
                    'College': lot.collegeName,
                    'Lot Number': lot.lotNumber,
                    'Participant Name': lot.participantName || '-',
                    'Participant Phone': lot.participantPhone || '-',
                    'Attended': lot.attendance ? 'Yes' : 'No',
                    'Attendance Time': formatDate(lot.attendanceAt)
                }));
                filename = 'attendance_report.csv';
                break;

            case 'feedback':
                {
                    // Load questions configuration so we can create one column per question
                    const settingsDoc = await db.collection('adminSettings').doc('main').get();
                    const settings = settingsDoc.exists ? settingsDoc.data() : {};
                    const questions = Array.isArray(settings.feedbackQuestions)
                        ? settings.feedbackQuestions
                        : [];

                    const feedbackSnapshot = await db.collection('feedback').get();

                    // One row per feedback entry, including email + college + each question rating
                    data = feedbackSnapshot.docs.map(doc => {
                        const fb = doc.data();
                        const row = {
                            'Email': fb.email || '',
                            'College': fb.collegeName || '',
                            'Submitted At': formatDate(fb.submittedAt)
                        };

                        if (fb.responses && typeof fb.responses === 'object') {
                            questions.forEach((q, idx) => {
                                const raw = fb.responses[q];
                                const num = raw != null && raw !== '' ? Number(raw) : '';
                                row[`Q${idx + 1} - ${q}`] = Number.isNaN(num) ? String(raw ?? '') : num;
                            });
                        }

                        // Fallback for any legacy simple fields
                        if (!questions.length) {
                            if (fb.rating != null) row['Rating'] = fb.rating;
                            if (fb.experience) row['Experience'] = fb.experience;
                            if (fb.suggestions) row['Suggestions'] = fb.suggestions;
                        }

                        return row;
                    });

                    filename = 'feedback.csv';
                }
                break;
        }

        if (data.length > 0) {
            exportToCSV(data, filename);
        } else {
            showToast('No data to export', 'error');
        }

    } catch (error) {
        console.error('Error exporting report:', error);
        showToast('Error exporting report', 'error');
    }
}

// Load credentials (usernames & passwords)
async function loadCredentials() {
    try {
        const credsSnapshot = await db.collection('credentials').get();
        const tableBody = document.getElementById('credentialsTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = '';

        if (credsSnapshot.empty) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:2rem; color:#6b7280;">No credentials found.</td></tr>';
            return;
        }

        credsSnapshot.forEach(doc => {
            const cred = doc.data();
            const password = cred.password || '-';
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${cred.regId || doc.id}</td>
                <td>${cred.college || '-'}</td>
                <td>${cred.email || '-'}</td>
                <td>
                    ${password}
                </td>
            `;
            tableBody.appendChild(row);
        });

        setupCredentialsSearch();
        applyCredentialsSearchFilter();
    } catch (error) {
        console.error('Error loading credentials:', error);
        showToast('Error loading credentials', 'error');
    }
}

function setupCredentialsSearch() {
    const searchInput = document.getElementById('searchCredentials');
    if (!searchInput) return;
    if (credentialsSearchBound) return;
    credentialsSearchBound = true;
    searchInput.addEventListener('input', debounce(applyCredentialsSearchFilter, 250));
}

function applyCredentialsSearchFilter() {
    const searchInput = document.getElementById('searchCredentials');
    if (!searchInput) return;
    const term = searchInput.value.toLowerCase();
    const rows = document.querySelectorAll('#credentialsTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

// Setup tabs
function setupTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const targetContent = document.getElementById(`${targetTab}-content`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

// View all participants with their events
async function viewAllParticipants() {
    try {
        const section = document.getElementById('allParticipantsSection');
        const tableBody = document.getElementById('allParticipantsTableBody');

        // Toggle visibility
        if (section.style.display === 'none') {
            section.style.display = 'block';
            tableBody.innerHTML = '<tr><td colspan="5">Loading...</td></tr>';

            // Load all participants
            const participantsSnapshot = await db.collection('participants').get();
            tableBody.innerHTML = '';

            if (participantsSnapshot.empty) {
                tableBody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No participants found in database</td></tr>';
                return;
            }

            // Group participants by Reg ID
            const regIdGroups = {};

            for (const doc of participantsSnapshot.docs) {
                const participant = doc.data();

                // Get team info
                let regId = '-';
                let collegeName = '-';
                if (participant.teamId) {
                    const teamDoc = await db.collection('teams').doc(participant.teamId).get();
                    if (teamDoc.exists) {
                        const team = teamDoc.data();
                        regId = team.regId || '-';
                        collegeName = team.collegeName || '-';
                    }
                }

                // Initialize group if not exists
                if (!regIdGroups[regId]) {
                    regIdGroups[regId] = {
                        regId: regId,
                        collegeName: collegeName,
                        participants: [],
                        allEvents: new Set()
                    };
                }

                // Add participant info
                const participantName = participant.name || '-';
                const participantDisplay = participant.isTeamLead
                    ? `${participantName} (TL)`
                    : participantName;
                regIdGroups[regId].participants.push({
                    name: participantDisplay,
                    phone: participant.phone || '-',
                    events: participant.events || []
                });

                // Collect all unique events
                (participant.events || []).forEach(event => regIdGroups[regId].allEvents.add(event));
            }

            // Display grouped data - one row per Reg ID
            for (const regId in regIdGroups) {
                const group = regIdGroups[regId];
                const participantsList = group.participants.map(p => p.name).join(', ');
                const phonesList = group.participants.map(p => p.phone).filter(p => p !== '-').join(', ') || '-';
                const allEventsArray = Array.from(group.allEvents);
                const eventsDisplay = allEventsArray.length > 0
                    ? formatEventsForDisplay(allEventsArray).join(', ')
                    : '<span style="color: red;">No events selected</span>';

                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${group.regId}</td>
                    <td>${group.collegeName}</td>
                    <td>${participantsList}</td>
                    <td>${phonesList}</td>
                    <td>${eventsDisplay}</td>
                `;
                tableBody.appendChild(row);
            }

            document.getElementById('viewAllParticipantsBtn').textContent = 'Hide Participants';
        } else {
            section.style.display = 'none';
            document.getElementById('viewAllParticipantsBtn').textContent = 'View All Participants';
        }

    } catch (error) {
        console.error('Error loading participants:', error);
        showToast('Error loading participants', 'error');
    }
}

// Setup event listeners
function setupEventListeners() {
    // Auto assign lots button
    const autoAssignBtn = document.getElementById('autoAssignLotsBtn');
    if (autoAssignBtn) {
        autoAssignBtn.addEventListener('click', autoAssignLots);
    }

    // View all participants button
    const viewParticipantsBtn = document.getElementById('viewAllParticipantsBtn');
    if (viewParticipantsBtn) {
        viewParticipantsBtn.addEventListener('click', viewAllParticipants);
    }

    // Settings form
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', saveSettings);
    }

    // Feedback settings form
    const feedbackSettingsForm = document.getElementById('feedbackSettingsForm');
    if (feedbackSettingsForm) {
        feedbackSettingsForm.addEventListener('submit', saveFeedbackSettings);
    }

    // Load feedback button
    const loadFeedbackBtn = document.getElementById('loadFeedbackBtn');
    if (loadFeedbackBtn) {
        loadFeedbackBtn.addEventListener('click', loadFeedback);
    }

    // Report buttons
    const reportBtns = document.querySelectorAll('.report-btn');
    reportBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const reportType = btn.getAttribute('data-report');
            exportReport(reportType);
        });
    });
}

// Setup real-time updates
function setupRealtimeUpdates() {
    db.collection('teams').onSnapshot((snapshot) => {
        allTeams = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderOverviewFromTeams();
        loadRegistrations();
    });
}

// Send registration email (using EmailJS)
async function sendRegistrationEmail(email, regId, password, teamData, username) {
    try {
        // Check if EmailJS is available and configured
        if (typeof emailjs !== 'undefined' && window.EMAILJS_CONFIG) {
            const config = window.EMAILJS_CONFIG;

            // Check if configuration is set
            if (config.publicKey === 'YOUR_PUBLIC_KEY' ||
                config.services.registration === 'YOUR_REGISTRATION_SERVICE_ID' ||
                config.templates.registration === 'YOUR_REGISTRATION_TEMPLATE_ID') {
                console.warn('EmailJS not fully configured. Please update js/emailjs-config.js');
                // Fallback to console log
                logRegistrationCredentials(email, regId, password, teamData);
                return;
            }

            // Get website URL for login link
            const websiteUrl = window.location.origin || 'https://your-website-url.com';

            await emailjs.send(
                config.services.registration,
                config.templates.registration,
                {
                    to_email: email,
                    username: username || email.split('@')[0],
                    reg_id: regId,
                    password: password,
                    college: teamData.collegeName,
                    team_lead: teamData.teamLead,
                    participant_count: teamData.participantCount,
                    staff_count: teamData.staffCount || 0,
                    events: formatEventsForDisplay(teamData.events || []).join(', '),
                    login_url: `${websiteUrl}/login.html`,
                    total_amount: `₹${teamData.amount}`
                }
            );

            console.log('Registration email sent successfully to:', email);
            showToast('Registration email sent to participant', 'success');
        } else {
            // Fallback: Log credentials (for testing/development)
            logRegistrationCredentials(email, regId, password, teamData, username);
        }
    } catch (error) {
        console.error('Error sending registration email:', error);
        showToast('Error sending email. Credentials logged to console.', 'error');
        // Log credentials as fallback
        logRegistrationCredentials(email, regId, password, teamData, username);
    }
}

// Fallback function to log credentials
function logRegistrationCredentials(email, regId, password, teamData, username) {
    const usernameValue = username || email.split('@')[0];
    console.log('=== REGISTRATION CREDENTIALS ===');
    console.log('Email:', email);
    console.log('Username:', usernameValue);
    console.log('Registration ID:', regId);
    console.log('Password:', password);
    console.log('College:', teamData.collegeName);
    console.log('Team Lead:', teamData.teamLead);
    console.log('===============================');

    // Optionally store in Firestore for admin to retrieve
    db.collection('credentials').doc(regId).set({
        email: email,
        username: usernameValue,
        regId: regId,
        password: password,
        college: teamData.collegeName,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(err => console.error('Error storing credentials:', err));
}

// Make functions available globally
window.verifyPayment = verifyPayment;
window.rejectPayment = rejectPayment;
window.unverifyPayment = unverifyPayment;
window.deleteRegistration = deleteRegistration;
