// EmailJS Configuration

const EMAILJS_CONFIG = {
    
    // Public Key
    publicKey: 'u1loN7YwzBjci-TdO',
    
    // Service IDs
    services: {
        registration: 'service_flcb9tq',
        reminder: 'service_flcb9tq'   // You can use same service
    },
    
    // Template IDs
    templates: {
        registration: 'template_o895tyz',
        reminder: 'template_o895tyz' // Same template for now
    }
};

// Initialize EmailJS
if (typeof emailjs !== 'undefined') {
    emailjs.init(EMAILJS_CONFIG.publicKey);
    console.log('EmailJS initialized SUCCESSFULLY');
} else {
    console.warn('EmailJS library not loaded!');
}

// Export config globally
window.EMAILJS_CONFIG = EMAILJS_CONFIG;
