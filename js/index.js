// Homepage JavaScript

// Events data with detailed rules (shown in modal on click)
const events = [
    {
        name: 'Project Expo',
        icon: 'assets/PROJECT_EXPO.png',
        rules:
            '<ol>' +
            '<li>Each team must consist of Two participants.</li>' +
            '<li>Participants must submit their project presentation at the registration desk.</li>' +
            '<li>The project presentation must contain Participants Name, College Name, Email ID, and Contact Number.</li>' +
            '<li>The presentation should not exceed 15 slides.</li>' +
            '<li>Total time limit is 10 minutes (8 minutes for presentation and 2 minutes for questions).</li>' +
            '<li>Topics must be related to the latest trends in Computer Science and Information Technology.</li>' +
            '<li>The judges’ decision will be final.</li>' +
            '</ol>'
    },
    {
        name: 'BrainBytes',
        icon: 'assets/BRAIN_BYTES.png',
        rules:
            '<ol>' +
            '<li>Each team must consist of Two participants.</li>' +
            '<li>The event will consist of multiple technical quiz rounds.</li>' +
            '<li>Questions will be based on Programming, Operating Systems, DBMS, DSA, and Computing Technologies.</li>' +
            '<li>The rules will be announced during each round.</li>' +
            '<li>Partial answers will not be awarded marks, and there will be no negative marking for wrong answers.</li>' +
            '<li>The judges’ decision will be final.</li>' +
            '</ol>'
    },
    {
        name: 'Digital Link',
        icon: 'assets/DIGITAL_LINK.png',
        rules:
            '<ol>' +
            '<li>Each team must consist of Two participants.</li>' +
            '<li>Participants must identify the hidden word by connecting the given pictures.</li>' +
            '<li>Questions will be based on IT companies, founders, programming, databases, and recent trends.</li>' +
            '<li>The event will be conducted in multiple rounds as per the organizers’ guidelines.</li>' +
            '<li>The rules will be announced during each round.</li>' +
            '<li>Partial answers will not be awarded marks, and there will be no negative marking for wrong answers.</li>' +
            '<li>The judges’ decision will be final.</li>' +
            '</ol>'
    },
    {
        name: 'HackBlitz',
        icon: 'assets/HACKBLITZ.png',
        rules:
            '<ol>' +
            '<li>Each team must consist of One participant.</li>' +
            '<li>Participants will be required to solve programming problems using C, C++, Python, SQL, and Java.</li>' +
            '<li>Linux or Windows systems will be provided by the organizers.</li>' +
            '<li>The maximum time duration is 90 minutes.</li>' +
            '<li>The event will be conducted in multiple rounds as per the organizers’ guidelines.</li>' +
            '<li>The rules will be announced during each round.</li>' +
            '<li>Use of internet or external storage devices is strictly prohibited.</li>' +
            '<li>Partial answers will not be awarded marks, and there will be no negative marking for wrong answers.</li>' +
            '<li>The judges’ decision will be final.</li>' +
            '</ol>'
    },
    {
        name: 'Web Solutions',
        icon: 'assets/WEB_SOLUTIONS.png',
        rules:
            '<ol>' +
            '<li>Each team must consist of One participant.</li>' +
            '<li>Participants must design a website based on the given theme, and the website must contain at least three pages.</li>' +
            '<li>The topic will be announced on the spot.</li>' +
            '<li>Participants can use HTML, CSS and JavaScript.</li>' +
            '<li>Systems will be provided by the organizers. Personal systems are not permitted.</li>' +
            '<li>The judges’ decision will be final.</li>' +
            '</ol>'
    },
    {
        name: 'Software Showcase',
        icon: 'assets/SOFTWARE_SHOWCASE.png',
        rules:
            '<ol>' +
            '<li>Each team may have Six participants.</li>' +
            '<li>Participants must present the assigned software, and the software names will be provided by the organizers.</li>' +
            '<li>Participants may use charts and stationery materials for the presentation at their own expense.</li>' +
            '<li>Each team will be given a total of 8 minutes: 5 minutes for presentation and 3 minutes for Q&A.</li>' +
            '<li>The judges’ decision will be final.</li>' +
            '</ol>'
    },
    {
        name: 'BrandCraft',
        icon: 'assets/BRANDCRAFT.png',
        rules:
            '<ol>' +
            '<li>Each team must consist of One participant.</li>' +
            '<li>Participants are required to design a poster or branding material based on the given theme.</li>' +
            '<li>Participants may use tools such as Photoshop, Illustrator, and PicsArt. The use of online tools is strictly prohibited. Participants must bring their own devices.</li>' +
            '<li>Designs must be original. Any copied designs will lead to disqualification.</li>' +
            '<li>The time duration for this event is 60 minutes.</li>' +
            '<li>The judges’ decision will be final.</li>' +
            '</ol>'
    },
    {
        name: 'ReelRush',
        icon: 'assets/REELRUSH.png',
        rules:
            '<ol>' +
            '<li>Each team must consist of Two participants.</li>' +
            '<li>Participants are required to create a short video based on the given theme.</li>' +
            '<li>The video duration must not exceed 3 minutes.</li>' +
            '<li>The video must be recorded within the DBCY campus premises.</li>' +
            '<li>The content must be in English and original. The use of downloaded or copied videos is strictly prohibited.</li>' +
            '<li>The judges’ decision will be final.</li>' +
            '<p><b>TOPIC: Exploring the Beauty of DBCY and Computer Science</b></p>' +
            '</ol>'
    },
    {
        name: 'Digital Don',
        icon: 'assets/DIGITAL_DON.png',
        rules:
            'Digital Don is the overall individual championship title awarded to the best performer across all events in INTEGRA 2026. The winner will be selected based on cumulative scores from all technical and creative events. Judges’ decision is final.',
        isSpecial: true
    }
];

// Initialize events grid
document.addEventListener('DOMContentLoaded', () => {
    const eventsGrid = document.getElementById('eventsGrid');
    
    events.forEach(event => {
        const eventCard = document.createElement('div');
        eventCard.className = event.isSpecial ? 'event-card event-card-special' : 'event-card';
        eventCard.innerHTML = `
            <div class="event-icon">
                <img src="${event.icon}" alt="${event.name}" class="event-icon-img">
            </div>
            <h3>${event.name}</h3>
            ${event.isSpecial ? '<span class="special-badge">★ SPECIAL EVENT</span>' : ''}
            <p class="click-rules">Click to view rules</p>
        `;
        eventCard.addEventListener('click', () => showEventModal(event));
        eventsGrid.appendChild(eventCard);
    });

    // Load event counts from Firebase
    loadEventCounts();

    // Setup navigation
    setupNavigation();

    // Setup about tabs
    setupAboutTabs();
    
    // Check feedback status
    checkFeedbackStatus();
});

// Check if feedback is enabled
async function checkFeedbackStatus() {
    try {
        if (!window.db) return;
        
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

// Show event modal
function showEventModal(event) {
    const modal = document.getElementById('eventModal');
    const eventName = document.getElementById('modalEventName');
    const eventRules = document.getElementById('modalEventRules');
    
    eventName.textContent = event.name;
    eventRules.innerHTML = event.rules;
    
    modal.style.display = 'block';
}

// Close modal
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('eventModal');
    const closeBtn = document.querySelector('.close');
    
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
});

// Load event counts from Firebase
async function loadEventCounts() {
    try {
        if (!window.db) return;
        
        const eventsSnapshot = await db.collection('events').get();
        const eventCounts = {};
        
        eventsSnapshot.forEach(doc => {
            eventCounts[doc.id] = doc.data().teamCount || 0;
        });

        // Update event cards with counts
        const eventCards = document.querySelectorAll('.event-card');
        eventCards.forEach(card => {
            const eventName = card.querySelector('h3').textContent;
            const count = eventCounts[eventName] || 0;
            const p = card.querySelector('p');
            if (p && !p.textContent.includes('teams')) {
                p.textContent = `${count} teams registered`;
            }
        });
    } catch (error) {
        console.error('Error loading event counts:', error);
    }
}

// Setup navigation
function setupNavigation() {
    const navMenu = document.getElementById('navMenu');

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                if (navMenu) {
                    navMenu.classList.remove('active');
                }
            }
        });
    });

    // Active nav link
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });
}

// Setup about tabs
function setupAboutTabs() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            
            // Remove active class from all buttons and contents
            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked button and corresponding content
            btn.classList.add('active');
            const targetContent = document.getElementById(`${targetTab}-content`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}
