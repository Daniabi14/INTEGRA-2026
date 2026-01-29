// EmailJS Configuration

const EMAILJS_CONFIG = {
    
    // Public Key
    publicKey: 'sDNj9uKaLizT65LCX',
    
    // Service IDs
    services: {
        registration: 'service_d4xguel',
        reminder: 'service_d4xguel'   // You can use same service
    },
    
    // Template IDs
    templates: {
        registration: 'template_v2f61e6',
        reminder: 'template_v2f61e6' // Same template for now
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
