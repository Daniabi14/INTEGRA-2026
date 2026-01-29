// QR Code Generator Utility

// Generate QR code for food token
function generateFoodTokenQR(teamId, regId, tokenId, tokenCount) {
    const qrData = {
        teamId: teamId,
        regId: regId,
        tokenId: tokenId,
        tokenCount: tokenCount,
        timestamp: Date.now()
    };
    
    return JSON.stringify(qrData);
}

// Generate QR code image
async function generateQRCodeImage(data, containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    const width = options.width || 300;
    const margin = options.margin || 2;
    
    try {
        await QRCode.toCanvas(container, data, {
            width: width,
            margin: margin,
            color: {
                dark: '#000000',
                light: '#FFFFFF'
            }
        });
    } catch (error) {
        console.error('Error generating QR code:', error);
        container.innerHTML = '<p>Error generating QR code</p>';
    }
}

// Download QR code as image
function downloadQRCode(canvasId, filename) {
    const canvas = document.querySelector(`#${canvasId} canvas`);
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = filename || 'qrcode.png';
    link.href = canvas.toDataURL();
    link.click();
}
