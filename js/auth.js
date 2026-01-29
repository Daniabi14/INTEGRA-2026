// Authentication JavaScript

let currentRole = 'participant';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginTabs = document.querySelectorAll('.login-tab');
    const coordinatorEventGroup = document.getElementById('coordinatorEventGroup');

    // Handle tab switching
    loginTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            loginTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentRole = tab.getAttribute('data-role');

            // Show/hide coordinator event selector
            if (currentRole === 'coordinator') {
                coordinatorEventGroup.style.display = 'block';
            } else {
                coordinatorEventGroup.style.display = 'none';
            }
        });
    });

    // Handle form submission
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const rawIdentifier = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const errorDiv = document.getElementById('loginError');
            const submitBtn = loginForm.querySelector('button[type="submit"]');

            try {
                errorDiv.classList.remove('show');
                errorDiv.textContent = '';

                // Show loading state
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Logging in...';
                }

                // Resolve participant "username/regId" -> email
                const email = await resolveLoginIdentifierToEmail(rawIdentifier, currentRole);

                // Sign in with Firebase Auth
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                const user = userCredential.user;

                // Route based on role
                await routeUser(user, email);

            } catch (error) {
                console.error('Login error:', error);
                let message = error.message || 'Login failed. Please check your credentials.';

                // If participant user doesn't exist yet, auto-provision from credentials (without logging out current session)
                if (currentRole === 'participant' && isAuthUserNotFoundLike(error)) {
                    try {
                        const resolvedEmail = await resolveLoginIdentifierToEmail(rawIdentifier, 'participant');
                        const cred = await findCredentialForIdentifierOrEmail(rawIdentifier, resolvedEmail);
                        const storedPassword = cred?.password ? String(cred.password) : null;

                        // Only auto-create if the entered password matches stored credentials
                        if (storedPassword && String(password) === storedPassword) {
                            await ensureParticipantAuthUserExists(resolvedEmail, storedPassword);
                            const userCredential = await auth.signInWithEmailAndPassword(resolvedEmail, storedPassword);
                            await routeUser(userCredential.user, resolvedEmail);
                            return;
                        }
                    } catch (e) {
                        console.warn('Auto-provision failed:', e);
                    }
                }

                // Handle participant-specific errors (before admin verification)
                if (currentRole === 'participant' && error && (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password')) {
                    try {
                        const teamsSnapshot = await db.collection('teams')
                            .where('email', '==', email)
                            .limit(1)
                            .get();

                        if (!teamsSnapshot.empty) {
                            const team = teamsSnapshot.docs[0].data();
                            const status = (team.paymentStatus || 'pending').toLowerCase();

                            if (status === 'pending') {
                                message = 'Your registration is pending admin verification. Please try again after admin verifies your payment.';
                            } else if (status === 'rejected') {
                                message = 'Your registration/payment has been rejected. Please contact the event coordinators for details.';
                            } else if (status === 'verified') {
                                message = 'Your registration is verified, but your login is not yet active. Please contact the event coordinators.';
                            }
                        } else {
                            // No registration found for this email – treat as invalid credentials
                            message = 'Invalid username or password.';
                        }
                    } catch (statusError) {
                        console.error('Error checking participant verification status:', statusError);
                        // Fallback to generic invalid credentials message
                        message = 'Invalid username or password.';
                    }
                } else if (error && (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password')) {
                    // Generic invalid credentials for other roles
                    message = 'Invalid username or password.';
                } else if (error && error.code === 'auth/too-many-requests') {
                    message = 'Too many failed attempts. Please try again later or reset your password.';
                }

                // Normalize ugly JSON/identity-toolkit errors into a clean message
                if (typeof message === 'string' && (message.includes('INVALID_LOGIN_CREDENTIALS') || message.trim().startsWith('{'))) {
                    message = 'Invalid username or password.';
                }

                errorDiv.textContent = message;
                errorDiv.classList.add('show');
                // Also show as popup so users clearly see the reason
                if (typeof showToast === 'function') {
                    showToast(message, 'error');
                }

                // Reset button
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Login';
                }
            }
        });
    }
});

// Allow participants to login using Email OR Username OR Reg ID
async function resolveLoginIdentifierToEmail(identifier, role) {
    const raw = (identifier || '').trim();
    if (!raw) return raw;

    // Non-participant roles: expect real email
    if (role !== 'participant') return raw;

    // If it's already an email, use it directly
    if (raw.includes('@')) return raw;

    // Cache to avoid repeated lookups (speeds up login)
    const cacheKey = `login_email_for_${raw.toLowerCase()}`;
    const cached = safeSessionGet(cacheKey);
    if (cached) return cached;

    // 1) Treat as Reg ID: credentials doc id is regId
    try {
        const credByRegId = await db.collection('credentials').doc(raw).get();
        if (credByRegId.exists) {
            const email = (credByRegId.data()?.email || '').trim();
            if (email) {
                safeSessionSet(cacheKey, email);
                return email;
            }
        }
    } catch (_) { /* ignore */ }

    // 2) Treat as stored username in credentials
    try {
        const snap = await db.collection('credentials')
            .where('username', '==', raw)
            .limit(1)
            .get();
        if (!snap.empty) {
            const email = (snap.docs[0].data()?.email || '').trim();
            if (email) {
                safeSessionSet(cacheKey, email);
                return email;
            }
        }
    } catch (_) { /* ignore */ }

    // 3) Fallback: older records may not store `username` correctly.
    // Scan credentials once and match by email prefix (before '@'), then cache.
    try {
        const scanCacheKey = `credentials_scan_done`;
        const scanDone = safeSessionGet(scanCacheKey);
        // Only scan if not done in this session (prevents repeated heavy reads)
        if (!scanDone) {
            const allCredsSnap = await db.collection('credentials').limit(2000).get();
            for (const doc of allCredsSnap.docs) {
                const data = doc.data() || {};
                const email = String(data.email || '').trim();
                if (!email || !email.includes('@')) continue;
                const prefix = email.split('@')[0].toLowerCase();
                if (prefix === raw.toLowerCase()) {
                    safeSessionSet(cacheKey, email);
                    safeSessionSet(scanCacheKey, '1');
                    return email;
                }
            }
            safeSessionSet(scanCacheKey, '1');
        }
    } catch (_) { /* ignore */ }

    return raw;
}

function isAuthUserNotFoundLike(error) {
    const code = error?.code || '';
    const msg = String(error?.message || '');
    return (
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-credential' ||
        code === 'auth/invalid-login-credentials' ||
        msg.includes('INVALID_LOGIN_CREDENTIALS')
    );
}

async function findCredentialForIdentifierOrEmail(identifier, resolvedEmail) {
    const raw = (identifier || '').trim();
    if (!raw && !resolvedEmail) return null;

    // Try by regId document id
    if (raw && /^INT/i.test(raw)) {
        const doc = await db.collection('credentials').doc(raw).get();
        if (doc.exists) return doc.data();
    }

    // Try by username
    if (raw && !raw.includes('@')) {
        const snap = await db.collection('credentials').where('username', '==', raw).limit(1).get();
        if (!snap.empty) return snap.docs[0].data();
    }

    // Try by email
    if (resolvedEmail) {
        const snap = await db.collection('credentials').where('email', '==', resolvedEmail).limit(1).get();
        if (!snap.empty) return snap.docs[0].data();
    }

    return null;
}

async function ensureParticipantAuthUserExists(email, password) {
    const config = window.firebaseConfig;
    if (!config) throw new Error('Missing firebaseConfig');

    const secondaryName = 'participant-provision';
    const secondaryApp =
        firebase.apps?.find(a => a.name === secondaryName) ||
        firebase.initializeApp(config, secondaryName);
    const secondaryAuth = secondaryApp.auth();

    try {
        await secondaryAuth.createUserWithEmailAndPassword(email, password);
    } catch (e) {
        // If already exists, ignore
        if (e?.code !== 'auth/email-already-in-use') throw e;
    } finally {
        try { await secondaryAuth.signOut(); } catch (_) { }
    }
}

// Route user to appropriate dashboard
async function routeUser(user, email) {
    try {
        if (currentRole === 'admin') {
            // Quick check: known admin emails (instant)
            const adminEmails = ['admin@integra2026.com', 'admin@integra.com'];
            if (adminEmails.includes(email)) {
                window.location.href = 'dashboard-admin.html';
                return;
            }

            // Check both UID and email in parallel
            const [adminDocResult, adminByEmailResult] = await Promise.all([
                db.collection('admins').doc(user.uid).get(),
                db.collection('admins').where('email', '==', email).limit(1).get()
            ]);

            if (adminDocResult.exists || !adminByEmailResult.empty) {
                window.location.href = 'dashboard-admin.html';
                return;
            }

            throw new Error('Unauthorized: Admin access required');

        } else if (currentRole === 'coordinator') {
            const eventName = document.getElementById('coordinatorEvent').value;
            if (!eventName) {
                throw new Error('Please select an event');
            }

            // Check by both email and userId in parallel
            const coordSnapshot = await db.collection('coordinators')
                .where('eventName', '==', eventName)
                .get();

            const found = coordSnapshot.docs.some(doc => {
                const data = doc.data();
                return data.email === email || data.userId === user.uid;
            });

            if (found) {
                safeSessionSet('coordinatorEvent', eventName);
                window.location.href = 'dashboard-coordinator.html';
                return;
            }

            throw new Error('Unauthorized: Coordinator access required for this event');

        } else if (currentRole === 'food') {
            // Quick check: known food coordinator emails (instant)
            const foodEmails = ['food@integra2026.com', 'food_co@integra.com'];
            if (foodEmails.includes(email)) {
                window.location.href = 'dashboard-food.html';
                return;
            }

            // Check both UID and email in parallel
            const [foodDocResult, foodByEmailResult] = await Promise.all([
                db.collection('foodCoordinators').doc(user.uid).get(),
                db.collection('foodCoordinators').where('email', '==', email).limit(1).get()
            ]);

            if (foodDocResult.exists || !foodByEmailResult.empty) {
                window.location.href = 'dashboard-food.html';
                return;
            }

            throw new Error('Unauthorized: Food coordinator access required');

        } else {
            // Participant login - allow access only after admin verification
            const teamsSnapshot = await db.collection('teams')
                .where('email', '==', email)
                .limit(1)
                .get();

            if (teamsSnapshot.empty) {
                throw new Error('No registration found with this email');
            }

            const teamDoc = teamsSnapshot.docs[0];
            const teamData = teamDoc.data();
            const status = (teamData.paymentStatus || 'pending').toLowerCase();

            if (status !== 'verified') {
                // Not yet verified – log the user back out and show a clear message
                await auth.signOut();

                if (status === 'pending') {
                    throw new Error('Your registration is pending admin verification. Please try again after your payment is verified.');
                }

                if (status === 'rejected') {
                    throw new Error('Your registration/payment has been rejected. Please contact the event coordinators for details.');
                }

                // Any other unexpected status
                throw new Error('Your registration is not active yet. Please contact the event coordinators.');
            }

            // Verified – allow dashboard access
            safeSessionSet('teamId', teamDoc.id);
            safeSessionSet('regId', teamData.regId);
            window.location.href = 'dashboard-participant.html';
            return;
        }
    } catch (error) {
        const errorDiv = document.getElementById('loginError');
        errorDiv.textContent = error.message;
        errorDiv.classList.add('show');
        throw error;
    }
}

// Logout function
function logout() {
    auth.signOut().then(() => {
        safeSessionClear();
        localStorage.clear();
        window.location.href = 'login.html';
    }).catch(error => {
        console.error('Logout error:', error);
        showToast('Error logging out', 'error');
    });
}

// Make logout function globally available
window.logout = logout;

// Add logout button listeners
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtns = document.querySelectorAll('#logoutBtn');
    logoutBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            logout();
        });
    });
});
