// QR Code Scanner Utility

// This file is used by dashboard-food.js
// The actual scanner implementation is in dashboard-food.js using html5-qrcode library

// Validate QR code data structure
function validateQRData(data) {
    try {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        
        return (
            parsed.teamId &&
            parsed.regId &&
            parsed.tokenId &&
            typeof parsed.tokenCount === 'number'
        );
    } catch (error) {
        return false;
    }
}

// Extract QR code data
function extractQRData(qrString) {
    try {
        return JSON.parse(qrString);
    } catch (error) {
        console.error('Error parsing QR data:', error);
        return null;
    }
}
