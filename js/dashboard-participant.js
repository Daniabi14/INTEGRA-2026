// Participant Dashboard JavaScript

let teamData = null;
let teamId = null;
let currentParticipants = [];

const MAX_PARTICIPANTS = 15;
const MAX_EVENTS_PER_PERSON = 4;
const eventsList = [
    'Project Expo',
    'HackBlitz',
    'BrandCraft',
    'Web Solutions',
    'Digital Link',
    'Software Showcase',
    'BrainBytes',
    'ReelRush'
];

document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    try {
        await requireAuth();
        teamId = safeSessionGet('teamId');
        const regId = safeSessionGet('regId');
        
        if (!teamId) {
            window.location.href = 'login.html';
            return;
        }
        
        // Load team data
        await loadTeamData();
        
        // Setup tabs
        setupTabs();

        // Setup participant management (add participant)
        setupParticipantManagement();
        
        // Load user name
        const userName = teamData?.teamLead || 'Participant';
        document.getElementById('userName').textContent = userName;
        
    } catch (error) {
        console.error('Error loading dashboard:', error);
        window.location.href = 'login.html';
    }
});

// Load team data
async function loadTeamData() {
    try {
        const teamDoc = await db.collection('teams').doc(teamId).get();
        if (!teamDoc.exists) {
            throw new Error('Team not found');
        }
        
        teamData = teamDoc.data();
        teamData.id = teamDoc.id;
        
        // Display registration ID
        document.getElementById('regId').textContent = teamData.regId;
        document.getElementById('detailRegId').textContent = teamData.regId;
        
        // Display details
        document.getElementById('detailCollege').textContent = teamData.collegeName;
        document.getElementById('detailParticipants').textContent = teamData.participantCount;
        document.getElementById('detailStaff').textContent = teamData.staffCount || 0;
        document.getElementById('detailAmount').textContent = `₹${teamData.amount}`;
        
        // Payment status
        const paymentStatus = document.getElementById('detailPaymentStatus');
        paymentStatus.textContent = teamData.paymentStatus || 'pending';
        paymentStatus.className = `status-badge ${teamData.paymentStatus || 'pending'}`;
        
        // Load participants with events and lots
        await loadParticipantsData();
        
        // Load food tokens
        await loadFoodTokens();
        
        // Load venue and instructions
        await loadVenueAndInstructions();
        
        // Check feedback status
        await checkFeedbackStatus();
        
        // Listen for real-time updates
        db.collection('teams').doc(teamId).onSnapshot((doc) => {
            if (doc.exists) {
                teamData = { ...doc.data(), id: doc.id };
                updateDashboard();
            }
        });
        
    } catch (error) {
        console.error('Error loading team data:', error);
        showToast('Error loading team data', 'error');
    }
}

// Check if feedback is enabled
async function checkFeedbackStatus() {
    try {
        const settingsDoc = await db.collection('adminSettings').doc('main').get();
        if (settingsDoc.exists) {
            const settings = settingsDoc.data();
            const feedbackLink = document.querySelector('a[href="feedback.html"]');
            
            if (feedbackLink) {
                if (settings.feedbackEnabled) {
                    feedbackLink.style.display = 'inline-block';
                } else {
                    feedbackLink.style.display = 'none';
                }
            }
        }
    } catch (error) {
        console.error('Error checking feedback status:', error);
    }
}

// Load participants data
async function loadParticipantsData() {
    try {
        const participantsSnapshot = await db.collection('participants')
            .where('teamId', '==', teamId)
            .get();

        currentParticipants = [];
        const tableBody = document.getElementById('participantsTableBody');
        tableBody.innerHTML = '';
        
        participantsSnapshot.forEach(doc => {
            const participant = doc.data();
            currentParticipants.push({ id: doc.id, ...participant });
            const row = document.createElement('tr');
            
            const events = participant.events || [];
            const lotNumbers = participant.lotNumber || {};
            const lotDisplay = events.map(event => {
                const lot = lotNumbers[event] || 'Not assigned';
                return `${formatEventNameForDisplay(event)}: ${lot}`;
            }).join('<br>');
            
            const participantName = participant.isTeamLead 
                ? `${participant.name} <strong>(Team Leader)</strong>` 
                : participant.name;
            
            const eventsDisplay = events.length > 0 
                ? formatEventsForDisplay(events).join(', ') 
                : 'No events selected';
            
            row.innerHTML = `
                <td>${participantName}</td>
                <td>${eventsDisplay}</td>
                <td>${lotDisplay || 'Not assigned'}</td>
            `;
            tableBody.appendChild(row);
        });
        
    } catch (error) {
        console.error('Error loading participants:', error);
    }
}

// Load food tokens
async function loadFoodTokens() {
    try {
        const tokensSnapshot = await db.collection('foodTokens')
            .where('teamId', '==', teamId)
            .get();
        
        if (tokensSnapshot.empty) {
            return;
        }
        
        const tokenData = tokensSnapshot.docs[0].data();
        const tokenCount = tokenData.tokenCount || (teamData.participantCount + (teamData.staffCount || 0));
        
        document.getElementById('foodTokenCount').textContent = tokenCount;
        
        // Generate QR code
        const qrData = {
            teamId: teamId,
            regId: teamData.regId,
            tokenId: tokensSnapshot.docs[0].id,
            tokenCount: tokenCount
        };
        
        const qrContainer = document.getElementById('foodTokenQR');
        if (!qrContainer) {
            console.error('QR container not found');
            return;
        }
        qrContainer.innerHTML = '<p style="padding: 1rem;">Loading QR code...</p>';
        
        const qrJson = JSON.stringify(qrData);
        
        // Function to generate QR via library (if available)
        const generateQRWithLibrary = () => {
            if (typeof QRCode === 'undefined') return false;
            qrContainer.innerHTML = '';
            const canvas = document.createElement('canvas');
            qrContainer.appendChild(canvas);
            QRCode.toCanvas(canvas, qrJson, {
                width: 300,
                margin: 2,
                color: { dark: '#000000', light: '#FFFFFF' }
            }, (error) => {
                if (error) {
                    console.warn('QR library failed, using API fallback:', error);
                    generateQRWithAPI();
                }
            });
            return true;
        };
        
        // Fallback: use free QR API when library fails (no external lib needed)
        function generateQRWithAPI() {
            const encoded = encodeURIComponent(qrJson);
            const url = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encoded}`;
            qrContainer.innerHTML = '';
            const img = document.createElement('img');
            img.src = url;
            img.alt = 'Food Token QR Code';
            img.style.maxWidth = '300px';
            img.style.height = 'auto';
            img.onerror = () => {
                qrContainer.innerHTML = '<p style="color: red; padding: 1rem;">QR code could not be generated. Please check your connection and refresh.</p>';
            };
            qrContainer.appendChild(img);
        }
        
        // Try library first, then retry, then API fallback
        let attempts = 0;
        const maxAttempts = 5;
        const tryLibrary = () => {
            if (generateQRWithLibrary()) return;
            attempts++;
            if (attempts < maxAttempts) {
                setTimeout(tryLibrary, 500);
            } else {
                generateQRWithAPI();
            }
        };
        tryLibrary();
        
    } catch (error) {
        console.error('Error loading food tokens:', error);
    }
}

// Load venue and instructions
async function loadVenueAndInstructions() {
    try {
        const settingsDoc = await db.collection('adminSettings').doc('main').get();
        if (settingsDoc.exists) {
            const settings = settingsDoc.data();
            
            if (settings.venue) {
                document.getElementById('venueDetails').innerHTML = `<p>${settings.venue}</p>`;
                document.getElementById('venueInfo').style.display = 'block';
            }
            
            if (settings.instructions) {
                document.getElementById('instructionsDetails').innerHTML = `<p>${settings.instructions}</p>`;
                document.getElementById('instructionsInfo').style.display = 'block';
            }
            
            if (settings.eventTimings) {
                let timingsHTML = '<ul>';
                Object.entries(settings.eventTimings).forEach(([event, timing]) => {
                    timingsHTML += `<li><strong>${event}:</strong> ${timing}</li>`;
                });
                timingsHTML += '</ul>';
                document.getElementById('venueDetails').innerHTML += timingsHTML;
            }
        }
    } catch (error) {
        console.error('Error loading venue and instructions:', error);
    }
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

// Update dashboard
function updateDashboard() {
    if (!teamData) return;
    
    // Update payment status
    const paymentStatus = document.getElementById('detailPaymentStatus');
    paymentStatus.textContent = teamData.paymentStatus || 'pending';
    paymentStatus.className = `status-badge ${teamData.paymentStatus || 'pending'}`;
    
    // Reload participants if lots are updated
    if (teamData.lotNumbers && Object.keys(teamData.lotNumbers).length > 0) {
        loadParticipantsData();
    }
}

// Setup add-participant modal and handlers
function setupParticipantManagement() {
    const addBtn = document.getElementById('addParticipantDashboardBtn');
    const modal = document.getElementById('addParticipantModal');
    const closeBtn = document.getElementById('closeAddParticipantModal');
    const eventsContainer = document.getElementById('dpParticipantEvents');
    const saveBtn = document.getElementById('saveParticipantBtn');

    if (!addBtn || !modal || !eventsContainer || !saveBtn) return;

    // Render event checkboxes once
    eventsContainer.innerHTML = eventsList.map(event => `
        <label class="event-option">
            <input type="checkbox" class="dp-participant-event" value="${event}">
            <div class="event-card">
                <span class="event-name">${event}</span>
                <span class="event-checkmark">✓</span>
            </div>
        </label>
    `).join('');

    addBtn.addEventListener('click', () => {
        if (!teamData) return;
        const totalCurrent = teamData.participantCount || currentParticipants.length;
        if (totalCurrent >= MAX_PARTICIPANTS) {
            showToast(`Maximum ${MAX_PARTICIPANTS} participants allowed (including team leader)`, 'error');
            return;
        }
        // Reset form fields
        document.getElementById('dpParticipantName').value = '';
        document.getElementById('dpParticipantEmail').value = '';
        document.getElementById('dpParticipantPhone').value = '';
        eventsContainer.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.getElementById('dpParticipantEventCount').textContent = `Selected: 0/${MAX_EVENTS_PER_PERSON}`;
        modal.style.display = 'block';
    });

    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            modal.style.display = 'none';
        });
    }

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    // Track selected events count
    eventsContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('dp-participant-event')) {
            const selected = eventsContainer.querySelectorAll('.dp-participant-event:checked');
            if (selected.length > MAX_EVENTS_PER_PERSON) {
                e.target.checked = false;
                showToast(`Maximum ${MAX_EVENTS_PER_PERSON} events per participant`, 'error');
                return;
            }
            document.getElementById('dpParticipantEventCount').textContent =
                `Selected: ${selected.length}/${MAX_EVENTS_PER_PERSON}`;
        }
    });

    saveBtn.addEventListener('click', handleAddParticipantFromDashboard);
}

// Add a participant from dashboard and update Firestore
async function handleAddParticipantFromDashboard() {
    try {
        if (!teamData) return;

        const name = document.getElementById('dpParticipantName').value.trim();
        const email = document.getElementById('dpParticipantEmail').value.trim();
        const phone = document.getElementById('dpParticipantPhone').value.trim();
        const events = Array.from(document.querySelectorAll('.dp-participant-event:checked'))
            .map(cb => cb.value);

        if (!name || !email || !phone) {
            showToast('Please fill all participant details', 'error');
            return;
        }

        if (!validateEmail(email)) {
            showToast('Invalid participant email', 'error');
            return;
        }

        if (!validatePhone(phone)) {
            showToast('Invalid participant phone number', 'error');
            return;
        }

        if (events.length === 0) {
            showToast('Participant must select at least one event', 'error');
            return;
        }

        if (events.length > MAX_EVENTS_PER_PERSON) {
            showToast(`Participant can select maximum ${MAX_EVENTS_PER_PERSON} events`, 'error');
            return;
        }

        // Check duplicates inside this team
        const lowerEmail = email.toLowerCase();
        const phoneKey = phone;

        if (teamData.email && teamData.email.toLowerCase() === lowerEmail) {
            showToast('Email already exist', 'error');
            return;
        }
        if (teamData.phone && teamData.phone === phoneKey) {
            showToast('Mobile number already exist', 'error');
            return;
        }

        for (const p of currentParticipants) {
            if ((p.email || '').toLowerCase() === lowerEmail) {
                showToast('Email already exist', 'error');
                return;
            }
            if (p.phone === phoneKey) {
                showToast('Mobile number already exist', 'error');
                return;
            }
        }

        // Check global duplicates (teams + participants)
        try {
            const [teamsEmail, partsEmail] = await Promise.all([
                db.collection('teams').where('email', '==', email).limit(1).get(),
                db.collection('participants').where('email', '==', email).limit(1).get()
            ]);
            if (!teamsEmail.empty || !partsEmail.empty) {
                showToast('Email already exist', 'error');
                return;
            }

            const [teamsPhone, partsPhone] = await Promise.all([
                db.collection('teams').where('phone', '==', phone).limit(1).get(),
                db.collection('participants').where('phone', '==', phone).limit(1).get()
            ]);
            if (!teamsPhone.empty || !partsPhone.empty) {
                showToast('Mobile number already exist', 'error');
                return;
            }
        } catch (dupError) {
            console.error('Error checking duplicates from dashboard:', dupError);
            showToast('Error checking duplicate email/mobile. Please try again.', 'error');
            return;
        }

        const totalCurrent = teamData.participantCount || currentParticipants.length;
        if (totalCurrent >= MAX_PARTICIPANTS) {
            showToast(`Maximum ${MAX_PARTICIPANTS} participants allowed (including team leader)`, 'error');
            return;
        }

        // Create participant doc
        const participant = {
            teamId,
            name,
            email,
            phone,
            events,
            isTeamLead: false,
            lotNumber: {}
        };

        const participantRef = await db.collection('participants').add(participant);

        // Update team doc: participantCount and embedded participants array
        const newParticipantCount = totalCurrent + 1;
        const updatedParticipantsArray = Array.isArray(teamData.participants)
            ? [...teamData.participants, { name, email, phone, events }]
            : [{ name, email, phone, events }];

        await db.collection('teams').doc(teamId).update({
            participantCount: newParticipantCount,
            participants: updatedParticipantsArray
        });

        teamData.participantCount = newParticipantCount;
        teamData.participants = updatedParticipantsArray;

        // Update food token count
        const tokensSnapshot = await db.collection('foodTokens')
            .where('teamId', '==', teamId)
            .limit(1)
            .get();
        if (!tokensSnapshot.empty) {
            const tokenRef = tokensSnapshot.docs[0].ref;
            await tokenRef.update({
                tokenCount: firebase.firestore.FieldValue.increment(1)
            });
        }

        showToast('Participant added successfully', 'success');

        // Refresh UI
        await loadParticipantsData();
        await loadFoodTokens();
        document.getElementById('detailParticipants').textContent = teamData.participantCount;

        // Close modal
        const modal = document.getElementById('addParticipantModal');
        if (modal) modal.style.display = 'none';
    } catch (error) {
        console.error('Error adding participant from dashboard:', error);
        showToast('Error adding participant. Please try again.', 'error');
    }
}
