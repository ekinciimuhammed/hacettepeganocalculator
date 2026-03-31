/* Split-script loader for LuxPDF */
(function () {
    if (window.__luxpdfSplitScriptsLoaded) {
        return;
    }
    window.__luxpdfSplitScriptsLoaded = true;

    // Mark tool detail pages so we can simplify layout via CSS.
    const isToolPage = /\/tools\/[^/]+\.html(?:\?|$)/.test(window.location.pathname);
    if (isToolPage) {
        document.documentElement.classList.add('tool-page-minimal');
    }

    const version = '1.4';
    // Resolve paths relative to this loader file (not the current HTML page path).
    // This is required for tool pages under `tools/` that include `../script.js`.
    const loaderScript = document.currentScript || Array.from(document.scripts).find((s) => {
        try {
            return /\/pdf_tools\/script\.js(?:\?|$)/.test(s.src) || /\/script\.js(?:\?|$)/.test(s.src);
        } catch (_) {
            return false;
        }
    });
    const baseUrl = loaderScript && loaderScript.src
        ? new URL('./', loaderScript.src).href
        : new URL('./', window.location.href).href;
    const sources = [
        'scripts/luxpdf-theme.js',
        'scripts/pdf-converter-base.js',
        'scripts/pdf-converter-ui.js',
        'scripts/pdf-converter-workflows.js',
        'scripts/pdf-converter-converters-a.js',
        'scripts/pdf-converter-converters-b.js',
        'scripts/pdf-converter-tools.js',
        'scripts/luxpdf-site-init.js'
    ];

    if (document.readyState === 'loading') {
        document.write(
            sources
                .map((src) => '<script src="' + new URL(src, baseUrl).href + '?v=' + version + '"><\/script>')
                .join('')
        );
        return;
    }

    sources.forEach((src) => {
        const script = document.createElement('script');
        script.src = new URL(src, baseUrl).href + '?v=' + version;
        script.async = false;
        document.head.appendChild(script);
    });
})();
