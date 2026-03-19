document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const dashboard = document.getElementById('dashboard');
    const coursesBody = document.getElementById('courses-body');
    const gpaValue = document.getElementById('gpa-value');

    // Progress
    const progressFill = document.getElementById('progress-fill');
    const currentAktsSpan = document.getElementById('current-akts');

    // Buttons
    const addCourseBtn = document.getElementById('add-course-btn');
    const manualEntryBtn = document.getElementById('manual-entry-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');

    // Theme Logic
    const storedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (storedTheme === 'dark' || (!storedTheme && systemPrefersDark)) {
        document.documentElement.setAttribute('data-theme', 'dark');
        if (themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun" style="color:#f59e0b;"></i>';
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            if (currentTheme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
            } else {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun" style="color:#f59e0b;"></i>';
            }
            // Re-render chart if it exists to update colors (Chart.js canvas doesn't auto-update colors)
            if (document.getElementById('view-analytics').classList.contains('active')) {
                renderAnalytics();
            }
        });
    }

    // --- Bendis Feature Removed ---

    // Data State
    let courses = [];
    let gradeScale = {};
    let forcedMode = null; // 'AKTS' or 'UK' or null (auto)

    // Helper: Parse Semester String to Value
    function parseSemester(semStr) {
        if (!semStr || semStr === 'Manuel') return 0; // Manuel or unknown
        // Expect format: "2023-2024 Güz"
        // Regex to capture year and term
        const match = semStr.match(/(\d{4})-\d{4}\s+(\w+)/);
        if (match) {
            const year = parseInt(match[1]);
            const termStr = match[2].toLowerCase();
            let termVal = 1; // Default
            if (termStr.includes('güz')) termVal = 2; // Güz comes first in academic year starting Sep? 
            // Actually: 2023-2024 Güz (Sep 2023), 2023-2024 Bahar (Feb 2024), 2023-2024 Yaz (Jun 2024)
            // So order: Güz < Bahar < Yaz
            else if (termStr.includes('bahar')) termVal = 5;
            else if (termStr.includes('yaz')) termVal = 8;

            return (year * 10) + termVal;
        }
        return 0;
    }

    // Helper: Mark Repeated Courses
    function flagRepeatedCourses() {
        // Reset all first
        courses.forEach(c => {
            c.isRepeated = false;
            c.isOngoing = false; // New state for taken but not graded courses
        });

        // Group by Code
        const groups = {};
        courses.forEach(c => {
            // Normalize code: remove spaces, uppercase
            const codeKey = c.code.replace(/\s+/g, '').toUpperCase();
            if (!groups[codeKey]) groups[codeKey] = [];
            groups[codeKey].push(c);
        });

        // Process Groups
        Object.keys(groups).forEach(key => {
            const group = groups[key];
            if (group.length > 1) {
                // Sort by Semester Descending, then ID Descending
                group.sort((a, b) => {
                    const semA = parseSemester(a.semester);
                    const semB = parseSemester(b.semester);
                    if (semA !== semB) return semB - semA; // Newer semester first
                    return b.id - a.id; // Newer ID first (if same semester)
                });

                // Algorithm:
                // Find the first course with a VALID grade. That is the Active one.
                // Courses NEWER than active but without grade -> Ongoing (Don't affect GPA, don't replace active)
                // Courses OLDER than active (with or without grade) -> Repeated (Invalid)

                let activeFound = false;

                for (let i = 0; i < group.length; i++) {
                    const c = group[i];
                    // Check if has valid grade (not empty, not -, not null)
                    const hasGrade = c.grade && c.grade !== '-' && c.grade.trim() !== '';

                    if (!activeFound) {
                        if (hasGrade) {
                            // This is our ACTIVE course (Newest with grade)
                            activeFound = true;
                            // Leave isRepeated = false, isOngoing = false
                        } else {
                            // Newer but no grade
                            c.isOngoing = true;
                            // Not repeated, but also not Active in calculations logic (handled in calc)
                        }
                    } else {
                        // We already found a newer active course, so this old one is Repeated
                        c.isRepeated = true;
                    }
                }
            } else if (group.length === 1) {
                // Single course check
                const c = group[0];
                const hasGrade = c.grade && c.grade !== '-' && c.grade.trim() !== '';
                if (!hasGrade) c.isOngoing = true;
            }
        });
    }

    // Default Grade Scale for Manual Mode
    const defaultGradeScale = {
        'A1': 4.00, 'A2': 3.75, 'A3': 3.50,
        'B1': 3.25, 'B2': 3.00, 'B3': 2.75,
        'C1': 2.50, 'C2': 2.25, 'C3': 2.00,
        'D': 1.75, 'F1': 0.00, 'F2': 0.00, 'F3': 0.00
    };

    // --- Event Listeners ---

    // Manual Entry
    if (manualEntryBtn) {
        manualEntryBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent triggering dropzone click
            gradeScale = defaultGradeScale;
            courses = [];

            dashboard.classList.remove('hidden');
            dropZone.classList.add('hidden');

            renderCourses();
            calculateStats();

            saveToLocalStorage();

            // Auto-add one draft course to start with
            if (addCourseBtn) addCourseBtn.click();
        });
    }

    // Add Course
    if (addCourseBtn) {
        addCourseBtn.addEventListener('click', () => {
            const newId = courses.length ? Math.max(...courses.map(c => c.id)) + 1 : 1;
            courses.unshift({
                id: newId,
                semester: 'Manuel',
                code: '',
                name: '',
                akts: '', // User must enter
                grade: Object.keys(gradeScale)[0] || 'AA',
                status: 'Z',
                isDraft: true // Not included in GNO until saved
            });
            renderCourses();
            // Don't calculate stats yet
        });
    }

    // Downloads
    // Downloads
    window.exportData = (type) => {
        if (type === 'json') {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(courses, null, 2));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", "courses.json");
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
        } else if (type === 'csv') {
            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "Donem,Ders Kodu,Ders Adi,AKTS,Harf Notu\n";
            courses.forEach(c => {
                csvContent += `${c.semester},${c.code},${c.name},${c.akts},${c.grade}\n`;
            });
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", "courses.csv");
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
    };

    // Drag & Drop
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', () => {
        if (fileInput.files.length) handleFile(fileInput.files[0]);
    });

    // Reset Button (Legacy removed, kept for safety found in DOM?)
    const resetBtn = document.getElementById('reset-app-btn');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetApp);
    }

    // Quick Upload Button (New Seamless)
    const quickUploadBtn = document.getElementById('quick-upload-btn');
    if (quickUploadBtn) {
        quickUploadBtn.addEventListener('click', () => {
            // Trigger same file input
            fileInput.click();
        });
    }

    // --- Core Functions ---

    async function handleFile(file) {
        if (file.type !== 'application/pdf') {
            alert('Lütfen sadece PDF dosyası yükleyin.');
            return;
        }

        // UI Feedback
        const originalDropContent = dropZone.innerHTML;
        const gnoVal = document.getElementById('gpa-value');
        const gnoOriginal = gnoVal ? gnoVal.innerHTML : '0.00';

        if (!dashboard.classList.contains('hidden')) {
            if (gnoVal) gnoVal.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; color: var(--primary-color);"></i>';
        } else {
            dropZone.innerHTML = '<div class="upload-content"><i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; color: var(--primary-color);"></i><h3>Analiz Ediliyor...</h3></div>';
        }

        try {
            // Read File as ArrayBuffer
            const arrayBuffer = await file.arrayBuffer();

            // Load PDF
            const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
            const pdf = await loadingTask.promise;

            // Extract Text Pages
            const pages = [];
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();

                // Helper to organize items into lines
                const items = textContent.items.map(item => ({
                    str: item.str,
                    // transform[4] is x, transform[5] is y
                    x: item.transform[4],
                    y: item.transform[5],
                    w: item.width,
                    h: item.height,
                    endX: item.transform[4] + item.width
                }));

                // Group by Y-coordinate (Lines)
                // We use a tolerance because characters on the same line might have slightly different Y
                const yTolerance = 5;
                const lines = [];

                // Sort by Y descending (Top -> Bottom)
                items.sort((a, b) => b.y - a.y);

                if (items.length > 0) {
                    let currentLine = [items[0]];
                    let currentY = items[0].y;

                    for (let j = 1; j < items.length; j++) {
                        const item = items[j];
                        if (Math.abs(item.y - currentY) < yTolerance) {
                            // Same line
                            currentLine.push(item);
                        } else {
                            // New line
                            lines.push(currentLine);
                            currentLine = [item];
                            currentY = item.y;
                        }
                    }
                    if (currentLine.length > 0) lines.push(currentLine);
                }

                // Process each line
                let pageText = "";
                lines.forEach(lineItems => {
                    // Sort items in line by X ascending (Left -> Right)
                    lineItems.sort((a, b) => a.x - b.x);

                    let lineStr = "";
                    let lastEndX = -1;

                    lineItems.forEach(item => {
                        if (lastEndX !== -1) {
                            // Check gap
                            const gap = item.x - lastEndX;
                            // Heuristic: If gap is significant (> 2 units), add space
                            // Adjust this threshold based on typical font size or test
                            if (gap > 3 || (gap > 0.5 && item.str.trim().length > 0)) {
                                lineStr += " ";
                            }
                        }
                        lineStr += item.str;
                        lastEndX = item.endX;
                    });
                    pageText += lineStr + "\n";
                });

                pages.push(pageText);
            }

            // 1. Extract Grade Scale
            const extractedScale = extractGradeScale(pages);

            // 2. Extract Courses (General Strategy)
            let extractedCourses = extractCourses(pages);

            // 3. Fallback: Custom Parser
            if (!extractedCourses || extractedCourses.length === 0) {
                console.log("General parser found no courses. Attempting fallback parser...");
                // Note: extractCustomFormat is now imported from custom_parser.js globally
                if (typeof extractCustomFormat === 'function') {
                    extractedCourses = extractCustomFormat(pages);
                } else {
                    console.error("Custom Parser not loaded!");
                }
            }

            if (!extractedCourses || extractedCourses.length === 0) {
                throw new Error('Ders bilgileri okunamadı veya desteklenmeyen format.');
            }

            // Success! Logic
            courses = extractedCourses;
            gradeScale = extractedScale;

            // Check Header for Credit Type Mode + Academic Unit/Program
            const headerInfo = extractHeaderInfo(pages.length > 0 ? pages[0] : "");
            if (headerInfo.mode) {
                console.log("Header Detection Mode:", headerInfo.mode);
                // Calls UI update + calculation
                if (typeof window.setMode === 'function') {
                    window.setMode(headerInfo.mode);
                } else {
                    forcedMode = headerInfo.mode;
                }
                // Optionally show toast or log about auto-detected mode
            } else {
                forcedMode = null;
            }

            // Auto-select graduation faculty/department if transcript header provides clues
            if (typeof window.autoSelectGraduationByTranscript === 'function') {
                window.autoSelectGraduationByTranscript({
                    academicUnit: headerInfo.academicUnit || '',
                    program: headerInfo.program || ''
                });
            }



            dashboard.classList.remove('hidden');
            dropZone.classList.add('hidden');
            if (resetBtn) resetBtn.style.display = 'block';

            renderCourses();
            renderGradeScale();
            calculateStats();

            saveToLocalStorage();

            // Hide simulation
            const simSection = document.getElementById('target-simulation-section');
            if (simSection) simSection.style.display = 'none';

        } catch (err) {
            console.error(err);
            alert('Hata: ' + err.message);
            // Restore UI
            if (!dashboard.classList.contains('hidden')) {
                if (gnoVal) gnoVal.innerHTML = gnoOriginal;
            } else {
                dropZone.innerHTML = `<div class="upload-content"><i class="fa-solid fa-triangle-exclamation" style="color:var(--danger-color); font-size: 2rem;"></i><h3>Hata Oluştu</h3><p>${err.message}</p></div>`;
                setTimeout(() => dropZone.innerHTML = originalDropContent, 3000);
            }
        }
    }

    function resetApp() {
        if (!confirm('Mevcut hesaplama verileri temizlenecek. Devam etmek istiyor musunuz?')) return;

        courses = [];
        gradeScale = {};
        forcedMode = null;
        fileInput.value = ''; // Reset input

        dashboard.classList.add('hidden');
        dropZone.classList.remove('hidden');
        if (resetBtn) resetBtn.style.display = 'none';

        localStorage.removeItem('gano_data');

        // Hide Simulation Panel if open
        const simSection = document.getElementById('target-simulation-section');
        const toggleSimBtn = document.getElementById('toggle-sim-btn');
        if (simSection) simSection.style.display = 'none';
        if (toggleSimBtn) {
            toggleSimBtn.style.background = 'transparent';
            toggleSimBtn.style.borderColor = '#cbd5e1';
        }
    }

    // --- Client-Side PDF Parsing Logic ---

    function extractGradeScale(pages) {
        let scale = {};
        // Use the last page for scale usually
        const lastPage = pages.length > 0 ? pages[pages.length - 1] : "";
        const lines = lastPage.split('\n');

        // Regex Strategies
        // 1. Compact Colon Format: "A1: 4.00"
        const colonPattern = /\b([A-Z][A-Z0-9]*):\s*(\d+(?:[.,]\d+)?)/g;

        // 2. Detailed Table: "95-100 A1 4,00 Success"
        const rangePattern = /(\d+(?:-\d+)?)\s+([A-Z]+[0-9]*)\s+(\d+(?:[.,]\d+)?)\s+([a-zA-ZçğıöşüÇĞİÖŞÜ]+)/;

        // 3. Simple Fallback: "A1 4,00"
        const simplePattern = /\b([A-Z]{1,2}[0-9]?)\s+(\d(?:[.,]\d{1,2})?)\b/;

        // Strategy 1
        let colonMatchesFound = false;
        for (const line of lines) {
            let match;
            // Reset lastIndex for global regex in loop iteration if re-using, 
            // but here we create new iterator strictly or use matchAll
            const matches = [...line.matchAll(colonPattern)];
            if (matches.length > 0) {
                colonMatchesFound = true;
                for (const m of matches) {
                    const g = m[1];
                    const val = parseFloat(m[2].replace(',', '.'));
                    if (!isNaN(val)) scale[g] = val;
                }
            }
        }

        if (colonMatchesFound && Object.keys(scale).length > 3) return scale;

        // Strategy 2
        for (const line of lines) {
            const match = line.match(rangePattern);
            if (match) {
                const g = match[2];
                const val = parseFloat(match[3].replace(',', '.'));
                if (!isNaN(val)) scale[g] = val;
            }
        }

        if (Object.keys(scale).length > 3) return scale;

        // Strategy 3
        for (const line of lines) {
            if (line.includes("Ölçeği") || line.includes("Scale")) continue;

            const match = line.match(simplePattern);
            if (match) {
                const g = match[1];
                // Time/Date Guard
                if (/\d/.test(g) && g.length > 2) continue; // e.g. 23:47 parsed as grade?

                const val = parseFloat(match[2].replace(',', '.'));
                if (!isNaN(val)) scale[g] = val;
            }
        }

        // Fallback Default
        if (Object.keys(scale).length < 3) {
            console.log("Explicit extraction failed/low. Using fallback scale.");
            scale = {
                'A1': 4.00, 'A2': 3.75, 'A3': 3.50,
                'B1': 3.25, 'B2': 3.00, 'B3': 2.75,
                'C1': 2.50, 'C2': 2.25, 'C3': 2.00, 'D': 1.75,
                'F1': 0.00, 'F2': 0.00, 'F3': 0.00,
                // Common
                'AA': 4.00, 'BA': 3.50, 'BB': 3.00, 'CB': 2.50,
                'CC': 2.00, 'DC': 1.50, 'DD': 1.00,
                'FF': 0.00, 'VF': 0.00
            };
        }

        return scale;
    }

    function extractCourses(pages) {
        const extractedCourses = [];
        let currentSemester = "Bilinmiyor";
        let indexCounter = 0;

        const semesterPattern = /^(\d{4}-\d{4})\s+(.+?)(?:\s+Dersin|$)/;

        // Complex Course Tail Regex
        // JS RegExp doesn't support named groups in older browsers but modern ones do. 
        // We stick to numbered groups.
        // Group 1: Status (Z/S/M), 2: Lang, 3: T, 4: P, 5: Credit (UK), 6: AKTS, 7: Grade, 8: Points?, 9: Rest
        // Group 7 (Grade) is now OPTIONAL or allows empty/dash
        // We use (?:...)? for optional non-capturing group around grade
        const courseTailRegex = /\s+(Z|S|M)\s+(Tr|İng\.)\s+(\d+)\s+(\d+)\s+(\d+(?:[.,]\d+)?)\s+(\d+(?:[.,]\d+)?)\s+([A-Z0-9-]+|)?\s*([\d\.,]+)?(.*)$/;

        const concatPattern = /^(\d+_\d+)([A-ZÇĞİÖŞÜ].*)/;

        pages.forEach(pageText => {
            const lines = pageText.split('\n');

            for (let i = 0; i < lines.length; i++) {
                let line = lines[i].trim();
                if (!line) continue;

                // Semester Check
                // Starts with Year: 2023-2024
                if (/^\d{4}-\d{4}/.test(line)) {
                    const m = line.match(semesterPattern);
                    if (m) {
                        currentSemester = `${m[1]} ${m[2]}`.replace("Dersin Statüsü", "").trim();
                    }
                }

                // Fix Concat (Çapar PDF)
                const concatMatch = line.match(concatPattern);
                if (concatMatch) {
                    line = `${concatMatch[1]} ${concatMatch[2]}`;
                }

                // Course Logic
                const match = line.match(courseTailRegex);
                if (match) {
                    const prefix = line.substring(0, match.index).trim();

                    // Split Code/Name
                    const parts = prefix.split(/\s+/);
                    let code = "";
                    let name = "";

                    if (parts.length > 0) {
                        // Check for "BEB 650" vs "BEB650"
                        if (parts.length > 1 && /^[A-Z]+$/.test(parts[0]) && /\d/.test(parts[1])) {
                            code = `${parts[0]} ${parts[1]}`;
                            name = parts.slice(2).join(" ");
                        } else if (parts[0].includes('_')) {
                            // 103111_10311 detected.
                            // Check if the next line has the "Real Code" (e.g. 10040)
                            code = parts[0];

                            // Peek at next line
                            if (i + 1 < lines.length) {
                                const nextLine = lines[i + 1].trim();
                                // Guard: Ensure next line is NOT a separate course entry
                                const isNextLineNewCourse = courseTailRegex.test(nextLine);

                                if (!isNextLineNewCourse) {
                                    // Regex to find start with digits (e.g. "10040 (ENGLISH NAME)")
                                    const nextLineMatch = nextLine.match(/^(\d+)\s+/);
                                    if (nextLineMatch) {
                                        code = nextLineMatch[1];
                                    }
                                }
                            }

                            name = parts.slice(1).join(" ");
                        } else {
                            code = parts[0];
                            name = parts.slice(1).join(" ");
                        }
                    }

                    if (code.startsWith('*') || name.startsWith('*')) continue;

                    const status = match[1];
                    const ukStr = match[5];
                    const aktsStr = match[6];
                    const grade = match[7];
                    // points match[8]

                    extractedCourses.push({
                        id: indexCounter++,
                        semester: currentSemester,
                        code: code,
                        name: name,
                        akts: parseFloat(aktsStr) || 0,
                        uk: parseFloat(ukStr) || 0.0,
                        points: 0.0, // Calculated later if needed or from match[8]
                        grade: grade || "-", // Default to dash if empty
                        status: status
                    });
                }
            }
        });

        return extractedCourses;
    }

    function extractHeaderInfo(firstPageText) {
        const info = { mode: null, gpa: null, academicUnit: null, program: null };
        const lines = firstPageText
            .split('\n')
            .map(x => x.trim())
            .filter(Boolean);

        function getValueAfterLabel(labelRegex) {
            for (let i = 0; i < lines.length; i++) {
                if (!labelRegex.test(lines[i])) continue;
                for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
                    const candidate = lines[j];
                    if (!candidate || candidate.startsWith(':') || candidate.startsWith('(')) continue;
                    if (/^[:\-–]+$/.test(candidate)) continue;
                    return candidate;
                }
            }
            return null;
        }

        // 1. Credit Type Detection
        // Regex: Kredi Türü : AKTS or Credit Type : ECTS
        const creditTypeRegex = /(?:Kredi Türü|Credit Type)\s*(?:\(Credit Type\))?\s*[:]\s*(\w+)/i;
        const matchMode = firstPageText.match(creditTypeRegex);
        if (matchMode) {
            const val = matchMode[1].toUpperCase();
            if (val.includes('AKTS') || val.includes('ECTS')) {
                info.mode = 'AKTS';
            } else if (val.includes('UK') || val.includes('ULUSAL') || val.includes('NATIONAL')) {
                info.mode = 'UK';
            }
        }

        // 2. GPA Detection (Example: Genel Not Ortalaması : 2.68)
        const gpaRegex = /(?:Genel Not Ortalaması|Cumulative GPA)\s*(?:\(Cumulative GPA\))?\s*[:]\s*(\d+[.,]\d+)/i;
        const matchGpa = firstPageText.match(gpaRegex);
        if (matchGpa) {
            info.gpa = matchGpa[1];
        }

        // 3. Academic Unit (Eğitim Birimi)
        info.academicUnit = getValueAfterLabel(/(?:Eğitim Birimi|Academic Unit)/i);
        if (!info.academicUnit) {
            const unitLine = lines.find(l => /fakültesi|fakultesi|enstitüsü|enstitusu|yüksekokulu|yuksekokulu/i.test(l));
            if (unitLine) info.academicUnit = unitLine;
        }

        // 4. Program (Programı/ABD/ASD)
        // Prefer direct degree/program-like lines first (more reliable for transcript tables).
        const labelLikeProgramTerms = /program türü|akademik derece türü|öğretim dili|eğitim ve öğretim türü|öğrenim durumu|isc(e)?d kodu|kayıt tarihi|giriş türü|sınıfı\s*\/\s*dönemi|not sistemi|genel not ortalaması/i;
        const programLine = lines.find(l =>
            /mühendisliği|muhendisligi|bölümü|bolumu|\bpr\./i.test(l) &&
            !/fakültesi|fakultesi|enstitüsü|enstitusu|yüksekokulu|yuksekokulu/i.test(l) &&
            !labelLikeProgramTerms.test(l)
        );
        if (programLine) {
            info.program = programLine;
        } else {
            const fromLabel = getValueAfterLabel(/(?:Programı\/ABD\/ASD|Program\/Department|Programı|Program)/i);
            if (fromLabel && !labelLikeProgramTerms.test(fromLabel)) {
                info.program = fromLabel;
            }
        }

        return info;
    }

    // Custom Parser is now in custom_parser.js

    // --- Helper Functions ---
    function determineMode() {
        if (forcedMode) return forcedMode;

        let sumPdfPoints = 0;
        let sumAktsPoints = 0;
        let sumUkPoints = 0;
        let sumUk = 0;

        courses.forEach(c => {
            if (c.isDraft) return;
            const m = gradeScale[c.grade];
            if (m !== undefined) {
                sumAktsPoints += c.akts * m;
                const currentUk = c.uk || 0;
                sumUkPoints += currentUk * m;
                sumUk += currentUk;
                sumPdfPoints += (c.points || 0);
            }
        });

        // Smart Logic
        if (sumPdfPoints > 0 && sumUk > 0) {
            const diffAkts = Math.abs(sumPdfPoints - sumAktsPoints);
            const diffUk = Math.abs(sumPdfPoints - sumUkPoints);
            // If UK matches strictly better or is very close
            if (diffUk < 1.0 || (diffUk < diffAkts)) {
                return 'UK';
            }
        }
        return 'AKTS'; // Default
    }

    window.setMode = (mode) => {
        forcedMode = mode;

        // Update UI Look
        const btnAkts = document.getElementById('mode-akts-btn');
        const btnUk = document.getElementById('mode-uk-btn');

        if (mode === 'AKTS') {
            btnAkts.style.background = 'white';
            btnAkts.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
            btnAkts.style.fontWeight = '600';
            btnAkts.style.color = '#0f172a';

            btnUk.style.background = 'transparent';
            btnUk.style.boxShadow = 'none';
            btnUk.style.fontWeight = '500';
            btnUk.style.color = '#64748b';
        } else {
            btnUk.style.background = 'white';
            btnUk.style.boxShadow = '0 1px 2px rgba(0,0,0,0.1)';
            btnUk.style.fontWeight = '600';
            btnUk.style.color = '#0f172a';

            btnAkts.style.background = 'transparent';
            btnAkts.style.boxShadow = 'none';
            btnAkts.style.fontWeight = '500';
            btnAkts.style.color = '#64748b';
        }

        renderCourses();
        calculateStats();
    };

    function renderCourses() {
        flagRepeatedCourses(); // Ensure flags are up to date
        coursesBody.innerHTML = '';

        const currentMode = determineMode();
        const headerEl = document.getElementById('dynamic-credit-header');
        if (headerEl) {
            headerEl.innerHTML = currentMode === 'UK' ?
                '<i class="fa-solid fa-coins"></i> Kredi (UK)' :
                '<i class="fa-solid fa-graduation-cap"></i> AKTS';
            headerEl.style.color = currentMode === 'UK' ? '#f59e0b' : '#334155';
        }

        const semesters = {};
        const semesterOrder = [];

        courses.forEach(c => {
            if (!semesters[c.semester]) {
                semesters[c.semester] = [];
                semesterOrder.push(c.semester);
            }
            semesters[c.semester].push(c);
        });

        semesterOrder.forEach(semName => {
            const semCourses = semesters[semName];

            // Calculate Term average based on CURRENT MODE
            let termWeighted = 0;
            let termCredit = 0;

            semCourses.forEach(c => {
                if (c.isDraft) return;
                if (c.isRepeated) return;
                if (c.isOngoing) return; // Don't count ongoing courses

                const m = gradeScale[c.grade];
                if (m !== undefined) {
                    if (currentMode === 'UK') {
                        const val = c.uk || 0;
                        termWeighted += val * m;
                        termCredit += val;
                    } else {
                        termWeighted += c.akts * m;
                        termCredit += c.akts;
                    }
                }
            });
            const termGpa = termCredit > 0 ? (termWeighted / termCredit).toFixed(2) : "0.00";

            const headerRow = document.createElement('tr');
            headerRow.className = 'semester-header';
            headerRow.innerHTML = `
                <td colspan="5" style="background:#f8fafc; padding:15px; border-top: 2px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
                    <div style="display:flex; justify-content:space-between; align-items:center; color:#334155;">
                        <span style="font-weight:700; font-size: 1rem;"><i class="fa-regular fa-calendar-days" style="margin-right:8px; color:#3b82f6;"></i> ${semName}</span>
                        <span style="background:white; padding:5px 12px; border-radius:20px; font-size:0.9rem; font-weight:600; border:1px solid #cbd5e1; color:#0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">DNO: <span style="color:#2563eb;">${termGpa}</span></span>
                    </div>
                </td>
            `;
            coursesBody.appendChild(headerRow);

            semCourses.forEach((course) => {
                const sortedGrades = Object.keys(gradeScale).sort((a, b) => gradeScale[b] - gradeScale[a]);
                let options = '';
                sortedGrades.forEach(g => {
                    const selected = course.grade === g ? 'selected' : '';
                    options += `<option value="${g}" ${selected}>${g}</option>`;
                });

                // Add default dash option if not in scale (for ongoing)
                if (!gradeScale['-']) {
                    const sel = (course.grade === '-' || !course.grade) ? 'selected' : '';
                    options = `<option value="-" ${sel}>- (Not Yok)</option>` + options;
                }

                if (!gradeScale[course.grade] && course.grade !== '-') options = `<option value="${course.grade}" selected>${course.grade}</option>` + options;

                const isExcluded = course.isExcluded ? 'opacity: 0.5; background: #f1f5f9;' : '';
                const isRepeatedStyle = course.isRepeated ? 'opacity: 0.6; text-decoration: line-through; background: #fff1f2;' : '';
                const isOngoingStyle = course.isOngoing ? 'background: #eff6ff; border-left: 3px solid #60a5fa;' : '';

                const row = document.createElement('tr');
                row.className = 'course-row';
                if (course.isDraft) row.style.background = '#f0f9ff';
                else if (course.isRepeated) {
                    row.style = isRepeatedStyle;
                    row.title = "Bu ders tekrar alındığı için ortalamaya katılmıyor.";
                }
                else if (course.isOngoing) {
                    row.style = isOngoingStyle;
                    row.title = "Bu ders henüz notlanmadığı için ortalamaya katılmıyor (Devam Ediyor).";
                }
                else if (course.isExcluded) row.style = isExcluded;

                let actionBtn = '';
                if (course.isDraft) {
                    actionBtn = `
                        <button class="btn-icon" onclick="saveCourse(${course.id})" title="Onayla"><i class="fa-solid fa-check" style="color: var(--success-color);"></i></button>
                        <button class="btn-icon" onclick="deleteCourse(${course.id})" title="İptal"><i class="fa-solid fa-xmark" style="color: var(--danger-color);"></i></button>
                    `;
                } else {
                    actionBtn = `
                        <button class="btn-icon" onclick="deleteCourse(${course.id})" title="Dersi Sil"><i class="fa-solid fa-trash-can"></i></button>
                    `;
                }

                const displayVal = currentMode === 'UK' ? (course.uk || 0) : course.akts;
                const creditPlaceholder = currentMode === 'UK' ? 'UK' : 'AKTS';
                const stepAttr = currentMode === 'UK' ? 'step="0.5"' : '';

                // Exclusion Checkbox
                const checkedAttr = !course.isExcluded ? 'checked' : '';
                const excludeTd = `<td style="text-align:center;"><input type="checkbox" ${checkedAttr} onclick="toggleExclusion(${course.id})" title="Hesaplamaya dahil et/çıkar"></td>`;

                row.innerHTML = `
                    ${excludeTd}
                    <td>
                        <input type="text" class="table-input" value="${course.code}" onchange="updateCourse(${course.id}, 'code', this.value)" placeholder="Kod" ${course.isExcluded || course.isRepeated ? 'disabled' : ''}>
                        ${course.isRepeated ? '<br><small style="color:#e11d48; font-weight:600;">(Tekrar)</small>' : ''}
                        ${course.isOngoing ? '<br><small style="color:#3b82f6; font-weight:600;">(Devam Ediyor)</small>' : ''}
                    </td>
                    <td><input type="text" class="table-input" value="${course.name}" onchange="updateCourse(${course.id}, 'name', this.value)" placeholder="Ders Adı" ${course.isExcluded ? 'disabled' : ''}></td>
                    <td>
                        <input type="number" class="table-input" value="${displayVal}" 
                               onchange="updateCourse(${course.id}, 'dynamic_credit', this.value)" 
                               style="width: 70px;" placeholder="${creditPlaceholder}" min="0" ${stepAttr} 
                               ${course.isExcluded ? 'disabled' : ''}>
                    </td>
                    <td><select class="grade-select" onchange="updateCourse(${course.id}, 'grade', this.value)" ${course.isExcluded ? 'disabled' : ''}>${options}</select></td>
                    <td style="text-align: center;">${actionBtn}</td> 
                `;
                coursesBody.appendChild(row);
            });
        });
    }

    window.saveCourse = (id) => {
        const course = courses.find(c => c.id === id);
        if (course) {
            // Check based on detected mode or just ensure positive values exist
            // Simplest: Check whatever is currently being displayed or just generally
            if ((!course.akts && !course.uk) || (course.akts < 0 && course.uk < 0)) {
                // Fallback validation
            }

            course.isDraft = false;
            course.akts = parseFloat(course.akts || 0);
            course.uk = parseFloat(course.uk || 0);

            // saveToLocation();
            renderCourses();
            calculateStats();
            saveToLocalStorage();
        }
    };

    window.updateCourse = (id, field, value) => {
        const course = courses.find(c => c.id === id);
        if (course) {
            if (field === 'dynamic_credit') {
                // Smart Update
                const mode = determineMode();
                let val = parseFloat(value);
                if (isNaN(val)) val = 0; else if (val < 0) val = 0;

                if (mode === 'UK') {
                    course.uk = val;
                } else {
                    course.akts = val;
                }
            } else {
                course[field] = value;
            }

            if (!course.isDraft) {
                // Status (Ongoing/Repeated) might change based on Grade
                flagRepeatedCourses();
                calculateStats();
                saveToLocalStorage();

                // If grade changed, visuals (colors, repeated status) might change significantly used by other rows
                // So we should re-render, BUT be careful about focus. 
                // Since this is a 'select' change usually, focus loss is acceptable.
                if (field === 'grade') {
                    renderCourses();
                }
            }
        }
    };

    window.deleteCourse = (id) => {
        if (confirm('Dersi silmek istediğine emin misin?')) {
            courses = courses.filter(c => c.id !== id);
            renderCourses();
            calculateStats();
            saveToLocalStorage();
        }
    };

    window.toggleExclusion = (id) => {
        const course = courses.find(c => c.id === id);
        if (course) {
            course.isExcluded = !course.isExcluded; // Toggle state

            // Re-render to update UI state (gray out, disabled inputs)
            renderCourses();
            calculateStats(); // Recalculate if exclusion affects GPA (it doesn't currently, but for future-proofing)
            saveToLocalStorage();
        }
    };

    // Initialize
    // Clean Start

    function calculateStats() {
        const mode = determineMode();

        let totalWeighted = 0;
        let totalCredit = 0;
        let totalCompletedAkts = 0;

        courses.forEach(c => {
            if (c.isDraft) return;
            if (c.isRepeated) return; // Skip repeated courses
            if (c.isOngoing) return; // Skip ongoing courses logic in general calc (unless needed for something else)

            const m = gradeScale[c.grade];
            if (m !== undefined) {
                const credit = mode === 'UK' ? (c.uk || 0) : c.akts;

                totalWeighted += credit * m;
                totalCredit += credit;

                if (m > 0) totalCompletedAkts += c.akts;
            }
        });

        const gpa = totalCredit > 0 ? (totalWeighted / totalCredit).toFixed(2) : "0.00";

        // Update Big GNO
        gpaValue.innerText = gpa;

        // Mode Label
        let modeLabel = document.getElementById('gno-mode-label');
        if (!modeLabel) {
            modeLabel = document.createElement('div');
            modeLabel.id = 'gno-mode-label';
            modeLabel.style.fontSize = '0.9rem';
            modeLabel.style.marginTop = '5px';
            modeLabel.style.fontWeight = '500';
            gpaValue.parentNode.appendChild(modeLabel);
        }

        if (mode === 'UK') {
            modeLabel.innerHTML = '<span style="color:var(--warning-color); background:#fffbeb; padding:2px 8px; border-radius:10px; border:1px solid #fcd34d;">UK (Kredi) Modu</span>';
        } else {
            modeLabel.innerHTML = '<span style="color:#64748b;">AKTS Modu</span>';
        }

        // Dynamic Coloring
        gpaValue.className = 'gno-value';
        const gnoNum = parseFloat(gpa);
        if (gnoNum >= 3.00) gpaValue.classList.add('text-success');
        else if (gnoNum >= 2.00) gpaValue.classList.add('text-warning');
        else if (gnoNum > 0) gpaValue.classList.add('text-danger');

        // Graduation Progress
        const percent = Math.min((totalCompletedAkts / 240) * 100, 100);
        progressFill.style.width = `${percent}%`;
        currentAktsSpan.innerText = `${totalCompletedAkts} / 240 AKTS`;
    }
    // --- Smart Target GNO Logic ---

    const calcTargetBtn = document.getElementById('calc-target-btn');
    const targetGnoInput = document.getElementById('target-gno-input');
    const targetGradeSelect = document.getElementById('target-grade-select');
    const targetResultArea = document.getElementById('target-result-area');
    const realisticModeCheck = document.getElementById('realistic-mode-check');

    // Toggle Button Logic
    const toggleSimBtn = document.getElementById('toggle-sim-btn');
    const simSection = document.getElementById('target-simulation-section');

    if (toggleSimBtn && simSection) {
        toggleSimBtn.addEventListener('click', () => {
            if (simSection.style.display === 'none' || simSection.style.display === '') {
                simSection.style.display = 'flex';
                // Toggle active state visualization if desired
                toggleSimBtn.style.background = '#e0f2fe';
                toggleSimBtn.style.borderColor = '#3b82f6';
            } else {
                simSection.style.display = 'none';
                toggleSimBtn.style.background = 'transparent';
                toggleSimBtn.style.borderColor = '#cbd5e1';
            }
        });
    }

    if (calcTargetBtn) {
        calcTargetBtn.addEventListener('click', () => {
            const targetGno = parseFloat(targetGnoInput.value);
            const targetGradeVal = parseFloat(targetGradeSelect.value);
            const isRealistic = realisticModeCheck ? realisticModeCheck.checked : false;

            if (isNaN(targetGno) || targetGno <= 0 || targetGno > 4.00) {
                alert("Lütfen geçerli bir hedef GNO girin (0 - 4.00 arası).");
                return;
            }

            calculateSmartTarget(targetGno, targetGradeVal, isRealistic);
        });
    }

    function calculateSmartTarget(targetGno, userTargetGradeVal, isRealistic) {
        // 1. Determine Mode
        const mode = determineMode();

        // 2. Prepare Valid Courses (exclude drafts AND exclusions)
        let relevantCourses = [];
        let currentTotalWeighted = 0;
        let currentTotalCredit = 0;

        courses.forEach(c => {
            if (c.isDraft) return;
            // Note: Excluded courses are STILL part of the current GNO.
            // We only exclude them from being CANDIDATES for retake.

            const m = gradeScale[c.grade];
            if (m !== undefined) {
                const credit = mode === 'UK' ? (c.uk || 0) : c.akts;
                if (credit <= 0) return;

                currentTotalWeighted += credit * m;
                currentTotalCredit += credit;

                // --- Simulation Candidacy Check ---
                if (c.isExcluded) return; // BLACKLISTED: Cannot be retaken

                // --- Realistic Mode Logic ---
                // Determine Max Possible Grade for this course
                let maxPossible = userTargetGradeVal; // Default limit is user selection

                if (isRealistic) {
                    // Logic:
                    // Low ( < 2.00 ) -> Max B2 (3.00)
                    // Mid ( 2.00 <= x < 3.00 ) -> Max B1 (3.25)
                    // High ( >= 3.00 ) -> No extra cap (userTargetGradeVal applies)

                    if (m < 2.00) {
                        // D, F1, F2, F3, etc.
                        maxPossible = Math.min(userTargetGradeVal, 3.00);
                    } else if (m < 3.00) {
                        // C1, C2, C3, CC, DC, CB? (CB is 2.50 in some, 2.75 in others, CC is 2.00)
                        // Let's use strict value check.
                        maxPossible = Math.min(userTargetGradeVal, 3.25);
                    }
                    // If m >= 3.00, we trust userTargetGradeVal (e.g. want to raise BB to A1)
                }

                // Calculate potential gain
                // Only consider if MaxPossible > Current
                if (maxPossible > m) {
                    const gain = (maxPossible - m) * credit;
                    relevantCourses.push({
                        id: c.id,
                        code: c.code,
                        name: c.name,
                        currentGrade: c.grade,
                        currentVal: m,
                        targetVal: maxPossible, // Store the effective target
                        credit: credit,
                        gain: gain
                    });
                }
            }
        });

        const currentGno = currentTotalCredit > 0 ? (currentTotalWeighted / currentTotalCredit) : 0;

        if (currentGno >= targetGno) {
            targetResultArea.style.display = 'block';
            targetResultArea.innerHTML = `<i class="fa-solid fa-check-circle" style="color:var(--success-color);"></i> Zaten hedefinize ulaştınız! Mevcut GNO: <strong>${currentGno.toFixed(2)}</strong>`;
            return;
        }

        // 3. Greedy Sort by Gain (High to Low)
        // We want the most "efficient" courses (highest impact) first.
        // Usually high credit + low grade = high impact.
        relevantCourses.sort((a, b) => b.gain - a.gain);

        // 4. Simulate Retakes
        let tempWeighted = currentTotalWeighted;
        let retakeCount = 0;
        let retakeCredits = 0;
        let retakeList = [];

        for (const course of relevantCourses) {
            // "Retake" this course
            // Remove old points, add new points
            // Old contribution: credit * currentVal
            // New contribution: credit * targetGradeVal
            // Since we calculated 'gain', we can just add gain to tempWeighted

            tempWeighted += course.gain;
            retakeCount++;
            retakeCredits += course.credit;
            retakeList.push(course);

            const projectedGno = tempWeighted / currentTotalCredit;

            if (projectedGno >= targetGno) {
                // Success!
                displayTargetResults(retakeList, projectedGno, targetGno);
                return;
            }
        }

        // If we exit loop without returning, we failed to reach target even with all retakes
        const maxPossibleGno = tempWeighted / currentTotalCredit;
        targetResultArea.style.display = 'block';
        targetResultArea.innerHTML = `
            <div style="color:var(--danger-color); font-weight:600; margin-bottom:5px;"><i class="fa-solid fa-circle-exclamation"></i> Hedefe Ulaşılamadı</div>
            <div>Tüm dersleri ${targetGradeVal.toFixed(2)} ile tekrar etseniz bile maksimum <strong>${maxPossibleGno.toFixed(2)}</strong> ortalamaya ulaşabilirsiniz.</div>
        `;
    }

    function displayTargetResults(retakeList, projectedGno, targetGno) {
        targetResultArea.style.display = 'block';

        // Build list HTML
        let listHtml = '<ul style="margin: 10px 0; padding-left: 20px;">';
        retakeList.forEach(c => {
            // Find grade label for targetVal (reverse lookup or approx)
            // Just show the value or closest match
            const targetGradeLabel = findGradeLabel(c.targetVal) || c.targetVal.toFixed(2);
            listHtml += `<li><strong>${c.code}</strong> (${c.name}): <span style="color:#64748b;">${c.currentGrade}</span> <i class="fa-solid fa-arrow-right" style="font-size:0.8rem; color:#94a3b8;"></i> <strong>${targetGradeLabel}</strong></li>`;
        });
        listHtml += '</ul>';

        targetResultArea.innerHTML = `
            <div style="margin-bottom:10px;"><i class="fa-solid fa-trophy" style="color:#f59e0b;"></i> Hedefe Ulaşmak İçin Plan:</div>
            <div>Şu <strong>${retakeList.length}</strong> dersi tekrar alarak (Toplam ${retakeList.reduce((acc, c) => acc + c.credit, 0)} Kredi), ortalamanızı <strong>${projectedGno.toFixed(2)}</strong> seviyesine çıkarabilirsiniz:</div>
            ${listHtml}
        `;
    }

    function findGradeLabel(val) {
        // Simple reverse lookup from gradeScale
        // Sort keys by value desc
        const sorted = Object.keys(gradeScale).sort((a, b) => gradeScale[b] - gradeScale[a]);
        // Find exact match first
        const exact = sorted.find(k => Math.abs(gradeScale[k] - val) < 0.01);
        if (exact) return exact;
        return val.toFixed(2);
    }

    // --- Future Planner Logic ---
    const toggleFutureBtn = document.getElementById('toggle-future-btn');
    const futureSection = document.getElementById('future-planner-section');
    const calcFutureBtn = document.getElementById('calc-future-btn');
    const futureCreditsInput = document.getElementById('future-credits-input');
    const futureTargetGnoInput = document.getElementById('future-target-gno');
    const futureResultArea = document.getElementById('future-result-area');

    if (toggleFutureBtn && futureSection) {
        toggleFutureBtn.addEventListener('click', () => {
            if (futureSection.style.display === 'none' || futureSection.style.display === '') {
                futureSection.style.display = 'flex';
                toggleFutureBtn.style.background = '#f5f3ff';
            } else {
                futureSection.style.display = 'none';
                toggleFutureBtn.style.background = 'white';
            }
        });
    }

    if (calcFutureBtn) {
        calcFutureBtn.addEventListener('click', () => {
            const plannedCredits = parseFloat(futureCreditsInput.value);
            const targetGno = parseFloat(futureTargetGnoInput.value);

            if (isNaN(plannedCredits) || plannedCredits <= 0) {
                alert("Lütfen geçerli bir kredi miktarı girin.");
                return;
            }
            if (isNaN(targetGno) || targetGno <= 0 || targetGno > 4.00) {
                alert("Lütfen geçerli bir hedef GNO girin.");
                return;
            }

            calculateFutureScenario(plannedCredits, targetGno);
        });
    }

    function calculateFutureScenario(plannedCredits, targetGno) {
        const mode = determineMode();

        let currentTotalWeighted = 0;
        let currentTotalCredit = 0;

        // Calculate Current State (Excluding Drafts)
        courses.forEach(c => {
            if (c.isDraft) return;
            const m = gradeScale[c.grade];
            if (m !== undefined) {
                const credit = mode === 'UK' ? (c.uk || 0) : c.akts;
                if (credit <= 0) return;
                currentTotalWeighted += credit * m;
                currentTotalCredit += credit;
            }
        });

        // Formula:
        // NewGNO = (CurrentWeighted + FutureWeighted) / (CurrentCredit + FutureCredit)
        // Target = (CurrentWeighted + (ReqDNO * FutureCredit)) / (CurrentCredit + FutureCredit)
        // Target * (CurrentCredit + FutureCredit) = CurrentWeighted + (ReqDNO * FutureCredit)
        // (Target * (CurrentCredit + FutureCredit)) - CurrentWeighted = ReqDNO * FutureCredit
        // ReqDNO = ((Target * (CurrentCredit + FutureCredit)) - CurrentWeighted) / FutureCredit

        const requiredWeightedFuture = (targetGno * (currentTotalCredit + plannedCredits)) - currentTotalWeighted;
        const requiredDno = requiredWeightedFuture / plannedCredits;

        futureResultArea.style.display = 'block';

        if (requiredDno > 4.00) {
            futureResultArea.innerHTML = `
                <div style="color:var(--danger-color); font-weight:700; margin-bottom:5px;">
                    <i class="fa-solid fa-bomb"></i> Bu hedef matematiksel olarak imkansız!
                </div>
                <div>Bu kredilik dersten <strong>4.00 (A1)</strong> bile alsanız ortalamanız en fazla <strong>${((currentTotalWeighted + (plannedCredits * 4.0)) / (currentTotalCredit + plannedCredits)).toFixed(2)}</strong> olabilir.</div>
                <div style="margin-top:5px; font-size:0.9rem; color:#64748b;">(Gereken Dönem Ortalaması: ${requiredDno.toFixed(2)})</div>
            `;
        } else if (requiredDno < 0) {
            futureResultArea.innerHTML = `
                <div style="color:var(--success-color); font-weight:700;">
                    <i class="fa-solid fa-champagne-glasses"></i> Hedefe zaten ulaştınız!
                </div>
                <div>Gelecek dönemden 0.00 bile alsanız bu hedefin üzerinde kalıyorsunuz.</div>
            `;
        } else {
            // Determine likely letter grade needed
            let closestGrade = '';
            let minDiff = 999;
            Object.entries(gradeScale).forEach(([g, p]) => {
                const diff = Math.abs(p - requiredDno);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestGrade = `${g} (${p.toFixed(2)})`;
                }
            });

            // Color coding
            let color = '#4c1d95'; // default purple
            if (requiredDno > 3.50) color = '#ef4444'; // Hard
            else if (requiredDno > 3.00) color = '#f59e0b'; // Medium
            else color = '#10b981'; // Easy

            // Custom Motivational Messages
            let motivationMsg = "";
            let motivationColor = "#64748b";

            if (requiredDno >= 3.40) {
                motivationMsg = `<i class="fa-solid fa-fire"></i> Kardeşim zor ancak imkansız değil, sadece çooook çalışman gerek. Sosyal hayatını bir süreliğine askıya alabilirsin. 📚☕`;
                motivationColor = "#dc2626"; // Red
            } else if (requiredDno >= 3.00) {
                motivationMsg = `<i class="fa-solid fa-dumbbell"></i> Biraz terletecek ama düzenli çalışırsan rahat yaparsın. Ortalamayı yükseltmek istiyorsan bu acıyı çekeceksin. 💪`;
                motivationColor = "#d97706"; // Amber
            } else if (requiredDno >= 2.50) {
                motivationMsg = `<i class="fa-solid fa-mug-hot"></i> Makul bir hedef. Derslere girip not tutsan zaten bu ortalamayı yaparsın. Rahat ol. 😎`;
                motivationColor = "#059669"; // Green
            } else {
                motivationMsg = `<i class="fa-solid fa-rocket"></i> Bunu yanlışlıkla bile yaparsın. Hedefini biraz daha yükseltmeye ne dersin? 🚀`;
                motivationColor = "#2563eb"; // Blue
            }

            futureResultArea.innerHTML = `
                <div style="font-weight:600; color:#334155; margin-bottom:5px;">Hedefe Ulaşmak İçin Gereken Dönem Ortalaması:</div>
                <div style="font-size:2rem; font-weight:800; color:${color}; line-height:1.2;">
                    ${requiredDno.toFixed(2)}
                </div>
                <div style="margin-top:8px;">
                    Önümüzdeki dönem <strong>${plannedCredits} kredi</strong> ders alıp ortalamanızı <strong>${requiredDno.toFixed(2)}</strong> yaparsanız genel ortalamanız <strong>${targetGno.toFixed(2)}</strong> oluyor.
                </div>
                <div style="margin-top:5px; font-size:0.9rem; color:#64748b; margin-bottom: 12px;">
                    <i class="fa-solid fa-tag"></i> Ortalama olarak tüm dersleriniz <strong>${closestGrade}</strong> civarında olmalı.
                </div>
                
                <div style="background: white; border-left: 4px solid ${motivationColor}; padding: 10px; border-radius: 4px; font-size: 0.95rem; color: #475569; font-style: italic;">
                    ${motivationMsg}
                </div>
            `;
        }
    }

    function renderGradeScale() {
        const container = document.getElementById('grade-scale-grid');
        if (!container) return;

        container.innerHTML = '';

        if (!gradeScale) return;

        // Sort grade scale by value descending
        const sortedGrades = Object.entries(gradeScale).sort(([, a], [, b]) => b - a);

        sortedGrades.forEach(([grade, point]) => {
            const item = document.createElement('div');
            item.className = 'grade-scale-item';
            item.innerHTML = `<strong>${grade}</strong>: ${point.toFixed(2)}`;
            container.appendChild(item);
        });
    }

    // --- Share Link Logic ---
    window.generateShareLink = () => {
        // Optimize payload
        // Map: code->c, name->n, akts->a, uk->u, grade->g, semester->s
        const payload = courses.filter(c => !c.isDraft).map(c => ({
            s: c.semester,
            c: c.code,
            n: c.name,
            a: c.akts,
            u: c.uk,
            g: c.grade
        }));

        const dataObj = { c: payload, s: gradeScale, m: forcedMode };
        const jsonStr = JSON.stringify(dataObj);

        // LZ-String Compression (URL Safe)
        // Ensure LZString is loaded
        if (typeof LZString === 'undefined') {
            alert("Sıkıştırma kütüphanesi yüklenemedi. Lütfen sayfayı yenileyin.");
            return;
        }

        const compressed = LZString.compressToEncodedURIComponent(jsonStr);
        const url = `${window.location.protocol}//${window.location.host}${window.location.pathname}?d=${compressed}`;

        navigator.clipboard.writeText(url).then(() => {
            alert("Sıkıştırılmış Link panoya kopyalandı! 🗜️🔗");
        }).catch(err => {
            console.error(err);
            prompt("Kopyalamada hata oldu. Linki buradan alabilirsin:", url);
        });
    };

    function loadFromUrl() {
        const params = new URLSearchParams(window.location.search);
        const data = params.get('d');
        if (!data) return;

        try {
            if (typeof LZString === 'undefined') return;

            // Decompress
            const jsonStr = LZString.decompressFromEncodedURIComponent(data);
            if (!jsonStr) throw new Error("Decompression failed");

            const dataObj = JSON.parse(jsonStr);

            if (dataObj.c) {
                // Restore Courses
                courses = dataObj.c.map((x, i) => ({
                    id: i + 1,
                    semester: x.s,
                    code: x.c,
                    name: x.n,
                    akts: x.a,
                    uk: x.u,
                    grade: x.g,
                    status: 'Z', // default
                    isDraft: false
                }));
            }
            if (dataObj.s) gradeScale = dataObj.s;
            if (dataObj.m) forcedMode = dataObj.m;

            // UI Init
            dashboard.classList.remove('hidden');
            dropZone.classList.add('hidden');
            renderCourses();
            renderGradeScale();
            calculateStats();

            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);

            // Notification
            const gnoVal = document.getElementById('gpa-value');
            if (gnoVal) {
                const badge = document.createElement('div');
                badge.innerHTML = '<span style="font-size:0.8rem; background:#dbeafe; color:#1e40af; padding:4px 8px; border-radius:12px; margin-left:10px;">Paylaşılan Profil</span>';
                gnoVal.parentNode.appendChild(badge);
            }
        } catch (e) {
            console.error("Link parsing failed", e);
            alert("Link bozuk veya geçersiz.");
        }
    }

    // --- Local Storage Persistence ---
    function saveToLocalStorage() {
        // Collect UI values
        const facultyVal = document.getElementById('faculty-select')?.value;
        const deptVal = document.getElementById('dept-select')?.value;
        const withLabVal = document.getElementById('elective-with-lab-input')?.value;
        const withoutLabVal = document.getElementById('elective-without-lab-input')?.value;

        // Smart Graduation State Preservation (Race Condition Fix)
        // If we have NO selection now, but we have something in localStorage,
        // don't overwrite with nulls yet. Graduation loading might be async.
        let gradState = null;
        if (facultyVal || deptVal || withLabVal || withoutLabVal) {
             gradState = {
                faculty: facultyVal,
                dept: deptVal,
                withLab: withLabVal,
                withoutLab: withoutLabVal
            };
        } else {
            const saved = localStorage.getItem('gano_data');
            if (saved) {
                try {
                    const data = JSON.parse(saved);
                    gradState = data.graduation || null;
                } catch(e) {}
            }
        }

        const data = {
            courses: courses.filter(c => !c.isDraft), // Don't save drafts
            gradeScale,
            forcedMode,
            graduation: gradState,
            infoCardHidden: document.querySelector('.info-sidebar')?.classList.contains('hidden') || false
        };
        localStorage.setItem('gano_data', JSON.stringify(data));
    }

    function loadFromLocalStorage() {
        // Priority: Url Data > Local Storage
        const params = new URLSearchParams(window.location.search);
        if (params.get('d')) return; 

        const saved = localStorage.getItem('gano_data');
        if (saved) {
            try {
                const data = JSON.parse(saved);
                if (data.courses) courses = data.courses;
                if (data.gradeScale) gradeScale = data.gradeScale;
                if (data.forcedMode) forcedMode = data.forcedMode;

                if (data.infoCardHidden) {
                    const sidebar = document.querySelector('.info-sidebar');
                    if (sidebar) sidebar.classList.add('hidden');
                }

                if (courses.length > 0) {
                    dashboard.classList.remove('hidden');
                    dropZone.classList.add('hidden');
                    if (resetBtn) resetBtn.style.display = 'block';

                    renderCourses();
                    renderGradeScale();
                    calculateStats();
                    saveToLocalStorage();
                }
            } catch (e) {
                console.error("Local storage load failed", e);
            }
        }
    }

    // --- Tab Switching & Analytics ---
    const tabButtons = document.querySelectorAll('.tab-btn');
    const views = document.querySelectorAll('.app-view');
    let gradeChart = null;
    let trendChart = null;

    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active from all tabs
            tabButtons.forEach(b => b.classList.remove('active'));
            // Add active to clicked
            btn.classList.add('active');

            // Hide all views
            views.forEach(v => v.classList.remove('active'));
            views.forEach(v => v.style.display = 'none');

            // Show target view
            const targetId = btn.getAttribute('data-tab');
            const targetView = document.getElementById(targetId);
            if (targetView) {
                targetView.classList.add('active');
                targetView.style.display = 'block';

                if (targetId === 'view-analytics') {
                    renderAnalytics();
                }
            }
        });
    });

    function renderAnalytics() {
        if (typeof Chart === 'undefined') {
            alert("Grafik kütüphanesi yüklenemedi.");
            return;
        }

        const mode = determineMode();

        // 1. Prepare Data for Grade Distribution
        const gradeCounts = {};
        courses.forEach(c => {
            if (c.isDraft) return;
            // Only count valid grades in scale
            if (gradeScale[c.grade] !== undefined) {
                gradeCounts[c.grade] = (gradeCounts[c.grade] || 0) + 1;
            }
        });

        // 2. Prepare Data for GPA Trend
        // Group by semester
        const semesterData = {}; // { '2023 Güz': { totals:..., credits:... } }
        // We need to sort semesters. Usually chronologically. 
        // Our semester names are like "2023-2024 Güz" or just random strings.
        // We will try to rely on the order they appear in the `courses` array (assuming transcript order).
        // OR we just collect unique semesters as they appear.

        const uniqueSemesters = [...new Set(courses.map(c => c.semester))];
        // Reverse because usually transcripts are newest top? No, usually oldest top.
        // Let's check typical data. If newest top, we should reverse for graph (Time ->).
        // Let's assume input order is roughly chronological or reverse chronological.
        // We will just plot them in the order of `uniqueSemesters`.

        const trendLabels = [];
        const trendPoints = [];

        uniqueSemesters.forEach(sem => {
            let semWeighted = 0;
            let semCredit = 0;
            courses.forEach(c => {
                if (c.isDraft) return;
                if (c.semester === sem && gradeScale[c.grade] !== undefined) {
                    const credit = mode === 'UK' ? (c.uk || 0) : c.akts;
                    semWeighted += credit * gradeScale[c.grade];
                    semCredit += credit;
                }
            });
            if (semCredit > 0) {
                trendLabels.push(sem);
                trendPoints.push((semWeighted / semCredit).toFixed(2));
            }
        });

        // Render Pie Chart
        const ctxPie = document.getElementById('grade-distribution-chart').getContext('2d');
        if (gradeChart) gradeChart.destroy();

        gradeChart = new Chart(ctxPie, {
            type: 'doughnut',
            data: {
                labels: Object.keys(gradeCounts),
                datasets: [{
                    data: Object.values(gradeCounts),
                    backgroundColor: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
                        '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6'
                    ],
                    borderWidth: 1
                }]
            },
            options: { responsive: true }
        });

        // Render Line Chart
        const ctxLine = document.getElementById('gpa-trend-chart').getContext('2d');
        if (trendChart) trendChart.destroy();

        trendChart = new Chart(ctxLine, {
            type: 'line',
            data: {
                labels: trendLabels,
                datasets: [{
                    label: 'Dönem Ortalaması (DNO)',
                    data: trendPoints,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    tension: 0.3,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: { beginAtZero: false, min: 0, max: 4.0 }
                }
            }
        });
    }

    // Check URL on Load
    // Wait for LZString if needed? Usually CDN is fast enough.
    // If not, we might need a retry or window.onload
    if (typeof LZString !== 'undefined') {
        loadFromUrl();
    } else {
        window.addEventListener('load', loadFromUrl);
    }

    // --- Easter Egg: Counter (Removed for Client-Side) ---
    // window.bendis logic removed.

    // --- Info Card Dismissal ---
    const closeInfoBtn = document.getElementById('close-info-btn');
    if (closeInfoBtn) {
        closeInfoBtn.addEventListener('click', () => {
            const sidebar = document.querySelector('.info-sidebar');
            if (sidebar) {
                sidebar.classList.add('hidden');
                saveToLocalStorage();
            }
        });
    }

    // --- Graduation Check Module ---
    if (typeof initGraduation === 'function') {
        initGraduation(() => courses, saveToLocalStorage);
    }

    // Load saved data if exists
    loadFromLocalStorage();

});
