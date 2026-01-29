// Utility Functions

// Generate Registration ID
function generateRegId() {
    const prefix = 'INT';
    const timestamp = Date.now().toString().slice(-6);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
}

// Normalize event name for display (e.g. stored "reelrush" -> "ReelRush")
function formatEventNameForDisplay(name) {
    if (typeof name !== 'string') return name;
    if (name.toLowerCase() === 'reelrush') return 'ReelRush';
    return name;
}

// Format events array for display (handles legacy "reelrush" in DB)
function formatEventsForDisplay(events) {
    if (!Array.isArray(events) || events.length === 0) return [];
    return events.map(formatEventNameForDisplay);
}

// Format currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 2rem;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        color: white;
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
        z-index: 3000;
        animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Add CSS for toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(100%);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Validate email
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Validate phone
function validatePhone(phone) {
    const re = /^[0-9]{10}$/;
    return re.test(phone);
}

// Format date
function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Export CSV
function exportToCSV(data, filename) {
    if (!data || data.length === 0) {
        showToast('No data to export', 'error');
        return;
    }

    const headers = Object.keys(data[0]);
    const csvContent = [
        headers.join(','),
        ...data.map(row => 
            headers.map(header => {
                const value = row[header];
                if (value === null || value === undefined) return '';
                // Escape commas and quotes in values
                const stringValue = String(value).replace(/"/g, '""');
                return `"${stringValue}"`;
            }).join(',')
        )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast(`Exported ${filename} successfully`, 'success');
}

// Check user role
async function checkUserRole(userId) {
    try {
        const userDoc = await db.collection('users').doc(userId).get();
        if (userDoc.exists) {
            return userDoc.data().role;
        }
        return null;
    } catch (error) {
        console.error('Error checking user role:', error);
        return null;
    }
}

// Get user role from email (for coordinators)
async function getCoordinatorEvent(email) {
    try {
        const coordinatorsSnapshot = await db.collection('coordinators')
            .where('email', '==', email)
            .get();
        
        if (!coordinatorsSnapshot.empty) {
            return coordinatorsSnapshot.docs[0].data().eventName;
        }
        return null;
    } catch (error) {
        console.error('Error getting coordinator event:', error);
        return null;
    }
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Check if user is authenticated
function requireAuth() {
    return new Promise((resolve, reject) => {
        auth.onAuthStateChanged((user) => {
            if (user) {
                resolve(user);
            } else {
                reject(new Error('User not authenticated'));
                window.location.href = 'login.html';
            }
        });
    });
}

// Basic mobile navigation toggle for pages that include a hamburger menu
document.addEventListener('DOMContentLoaded', () => {
    const hamburger = document.getElementById('hamburger');
    const navMenu = document.getElementById('navMenu');

    if (hamburger && navMenu) {
        hamburger.addEventListener('click', () => {
            navMenu.classList.toggle('active');
        });
    }
});

// Safe sessionStorage helpers (handle environments where access is blocked)
function safeSessionSet(key, value) {
    try {
        if (window.sessionStorage && typeof window.sessionStorage.setItem === 'function') {
            window.sessionStorage.setItem(key, value);
        }
    } catch (e) {
        console.warn('SessionStorage set blocked:', e);
    }
}

function safeSessionGet(key) {
    try {
        if (window.sessionStorage && typeof window.sessionStorage.getItem === 'function') {
            return window.sessionStorage.getItem(key);
        }
    } catch (e) {
        console.warn('SessionStorage get blocked:', e);
    }
    return null;
}

function safeSessionClear() {
    try {
        if (window.sessionStorage && typeof window.sessionStorage.clear === 'function') {
            window.sessionStorage.clear();
        }
    } catch (e) {
        console.warn('SessionStorage clear blocked:', e);
    }
}
