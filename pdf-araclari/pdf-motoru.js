
(function () {
    if (window.__PDFAraclariSplitScriptsLoaded) {
        return;
    }
    window.__PDFAraclariSplitScriptsLoaded = true;
    
    const version = '1.4';
    const isToolPage = window.location.pathname.includes('/tools/');
    const prefix = isToolPage ? '../' : '';
    
    const sources = [
        prefix + 'scripts/isleyici-tema.js',
        prefix + 'scripts/pdf-isleyici-temel.js',
        prefix + 'scripts/pdf-isleyici-arayuz.js',
        prefix + 'scripts/pdf-isleyici-isakislar.js',
        prefix + 'scripts/pdf-isleyici-donusturucu-a.js',
        prefix + 'scripts/pdf-isleyici-donusturucu-b.js',
        prefix + 'scripts/pdf-isleyici-araclar.js',
        prefix + 'scripts/ana-islevler.js'
    ];

    if (document.readyState === 'loading') {
        document.write(sources.map((src) => '<script src="' + src + '?v=' + version + '"><\/script>').join(''));
        return;
    }

    sources.forEach((src) => {
        const script = document.createElement('script');
        script.src = src + '?v=' + version;
        script.async = false;
        document.head.appendChild(script);
    });
})();
