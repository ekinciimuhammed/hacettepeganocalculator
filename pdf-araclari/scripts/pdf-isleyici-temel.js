/* Split from pdf-motoru.js: base PDFIsleyici class */
class PDFIsleyici {
    constructor() {
        this.currentTool = null;
        this.uploadedFiles = [];
        this.isReversed = false; // Track reverse state for sort-pages tool
        this.handleFileInputChange = null; // Reference to file input change handler
        this.imageResizerReference = null; // Store reference dimensions for locked-aspect resize mode
        this.watermarkImageAsset = null; // Selected watermark image data for add-watermark tool
        this.watermarkPreviewRenderToken = 0; // Avoid stale async preview renders
        this.watermarkInteractionCleanup = null; // Cleanup handlers for watermark drag/resize
        this.init();
    }
}

window.PDFIsleyici = PDFIsleyici;
