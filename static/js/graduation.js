/**
 * Mezuniyet Kontrol Modülü
 * Tüm bölümler için müfredatı JSON'dan yükler ve transkript ile karşılaştırır.
 */

const GRAD_CURRICULUM_URL = 'static/data/curriculum_all_departments.json';
const MIN_REQUIRED_SEC_COURSES = 3;

function initGraduation(coursesGetter, onSave) {
    const facultySelect = document.getElementById('faculty-select');
    const deptSelect = document.getElementById('dept-select');
    const checkBtn = document.getElementById('check-graduation-btn');
    const reportArea = document.getElementById('graduation-report');
    const withLabInput = document.getElementById('elective-with-lab-input');
    const withoutLabInput = document.getElementById('elective-without-lab-input');
    const rulesHint = document.getElementById('elective-rules-hint');

    if (!checkBtn || !reportArea || !deptSelect || !facultySelect) return;

    const state = {
        departments: [],
        byId: new Map(),
        loaded: false
    };
    let pendingAutoMeta = null;

    const setHint = (text) => {
        if (rulesHint) rulesHint.textContent = text;
    };

    const triggerSave = () => {
        if (typeof onSave === 'function') onSave();
    };

    loadCurriculumData().then((departments) => {
        state.departments = departments;
        state.byId = new Map(departments.map(d => [d.id, d]));
        state.loaded = true;

        populateFacultyOptions(facultySelect, departments);
        setHint('Kural boş bırakılırsa bölümde tanımlı varsayılanlar kullanılır.');

        // --- Load Saved State ---
        loadGraduationState();

        if (pendingAutoMeta) {
            autoSelectFromTranscript(pendingAutoMeta);
            pendingAutoMeta = null;
        }
    }).catch((err) => {
        console.error('Curriculum load failed:', err);
        setHint('Müfredat verisi yüklenemedi.');
    });

    window.autoSelectGraduationByTranscript = (meta) => {
        if (!state.loaded) {
            pendingAutoMeta = meta;
            return;
        }
        autoSelectFromTranscript(meta);
    };

    function loadGraduationState() {
        const saved = localStorage.getItem('gano_data');
        if (!saved) return;
        try {
            const data = JSON.parse(saved);
            if (data.graduation) {
                const g = data.graduation;
                if (g.faculty) {
                    facultySelect.value = g.faculty;
                    populateDepartmentOptions(deptSelect, state.departments, g.faculty);
                }
                if (g.dept) {
                    deptSelect.value = g.dept;
                    const dept = state.byId.get(g.dept);
                    applyDepartmentRulePlaceholders(dept, withLabInput, withoutLabInput, setHint);
                }
                if (g.withLab !== undefined) withLabInput.value = g.withLab;
                if (g.withoutLab !== undefined) withoutLabInput.value = g.withoutLab;
            }
        } catch (e) {
            console.error('Failed to load graduation state', e);
        }
    }

    facultySelect.addEventListener('change', () => {
        populateDepartmentOptions(deptSelect, state.departments, facultySelect.value);
        clearRuleInputs(withLabInput, withoutLabInput);
        setHint('Lablı/labsız şartlarını manuel girebilirsin veya boş bırakabilirsin.');
        triggerSave();
    });

    deptSelect.addEventListener('change', () => {
        const dept = state.byId.get(deptSelect.value);
        applyDepartmentRulePlaceholders(dept, withLabInput, withoutLabInput, setHint);
        triggerSave();
    });

    if (withLabInput) withLabInput.addEventListener('change', triggerSave);
    if (withoutLabInput) withoutLabInput.addEventListener('change', triggerSave);

    checkBtn.addEventListener('click', () => {
        if (!state.loaded) {
            reportArea.innerHTML = `
                <div style="text-align:center; padding:30px; color:var(--text-muted);">
                    <i class="fa-solid fa-spinner fa-spin" style="font-size:2rem; margin-bottom:10px; display:block;"></i>
                    Müfredat yükleniyor, lütfen tekrar dene.
                </div>`;
            return;
        }

        const deptId = deptSelect.value;
        const curriculum = state.byId.get(deptId);
        if (!curriculum) {
            reportArea.innerHTML = `
                <div style="text-align:center; padding:30px; color:var(--text-muted);">
                    <i class="fa-solid fa-circle-info" style="font-size:2rem; margin-bottom:10px; display:block;"></i>
                    Lütfen önce fakülte ve bölüm seç.
                </div>`;
            return;
        }

        const courses = coursesGetter();
        if (!courses || courses.length === 0) {
            reportArea.innerHTML = `
                <div style="text-align:center; padding:30px; color:var(--text-muted);">
                    <i class="fa-solid fa-file-circle-exclamation" style="font-size:2rem; margin-bottom:10px; display:block;"></i>
                    Henüz ders yüklemedin. Önce transkriptini yükle veya manuel giriş yap.
                </div>`;
            return;
        }

        const overrides = {
            withLab: parseOptionalInt(withLabInput ? withLabInput.value : ''),
            withoutLab: parseOptionalInt(withoutLabInput ? withoutLabInput.value : '')
        };

        const report = generateGraduationReport(courses, curriculum, overrides);
        renderGraduationReport(report, reportArea);
    });

    function autoSelectFromTranscript(meta) {
        if (!meta) return;
        const unit = String(meta.academicUnit || '').trim();
        const program = String(meta.program || '').trim();
        if (!unit && !program) return;

        const facultyCandidates = [...new Set(state.departments.map(d => d.faculty).filter(Boolean))];
        const bestFaculty = findBestMatch(unit, facultyCandidates);

        let selectedFaculty = null;
        if (bestFaculty && bestFaculty.score >= 0.35) {
            selectedFaculty = bestFaculty.value;
            facultySelect.value = selectedFaculty;
            facultySelect.dispatchEvent(new Event('change'));
        }

        const deptPool = state.departments.filter(d => !selectedFaculty || d.faculty === selectedFaculty);
        const deptCandidates = deptPool.map(d => d.name);
        const bestDept = findBestMatch(program, deptCandidates);
        if (bestDept && bestDept.score >= 0.35) {
            const picked = deptPool.find(d => d.name === bestDept.value);
            if (picked) {
                if (!selectedFaculty) {
                    facultySelect.value = picked.faculty;
                    facultySelect.dispatchEvent(new Event('change'));
                }
                deptSelect.value = picked.id;
                deptSelect.dispatchEvent(new Event('change'));
                setHint(`Transkriptten otomatik eşleşti: ${picked.faculty} / ${picked.name}`);
            }
        }
    }
}

function normalizeSearchText(value) {
    const map = {
        'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
        'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'I': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
    };
    return String(value || '')
        .split('')
        .map(ch => map[ch] || ch)
        .join('')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokenSet(text) {
    const n = normalizeSearchText(text);
    if (!n) return new Set();
    return new Set(n.split(' ').filter(Boolean));
}

function similarityScore(a, b) {
    const na = normalizeSearchText(a);
    const nb = normalizeSearchText(b);
    if (!na || !nb) return 0;
    if (na === nb) return 1;
    if (na.includes(nb) || nb.includes(na)) return 0.92;

    const ta = tokenSet(na);
    const tb = tokenSet(nb);
    if (ta.size === 0 || tb.size === 0) return 0;

    let inter = 0;
    ta.forEach(x => { if (tb.has(x)) inter++; });
    const union = new Set([...ta, ...tb]).size;
    const jaccard = union > 0 ? inter / union : 0;

    return jaccard;
}

function findBestMatch(query, candidates) {
    const q = String(query || '').trim();
    if (!q || !Array.isArray(candidates) || candidates.length === 0) return null;

    let best = { value: null, score: 0 };
    candidates.forEach((c) => {
        const s = similarityScore(q, c);
        if (s > best.score) best = { value: c, score: s };
    });
    return best.value ? best : null;
}

async function loadCurriculumData() {
    // 1) Primary source: curriculum_data.js (global CURRICULUM_DATA)
    const legacyDepartments = convertLegacyCurriculum();
    if (legacyDepartments.length > 0) {
        return ensureUniqueDepartmentIds(legacyDepartments);
    }

    // 2) Fallback source: generated JSON
    try {
        const res = await fetch(GRAD_CURRICULUM_URL, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = await res.json();
        if (!payload || !Array.isArray(payload.departments)) {
            throw new Error('Invalid curriculum payload');
        }
        return ensureUniqueDepartmentIds(payload.departments);
    } catch (err) {
        console.warn('JSON curriculum could not be loaded, fallback to legacy data.', err);
        return ensureUniqueDepartmentIds(convertLegacyCurriculum());
    }
}

function toIdSlug(value) {
    const map = {
        'ç': 'c', 'ğ': 'g', 'ı': 'i', 'ö': 'o', 'ş': 's', 'ü': 'u',
        'Ç': 'c', 'Ğ': 'g', 'İ': 'i', 'I': 'i', 'Ö': 'o', 'Ş': 's', 'Ü': 'u'
    };
    return String(value || '')
        .split('')
        .map(ch => map[ch] || ch)
        .join('')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-');
}

function buildDepartmentId(department) {
    const facultySlug = toIdSlug(department && department.faculty);
    const nameSlug = toIdSlug(department && department.name);
    const rawSlug = toIdSlug(department && department.id);

    const base = [facultySlug, nameSlug].filter(Boolean).join('-');
    if (base) return base;
    if (rawSlug) return rawSlug;
    return 'bolum';
}

function ensureUniqueDepartmentIds(departments) {
    const used = new Map();

    return (departments || []).map((d) => {
        const baseId = buildDepartmentId(d);
        const seen = used.get(baseId) || 0;
        const next = seen + 1;
        used.set(baseId, next);

        return {
            ...d,
            id: seen === 0 ? baseId : `${baseId}-${next}`
        };
    });
}

function convertLegacyCurriculum() {
    if (typeof CURRICULUM_DATA === 'undefined' || !CURRICULUM_DATA) return [];

    const entries = Array.isArray(CURRICULUM_DATA)
        ? CURRICULUM_DATA.map((c, index) => [c && c.id ? c.id : `bolum-${index + 1}`, c])
        : Object.entries(CURRICULUM_DATA);

    return entries
        .map(([id, c]) => {
            const faculty = c.faculty || c.fakulte || 'Bilinmiyor';
            const electives = c.electives || c.elective || {};

            return {
                id,
                faculty: faculty,
                name: c.name || id,
                code: c.code || id.toUpperCase(),
                mandatory: c.mandatory || {},
                electives: electives,
                electivePrefix: Array.isArray(c.electivePrefix) ? c.electivePrefix : [],
                electiveRules: {
                    withLab: c.electiveRules && Number.isFinite(c.electiveRules.withLab) ? c.electiveRules.withLab : null,
                    withoutLab: c.electiveRules && Number.isFinite(c.electiveRules.withoutLab) ? c.electiveRules.withoutLab : null
                }
            };
        })
        .sort((a, b) => {
            const facultyCmp = a.faculty.localeCompare(b.faculty, 'tr');
            if (facultyCmp !== 0) return facultyCmp;
            return a.name.localeCompare(b.name, 'tr');
        });
}

function populateFacultyOptions(selectEl, departments) {
    const faculties = [...new Set(departments.map(d => d.faculty).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'tr'));
    selectEl.innerHTML = '<option value="">-- Fakülte Seç --</option>';

    faculties.forEach((faculty) => {
        const opt = document.createElement('option');
        opt.value = faculty;
        opt.textContent = faculty;
        selectEl.appendChild(opt);
    });
}

function populateDepartmentOptions(selectEl, departments, faculty) {
    selectEl.innerHTML = '<option value="">-- Bölüm Seç --</option>';
    if (!faculty) return;

    const list = departments
        .filter(d => d.faculty === faculty)
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

    list.forEach((dept) => {
        const opt = document.createElement('option');
        opt.value = dept.id;
        opt.textContent = dept.name;
        selectEl.appendChild(opt);
    });
}

function clearRuleInputs(withLabInput, withoutLabInput) {
    if (withLabInput) {
        withLabInput.value = '';
        withLabInput.placeholder = 'Örn: 4';
    }
    if (withoutLabInput) {
        withoutLabInput.value = '';
        withoutLabInput.placeholder = 'Örn: 3';
    }
}

function applyDepartmentRulePlaceholders(curriculum, withLabInput, withoutLabInput, setHint) {
    if (!withLabInput || !withoutLabInput) return;

    withLabInput.value = '';
    withoutLabInput.value = '';

    const defaultWithLab = curriculum && curriculum.electiveRules ? curriculum.electiveRules.withLab : null;
    const defaultWithoutLab = curriculum && curriculum.electiveRules ? curriculum.electiveRules.withoutLab : null;

    withLabInput.placeholder = Number.isFinite(defaultWithLab) ? String(defaultWithLab) : 'Örn: 4';
    withoutLabInput.placeholder = Number.isFinite(defaultWithoutLab) ? String(defaultWithoutLab) : 'Örn: 3';

    if (Number.isFinite(defaultWithLab) || Number.isFinite(defaultWithoutLab)) {
        setHint(`Bu bölüm için varsayılan kural: lablı ${Number.isFinite(defaultWithLab) ? defaultWithLab : '-'}, labsız ${Number.isFinite(defaultWithoutLab) ? defaultWithoutLab : '-'}.`);
    } else {
        setHint('Bu bölüm için varsayılan lablı/labsız kuralı bulunamadı. İstersen manuel girebilirsin.');
    }
}

function parseOptionalInt(value) {
    if (value === null || value === undefined || String(value).trim() === '') return null;
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return null;
    return n;
}

function normalizeCode(code) {
    return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function parseNumericPart(code) {
    const n = parseInt(String(code || '').replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
}

function isLabLikeCourse(course) {
    const text = `${course.code || ''} ${course.name || ''}`.toUpperCase();
    return text.includes('LAB') || text.includes('LABORATUVAR') || text.includes('LABORATORY');
}

function isLanguageCourse(course) {
    const code = normalizeCode(course && course.code);
    const name = normalizeSearchText(course && course.name);

    const languageCodePrefixes = ['ALM', 'FRA', 'ING', 'JPN', 'KRC', 'YUN', 'RUS', 'ISP', 'ITA', 'LAT', 'OSM', 'CIN', 'ARA', 'FLS', 'YD'];
    const hasLanguageCodePrefix = languageCodePrefixes.some(prefix => code.startsWith(prefix));

    const positiveNameTerms = [
        'yabanci dil', 'foreign language',
        'ingilizce', 'almanca', 'fransizca', 'japonca', 'korece', 'yunanca',
        'rusca', 'ispanyolca', 'italyanca', 'latince', 'osmanlica', 'arapca', 'cince'
    ];
    const hasPositiveNameTerm = positiveNameTerms.some(term => name.includes(term));

    // Avoid NLP-type technical courses such as "Dogal Dil Isleme".
    const negativeNameTerms = ['dogal dil', 'dil isleme', 'nlp'];
    const hasNegativeNameTerm = negativeNameTerms.some(term => name.includes(term));

    return (hasLanguageCodePrefix || hasPositiveNameTerm) && !hasNegativeNameTerm;
}

function isPassed(grade) {
    const normalized = String(grade || '').trim();
    const failGrades = ['F1', 'F2', 'F3', 'FF', 'FD', 'Başarısız', 'DZ', 'G', '-'];
    return normalized !== '' && !failGrades.includes(normalized);
}

function isSecCourseCode(code) {
    return normalizeCode(code).startsWith('SEC');
}

function flattenCoursesBySemester(courseMap) {
    const all = [];
    const set = new Set();

    Object.entries(courseMap || {}).forEach(([semester, courses]) => {
        (courses || []).forEach(c => {
            const normalized = normalizeCode(c.code);
            if (!normalized) return;
            all.push({ ...c, semester });
            set.add(normalized);
        });
    });

    return { all, set };
}

function pickBetterAttempt(existing, candidate) {
    const candidateOngoing = !candidate.grade || candidate.grade === '-' || String(candidate.grade).trim() === '';
    const existingOngoing = !existing.grade || existing.grade === '-' || String(existing.grade).trim() === '';

    if (existingOngoing && !candidateOngoing) return candidate;
    if (!existingOngoing && candidateOngoing) return existing;

    const candidateId = Number.isFinite(candidate.id) ? candidate.id : 0;
    const existingId = Number.isFinite(existing.id) ? existing.id : 0;
    return candidateId >= existingId ? candidate : existing;
}

function classifyLabPairs(electives) {
    const labPairs = [];
    const standalone = [];
    const paired = new Set();

    const enriched = electives.map(c => ({
        ...c,
        normalizedCode: normalizeCode(c.code),
        numericPart: parseNumericPart(c.code),
        isLabLike: isLabLikeCourse(c)
    }));

    // Candidate pairs: same code prefix, numeric difference is exactly 2,
    // and exactly one side is lab-like (theory + lab relation).
    const candidates = [];
    for (let i = 0; i < enriched.length; i++) {
        const a = enriched[i];
        if (a.numericPart === null) continue;
        const prefixA = String(a.code || '').replace(/[0-9]/g, '').toUpperCase();

        for (let j = i + 1; j < enriched.length; j++) {
            const b = enriched[j];
            if (b.numericPart === null) continue;

            const prefixB = String(b.code || '').replace(/[0-9]/g, '').toUpperCase();
            if (prefixA !== prefixB) continue;
            if (Math.abs(a.numericPart - b.numericPart) !== 2) continue;
            if (a.isLabLike === b.isLabLike) continue;

            const theory = a.isLabLike ? b : a;
            const lab = a.isLabLike ? a : b;
            const diff = lab.numericPart - theory.numericPart;
            const priority = diff === 2 ? 0 : 1; // Prefer theory -> lab as +2

            candidates.push({ theory, lab, priority });
        }
    }

    candidates.sort((x, y) => x.priority - y.priority);

    candidates.forEach(({ theory, lab }) => {
        if (paired.has(theory.normalizedCode) || paired.has(lab.normalizedCode)) return;
        labPairs.push({ theory, lab });
        paired.add(theory.normalizedCode);
        paired.add(lab.normalizedCode);
    });

    enriched.forEach(course => {
        if (!paired.has(course.normalizedCode)) {
            standalone.push(course);
        }
    });

    return { labPairs, standalone };
}

function buildElectiveRecommendations(curriculumElectives, userCoursesMap) {
    const resolved = Object.values(userCoursesMap || {});
    const takenCodeSet = new Set(
        resolved
            .map(c => normalizeCode(c.code))
            .filter(Boolean)
    );

    const uniqueByCode = new Map();
    (curriculumElectives || []).forEach((course) => {
        const code = normalizeCode(course.code);
        if (!code) return;

        if (!uniqueByCode.has(code)) {
            uniqueByCode.set(code, {
                code: course.code,
                name: course.name,
                akts: course.akts,
                semester: course.semester,
                semesters: [course.semester].filter(Boolean)
            });
            return;
        }

        const existing = uniqueByCode.get(code);
        if (course.semester && !existing.semesters.includes(course.semester)) {
            existing.semesters.push(course.semester);
        }
    });

    const uniqueElectives = Array.from(uniqueByCode.values());
    const classified = classifyLabPairs(uniqueElectives);

    const isAvailable = (course) => !takenCodeSet.has(normalizeCode(course.code));

    const labRecommendations = [];
    classified.labPairs.forEach((pair) => {
        const theoryAvailable = isAvailable(pair.theory);
        const labAvailable = isAvailable(pair.lab);

        if (theoryAvailable && labAvailable) {
            labRecommendations.push({
                type: 'pair',
                theory: pair.theory,
                lab: pair.lab
            });
            return;
        }

        if (theoryAvailable || labAvailable) {
            const remaining = theoryAvailable ? pair.theory : pair.lab;
            const taken = theoryAvailable ? pair.lab : pair.theory;
            labRecommendations.push({
                type: 'single',
                remaining,
                taken
            });
        }
    });

    const nonLabRecommendations = classified.standalone.filter(c => isAvailable(c) && !isLanguageCourse(c));
    const languageRecommendations = uniqueElectives.filter(c => isAvailable(c) && isLanguageCourse(c));

    return {
        lab: labRecommendations,
        nonLab: nonLabRecommendations,
        language: languageRecommendations
    };
}

function generateGraduationReport(userCourses, curriculum, overrides) {
    if (!curriculum) return null;

    const mandatoryData = flattenCoursesBySemester(curriculum.mandatory || {});
    const electiveData = flattenCoursesBySemester(curriculum.electives || {});

    const allMandatory = mandatoryData.all;
    const mandatoryCodeSet = mandatoryData.set;
    const electiveCodeSet = electiveData.set;
    const electivePrefix = Array.isArray(curriculum.electivePrefix) ? curriculum.electivePrefix : [];

    const userCoursesMap = {};
    userCourses.forEach(c => {
        if (!c || c.isDraft || c.isRepeated) return;
        const code = normalizeCode(c.code);
        if (!code) return;

        if (!userCoursesMap[code]) userCoursesMap[code] = c;
        else userCoursesMap[code] = pickBetterAttempt(userCoursesMap[code], c);
    });

    const userCodeSet = new Set(Object.keys(userCoursesMap));

    const takenMandatory = [];
    const missingMandatory = [];

    allMandatory.forEach(mc => {
        const code = normalizeCode(mc.code);
        if (userCodeSet.has(code)) {
            const userCourse = userCoursesMap[code];
            takenMandatory.push({
                ...mc,
                userGrade: userCourse.grade,
                passed: isPassed(userCourse.grade)
            });
        } else {
            missingMandatory.push(mc);
        }
    });

    const resolvedCourses = Object.values(userCoursesMap);
    const electiveRecommendations = buildElectiveRecommendations(electiveData.all, userCoursesMap);

    const passedElectives = [];
    resolvedCourses.forEach(c => {
        const code = normalizeCode(c.code);
        if (!code || mandatoryCodeSet.has(code)) return;
        if (!isPassed(c.grade)) return;

        const matchesKnownElective = electiveCodeSet.has(code);
        const matchesPrefix = electivePrefix.some(prefix => code.startsWith(normalizeCode(prefix)));

        if (matchesKnownElective || matchesPrefix) {
            passedElectives.push({
                code: c.code,
                name: c.name,
                grade: c.grade,
                akts: c.akts
            });
        }
    });

    const ongoingCourses = [];
    resolvedCourses.forEach(c => {
        const grade = String(c.grade || '').trim();
        const isOngoing = grade === '' || grade === '-';
        if (!isOngoing) return;

        const code = normalizeCode(c.code);
        const isMandatory = mandatoryCodeSet.has(code);
        const isElective = electiveCodeSet.has(code) || electivePrefix.some(prefix => code.startsWith(normalizeCode(prefix)));

        ongoingCourses.push({
            code: c.code,
            name: c.name,
            akts: c.akts,
            semester: c.semester,
            isMandatory,
            isElective: !isMandatory && isElective,
            numericPart: parseNumericPart(c.code)
        });
    });

    const classified = classifyLabPairs(passedElectives);
    const standaloneLabElectives = classified.standalone.filter(isLabLikeCourse);
    const standaloneNonLabElectives = classified.standalone.filter(c => !isLabLikeCourse(c));

    const ongoingElectives = ongoingCourses.filter(c => c.isElective);
    const ongoingClassified = classifyLabPairs(ongoingElectives);
    const ongoingStandaloneLab = ongoingClassified.standalone.filter(isLabLikeCourse);
    const ongoingStandaloneNonLab = ongoingClassified.standalone.filter(c => !isLabLikeCourse(c));

    const defaultWithLab = curriculum.electiveRules && Number.isFinite(curriculum.electiveRules.withLab)
        ? curriculum.electiveRules.withLab
        : null;
    const defaultWithoutLab = curriculum.electiveRules && Number.isFinite(curriculum.electiveRules.withoutLab)
        ? curriculum.electiveRules.withoutLab
        : null;

    const requiredWithLab = Number.isFinite(overrides.withLab) ? overrides.withLab : defaultWithLab;
    const requiredWithoutLab = Number.isFinite(overrides.withoutLab) ? overrides.withoutLab : defaultWithoutLab;

    const hasWithLab = classified.labPairs.length + standaloneLabElectives.length;
    const hasWithoutLab = standaloneNonLabElectives.length;

    const withLabRuleKnown = Number.isFinite(requiredWithLab);
    const withoutLabRuleKnown = Number.isFinite(requiredWithoutLab);

    const withLabOk = !withLabRuleKnown || hasWithLab >= requiredWithLab;
    const withoutLabOk = !withoutLabRuleKnown || hasWithoutLab >= requiredWithoutLab;

    const passedSecCourses = resolvedCourses
        .filter(c => isSecCourseCode(c.code) && isPassed(c.grade))
        .map(c => ({
            code: c.code,
            name: c.name,
            grade: c.grade,
            akts: c.akts
        }));
    const secCourseCount = passedSecCourses.length;
    const secCoursesOk = secCourseCount >= MIN_REQUIRED_SEC_COURSES;

    return {
        department: curriculum.name,
        faculty: curriculum.faculty,
        totalMandatory: allMandatory.length,
        takenMandatory,
        missingMandatory,
        passedElectives,
        labPairs: classified.labPairs,
        standaloneElectives: classified.standalone,
        standaloneLabElectives,
        standaloneNonLabElectives,
        ongoingCourses,
        ongoingElectiveImpact: {
            withLab: ongoingClassified.labPairs.length + ongoingStandaloneLab.length,
            withoutLab: ongoingStandaloneNonLab.length
        },
        secRules: {
            required: MIN_REQUIRED_SEC_COURSES,
            has: secCourseCount,
            ok: secCoursesOk
        },
        passedSecCourses,
        electiveRecommendations,
        electiveRules: {
            requiredWithLab,
            requiredWithoutLab,
            hasWithLab,
            hasWithoutLab,
            withLabRuleKnown,
            withoutLabRuleKnown,
            withLabOk,
            withoutLabOk,
            allOk: withLabOk && withoutLabOk
        }
    };
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderGraduationReport(report, container) {
    if (!report) {
        container.innerHTML = '<p>Rapor oluşturulamadı.</p>';
        return;
    }

    const e = escapeHtml;
    const mandatoryPassed = report.takenMandatory.filter(c => c.passed).length;
    const mandatoryFailed = report.takenMandatory.filter(c => !c.passed).length;
    const mandatoryMissing = report.missingMandatory.length;
    const mandatoryTotal = report.totalMandatory;
    const mandatoryPercent = mandatoryTotal > 0 ? Math.round((mandatoryPassed / mandatoryTotal) * 100) : 0;

    const electiveOk = report.electiveRules.allOk;
    const secOk = report.secRules && report.secRules.ok;
    const mandatoryOk = mandatoryMissing === 0 && mandatoryFailed === 0;
    const allGood = mandatoryOk && electiveOk && secOk;

    let overallBadge = '';
    if (allGood) {
        overallBadge = `<div class="grad-overall grad-success"><i class="fa-solid fa-graduation-cap"></i> Tebrikler! Tüm mezuniyet şartları tamamlanmış görünüyor!</div>`;
    } else {
        overallBadge = `<div class="grad-overall grad-warning"><i class="fa-solid fa-triangle-exclamation"></i> Henüz tamamlanmamış mezuniyet şartları var</div>`;
    }

    const deptInfo = `
        <div style="margin-bottom:12px; padding:10px 12px; border:1px solid var(--border-color); border-radius:10px; background:var(--bg-card); font-size:0.9rem; color:var(--text-secondary);">
            <i class="fa-solid fa-building"></i>
            <strong>${e(report.faculty)}</strong> / ${e(report.department)}
        </div>
    `;

    let missingHtml = '';
    if (report.missingMandatory.length > 0) {
        const bySemester = {};
        report.missingMandatory.forEach(c => {
            if (!bySemester[c.semester]) bySemester[c.semester] = [];
            bySemester[c.semester].push(c);
        });

        let semesterCards = '';
        Object.entries(bySemester).forEach(([sem, courses]) => {
            let courseRows = courses.map(c => `
                <div class="grad-course-row grad-missing-row">
                    <span class="grad-code">${e(c.code)}</span>
                    <span class="grad-name">${e(c.name)}</span>
                    <span class="grad-akts">${e(c.akts || '-')} AKTS</span>
                    <span class="grad-status-badge grad-badge-missing"><i class="fa-solid fa-xmark"></i> Alınmadı</span>
                </div>
            `).join('');

            semesterCards += `
                <div class="grad-semester-group">
                    <div class="grad-semester-header">
                        <i class="fa-regular fa-calendar-days"></i> ${e(sem)}
                        <span class="grad-semester-count">${courses.length} ders eksik</span>
                    </div>
                    ${courseRows}
                </div>
            `;
        });

        missingHtml = `
            <div class="grad-section">
                <h4 class="grad-section-title">
                    <i class="fa-solid fa-book-open" style="color:#ef4444;"></i>
                    Alınmamış Zorunlu Dersler
                    <span class="grad-count-badge grad-count-danger">${report.missingMandatory.length}</span>
                </h4>
                ${semesterCards}
            </div>
        `;
    }

    let failedHtml = '';
    const failedCourses = report.takenMandatory.filter(c => !c.passed);
    if (failedCourses.length > 0) {
        let failedRows = failedCourses.map(c => `
            <div class="grad-course-row grad-failed-row">
                <span class="grad-code">${e(c.code)}</span>
                <span class="grad-name">${e(c.name)}</span>
                <span class="grad-akts">${e(c.akts || '-')} AKTS</span>
                <span class="grad-grade">${e(c.userGrade)}</span>
                <span class="grad-status-badge grad-badge-failed"><i class="fa-solid fa-rotate-right"></i> Tekrar Alınmalı</span>
            </div>
        `).join('');

        failedHtml = `
            <div class="grad-section">
                <h4 class="grad-section-title">
                    <i class="fa-solid fa-circle-exclamation" style="color:#f59e0b;"></i>
                    Başarı ile verilmesi gereken Dersler
                    <span class="grad-count-badge grad-count-warning">${failedCourses.length}</span>
                </h4>
                ${failedRows}
            </div>
        `;
    }

    const er = report.electiveRules;
    const sec = report.secRules || { has: 0, required: MIN_REQUIRED_SEC_COURSES, ok: false };
    const withLabStatusLabel = er.withLabRuleKnown ? `${er.hasWithLab} / ${er.requiredWithLab}` : `${er.hasWithLab} / ?`;
    const withoutLabStatusLabel = er.withoutLabRuleKnown ? `${er.hasWithoutLab} / ${er.requiredWithoutLab}` : `${er.hasWithoutLab} / ?`;

    let electiveHtml = `
        <div class="grad-section">
            <h4 class="grad-section-title">
                <i class="fa-solid fa-flask" style="color:#8b5cf6;"></i>
                Seçmeli Ders Durumu
            </h4>
            <div class="grad-elective-cards">
                <div class="grad-elective-card ${er.withLabOk ? 'grad-elective-ok' : 'grad-elective-missing'}">
                    <div class="grad-elective-icon">
                        <i class="fa-solid fa-microscope"></i>
                    </div>
                    <div class="grad-elective-info">
                        <div class="grad-elective-label">Lablı Seçmeli</div>
                        <div class="grad-elective-count">${withLabStatusLabel}</div>
                        <div class="grad-elective-hint">Lab çifti + lab olarak işaretlenen dersler</div>
                    </div>
                    <div class="grad-elective-status">
                        ${er.withLabOk
            ? '<i class="fa-solid fa-circle-check" style="color:#10b981; font-size:1.5rem;"></i>'
            : '<i class="fa-solid fa-circle-xmark" style="color:#ef4444; font-size:1.5rem;"></i>'}
                    </div>
                </div>
                <div class="grad-elective-card ${er.withoutLabOk ? 'grad-elective-ok' : 'grad-elective-missing'}">
                    <div class="grad-elective-icon">
                        <i class="fa-solid fa-book"></i>
                    </div>
                    <div class="grad-elective-info">
                        <div class="grad-elective-label">Labsız Seçmeli</div>
                        <div class="grad-elective-count">${withoutLabStatusLabel}</div>
                        <div class="grad-elective-hint">Lab olmayan seçmeli dersler</div>
                    </div>
                    <div class="grad-elective-status">
                        ${er.withoutLabOk
            ? '<i class="fa-solid fa-circle-check" style="color:#10b981; font-size:1.5rem;"></i>'
            : '<i class="fa-solid fa-circle-xmark" style="color:#ef4444; font-size:1.5rem;"></i>'}
                    </div>
                </div>
                <div class="grad-elective-card ${sec.ok ? 'grad-elective-ok' : 'grad-elective-missing'}">
                    <div class="grad-elective-icon">
                        <i class="fa-solid fa-hashtag"></i>
                    </div>
                    <div class="grad-elective-info">
                        <div class="grad-elective-label">SEC Kodlu Ders</div>
                        <div class="grad-elective-count">${sec.has} / ${sec.required}</div>
                        <div class="grad-elective-hint">Ders kodu SEC ile başlayan ve geçilmiş dersler</div>
                    </div>
                    <div class="grad-elective-status">
                        ${sec.ok
            ? '<i class="fa-solid fa-circle-check" style="color:#10b981; font-size:1.5rem;"></i>'
            : '<i class="fa-solid fa-circle-xmark" style="color:#ef4444; font-size:1.5rem;"></i>'}
                    </div>
                </div>
            </div>
            <div style="margin-top:8px; font-size:0.85rem; color:var(--text-muted);">
                ${er.withLabRuleKnown || er.withoutLabRuleKnown
            ? 'Kural kaynağı: bölüm varsayılanı veya manuel giriş.'
            : 'Bu bölüm için seçmeli kuralı tanımlı değil. İstersen üstten manuel değer gir.'}
                <br>
                Mezuniyet için ayrıca en az <strong>${sec.required}</strong> adet geçerli SEC kodlu ders gerekir.
            </div>
    `;

    const recommendationLabRows = (report.electiveRecommendations && report.electiveRecommendations.lab ? report.electiveRecommendations.lab : [])
        .map((item) => {
            if (item.type === 'pair') {
                return `
                    <div class="grad-course-row" style="padding:8px 10px; border-left:3px solid #8b5cf6; margin-bottom:6px; border-radius:6px; background:rgba(139,92,246,0.05);">
                        <span class="grad-code">${e(item.theory.code)} + ${e(item.lab.code)}</span>
                        <span class="grad-name">${e(item.theory.name)} + ${e(item.lab.name)}</span>
                        <span class="grad-status-badge" style="background:rgba(139,92,246,0.1); color:#6d28d9;">Lablı Paket</span>
                    </div>
                `;
            }

            return `
                <div class="grad-course-row" style="padding:8px 10px; border-left:3px solid #a855f7; margin-bottom:6px; border-radius:6px; background:rgba(168,85,247,0.05);">
                    <span class="grad-code">${e(item.remaining.code)}</span>
                    <span class="grad-name">${e(item.remaining.name)}</span>
                    <span class="grad-status-badge" style="background:rgba(168,85,247,0.12); color:#7e22ce;">Lab Eşi Tamamlama</span>
                </div>
            `;
        })
        .join('');

    const recommendationNonLabRows = (report.electiveRecommendations && report.electiveRecommendations.nonLab ? report.electiveRecommendations.nonLab : [])
        .map((item) => `
            <div class="grad-course-row" style="padding:8px 10px; margin-bottom:6px; border-radius:6px; background:rgba(59,130,246,0.05); border-left:3px solid #3b82f6;">
                <span class="grad-code">${e(item.code)}</span>
                <span class="grad-name">${e(item.name)}</span>
                <span class="grad-status-badge" style="background:rgba(59,130,246,0.12); color:#1d4ed8;">Labsız Öneri</span>
            </div>
        `)
        .join('');

    const recommendationLanguageRows = (report.electiveRecommendations && report.electiveRecommendations.language ? report.electiveRecommendations.language : [])
        .map((item) => `
            <div class="grad-course-row" style="padding:8px 10px; margin-bottom:6px; border-radius:6px; background:rgba(16,185,129,0.06); border-left:3px solid #10b981;">
                <span class="grad-code">${e(item.code)}</span>
                <span class="grad-name">${e(item.name)}</span>
                <span class="grad-status-badge" style="background:rgba(16,185,129,0.14); color:#047857;">Dil Dersi</span>
            </div>
        `)
        .join('');

    const electiveRecommendationHtml = `
        <div class="grad-section">
            <h4 class="grad-section-title">
                <i class="fa-solid fa-lightbulb" style="color:#f59e0b;"></i>
                Seçmeli Ders Önerileri
            </h4>
            <div style="display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                <button type="button" class="grad-rec-tab-btn active" data-rec-tab="lab" style="border:1px solid #8b5cf6; color:#6d28d9; background:#f5f3ff; border-radius:8px; padding:6px 10px; cursor:pointer; font-weight:600;">
                    Lablı (${(report.electiveRecommendations && report.electiveRecommendations.lab ? report.electiveRecommendations.lab.length : 0)})
                </button>
                <button type="button" class="grad-rec-tab-btn" data-rec-tab="nonlab" style="border:1px solid #3b82f6; color:#1d4ed8; background:#eff6ff; border-radius:8px; padding:6px 10px; cursor:pointer; font-weight:600;">
                    Labsız (${(report.electiveRecommendations && report.electiveRecommendations.nonLab ? report.electiveRecommendations.nonLab.length : 0)})
                </button>
                <button type="button" class="grad-rec-tab-btn" data-rec-tab="lang" style="border:1px solid #10b981; color:#047857; background:#ecfdf5; border-radius:8px; padding:6px 10px; cursor:pointer; font-weight:600;">
                    Dil Dersleri (${(report.electiveRecommendations && report.electiveRecommendations.language ? report.electiveRecommendations.language.length : 0)})
                </button>
            </div>

            <div class="grad-rec-panel" data-rec-panel="lab" style="display:block;">
                ${recommendationLabRows || '<div style="font-size:0.9rem; color:var(--text-muted); padding:6px 2px;">Lablı öneri bulunamadı (alınmamış uygun ders yok).</div>'}
            </div>
            <div class="grad-rec-panel" data-rec-panel="nonlab" style="display:none;">
                ${recommendationNonLabRows || '<div style="font-size:0.9rem; color:var(--text-muted); padding:6px 2px;">Labsız öneri bulunamadı (alınmamış uygun ders yok).</div>'}
            </div>
            <div class="grad-rec-panel" data-rec-panel="lang" style="display:none;">
                ${recommendationLanguageRows || '<div style="font-size:0.9rem; color:var(--text-muted); padding:6px 2px;">Dil dersi önerisi bulunamadı (uygun/alınmamış ders yok).</div>'}
            </div>
            <div style="margin-top:8px; font-size:0.82rem; color:var(--text-muted);">
                Öneriler, bölüm müfredatındaki seçmeli havuzundan alınan ve henüz alınmamış derslere göre üretilir.
            </div>
        </div>
    `;

    if (report.labPairs.length > 0) {
        let pairRows = report.labPairs.map(p => `
            <div class="grad-pair-row">
                <span class="grad-pair-theory"><i class="fa-solid fa-chalkboard-user"></i> ${e(p.theory.code)} - ${e(p.theory.name)}</span>
                <span class="grad-pair-arrow"><i class="fa-solid fa-link"></i></span>
                <span class="grad-pair-lab"><i class="fa-solid fa-flask-vial"></i> ${e(p.lab.code)} - ${e(p.lab.name)}</span>
            </div>
        `).join('');

        electiveHtml += `
            <div class="grad-detected-pairs">
                <h5 style="margin:10px 0 8px; color:var(--text-secondary); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em;">
                    <i class="fa-solid fa-link"></i> Tespit Edilen Lab Çiftleri
                </h5>
                ${pairRows}
            </div>
        `;
    }

    if (report.standaloneNonLabElectives.length > 0) {
        let standaloneRows = report.standaloneNonLabElectives.map(c => `
            <div class="grad-course-row" style="padding:6px 10px;">
                <span class="grad-code">${e(c.code)}</span>
                <span class="grad-name">${e(c.name)}</span>
                <span class="grad-grade">${e(c.grade)}</span>
            </div>
        `).join('');

        electiveHtml += `
            <div class="grad-detected-standalone">
                <h5 style="margin:10px 0 8px; color:var(--text-secondary); font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em;">
                    <i class="fa-solid fa-book"></i> Labsız Seçmeliler
                </h5>
                ${standaloneRows}
            </div>
        `;
    }

    electiveHtml += '</div>';

    const summaryHtml = `
        <div class="grad-summary">
            <div class="grad-summary-card">
                <div class="grad-summary-number" style="color:#10b981;">${mandatoryPassed}</div>
                <div class="grad-summary-label">Geçilen Zorunlu</div>
            </div>
            <div class="grad-summary-card">
                <div class="grad-summary-number" style="color:#ef4444;">${mandatoryMissing + mandatoryFailed}</div>
                <div class="grad-summary-label">Eksik / Başarısız</div>
            </div>
            <div class="grad-summary-card">
                <div class="grad-summary-number" style="color:#8b5cf6;">${report.passedElectives.length}</div>
                <div class="grad-summary-label">Geçilen Seçmeli</div>
            </div>
            <div class="grad-summary-card">
                <div class="grad-summary-number" style="color:${sec.ok ? '#10b981' : '#ef4444'};">${sec.has} / ${sec.required}</div>
                <div class="grad-summary-label">SEC Kodlu Ders</div>
            </div>
            <div class="grad-summary-card">
                <div class="grad-summary-number" style="color:#3b82f6;">${mandatoryPercent}%</div>
                <div class="grad-summary-label">Zorunlu Tamamlama</div>
            </div>
        </div>
    `;

    const progressHtml = `
        <div class="grad-progress-section">
            <div style="display:flex; justify-content:space-between; margin-bottom:6px; font-size:0.85rem; color:var(--text-secondary);">
                <span>Zorunlu Ders İlerlemesi</span>
                <span>${mandatoryPassed} / ${mandatoryTotal}</span>
            </div>
            <div class="grad-progress-bar">
                <div class="grad-progress-fill" style="width:${mandatoryPercent}%;"></div>
            </div>
        </div>
    `;

    let ongoingHtml = '';
    if (report.ongoingCourses && report.ongoingCourses.length > 0) {
        const ongoingMandatory = report.ongoingCourses.filter(c => c.isMandatory);
        const ongoingElective = report.ongoingCourses.filter(c => c.isElective);
        const ongoingOther = report.ongoingCourses.filter(c => !c.isMandatory && !c.isElective);

        let ongoingRows = '';

        if (ongoingMandatory.length > 0) {
            ongoingRows += `
                <div style="margin-bottom:10px;">
                    <h5 style="margin:0 0 6px; color:var(--text-secondary); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">
                        <i class="fa-solid fa-book-bookmark" style="color:#3b82f6;"></i> Zorunlu Dersler
                    </h5>
                    ${ongoingMandatory.map(c => `
                        <div class="grad-course-row" style="background:rgba(59,130,246,0.04); border-left:3px solid #3b82f6; padding:8px 12px; margin-bottom:4px; border-radius:6px;">
                            <span class="grad-code">${e(c.code)}</span>
                            <span class="grad-name">${e(c.name)}</span>
                            <span class="grad-akts">${e(c.akts || '-')} AKTS</span>
                            <span class="grad-status-badge" style="background:rgba(59,130,246,0.1); color:#2563eb;"><i class="fa-solid fa-spinner"></i> Devam Ediyor</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        if (ongoingElective.length > 0) {
            const impact = report.ongoingElectiveImpact;
            ongoingRows += `
                <div style="margin-bottom:10px;">
                    <h5 style="margin:0 0 6px; color:var(--text-secondary); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">
                        <i class="fa-solid fa-flask" style="color:#8b5cf6;"></i> Seçmeli Dersler
                    </h5>
                    ${ongoingElective.map(c => `
                        <div class="grad-course-row" style="background:rgba(139,92,246,0.04); border-left:3px solid #8b5cf6; padding:8px 12px; margin-bottom:4px; border-radius:6px;">
                            <span class="grad-code">${e(c.code)}</span>
                            <span class="grad-name">${e(c.name)}</span>
                            <span class="grad-akts">${e(c.akts || '-')} AKTS</span>
                            <span class="grad-status-badge" style="background:rgba(139,92,246,0.1); color:#7c3aed;"><i class="fa-solid fa-spinner"></i> Devam Ediyor</span>
                        </div>
                    `).join('')}
                    <div style="margin-top:6px; padding:8px 12px; background:rgba(139,92,246,0.06); border-radius:6px; font-size:0.85rem; color:#4c1d95;">
                        <i class="fa-solid fa-arrow-trend-up" style="color:#8b5cf6;"></i>
                        Geçersen etkisi: lablı +${impact.withLab}, labsız +${impact.withoutLab}
                    </div>
                </div>
            `;
        }

        if (ongoingOther.length > 0) {
            ongoingRows += `
                <div>
                    <h5 style="margin:0 0 6px; color:var(--text-secondary); font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em;">
                        <i class="fa-solid fa-ellipsis" style="color:#94a3b8;"></i> Diğer Dersler
                    </h5>
                    ${ongoingOther.map(c => `
                        <div class="grad-course-row" style="padding:6px 12px; margin-bottom:3px;">
                            <span class="grad-code">${e(c.code)}</span>
                            <span class="grad-name">${e(c.name)}</span>
                            <span class="grad-akts">${e(c.akts || '-')} AKTS</span>
                        </div>
                    `).join('')}
                </div>
            `;
        }

        ongoingHtml = `
            <div class="grad-section" style="border-left:4px solid #f59e0b;">
                <h4 class="grad-section-title">
                    <i class="fa-solid fa-hourglass-half" style="color:#f59e0b;"></i>
                    Bu Dönem Aldıkların
                    <span class="grad-count-badge" style="background:#fffbeb; color:#d97706;">${report.ongoingCourses.length} ders</span>
                </h4>
                <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:12px;">
                    Henüz not verilmemiş dersler.
                </p>
                ${ongoingRows}
            </div>
        `;
    }

    container.innerHTML = `
        ${deptInfo}
        ${overallBadge}
        ${summaryHtml}
        ${progressHtml}
        ${failedHtml}
        ${missingHtml}
        ${electiveHtml}
        ${electiveRecommendationHtml}
        ${ongoingHtml}
    `;

    const recButtons = container.querySelectorAll('.grad-rec-tab-btn');
    const recPanels = container.querySelectorAll('.grad-rec-panel');
    recButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-rec-tab');
            recButtons.forEach(b => {
                b.classList.remove('active');
                b.style.opacity = b === btn ? '1' : '0.75';
            });
            btn.classList.add('active');

            recPanels.forEach((panel) => {
                const isMatch = panel.getAttribute('data-rec-panel') === target;
                panel.style.display = isMatch ? 'block' : 'none';
            });
        });
    });
}
