// Coordinator Dashboard JavaScript

let coordinatorEvent = null;
let eventLots = [];

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await requireAuth();

        // Get coordinator event from session (safely)
        coordinatorEvent = safeSessionGet('coordinatorEvent');
        if (!coordinatorEvent) {
            // Try to get from Firebase based on user email or userId
            const user = auth.currentUser;
            if (user) {
                // Try by email first
                coordinatorEvent = await getCoordinatorEvent(user.email);

                // If not found, try by userId
                if (!coordinatorEvent) {
                    const coordSnapshot = await db.collection('coordinators')
                        .where('userId', '==', user.uid)
                        .get();
                    if (!coordSnapshot.empty) {
                        coordinatorEvent = coordSnapshot.docs[0].data().eventName;
                        safeSessionSet('coordinatorEvent', coordinatorEvent);
                    }
                } else {
                    safeSessionSet('coordinatorEvent', coordinatorEvent);
                }
            }
        }

        if (!coordinatorEvent) {
            window.location.href = 'login.html';
            return;
        }

        // Display event name
        document.getElementById('coordinatorEventName').textContent = coordinatorEvent;
        document.getElementById('eventNameDisplay').textContent = `Event: ${coordinatorEvent}`;

        // Load data
        await loadEventLots();
        await loadAttendance();

        // Setup event listeners
        setupEventListeners();

    } catch (error) {
        console.error('Error loading coordinator dashboard:', error);
        window.location.href = 'login.html';
    }
});

// Load event lots
async function loadEventLots() {
    try {
        const lotsSnapshot = await db.collection('lots')
            .where('eventName', '==', coordinatorEvent)
            .get();

        eventLots = lotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Fill missing participantPhone from participants collection (for old lots or if not stored)
        const teamParticipantsCache = {};
        for (const lot of eventLots) {
            if (!lot.participantPhone || String(lot.participantPhone).trim() === '') {
                try {
                    if (!teamParticipantsCache[lot.teamId]) {
                        const snap = await db.collection('participants')
                            .where('teamId', '==', lot.teamId)
                            .get();
                        teamParticipantsCache[lot.teamId] = snap.docs.map(d => d.data());
                    }
                    const match = teamParticipantsCache[lot.teamId].find(
                        p => (p.name || '').trim() === (lot.participantName || '').trim()
                    );
                    if (match && match.phone) lot.participantPhone = match.phone;
                } catch (e) { /* ignore */ }
            }
        }

        // Group by college; each lot has participantName & participantPhone
        const collegeGroups = {};
        for (const lot of eventLots) {
            if (!collegeGroups[lot.collegeName]) {
                collegeGroups[lot.collegeName] = {
                    college: lot.collegeName,
                    lots: [],
                    participantPhones: [],
                    participants: []
                };
            }
            collegeGroups[lot.collegeName].lots.push(lot.lotNumber);
            collegeGroups[lot.collegeName].participants.push(lot.participantName || '-');
            const ph = (lot.participantPhone || '').trim();
            collegeGroups[lot.collegeName].participantPhones.push(ph ? lot.participantPhone : '-');
        }

        const tableBody = document.getElementById('lotsTableBody');
        tableBody.innerHTML = '';

        const groupsArray = Object.values(collegeGroups);
        if (groupsArray.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td colspan="4" style="text-align:center;">No lots assigned yet for this event.</td>
            `;
            tableBody.appendChild(row);
        } else {
            groupsArray.forEach(group => {
                const row = document.createElement('tr');
                // Get unique lot numbers
                const uniqueLots = [...new Set(group.lots)];
                row.innerHTML = `
                    <td>${group.college}</td>
                    <td>${uniqueLots.join(', ')}</td>
                    <td>${group.participants.join(', ') || '-'}</td>
                    <td>${group.participantPhones.join(', ') || '-'}</td>
                `;
                tableBody.appendChild(row);
            });
        }

        applyLotsSearchFilter();
        // Also populate attendance table
        await loadAttendance();

    } catch (error) {
        console.error('Error loading event lots:', error);
    }
}

// Load attendance
async function loadAttendance() {
    try {
        const tableBody = document.getElementById('attendanceTableBody');
        tableBody.innerHTML = '';

        for (const lot of eventLots) {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${lot.collegeName}</td>
                <td>${lot.lotNumber}</td>
                <td>${lot.participantName || '-'}</td>
                <td>${lot.participantPhone || '-'}</td>
                <td>
                    <input type="checkbox" class="attendance-checkbox" 
                           data-team-id="${lot.teamId}" 
                           data-lot-id="${lot.id}"
                           ${lot.attendance ? 'checked' : ''}>
                </td>
            `;
            tableBody.appendChild(row);
        }

        // Add event listeners for attendance checkboxes
        document.querySelectorAll('.attendance-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', async (e) => {
                const teamId = e.target.getAttribute('data-team-id');
                const lotId = e.target.getAttribute('data-lot-id');
                const attended = e.target.checked;

                try {
                    await db.collection('lots').doc(lotId).update({
                        attendance: attended,
                        attendanceAt: attended ? firebase.firestore.FieldValue.serverTimestamp() : null
                    });
                    showToast('Attendance updated', 'success');
                } catch (error) {
                    console.error('Error updating attendance:', error);
                    showToast('Error updating attendance', 'error');
                }
            });
        });

        applyAttendanceSearchFilter();
    } catch (error) {
        console.error('Error loading attendance:', error);
    }
}

// Setup event listeners
function setupEventListeners() {
    const searchLots = document.getElementById('searchCoordinatorLots');
    if (searchLots) {
        searchLots.addEventListener('input', debounce(applyLotsSearchFilter, 300));
    }

    const searchAttendance = document.getElementById('searchCoordinatorAttendance');
    if (searchAttendance) {
        searchAttendance.addEventListener('input', debounce(applyAttendanceSearchFilter, 300));
    }
}

function applyLotsSearchFilter() {
    const input = document.getElementById('searchCoordinatorLots');
    if (!input) return;
    const term = input.value.toLowerCase();
    const rows = document.querySelectorAll('#lotsTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}

function applyAttendanceSearchFilter() {
    const input = document.getElementById('searchCoordinatorAttendance');
    if (!input) return;
    const term = input.value.toLowerCase();
    const rows = document.querySelectorAll('#attendanceTableBody tr');
    rows.forEach(row => {
        const text = row.textContent.toLowerCase();
        row.style.display = text.includes(term) ? '' : 'none';
    });
}
