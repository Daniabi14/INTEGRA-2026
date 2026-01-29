// Registration JavaScript

let participants = [];
let additionalParticipantCount = 0; // Additional participants (excluding team leader)
const maxParticipants = 15; // Total including team leader
const feePerParticipant = 150;
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
    // Note: Digital Don is overall event, not selectable in registration
];

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('registrationForm');
    const addParticipantBtn = document.getElementById('addParticipantBtn');
    const removeParticipantBtn = document.getElementById('removeParticipantBtn');
    const hasStaffYes = document.getElementById('hasStaffYes');
    const hasStaffNo = document.getElementById('hasStaffNo');
    const staffDetailsContainer = document.getElementById('staffDetailsContainer');

    // Load payment QR code
    loadPaymentQR();
    // Do not auto-add additional participants.
    // Participant 2+ should appear only when user clicks "Add Participant".

    // Team leader event selection
    let teamLeaderEvents = [];

    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('team-leader-event')) {
            const selected = document.querySelectorAll('.team-leader-event:checked');
            if (selected.length > MAX_EVENTS_PER_PERSON) {
                e.target.checked = false;
                showToast(`Team Leader can select max ${MAX_EVENTS_PER_PERSON} events`, "error");
                return;
            }

            teamLeaderEvents = Array.from(selected).map(cb => cb.value);
            document.getElementById('teamLeaderEventCount').textContent =
                `Selected: ${teamLeaderEvents.length}/${MAX_EVENTS_PER_PERSON}`;
        }
    });


    // Add participant button
    if (addParticipantBtn) {
        addParticipantBtn.addEventListener('click', () => {
            const totalCount = 1 + additionalParticipantCount; // 1 for team leader
            if (totalCount < maxParticipants) {
                addParticipant();
            } else {
                showToast(`Maximum ${maxParticipants} participants allowed (including team leader)`, 'error');
            }
        });
    }

    // Global remove participant button (removes the last additional participant)
    if (removeParticipantBtn) {
        removeParticipantBtn.addEventListener('click', () => {
            if (additionalParticipantCount <= 0) {
                showToast('No additional participants to remove', 'error');
                return;
            }
            // Remove the last participant in the array
            const lastParticipant = participants[participants.length - 1];
            if (lastParticipant) {
                removeParticipant(lastParticipant.id);
            }
        });
    }

    // Handle staff yes/no toggle
    if (hasStaffYes && hasStaffNo) {
        hasStaffYes.addEventListener('change', () => {
            if (hasStaffYes.checked) {
                staffDetailsContainer.style.display = 'block';
                // Make staff fields required
                document.getElementById('staffName').required = true;
                document.getElementById('staffPhone').required = true;
                document.getElementById('staffEmail').required = true;
            }
        });

        hasStaffNo.addEventListener('change', () => {
            if (hasStaffNo.checked) {
                staffDetailsContainer.style.display = 'none';
                // Clear and make staff fields optional
                document.getElementById('staffName').value = '';
                document.getElementById('staffPhone').value = '';
                document.getElementById('staffEmail').value = '';
                document.getElementById('staffName').required = false;
                document.getElementById('staffPhone').required = false;
                document.getElementById('staffEmail').required = false;
            }
        });
    }

    // Form submission
    if (form) {
        form.addEventListener('submit', handleRegistration);
    }

    updateParticipantCount();
    updateTotalAmount();
});

// Add participant form
function addParticipant() {
    const totalCount = 1 + additionalParticipantCount; // 1 for team leader
    if (totalCount >= maxParticipants) {
        showToast(`Maximum ${maxParticipants} participants allowed (including team leader)`, 'error');
        return;
    }

    additionalParticipantCount++;
    const participant = {
        id: additionalParticipantCount,
        name: '',
        email: '',
        phone: '',
        events: []
    };
    participants.push(participant);

    const container = document.getElementById('participantsContainer');
    const participantDiv = document.createElement('div');
    participantDiv.className = 'participant-item';
    participantDiv.id = `participant-${additionalParticipantCount}`;
    participantDiv.innerHTML = `
        <h3>Participant ${additionalParticipantCount + 1}</h3>
        <p style="font-size: 0.9rem; color: #6b7280; margin-bottom: 0.5rem;">(Team Leader is Participant 1)</p>
        <div class="form-row">
            <div class="form-group">
                <label>Name *</label>
                <input type="text" class="participant-name" required>
            </div>
            <div class="form-group">
                <label>Email *</label>
                <input type="email" class="participant-email" required>
            </div>
            <div class="form-group">
                <label>Phone *</label>
                <input type="tel" class="participant-phone" pattern="[0-9]{10}" required>
            </div>
        </div>
        <div class="form-group">
            <label>Select Events (Maximum ${MAX_EVENTS_PER_PERSON}) *</label>
            <div class="events-selection events-grid">
                ${eventsList.map(event => `
                    <label class="event-option">
                        <input type="checkbox" class="participant-event" value="${event}" data-participant="${additionalParticipantCount}">
                        <div class="event-card">
                            <span class="event-name">${event}</span>
                            <span class="event-checkmark">✓</span>
                        </div>
                    </label>
                `).join('')}
            </div>
            <p class="selected-events-count event-count-display">Selected: 0/${MAX_EVENTS_PER_PERSON}</p>
        </div>
    `;

    container.appendChild(participantDiv);

    // Add event selection listeners
    const eventCheckboxes = participantDiv.querySelectorAll('.participant-event');
    eventCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', function () {
            const participantId = parseInt(this.getAttribute('data-participant'));
            const selectedEvents = Array.from(participantDiv.querySelectorAll('.participant-event:checked'))
                .map(cb => cb.value);

            if (selectedEvents.length > MAX_EVENTS_PER_PERSON) {
                this.checked = false;
                showToast(`Maximum ${MAX_EVENTS_PER_PERSON} events per participant`, 'error');
                return;
            }

            // Update participant data
            const participant = participants.find(p => p.id === participantId);
            if (participant) {
                participant.events = selectedEvents;
            }

            // Update count display
            const countDisplay = participantDiv.querySelector('.selected-events-count');
            if (countDisplay) {
                countDisplay.textContent = `Selected: ${selectedEvents.length}/${MAX_EVENTS_PER_PERSON}`;
            }
        });
    });

    updateParticipantCount();
    updateTotalAmount();
}

// Remove participant
function removeParticipant(id) {
    const participantDiv = document.getElementById(`participant-${id}`);
    if (participantDiv) {
        participantDiv.remove();
        participants = participants.filter(p => p.id !== id);
        // Recalculate additional participant count
        additionalParticipantCount = participants.length;
        updateParticipantCount();
        updateTotalAmount();
    }
}

// Update participant count display
function updateParticipantCount() {
    const countDisplay = document.getElementById('participantCount');
    if (countDisplay) {
        const totalCount = 1 + additionalParticipantCount; // 1 for team leader
        countDisplay.textContent = `${totalCount}/${maxParticipants} (Team Leader + ${additionalParticipantCount} additional)`;
    }
}

// Update total amount
function updateTotalAmount() {
    const hasStaff = document.getElementById('hasStaffYes')?.checked || false;
    const staffCount = hasStaff ? 1 : 0;
    const totalCount = 1 + additionalParticipantCount; // 1 for team leader + additional participants

    // For payment, charge based on actual participants count (no minimum team size)
    const total = totalCount * feePerParticipant;
    const totalDisplay = document.getElementById('totalAmount');
    if (totalDisplay) {
        totalDisplay.textContent = total;
    }
}

// Handle registration
async function handleRegistration(e) {
    e.preventDefault();

    // Get form data first
    const collegeName = document.getElementById('collegeName').value.trim();
    const teamLeadName = document.getElementById('teamLeadName').value.trim();
    const teamLeadEmail = document.getElementById('teamLeadEmail').value.trim();
    const teamLeadPhone = document.getElementById('teamLeadPhone').value.trim();
    const hasStaff = document.getElementById('hasStaffYes')?.checked || false;
    const staffName = hasStaff ? document.getElementById('staffName').value.trim() : '';
    const staffPhone = hasStaff ? document.getElementById('staffPhone').value.trim() : '';
    const staffEmail = hasStaff ? document.getElementById('staffEmail').value.trim() : '';
    const staffCount = hasStaff ? 1 : 0;
    const transactionId = document.getElementById('transactionId').value.trim();

    if (!collegeName || !teamLeadName || !teamLeadEmail || !teamLeadPhone || !transactionId) {
        showToast('Please fill all required fields', 'error');
        return;
    }

    if (!validateEmail(teamLeadEmail)) {
        showToast('Invalid team lead email', 'error');
        return;
    }

    if (!validatePhone(teamLeadPhone)) {
        showToast('Invalid team lead phone number', 'error');
        return;
    }

    // Validate staff details if staff is selected
    if (hasStaff) {
        if (!staffName || !staffPhone || !staffEmail) {
            showToast('Please fill all staff details', 'error');
            return;
        }
        if (!validateEmail(staffEmail)) {
            showToast('Invalid staff email', 'error');
            return;
        }
        if (!validatePhone(staffPhone)) {
            showToast('Invalid staff phone number', 'error');
            return;
        }
    }

    // Validate team leader event selection
    const selectedTeamLeaderEvents = Array.from(document.querySelectorAll('.team-leader-event:checked'))
        .map(cb => cb.value);

    if (selectedTeamLeaderEvents.length === 0) {
        showToast('Team Leader must select at least one event', 'error');
        return;
    }

    if (selectedTeamLeaderEvents.length > MAX_EVENTS_PER_PERSON) {
        showToast(`Team Leader can select maximum ${MAX_EVENTS_PER_PERSON} events`, 'error');
        return;
    }

    const totalCount = 1 + additionalParticipantCount; // 1 for team leader

    if (totalCount > maxParticipants) {
        showToast(`Maximum ${maxParticipants} participants allowed (including team leader)`, 'error');
        return;
    }

    // Check for duplicate emails / phones within this form
    const emailSet = new Set();
    const phoneSet = new Set();

    function addEmail(email, label) {
        if (!email) return false;
        const key = email.trim().toLowerCase();
        if (emailSet.has(key)) {
            showToast(`${label} email already exist`, 'error');
            return true;
        }
        emailSet.add(key);
        return false;
    }

    function addPhone(phone, label) {
        if (!phone) return false;
        const key = phone.trim();
        if (phoneSet.has(key)) {
            showToast(`${label} mobile number already exist`, 'error');
            return true;
        }
        phoneSet.add(key);
        return false;
    }

    if (addEmail(teamLeadEmail, 'Team leader')) return;
    if (addPhone(teamLeadPhone, 'Team leader')) return;

    if (hasStaff) {
        if (addEmail(staffEmail, 'Staff')) return;
        if (addPhone(staffPhone, 'Staff')) return;
    }

    // Collect additional participant data (only items inside participantsContainer)
    const participantItems = document.querySelectorAll('#participantsContainer .participant-item');
    const participantsData = [];

    for (let i = 0; i < participantItems.length; i++) {
        const item = participantItems[i];
        const name = item.querySelector('.participant-name').value.trim();
        const email = item.querySelector('.participant-email').value.trim();
        const phone = item.querySelector('.participant-phone').value.trim();
        const selectedEvents = Array.from(item.querySelectorAll('.participant-event:checked'))
            .map(cb => cb.value);

        if (!name || !email || !phone) {
            showToast(`Please fill all fields for Participant ${i + 2}`, 'error');
            return;
        }

        if (selectedEvents.length === 0) {
            showToast(`Participant ${i + 2} must select at least one event`, 'error');
            return;
        }

        if (selectedEvents.length > MAX_EVENTS_PER_PERSON) {
            showToast(`Participant ${i + 2} can select maximum ${MAX_EVENTS_PER_PERSON} events`, 'error');
            return;
        }

        if (!validateEmail(email)) {
            showToast(`Invalid email for Participant ${i + 2}`, 'error');
            return;
        }

        if (!validatePhone(phone)) {
            showToast(`Invalid phone number for Participant ${i + 2}`, 'error');
            return;
        }

        if (addEmail(email, `Participant ${i + 2}`)) return;
        if (addPhone(phone, `Participant ${i + 2}`)) return;

        participantsData.push({
            name,
            email,
            phone,
            events: selectedEvents
        });
    }

    // Check against existing records to prevent duplicate email / phone globally
    const uniqueEmails = Array.from(emailSet);
    const uniquePhones = Array.from(phoneSet);

    try {
        // Check emails in teams and participants
        for (const email of uniqueEmails) {
            const teamsWithEmail = await db.collection('teams')
                .where('email', '==', email)
                .limit(1)
                .get();
            if (!teamsWithEmail.empty) {
                showToast('Email already exist', 'error');
                return;
            }

            const participantsWithEmail = await db.collection('participants')
                .where('email', '==', email)
                .limit(1)
                .get();
            if (!participantsWithEmail.empty) {
                showToast('Email already exist', 'error');
                return;
            }
        }

        // Check phones in teams and participants
        for (const phone of uniquePhones) {
            const teamsWithPhone = await db.collection('teams')
                .where('phone', '==', phone)
                .limit(1)
                .get();
            if (!teamsWithPhone.empty) {
                showToast('Mobile number already exist', 'error');
                return;
            }

            const participantsWithPhone = await db.collection('participants')
                .where('phone', '==', phone)
                .limit(1)
                .get();
            if (!participantsWithPhone.empty) {
                showToast('Mobile number already exist', 'error');
                return;
            }
        }
    } catch (dupError) {
        console.error('Error checking duplicate contacts:', dupError);
        showToast('Error checking for duplicate email / mobile. Please try again.', 'error');
        return;
    }

    // Amount to be collected is based on actual participants (no minimum team size)
    const totalAmount = totalCount * feePerParticipant;
    const regId = await generateSequentialRegId();

    // Add team leader as first participant
    const teamLeaderParticipant = {
        name: teamLeadName,
        email: teamLeadEmail,
        phone: teamLeadPhone,
        events: selectedTeamLeaderEvents // Include team leader's selected events
    };

    // Combine team leader with other participants
    const allParticipantsData = [teamLeaderParticipant, ...participantsData];

    // Create team data
    const teamData = {
        collegeName,
        teamLead: teamLeadName,
        email: teamLeadEmail,
        phone: teamLeadPhone,
        participants: allParticipantsData,
        participantCount: totalCount, // Total including team leader
        staffCount: staffCount,
        staffDetails: hasStaff ? {
            name: staffName,
            phone: staffPhone,
            email: staffEmail
        } : null,
        events: [...new Set([...selectedTeamLeaderEvents, ...participantsData.flatMap(p => p.events)])],
        amount: totalAmount,
        paymentStatus: 'pending',
        transactionId,
        regId,
        lotNumbers: {},
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const submitBtn = document.getElementById('submitBtn');

    try {
        // Disable submit button
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Registering...';
        }

        // Use batch for faster writes
        const batch = db.batch();

        // Save to Firebase
        const teamRef = db.collection('teams').doc();
        batch.set(teamRef, teamData);

        // Save participants in batch (including team leader as first)
        const participantRefs = [];
        for (let i = 0; i < allParticipantsData.length; i++) {
            const participant = allParticipantsData[i];
            const participantRef = db.collection('participants').doc();
            batch.set(participantRef, {
                teamId: teamRef.id,
                name: participant.name,
                email: participant.email,
                phone: participant.phone,
                events: participant.events || [],
                isTeamLead: i === 0,
                lotNumber: {}
            });
            participantRefs.push(participantRef);
        }

        // Save payment record in batch
        const paymentRef = db.collection('payments').doc();
        batch.set(paymentRef, {
            teamId: teamRef.id,
            amount: totalAmount,
            transactionId,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Generate food tokens in batch
        const foodTokenCount = totalCount + staffCount;
        const foodTokenRef = db.collection('foodTokens').doc();
        batch.set(foodTokenRef, {
            teamId: teamRef.id,
            regId: regId,
            tokenCount: foodTokenCount,
            redeemed: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Update event counts in batch
        teamData.events.forEach((eventName) => {
            const eventRef = db.collection('events').doc(eventName);
            batch.set(eventRef, {
                eventName: eventName,
                teamCount: firebase.firestore.FieldValue.increment(1),
                rules: '',
                venue: '',
                timing: ''
            }, { merge: true });
        });

        // Store credentials in batch
        const credRef = db.collection('credentials').doc(regId);
        batch.set(credRef, {
            email: teamData.email,
            username: teamData.email,
            password: teamData.phone,
            regId: regId,
            college: teamData.collegeName,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });

        // Commit all at once - much faster!
        await batch.commit();

        // Show registration summary
        showRegistrationSummary(teamData, teamRef.id);

    } catch (error) {
        console.error('Registration error:', error);
        const msg = (error && (error.message || error.code)) ? (error.message || error.code) : 'Registration failed. Please try again.';
        showToast(msg, 'error');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Complete Registration';
        }
    }
}

// Generate Registration ID in series: INT26001, INT26002, ...
async function generateSequentialRegId() {
    const counterRef = db.collection('counters').doc('regId');
    const start = 26001;
    const current = await db.runTransaction(async (tx) => {
        const snap = await tx.get(counterRef);
        if (!snap.exists) {
            tx.set(counterRef, { next: start + 1 });
            return start;
        }
        const data = snap.data() || {};
        const next = typeof data.next === 'number' ? data.next : start;
        tx.update(counterRef, { next: next + 1 });
        return next;
    });
    return `INT${current}`;
}

// Generate username and password
function generateUsername(email) {
    // Use email as username (or first part before @)
    return email.split('@')[0];
}

function generatePassword() {
    const length = 8;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    return password;
}

// Load payment QR code from admin settings
async function loadPaymentQR() {
    try {
        const settingsDoc = await db.collection('adminSettings').doc('main').get();
        const qrImage = document.getElementById('paymentQRImage');
        const qrPlaceholder = document.getElementById('qrPlaceholder');

        if (settingsDoc.exists) {
            const settings = settingsDoc.data();

            if (settings.paymentQRUrl) {
                qrImage.src = settings.paymentQRUrl;
                qrImage.style.display = 'block';
                qrPlaceholder.style.display = 'none';
            } else {
                // No QR configured in settings, fall back to bundled QR + UPI text
                qrImage.src = 'assets/qr_code.png';
                qrImage.style.display = 'block';
                qrPlaceholder.innerHTML = `
                    <p style="color: #6b7280; margin-bottom: 0.5rem;">Scan the QR code above or pay using UPI ID</p>
                    <p style="font-weight: 600; color: #2563eb; font-size: 1.1rem;">9080928437@pz</p>
                `;
            }
        } else {
            qrPlaceholder.innerHTML = `
                <p style="color: #6b7280; margin-bottom: 0.5rem;">Pay using UPI ID</p>
                <p style="font-weight: 600; color: #2563eb; font-size: 1.1rem;">9080928437@pz</p>
            `;
        }
    } catch (error) {
        console.error('Error loading payment QR:', error);
        const qrPlaceholder = document.getElementById('qrPlaceholder');
        qrPlaceholder.innerHTML = `
            <p style="color: #6b7280;">Pay using UPI ID: <strong>9080928437@pz</strong></p>
        `;
    }
}

// Show registration summary
function showRegistrationSummary(teamData, teamId) {
    const modal = document.getElementById('summaryModal');
    const summaryDiv = document.getElementById('registrationSummary');

    // Use email as username and team lead phone as password
    const username = teamData.email;
    const password = teamData.phone;

    summaryDiv.innerHTML = `
        <div class="summary-details">
            <p><strong>Registration ID:</strong> ${teamData.regId}</p>
            <p><strong>College:</strong> ${teamData.collegeName}</p>
            <p><strong>Team Lead:</strong> ${teamData.teamLead}</p>
            <p><strong>Total Participants:</strong> ${teamData.participantCount} (Team Leader + ${teamData.participantCount - 1} additional)</p>
            <p><strong>Staff:</strong> ${teamData.staffCount || 0}${teamData.staffDetails ? ` - ${teamData.staffDetails.name} (${teamData.staffDetails.email})` : ''}</p>
            <p><strong>Amount:</strong> ₹${teamData.amount}</p>
            <p><strong>Events:</strong> ${formatEventsForDisplay(teamData.events || []).join(', ')}</p>
            <hr style="margin: 1rem 0;">
            <h3>Login Credentials:</h3>
            <div style="background: #fee2e2; padding: 1rem; border-radius: 0.5rem; margin: 1rem 0; border-left: 4px solid #ef4444;">
                <p><strong>Username/Email:</strong> ${username}</p>
                <p><strong>Password:</strong> ${password}</p>
                <p style="margin-top: 0.5rem; font-size: 0.9rem; color: #991b1b;">
                    <strong>⚠️ Important:</strong> Please save these credentials. You will need them to login after admin verification.
                </p>
            </div>
            <hr style="margin: 1rem 0;">
            <h3>Participants List:</h3>
            <ul style="text-align: left; max-height: 200px; overflow-y: auto;">
                ${teamData.participants.map((p, idx) => {
        const isTeamLead = idx === 0;
        const eventsDisplay = p.events && p.events.length > 0 ? formatEventsForDisplay(p.events).join(', ') : 'No events selected';
        return `
                    <li>
                        ${idx + 1}. ${p.name}${isTeamLead ? ' <strong>(Team Leader)</strong>' : ''} - ${eventsDisplay}
                    </li>
                `;
    }).join('')}
            </ul>
            <p style="margin-top: 1rem; color: #6b7280;">
                <strong>Note:</strong> Your registration is pending verification. 
                Login credentials will also be sent to your email (${teamData.email}) after admin verification.
            </p>
        </div>
    `;

    modal.style.display = 'block';

    // Close modal handler
    const closeBtn = modal.querySelector('.close');
    closeBtn.onclick = () => {
        modal.style.display = 'none';
        window.location.href = 'index.html';
    };
}
