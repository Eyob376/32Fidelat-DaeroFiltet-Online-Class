(function () {
    const wrapper = document.querySelector('.member-portal-wrapper');
    if (!wrapper) return;

    const storage = {
        assignments: 'portalAssignmentsByEmail',
        assignmentsByProgram: 'portalAssignmentsByProgram',
        optionalAssignments: 'portalOptionalAssignmentsByEmail',
        optionalAssignmentsByProgram: 'portalOptionalAssignmentsByProgram',
        adminAdditionalAssignments: 'adminAdditionalAssignmentsForAllStudents',
        uploads: 'portalUploadsByEmail',
        progress: 'portalProgressByEmail',
        announcements: 'portalAnnouncementsByProgram',
        profileOverrides: 'portalProfileOverridesByEmail',
        reminders: 'portalRemindersByEmail',
        familyOffers: 'portalFamilyOffersByEmail',
        payments: 'portalPaymentsByEmail'
    };

    const sessionEmail = (
        sessionStorage.getItem('daeroMemberEmail') ||
        localStorage.getItem('daeroMemberEmail') ||
        ''
    ).toLowerCase().trim();
    const sessionRole = String(sessionStorage.getItem('daeroUserRole') || '').toLowerCase();
    const isPrivilegedPortalUser = sessionRole === 'admin' || sessionRole === 'itdev';
    const forcedStudentId = (new URLSearchParams(window.location.search).get('studentId') || '').trim();

    function normalizeStatus(value) {
        return String(value || '').trim().toLowerCase();
    }

    function canUseMemberPortal(studentRecord) {
        if (!studentRecord) return false;

        const lifecycleStatus = normalizeStatus(studentRecord.status);
        const courseStatus = normalizeStatus(studentRecord.courseStatus || studentRecord.course_status);
        const blocked = new Set(['suspended', 'terminated', 'completed']);

        if (blocked.has(lifecycleStatus) || blocked.has(courseStatus)) return false;
        return courseStatus === 'ongoing' || lifecycleStatus === 'ongoing';
    }

    function denyPortalAccess() {
        alert('Access denied. Only admin users and ongoing students can open the member portal.');
        window.location.replace('member.html');
    }

    function safeParse(key, fallback) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || '');
            return parsed ?? fallback;
        } catch (e) {
            return fallback;
        }
    }

    function saveMap(key, mapObj) {
        localStorage.setItem(key, JSON.stringify(mapObj || {}));
    }

    function normalizeEmail(value) {
        return String(value || '').trim().toLowerCase();
    }

    function sanitizeFileName(name) {
        return String(name || 'file').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'file';
    }

    function encodeAttr(value) {
        return encodeURIComponent(String(value || ''));
    }

    function decodeAttr(value) {
        try {
            return decodeURIComponent(String(value || ''));
        } catch (e) {
            return String(value || '');
        }
    }

    function openUrlInBrowser(url) {
        const href = String(url || '').trim();
        if (!href) {
            alert('File open link is unavailable.');
            return;
        }

        const opened = window.open(href, '_blank', 'noopener,noreferrer');
        if (!opened) {
            window.location.href = href;
        }
    }

    async function fetchAndOpen(url) {
        const href = String(url || '').trim();
        if (!href) { alert('File is unavailable.'); return; }
        try {
            const resp = await fetch(href);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const opened = window.open(blobUrl, '_blank');
            if (!opened) window.location.href = blobUrl;
            setTimeout(() => URL.revokeObjectURL(blobUrl), 30000);
        } catch (_err) {
            const opened = window.open(href, '_blank', 'noopener,noreferrer');
            if (!opened) window.location.href = href;
        }
    }

    async function fetchAndDownload(url, fileName) {
        const href = String(url || '').trim();
        if (!href) { alert('Download is unavailable.'); return; }
        const safeName = sanitizeFileName(fileName || 'file');
        try {
            const resp = await fetch(href);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = safeName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch (_err) {
            const link = document.createElement('a');
            link.href = href;
            link.download = safeName;
            link.rel = 'noopener';
            document.body.appendChild(link);
            link.click();
            link.remove();
        }
    }

    function bindFileLinks(scopeEl) {
        if (!scopeEl) return;
        scopeEl.querySelectorAll('.file-open-link:not([data-bound="open"])').forEach((link) => {
            link.dataset.bound = 'open';
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const url = decodeAttr(link.getAttribute('data-file-url') || '');
                if (!url) { alert('File is unavailable.'); return; }
                fetchAndOpen(url);
            });
        });
        scopeEl.querySelectorAll('.file-download-link:not([data-bound="dl"])').forEach((link) => {
            link.dataset.bound = 'dl';
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const url = decodeAttr(link.getAttribute('data-file-url') || '');
                const name = decodeAttr(link.getAttribute('data-file-name') || '');
                if (!url) { alert('Download is unavailable.'); return; }
                fetchAndDownload(url, name);
            });
        });
    }

    function buildFileActionLinks(fileUrl, fileName) {
        const href = String(fileUrl || '').trim();
        if (!href) return '<span>File unavailable</span>';

        const safeName = sanitizeFileName(fileName || 'file');
        const encodedUrl = encodeAttr(href);
        const encodedName = encodeAttr(safeName);
        return [
            `<button type="button" class="file-action-link file-open-link" data-file-url="${encodedUrl}">Open</button>`,
            `<button type="button" class="file-action-link file-download-link" data-file-url="${encodedUrl}" data-file-name="${encodedName}">Download</button>`
        ].join(' | ');
    }

    function getByEmail(mapObj, email) {
        const key = normalizeEmail(email);
        if (!key || !mapObj || typeof mapObj !== 'object') return null;
        if (mapObj[key] !== undefined) return mapObj[key];

        const matchedKey = Object.keys(mapObj).find(k => normalizeEmail(k) === key);
        return matchedKey ? mapObj[matchedKey] : null;
    }

    function mapProgramLevel(name) {
        const p = String(name || '').toLowerCase();
        if (p.includes('beginner') || p.includes('basic')) return 'Beginner';
        if (p.includes('intermediate')) return 'Intermediate';
        if (p.includes('advanced')) return 'Advanced';
        if (p.includes('immersion') || p.includes('cultural')) return 'Immersion';
        return 'Not Assigned';
    }

    function getScheduleText(student) {
        const chunks = [];
        if (student.morningStart && student.morningEnd) chunks.push(`Morning ${student.morningStart}-${student.morningEnd}`);
        if (student.afternoonStart && student.afternoonEnd) chunks.push(`Afternoon ${student.afternoonStart}-${student.afternoonEnd}`);
        if (student.eveningStart && student.eveningEnd) chunks.push(`Evening ${student.eveningStart}-${student.eveningEnd}`);
        return chunks.length ? chunks.join(' | ') : 'Schedule pending';
    }

    function findPortalStudentById(studentId) {
        if (!studentId) return null;

        const directKey = `applicant-${studentId}`;
        const directRaw = localStorage.getItem(directKey);
        if (directRaw) {
            try {
                const data = JSON.parse(directRaw);
                if (data && (data.firstName || data.programChoice || data.program)) {
                    return {
                        id: data.id || studentId,
                        status: data.status || 'new',
                        firstName: data.firstName || '',
                        lastName: data.lastName || '',
                        guardianName: data.guardianName || '',
                        guardianEmail: data.guardianEmail || '',
                        guardianPhone: data.guardianPhone || '',
                        programChoice: data.programChoice || data.program || data.gradeLevel || '',
                        teacherName: data.teacherName || 'TBD',
                        morningStart: data.morningStart || '',
                        morningEnd: data.morningEnd || '',
                        afternoonStart: data.afternoonStart || '',
                        afternoonEnd: data.afternoonEnd || '',
                        eveningStart: data.eveningStart || '',
                        eveningEnd: data.eveningEnd || ''
                    };
                }
            } catch (e) {
                return null;
            }
        }

        const suffixMatch = String(studentId).match(/-(\d+)$/);
        const baseId = suffixMatch ? String(studentId).replace(/-(\d+)$/, '') : String(studentId);
        const wantedSuffix = suffixMatch ? parseInt(suffixMatch[1], 10) : null;
        const baseRaw = localStorage.getItem(`applicant-${baseId}`);
        if (!baseRaw) return null;

        try {
            const data = JSON.parse(baseRaw);
            if (!data || !Array.isArray(data.students) || !data.students.length) return null;

            let matched = data.students[0];
            if (wantedSuffix) {
                const picked = data.students.find((s, idx) => {
                    const stableSuffix = Number.isInteger(s?._sid) ? s._sid : (idx + 1);
                    return stableSuffix === wantedSuffix;
                });
                if (picked) matched = picked;
            }

            return {
                id: studentId,
                status: data.status || 'new',
                firstName: matched.firstName || '',
                lastName: matched.lastName || '',
                guardianName: data.guardianName || '',
                guardianEmail: data.guardianEmail || '',
                guardianPhone: data.guardianPhone || '',
                programChoice: matched.programChoice || data.programChoice || '',
                teacherName: data.teacherName || 'TBD',
                morningStart: matched.morningStart || data.morningStart || '',
                morningEnd: matched.morningEnd || data.morningEnd || '',
                afternoonStart: matched.afternoonStart || data.afternoonStart || '',
                afternoonEnd: matched.afternoonEnd || data.afternoonEnd || '',
                eveningStart: matched.eveningStart || data.eveningStart || '',
                eveningEnd: matched.eveningEnd || data.eveningEnd || ''
            };
        } catch (e) {
            return null;
        }
    }

    function findPortalStudent(email) {
        const keys = Object.keys(localStorage).filter(k => k.startsWith('applicant-'));
        let fallback = null;

        for (const key of keys) {
            let data;
            try {
                data = JSON.parse(localStorage.getItem(key));
            } catch (e) {
                continue;
            }
            if (!data) continue;

            const gEmail = String(data.guardianEmail || '').toLowerCase();
            if (!gEmail || (email && gEmail !== email)) continue;

            if (Array.isArray(data.students) && data.students.length) {
                const s = data.students[0];
                fallback = {
                    id: data.id || key.replace('applicant-', ''),
                    status: data.status || 'new',
                    firstName: s.firstName || '',
                    lastName: s.lastName || '',
                    guardianName: data.guardianName || '',
                    guardianEmail: data.guardianEmail || '',
                    guardianPhone: data.guardianPhone || '',
                    programChoice: s.programChoice || data.programChoice || '',
                    teacherName: data.teacherName || 'TBD',
                    morningStart: s.morningStart || data.morningStart || '',
                    morningEnd: s.morningEnd || data.morningEnd || '',
                    afternoonStart: s.afternoonStart || data.afternoonStart || '',
                    afternoonEnd: s.afternoonEnd || data.afternoonEnd || '',
                    eveningStart: s.eveningStart || data.eveningStart || '',
                    eveningEnd: s.eveningEnd || data.eveningEnd || ''
                };
                continue;
            }

            if (data.firstName || data.programChoice || data.program) {
                const flattened = {
                    id: data.id || key.replace('applicant-', ''),
                    status: data.status || 'new',
                    firstName: data.firstName || '',
                    lastName: data.lastName || '',
                    guardianName: data.guardianName || '',
                    guardianEmail: data.guardianEmail || '',
                    guardianPhone: data.guardianPhone || '',
                    programChoice: data.programChoice || data.program || data.gradeLevel || '',
                    teacherName: data.teacherName || 'TBD',
                    morningStart: data.morningStart || '',
                    morningEnd: data.morningEnd || '',
                    afternoonStart: data.afternoonStart || '',
                    afternoonEnd: data.afternoonEnd || '',
                    eveningStart: data.eveningStart || '',
                    eveningEnd: data.eveningEnd || ''
                };

                if (flattened.status === 'admitted') return flattened;
                if (!fallback) fallback = flattened;
            }
        }

        return fallback;
    }
    async function findPortalStudentById(studentId) {
        if (!studentId || typeof db === 'undefined') return null;
        const { data, error } = await db.students.getById(studentId);
        if (error || !data) return null;
        const app = data.applicants || {};
        return {
            id: data.id,
            applicantId: data.applicant_id || null,
            status: data.status || 'new',
            courseStatus: data.course_status || '',
            firstName: data.first_name || '',
            lastName: data.last_name || '',
            guardianName: app.guardian_name || '',
            guardianEmail: app.guardian_email || '',
            guardianPhone: app.guardian_phone || '',
            programChoice: data.program_choice || '',
            teacherName: data.teacher_name || 'TBD',
            schedule: app.schedule || '',
            morningStart: '', morningEnd: '',
            afternoonStart: '', afternoonEnd: '',
            eveningStart: '', eveningEnd: ''
        };
    }

    async function findPortalStudent(email) {
        if (!email || typeof db === 'undefined') return null;
        const { data: applicants } = await db.applicants.getByEmail(email);
        if (!Array.isArray(applicants) || !applicants.length) return null;
        const applicant = applicants[0];
        const { data: students } = await db.students.getByApplicantId(applicant.id);
        const s = Array.isArray(students) && students.length ? students[0] : {};
        return {
            id: s.id || applicant.id,
            applicantId: applicant.id,
            status: s.status || applicant.status || 'new',
            courseStatus: s.course_status || applicant.course_status || '',
            firstName: s.first_name || '',
            lastName: s.last_name || '',
            guardianName: applicant.guardian_name || '',
            guardianEmail: applicant.guardian_email || '',
            guardianPhone: applicant.guardian_phone || '',
            programChoice: s.program_choice || applicant.program_choice || '',
            teacherName: s.teacher_name || 'TBD',
            schedule: applicant.schedule || '',
            morningStart: '', morningEnd: '',
            afternoonStart: '', afternoonEnd: '',
            eveningStart: '', eveningEnd: ''
        };
    }

    let student = null;
    const portalState = {
        assignments: [],
        announcements: [],
        reminders: [],
        payments: [],
        uploads: [],
        offer: null,
        programPrices: {},
        passwordOverride: { byEmail: null, byStudentId: null }
    };

    async function loadSupabasePortalData() {
        if (typeof db === 'undefined') return;

        // Load student from Supabase first
        if (forcedStudentId) {
            student = await findPortalStudentById(forcedStudentId);
        } else if (sessionEmail) {
            student = await findPortalStudent(sessionEmail);
        }

        if (!student) {
            if (!isPrivilegedPortalUser) denyPortalAccess();
            return;
        }

        if (!isPrivilegedPortalUser && !canUseMemberPortal(student)) {
            denyPortalAccess();
            return;
        }

        const guardianEmail = normalizeEmail(student.guardianEmail);
        const program = assignmentProgramKey(student.programChoice);

        const resourceCategory = `program-resources-${program}`;
        const [directAsgRes, sharedAsgRes, programResourceRes, announcementRes, reminderRes, offerRes, paymentRes, priceRes] = await Promise.all([
            db.assignments?.getByEmail ? db.assignments.getByEmail(guardianEmail) : { data: [], error: null },
            db.assignments?.getByProgram ? db.assignments.getByProgram(program) : { data: [], error: null },
            db.mediaUploads?.getByCategory ? db.mediaUploads.getByCategory(resourceCategory) : { data: [], error: null },
            db.announcements?.getByProgram ? db.announcements.getByProgram(program) : { data: [], error: null },
            db.reminders?.getByEmail ? db.reminders.getByEmail(guardianEmail) : { data: [], error: null },
            db.familyOffers?.getByEmail ? db.familyOffers.getByEmail(guardianEmail) : { data: null, error: null },
            db.payments?.getByEmail ? db.payments.getByEmail(guardianEmail) : { data: [], error: null },
            db.programPrices?.getAll ? db.programPrices.getAll() : { data: [], error: null }
        ]);

        const assignmentsById = new Map();
        [...(directAsgRes.data || []), ...(sharedAsgRes.data || [])].forEach((row) => {
            if (!row) return;
            const id = String(row.id || '');
            if (id && assignmentsById.has(id)) return;
            assignmentsById.set(id || `${row.title}-${row.posted_at}`, {
                id: row.id,
                title: row.title,
                dueDate: row.due_date || '',
                downloadUrl: row.download_url || '',
                postedAt: row.posted_at || ''
            });
        });

        (programResourceRes.data || []).forEach((row) => {
            if (!row) return;
            const id = String(row.id || '');
            const syntheticId = `res_${id || `${row.file_name || 'resource'}_${row.uploaded_at || ''}`}`;
            if (assignmentsById.has(syntheticId)) return;

            assignmentsById.set(syntheticId, {
                id: syntheticId,
                title: row.file_name || 'Program Resource',
                dueDate: '',
                downloadUrl: row.file_url || row.file_data || '',
                postedAt: row.uploaded_at || ''
            });
        });

        portalState.assignments = Array.from(assignmentsById.values());
        portalState.announcements = (announcementRes.data || []).map((row) => ({
            id: row.id,
            title: row.title,
            message: row.message,
            date: row.posted_at || ''
        }));
        portalState.reminders = (reminderRes.data || []).map((row) => ({
            id: row.id,
            title: row.title,
            dueDate: row.due_date || '',
            message: row.message,
            postedAt: row.posted_at || '',
            attachments: Array.isArray(row.attachments) ? row.attachments : []
        }));
        portalState.offer = offerRes.data || null;
        portalState.payments = paymentRes.data || [];
        portalState.programPrices = {};
        (priceRes.data || []).forEach((row) => {
            if (!row?.level) return;
            portalState.programPrices[row.level] = {
                price: Number(row.price) || 0,
                rating: Number(row.rating) || 4.9
            };
        });

        // Load student uploads - fetch by student ID for data isolation
        const { data: uploadsData } = await db.studentUploads.getByStudentId(student.id || null);
        portalState.uploads = (uploadsData || []).map(r => ({
            uploadId: r.id,
            title: r.context || r.file_name || '',
            fileName: r.file_name || '',
            fileUrl: r.file_url || '',
            fileData: r.file_data || '',
            createdAt: r.uploaded_at || ''
        }));

        // Load password overrides
        const [pwdEmailRes, pwdStudentRes] = await Promise.all([
            db.passwordOverrides.getByEmail(guardianEmail),
            student.id ? db.passwordOverrides.getByStudentId(String(student.id)) : Promise.resolve({ data: null, error: null })
        ]);
        portalState.passwordOverride = {
            byEmail: pwdEmailRes.data?.temporary_password || null,
            byStudentId: pwdStudentRes.data?.temporary_password || null
        };
    }

    function renderPortalTitle() {
        const titleEl = document.querySelector('.member-portal-title');
        if (!titleEl) return;

        const studentName = student
            ? `${student.firstName || ''} ${student.lastName || ''}`.trim()
            : '';

        const portalTitle = studentName ? `${studentName} Learning Portal` : 'My Learning Portal';
        titleEl.textContent = portalTitle;
        document.title = portalTitle;
    }

    function setText(selector, value) {
        const el = document.querySelector(selector);
        if (el) el.textContent = value;
    }

    function renderCoursePanel() {
        const assignedTeachers = 'Yohanse, Eyob and Aseir';

        if (!student) {
            setText('[data-field="course-program"]', 'No enrollment found');
            setText('[data-field="course-level"]', '—');
            setText('[data-field="course-schedule"]', '—');
            setText('[data-field="course-teacher"]', assignedTeachers);
            return;
        }

        setText('[data-field="course-program"]', student.programChoice || 'Not Assigned');
        setText('[data-field="course-level"]', mapProgramLevel(student.programChoice));
        setText('[data-field="course-schedule"]', getScheduleText(student));
        setText('[data-field="course-teacher"]', assignedTeachers);
    }

    function assignmentProgramKey(programChoice) {
        const p = String(programChoice || '').toLowerCase();
        if (p.includes('beginner') || p.includes('basic')) return 'beginner';
        if (p.includes('intermediate')) return 'intermediate';
        if (p.includes('advanced')) return 'advanced';
        if (p.includes('after school') || p.includes('ast')) return 'afterschool';
        if (p.includes('religious')) return 'religious';
        if (p.includes('immersion') || p.includes('cultural')) return 'immersion';
        return 'beginner';
    }

    function priceLevelKey(programChoice) {
        const key = assignmentProgramKey(programChoice);
        if (key === 'beginner') return 'level1';
        if (key === 'intermediate') return 'level2';
        if (key === 'advanced') return 'level3';
        if (key === 'afterschool') return 'level4';
        if (key === 'religious') return 'level5';
        return 'level4';
    }

    function readProgramPrice(levelKey) {
        const row = portalState.programPrices[levelKey];
        const n = Number(row?.price);
        return Number.isFinite(n) ? n : 0;
    }

    function getMonthlyDueDateLabel(email) {
        const rows = (portalState.reminders || []).filter((r) => normalizeEmail(email) === normalizeEmail(student?.guardianEmail));
        const dueRows = rows.filter(r => r && r.dueDate).sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
        if (dueRows.length) return dueRows[0].dueDate;

        const now = new Date();
        const due = new Date(now.getFullYear(), now.getMonth(), 5);
        if (now > due) due.setMonth(due.getMonth() + 1);
        return due.toISOString().slice(0, 10);
    }

    function formatDateLabel(value) {
        if (!value) return '—';
        const dt = new Date(value);
        if (isNaN(dt)) return value;
        return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function getAmountDueForStudent() {
        if (!student) return { regularPrice: 0, offerPrice: null, amountDue: 0, dueDate: '—', reason: '', offerEndDate: '' };

        const levelKey = priceLevelKey(student.programChoice);
        const regularPrice = readProgramPrice(levelKey);
        const dueDate = getMonthlyDueDateLabel(student.guardianEmail);

        const offer = portalState.offer || null;

        let offerPrice = null;
        let amountDue = regularPrice;
        let reason = '';
        let offerEndDate = offer?.endDate || '';

        if (offer && offer.offer_price && offer.start_date && offer.end_date) {
            const now = new Date();
                const start = new Date(offer.start_date);
                const end = new Date(offer.end_date);
                start.setHours(0, 0, 0, 0);
                end.setHours(23, 59, 59, 999);
            if (!isNaN(start) && !isNaN(end) && now >= start && now <= end) {
                offerPrice = Number(offer.offer_price);
                if (Number.isFinite(offerPrice) && offerPrice >= 0) {
                    amountDue = Math.max(0, regularPrice - offerPrice);
                    reason = offer.reason || '';
                    offerEndDate = offer.end_date || '';
                }
            }
        }

        return { regularPrice, offerPrice, amountDue, dueDate, reason, offerEndDate };
    }

    function getCurrentMonthKey() {
        const now = new Date();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        return `${now.getFullYear()}-${m}`;
    }

    function generateReminderId(reminder) {
        // Generate a unique ID for a reminder based on its content
        const id = `${reminder.title || ''}_${reminder.message || ''}_${reminder.dueDate || ''}`;
        return btoa(id).substring(0, 20); // Convert to base64 and truncate
    }

    async function getReadReminderIds() {
        if (!student) return [];
        if (typeof db === 'undefined' || !db.reminderReads?.getReadIds) return [];
        const { data } = await db.reminderReads.getReadIds(normalizeEmail(student.guardianEmail));
        return Array.isArray(data) ? data : [];
    }

    async function saveReadReminderId(reminderId) {
        if (!student) return;
        if (typeof db === 'undefined' || !db.reminderReads?.markRead) return;
        await db.reminderReads.markRead(normalizeEmail(student.guardianEmail), reminderId);
    }

    async function getUnreadReminders() {
        if (!student) return [];
        const rows = portalState.reminders || [];
        const readIds = await getReadReminderIds();
        
        return rows.filter(r => {
            const reminderId = generateReminderId(r);
            return !readIds.includes(reminderId);
        });
    }

    async function showFriendlyReminderAlert() {
        if (!student) return;
        
        const unreadReminders = await getUnreadReminders();
        
        if (unreadReminders.length > 0) {
            const titleEl = document.querySelector('.member-portal-title');
            if (!titleEl) return;
            
            const alertBox = document.createElement('div');
            alertBox.style.cssText = `
                display: block;
                background-color: #b32020;
                color: white;
                padding: 15px 20px;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
                font-size: 16px;
                font-weight: bold;
                max-width: 500px;
                margin: 15px auto 0;
                text-align: center;
                z-index: 1000;
                animation: slideDown 0.3s ease-out;
            `;
            alertBox.textContent = `Alert: You have ${unreadReminders.length} new friendly reminder(s) from your guardian.`;
            titleEl.insertAdjacentElement('afterend', alertBox);
            
            // Mark all displayed reminders as read
            for (const reminder of unreadReminders) {
                await saveReadReminderId(generateReminderId(reminder));
            }
            
            setTimeout(() => {
                alertBox.style.animation = 'slideUp 0.3s ease-in';
                setTimeout(() => alertBox.remove(), 300);
            }, 5000);
        }
    }


    function getOffDaysUntilExpiry() {
        const amount = getAmountDueForStudent();
        if (!amount.offerEndDate) return null;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const endDate = new Date(amount.offerEndDate);
        endDate.setHours(0, 0, 0, 0);
        
        const diffTime = endDate - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        return diffDays;
    }

    function renderMonthlyPayment() {
        const regularEl = document.getElementById('monthlyRegularPrice');
        const offerEl = document.getElementById('monthlyOfferPrice');
        const offerEndEl = document.getElementById('monthlyOfferEndDate');
        const dueEl = document.getElementById('monthlyAmountDue');
        const dueDateEl = document.getElementById('monthlyDueDate');
        const statusEl = document.getElementById('monthlyPaymentStatus');

        if (!regularEl || !offerEl || !offerEndEl || !dueEl || !dueDateEl || !statusEl || !student) return;

        const amount = getAmountDueForStudent();
        const monthKey = getCurrentMonthKey();
        const paymentRow = (portalState.payments || []).find((row) => String(row.month_key || '') === monthKey) || null;

        regularEl.textContent = `$${amount.regularPrice}`;
        offerEl.textContent = amount.offerPrice !== null
            ? `-$${amount.offerPrice}${amount.reason ? ` (${amount.reason})` : ''}`
            : 'No offer';
        
        // Offer end date with expiration color logic
        offerEndEl.textContent = amount.offerEndDate ? formatDateLabel(amount.offerEndDate) : '—';
        offerEndEl.style.backgroundColor = '';
        offerEndEl.style.color = '';
        
        const daysUntilExpiry = getOffDaysUntilExpiry();
        let finalAmountDue = amount.amountDue;
        
        if (daysUntilExpiry !== null) {
            if (daysUntilExpiry <= 0) {
                // Offer has expired
                offerEndEl.style.backgroundColor = 'hwb(0 14% 4%) !important';
                offerEndEl.style.color = 'white';
                finalAmountDue = 0;
            } else if (daysUntilExpiry <= 3) {
                // Less than or equal to 3 days remaining
                offerEndEl.style.backgroundColor = 'hwb(44 44% 0%) !important';
                offerEndEl.style.color = '#000';
            }
        }
        
        dueEl.textContent = `$${finalAmountDue}`;
        dueDateEl.textContent = amount.dueDate || '—';
        statusEl.textContent = paymentRow ? 'Paid' : 'Unpaid';
    }


    function initMonthlyPayment() {
        const payBtn = document.getElementById('payMonthlyNow');
        if (!payBtn || !student) return;

        payBtn.addEventListener('click', async () => {
            if (typeof db === 'undefined' || !db.payments?.add) {
                alert('Supabase payments are not configured.');
                return;
            }
            const monthKey = getCurrentMonthKey();
            const amount = getAmountDueForStudent();
            const { error } = await db.payments.add(
                normalizeEmail(student.guardianEmail),
                student.id || null,
                amount.amountDue,
                monthKey,
                'Paid from member portal'
            );
            if (error) {
                alert(`Could not record payment: ${error.message}`);
                return;
            }
            await loadSupabasePortalData();
            renderMonthlyPayment();
            alert('Monthly payment recorded.');
        });
    }

    function renderFriendlyReminders() {
        const listEl = document.getElementById('friendlyReminderList');
        if (!listEl || !student) return;

        const rows = portalState.reminders || [];

        if (!rows.length) {
            listEl.innerHTML = '<li>No reminders right now.</li>';
            return;
        }

        listEl.innerHTML = rows
            .slice()
            .reverse()
            .map(r => {
                const attachments = Array.isArray(r.attachments) ? r.attachments : [];
                const attachmentLinks = attachments
                    .map(file => {
                        const href = file?.downloadUrl || file?.dataUrl || file?.fileUrl || '';
                        const name = file?.name || 'Attachment';
                        const actions = buildFileActionLinks(href, name);
                        return `<span>${name}: ${actions}</span>`;
                    })
                    .join(' | ');

                const attachmentHtml = attachmentLinks ? ` • ${attachmentLinks}` : '';
                return `<li><strong>${r.title || 'Friendly Reminder'}</strong> • Due: ${r.dueDate || 'TBA'} • ${r.message || ''}${attachmentHtml}</li>`;
            })
            .join('');

            bindFileLinks(listEl);
    }

    function getAssignmentsForStudent() {
        if (!student) return [];
        return portalState.assignments || [];
    }

    function renderAssignments() {
        const listEl = document.getElementById('assignmentList');
        if (!listEl) return;

        const assignments = getAssignmentsForStudent();
        if (!assignments.length) {
            listEl.innerHTML = '<li>No assignments yet.</li>';
            return;
        }

        listEl.innerHTML = assignments.map(a => {
            const due = a.dueDate ? `Due: ${a.dueDate}` : 'Due: TBA';
            const actions = buildFileActionLinks(a.downloadUrl, a.title || 'Assignment');
            return `<li><strong>${a.title || 'Assignment'}</strong> • ${due} • ${actions}</li>`;
        }).join('');

        bindFileLinks(listEl);
    }

    async function getOptionalAssignmentsForStudent() {
        if (!student) return [];

        const programKey = assignmentProgramKey(student.programChoice);
        // Always use lowercase for class_type to match Supabase storage
        const normalizedClassType = mapProgramLevel(student.programChoice).toLowerCase(); // e.g., 'beginner', 'intermediate', etc.
        const byEmail = safeParse(storage.optionalAssignments, {});
        const byProgram = safeParse(storage.optionalAssignmentsByProgram, {});
        const directOptional = Array.isArray(byEmail[student.guardianEmail]) ? byEmail[student.guardianEmail] : [];
        const sharedOptional = Array.isArray(byProgram[programKey]) ? byProgram[programKey] : [];
        const baseByEmail = safeParse(storage.assignments, {});
        const baseByProgram = safeParse(storage.assignmentsByProgram, {});
        const optionalFromMainEmail = (Array.isArray(baseByEmail[student.guardianEmail]) ? baseByEmail[student.guardianEmail] : [])
            .filter(a => a && a.optional === true);
        const optionalFromMainProgram = (Array.isArray(baseByProgram[programKey]) ? baseByProgram[programKey] : [])
            .filter(a => a && a.optional === true);

        console.log('[StudentPortal] Fetching additional assignments for class type:', normalizedClassType);
        // Fetch additional assignments from Supabase for this class type
        let additionalAssignments = [];
        if (db.additionalAssignments?.getByClassType) {
            const { data: addData, error } = await db.additionalAssignments.getByClassType(normalizedClassType);
            console.log('[StudentPortal] Supabase additional_assignments result:', addData, 'Error:', error);
            if (Array.isArray(addData)) {
                additionalAssignments = addData.map(row => ({
                    id: row.id,
                    title: row.file_name || 'Optional Assignment',
                    dueDate: '',
                    downloadUrl: row.file_url || row.file_data || '',
                    postedAt: row.uploaded_at || ''
                }));
            }
        }

        const merged = [...directOptional, ...sharedOptional, ...optionalFromMainEmail, ...optionalFromMainProgram, ...additionalAssignments];
        const seen = new Set();
        return merged.filter(item => {
            const key = String(item?.id || `${item?.title || ''}|${item?.downloadUrl || ''}|${item?.postedAt || ''}`);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function renderOptionalAssignments() {
        const listEl = document.getElementById('optionalAssignmentList');
        if (!listEl) return;

        // Async fetch and render
        getOptionalAssignmentsForStudent().then(assignments => {
            if (!assignments.length) {
                listEl.innerHTML = '<li>No optional additional assignments yet.</li>';
                return;
            }

            listEl.innerHTML = assignments.map(a => {
                const due = a.dueDate ? `Due: ${a.dueDate}` : 'Due: TBA';
                const downloadUrl = a.downloadUrl || a.fileUrl || '';
                const actions = buildFileActionLinks(downloadUrl, a.title || 'Optional Assignment');
                return `<li><strong>${a.title || 'Optional Assignment'}</strong> • ${due} • ${actions}</li>`;
            }).join('');

            bindFileLinks(listEl);
        });
    }

    async function uploadToSupabaseIfConfigured(file, metadata) {
        if (!wrapper || wrapper.dataset.sbEnabled !== 'true') return { ok: false, url: '' };
        if (!window.supabase) return { ok: false, url: '' };

        const supabaseUrl = window.DAERO_SUPABASE_URL;
        const supabaseAnonKey = window.DAERO_SUPABASE_ANON_KEY;
        if (!supabaseUrl || !supabaseAnonKey) return { ok: false, url: '' };

        const client = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
        const bucket = wrapper.dataset.sbStorageBucket || 'student-submissions';

        const safeName = `${Date.now()}-${file.name}`;
        const path = `${metadata.guardianEmail || 'unknown'}/${safeName}`;
        const result = await client.storage.from(bucket).upload(path, file, { upsert: true });
        if (result.error) return { ok: false, url: '' };

        const pub = client.storage.from(bucket).getPublicUrl(path);
        return { ok: true, url: pub.data.publicUrl || '' };
    }

    function renderUploadHistory() {
        const listEl = document.getElementById('uploadHistoryList');
        if (!listEl || !student) return;

        const rows = getUploadRowsForStudent();

        if (!rows.length) {
            listEl.innerHTML = '<li>No uploads yet.</li>';
            return;
        }

        listEl.innerHTML = rows
            .slice()
            .reverse()
            .map(r => `<li>
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                    <div style="flex: 1;">
                        <button class="upload-view-btn" data-upload-id="${r.uploadId}" type="button" title="Open assignment" style="background: transparent; border: 1px solid #7e8fa5; color: #1c2f45; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 8px;">&#128065;</button>
                        <button class="upload-download-btn" data-upload-id="${r.uploadId}" type="button" title="Download assignment" style="background: transparent; border: 1px solid #7e8fa5; color: #1c2f45; padding: 4px 8px; border-radius: 6px; cursor: pointer; margin-right: 8px;">&#128229;</button>
                        <strong>${r.title}</strong> • ${r.fileName} • ${new Date(r.createdAt).toLocaleString()}
                    </div>
                    <button class="upload-delete-btn" data-upload-id="${r.uploadId}" type="button" style="background: #ff4444; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-size: 12px;">Delete</button>
                </div>
            </li>`)
            .join('');

        listEl.querySelectorAll('.upload-view-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const uploadId = btn.dataset.uploadId;
                openUploadFile(uploadId);
            });
        });

        listEl.querySelectorAll('.upload-download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const uploadId = btn.dataset.uploadId;
                downloadUploadFile(uploadId);
            });
        });

        // Attach delete event listeners
        listEl.querySelectorAll('.upload-delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                const uploadId = btn.dataset.uploadId;
                if (confirm('Are you sure you want to delete this upload?')) {
                    await deleteUpload(uploadId);
                }
            });
        });
    }

    function getUploadRowsForStudent() {
        if (!student) return [];
        return portalState.uploads || [];
    }

    async function deleteUpload(uploadId) {
        if (!student || typeof db === 'undefined' || !db.studentUploads?.deleteById) {
            alert('Cannot delete upload at this time.');
            return;
        }

        const { error } = await db.studentUploads.deleteById(uploadId);
        if (error) {
            alert('Could not delete upload: ' + (error.message || 'Unknown error'));
            return;
        }

        // Refresh uploads after deletion
        const { data: uploadsData } = await db.studentUploads.getByStudentId(student.id || null);
        portalState.uploads = (uploadsData || []).map(r => ({
            uploadId: r.id,
            title: r.context || r.file_name || '',
            fileName: r.file_name || '',
            fileUrl: r.file_url || '',
            fileData: r.file_data || '',
            createdAt: r.uploaded_at || ''
        }));

        renderUploadHistory();
        renderProgress();
    }

    function openUploadFile(uploadId) {
        const row = (portalState.uploads || []).find(item => String(item.uploadId) === String(uploadId));
        if (!row) {
            alert('Assignment file not found.');
            return;
        }

        // Use Supabase Storage URL if available
        if (row.fileUrl) {
            window.open(row.fileUrl, '_blank', 'noopener,noreferrer');
            return;
        }

        // Fall back to base64 data: create a blob URL for in-browser viewing
        if (row.fileData) {
            try {
                const [header, base64] = row.fileData.split(',');
                const mimeMatch = header.match(/data:([^;]+)/);
                const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
                const bytes = atob(base64);
                const arr = new Uint8Array(bytes.length);
                for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
                const blob = new Blob([arr], { type: mime });
                const blobUrl = URL.createObjectURL(blob);
                window.open(blobUrl, '_blank', 'noopener,noreferrer');
                // Release the blob URL after the browser has had time to open it
                setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
            } catch (err) {
                alert('Could not open this file. Please ask the student to re-upload it.');
            }
            return;
        }

        alert('This assignment was uploaded before file storage was enabled. Please ask the student to re-upload it.');
    }

    function downloadUploadFile(uploadId) {
        const row = (portalState.uploads || []).find(item => String(item.uploadId) === String(uploadId));
        if (!row) {
            alert('Assignment file not found.');
            return;
        }

        const href = row.fileUrl || row.fileData || '';
        if (!href) {
            alert('Download unavailable for this file.');
            return;
        }

        const link = document.createElement('a');
        link.href = href;
        link.download = sanitizeFileName(row.fileName || row.title || 'assignment');
        link.rel = 'noopener';
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    function initAssignmentUpload() {
        const form = document.getElementById('assignmentUploadForm');
        if (!form || !student) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const title = (document.getElementById('uploadAssignmentTitle')?.value || '').trim();
            const dueDate = (document.getElementById('uploadAssignmentDueDate')?.value || '').trim();
            const fileInput = document.getElementById('uploadAssignmentFile');
            const file = fileInput?.files?.[0];

            if (!title || !dueDate || !file) {
                alert('Please complete all upload fields.');
                return;
            }

            const guardianEmail = normalizeEmail(student.guardianEmail);
            const supa = await uploadToSupabaseIfConfigured(file, { guardianEmail });
            const fileUrl = supa.url || '';

            // When Supabase Storage is not configured, read the file as base64
            // so it can still be opened later via the eye button
            let fileDataUrl = '';
            if (!fileUrl) {
                fileDataUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => resolve(e.target?.result || '');
                    reader.onerror = () => resolve('');
                    reader.readAsDataURL(file);
                });
            }

            if (typeof db === 'undefined' || !db.studentUploads?.add) {
                alert('Supabase uploads are not configured.');
                return;
            }

            const { error } = await db.studentUploads.add(guardianEmail, student.id || null, {
                fileName: file.name,
                fileType: file.type,
                fileUrl,
                fileData: fileDataUrl,
                context: `[${dueDate}] ${title}`
            });

            if (error) {
                alert('Could not save upload: ' + (error.message || 'Unknown error'));
                return;
            }

            // Refresh uploads in portalState - fetch by student ID for data isolation
            const { data: uploadsData } = await db.studentUploads.getByStudentId(student.id || null);
            portalState.uploads = (uploadsData || []).map(r => ({
                uploadId: r.id,
                title: r.context || r.file_name || '',
                fileName: r.file_name || '',
                fileUrl: r.file_url || '',
                fileData: r.file_data || '',
                createdAt: r.uploaded_at || ''
            }));

            form.reset();
            renderUploadHistory();
            renderProgress();
        });
    }

    function renderProgress() {
        const lessonsEl = document.getElementById('completedLessonsValue');
        const assignmentsEl = document.getElementById('completedAssignmentsValue');
        const fill = document.getElementById('studentProgressFill');
        const label = document.getElementById('studentProgressLabel');
        const nextStepsList = document.getElementById('nextStepsList');

        if (!student) return;

        const allAssignments = getAssignmentsForStudent();
        const uploadedAssignments = getUploadRowsForStudent();
        const completedLessons = allAssignments.length;
        const completedAssignments = uploadedAssignments.length;

        const totalLessonsForProgress = completedLessons;
        const pct = totalLessonsForProgress > 0
            ? Math.max(0, Math.min(100, Math.round((completedAssignments / totalLessonsForProgress) * 100)))
            : 0;

        if (lessonsEl) lessonsEl.textContent = String(completedLessons);
        if (assignmentsEl) assignmentsEl.textContent = String(completedAssignments);
        if (fill) fill.style.width = `${pct}%`;
        if (label) label.textContent = `${pct}% completed`;

        if (nextStepsList) {
            nextStepsList.innerHTML = '<li>Complete listed assignments and upload your work</li>';
        }
    }

    function renderAnnouncements() {
        const listEl = document.getElementById('announcementList');
        if (!listEl || !student) return;

        const rows = portalState.announcements || [];

        if (!rows.length) {
            listEl.innerHTML = '<li>No announcements yet.</li>';
            return;
        }

        listEl.innerHTML = rows
            .slice()
            .reverse()
            .map(r => `<li><strong>${r.title || 'Update'}:</strong> ${r.message || ''}</li>`)
            .join('');
    }

    function renderProfile() {
        if (!student) return;

        const guardianName = student.guardianName || '—';
        const guardianPhone = student.guardianPhone || '—';
        const schedule = student.schedule || '';

        setText('#profileStudentName', `${student.firstName || ''} ${student.lastName || ''}`.trim() || '—');
        setText('#profileGuardianName', guardianName);
        setText('#profileGuardianEmail', student.guardianEmail || '—');
        setText('#profileGuardianPhone', guardianPhone);

        const nameInput = document.getElementById('editGuardianName');
        const phoneInput = document.getElementById('editGuardianPhone');
        const scheduleInput = document.getElementById('editSchedule');

        if (nameInput) nameInput.value = guardianName === '—' ? '' : guardianName;
        if (phoneInput) phoneInput.value = guardianPhone === '—' ? '' : guardianPhone;
        if (scheduleInput) scheduleInput.value = schedule;
    }

    function initProfileEdit() {
        const form = document.getElementById('profileEditForm');
        if (!form || !student) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const guardianName = (document.getElementById('editGuardianName')?.value || '').trim();
            const guardianPhone = (document.getElementById('editGuardianPhone')?.value || '').trim();
            const schedule = (document.getElementById('editSchedule')?.value || '').trim();

            if (typeof db !== 'undefined' && db.applicants?.save && student.applicantId) {
                const { error } = await db.applicants.save({
                    id: student.applicantId,
                    status: student.status,
                    guardianName,
                    guardianEmail: student.guardianEmail,
                    guardianPhone,
                    schedule
                });
                if (error) {
                    alert('Could not save profile: ' + (error.message || 'Unknown error'));
                    return;
                }
                student.guardianName = guardianName;
                student.guardianPhone = guardianPhone;
                student.schedule = schedule;
            }
            renderProfile();
            alert('Profile saved.');
        });
    }

    function readPasswordOverrides() {
        return safeParse('memberPasswordOverrides', {});
    }

    async function savePasswordOverrideByStudent(studentId, newPassword) {
        if (typeof db === 'undefined' || !db.passwordOverrides?.setByStudentId) {
            return { error: { message: 'db unavailable' } };
        }
        return db.passwordOverrides.setByStudentId(studentId, newPassword);
    }

    async function pushPasswordChangeAlert(studentId, guardianEmail) {
        if (typeof db === 'undefined' || !db.passwordChangeAlerts?.add) return;
        await db.passwordChangeAlerts.add(String(studentId || ''), String(guardianEmail || ''));
    }

    function getMapValueNormalized(mapObj, keyValue) {
        const wanted = normalizeEmail(keyValue);
        if (Object.prototype.hasOwnProperty.call(mapObj, keyValue)) {
            return String(mapObj[keyValue] || '');
        }

        const match = Object.keys(mapObj).find((k) => normalizeEmail(k) === wanted);
        return match ? String(mapObj[match] || '') : '';
    }

    function resolveStudentIdKey() {
        return String(student?.id || forcedStudentId || '').trim();
    }

    function resolveStudentEmailKey() {
        return normalizeEmail(student?.guardianEmail || sessionEmail || '');
    }

    function resolveCurrentExpectedPassword() {
        const pwdById = portalState.passwordOverride?.byStudentId;
        if (pwdById) return String(pwdById);

        const pwdByEmail = portalState.passwordOverride?.byEmail;
        if (pwdByEmail) return String(pwdByEmail);

        return `daero${String(student?.firstName || '').toLowerCase()}`;
    }

    function initPasswordChange() {
        const form = document.getElementById('passwordChangeForm');
        const statusEl = document.getElementById('passwordChangeStatus');
        const newInput = document.getElementById('newPortalPassword');
        const confirmInput = document.getElementById('confirmPortalPassword');
        const matchHint = document.getElementById('passwordMatchHint');
        if (!form || !student) return;

        const setMatchHint = (message, state) => {
            if (!matchHint) return;
            matchHint.textContent = message || '';
            matchHint.classList.remove('is-match', 'is-mismatch');
            if (state) matchHint.classList.add(state);
        };

        const syncLiveMatchHint = () => {
            const newValue = (newInput?.value || '').trim();
            const confirmValue = (confirmInput?.value || '').trim();

            if (!newValue && !confirmValue) {
                setMatchHint('', '');
                return;
            }

            if (!newValue || !confirmValue) {
                setMatchHint('Type both fields to compare.', '');
                return;
            }

            if (newValue.toLowerCase() === confirmValue.toLowerCase()) {
                setMatchHint('Passwords match.', 'is-match');
            } else {
                setMatchHint('Passwords do not match.', 'is-mismatch');
            }
        };

        newInput?.addEventListener('input', syncLiveMatchHint);
        confirmInput?.addEventListener('input', syncLiveMatchHint);

        form.querySelectorAll('.password-visibility-toggle').forEach((btn) => {
            btn.addEventListener('click', () => {
                const targetId = String(btn.getAttribute('data-target') || '').trim();
                const input = targetId ? document.getElementById(targetId) : null;
                if (!input) return;

                const showing = input.type === 'text';
                input.type = showing ? 'password' : 'text';
                btn.textContent = showing ? '👁' : '🙈';
                btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
            });
        });

        const setStatus = (message, ok) => {
            if (!statusEl) return;
            statusEl.textContent = message;
            statusEl.style.color = ok ? '#0b7a34' : '#b32020';
        };

        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const currentPassword = (document.getElementById('currentPortalPassword')?.value || '').trim();
            const newPassword = (document.getElementById('newPortalPassword')?.value || '').trim();
            const confirmPassword = (document.getElementById('confirmPortalPassword')?.value || '').trim();
            const normalizedNew = newPassword.toLowerCase();
            const normalizedConfirm = confirmPassword.toLowerCase();

            if (!currentPassword || !newPassword || !confirmPassword) {
                setStatus('Please complete all password fields.', false);
                return;
            }

            const expectedPassword = resolveCurrentExpectedPassword();
            if (!expectedPassword || currentPassword.toLowerCase() !== expectedPassword.toLowerCase()) {
                setStatus('Current password is incorrect.', false);
                return;
            }

            if (newPassword.length < 6) {
                setStatus('New password must be at least 6 characters.', false);
                return;
            }

            if (normalizedNew !== normalizedConfirm) {
                setStatus('New password and confirmation do not match.', false);
                return;
            }

            if (normalizedNew === expectedPassword.toLowerCase()) {
                setStatus('Please choose a different password from the current one.', false);
                return;
            }

            const studentIdKey = resolveStudentIdKey();
            if (!studentIdKey) {
                setStatus('Unable to identify your student account.', false);
                return;
            }

            const { error } = await savePasswordOverrideByStudent(studentIdKey, normalizedNew);
            if (error) {
                setStatus('Could not save password: ' + (error.message || 'Unknown error'), false);
                return;
            }
            await pushPasswordChangeAlert(studentIdKey, student?.guardianEmail || '');
            portalState.passwordOverride.byStudentId = normalizedNew;

            form.reset();
            setMatchHint('', '');
            setStatus('Password updated successfully.', true);
        });
    }
    async function init() {
        await loadSupabasePortalData();
        renderPortalTitle();
        await showFriendlyReminderAlert();
        renderCoursePanel();
        renderMonthlyPayment();
        renderOptionalAssignments();
        renderAssignments();
        renderFriendlyReminders();
        renderUploadHistory();
        renderProgress();
        renderAnnouncements();
        renderProfile();

        initMonthlyPayment();
        initAssignmentUpload();
        initProfileEdit();
        initPasswordChange();

        // Listen for admin additional assignments updates from other tabs/windows
        window.addEventListener('storage', (e) => {
            if (e.key === storage.adminAdditionalAssignments) {
                renderOptionalAssignments();
            }
        });
    }

    init();
})();
