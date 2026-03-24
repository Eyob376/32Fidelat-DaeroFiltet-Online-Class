
console.log("APP VERSION CHECK");
(async () => {
    if (typeof db === "undefined" || !db.appSettings?.getMaintenanceMode) return;

    const { data: mode } = await db.appSettings.getMaintenanceMode();
    if (mode !== "on") return;

    const currentRole = (sessionStorage.getItem("daeroUserRole") || "").toLowerCase();
    const isPrivileged = currentRole === "admin" || currentRole === "itdev";
    if (isPrivileged) return;

    const page = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
    const allowDuringMaintenance = new Set([
        "contact.html",
        "admin-dashboard.html",
        "editpanel.html",
        "mnt-page.html"
    ]);

    if (!allowDuringMaintenance.has(page)) {
        window.location.replace("MNT-Page.html");
    }
})();

/* =========================================================
   1. LOAD POSTS (Homepage only, safe-guarded)
========================================================= */
function markError(id) {
    const el = document.getElementById(id);
    if (el) {
        el.classList.add("input-error");
        el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
}

function clearErrors() {
    document.querySelectorAll(".input-error").forEach(el => {
        el.classList.remove("input-error");
    });
}

function validateEmail(email) {
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return pattern.test(email);
}

/* =========================================================
   2. PARALLAX EFFECT (Hero Section, if present)
========================================================= */
document.addEventListener("mousemove", (e) => {
    const overlay = document.querySelector(".hero-overlay");
    if (!overlay) return;

    const x = (e.clientX / window.innerWidth) - 0.5;
    const y = (e.clientY / window.innerHeight) - 0.5;
    overlay.style.transform = `translate(${x * 20}px, ${y * 20}px)`;
});

/* =========================================================
   3. SCROLL REVEAL ENGINE
========================================================= */
const revealElements = document.querySelectorAll(
    ".reveal, .slide-left, .slide-right, .blur-in"
);

function revealOnScroll() {
    revealElements.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight - 100) {
            el.classList.add("visible");
        }
    });
}

window.addEventListener("scroll", revealOnScroll);
revealOnScroll();

/* =========================================================
   4. MULTI-STEP REGISTRATION FORM
========================================================= */
document.addEventListener("DOMContentLoaded", async () => {
    const form = document.getElementById("registerForm");
    if (!form) return;

    const stepPanels = document.querySelectorAll(".step-panel");
    const next1 = document.getElementById("nextBtn1");
    const next2 = document.getElementById("nextStep2");
    const prevStep = document.getElementById("prevStep");
    const backToStep2 = document.getElementById("backToStep2");
    const submitBtn = document.getElementById("submitForm");
    const studentCountSelect = document.getElementById("studentCount");
    const studentsContainer = document.getElementById("studentsContainer");

    let currentStep = 1;
    let isUpdateMode = false;
    let matchedUpdateTargets = [];
    let appLocalCache = [];

    const { data: allStudents } = await db.students.getAll();
    appLocalCache = allStudents || [];

    function normalizeText(value) {
        return String(value || "").trim().toLowerCase();
    }

    function getProgramOptionsMarkup() {
        return `
            <option value="">Select</option>
            <option value="Beginner Class">Beginner Class</option>
            <option value="Intermediate Class">Intermediate Class</option>
            <option value="Advanced Class">Advanced Class</option>
            <option value="After School Tutorial">After School Tutorial</option>
            <option value="Religious Study">Religious Study</option>
        `;
    }

    function findExistingStudentTarget(firstName, lastName, guardianEmail) {
        const first = normalizeText(firstName);
        const last = normalizeText(lastName);
        const email = normalizeText(guardianEmail);

        const match = appLocalCache.find((row) =>
            normalizeText(row.first_name) === first &&
            normalizeText(row.last_name) === last &&
            (!email || normalizeText(row.applicants?.guardian_email) === email)
        );

        if (!match) return null;

        return {
            type: "supabase",
            studentId: match.id,
            applicantId: match.applicant_id
        };
    }

    function showStep(step) {
        stepPanels.forEach((panel) => {
            panel.classList.remove("active");
            if (parseInt(panel.dataset.step, 10) === step) {
                panel.classList.add("active");
            }
        });
    }

    function generateStudentBlocks(count) {
        studentsContainer.innerHTML = "";

        for (let i = 1; i <= count; i++) {
            const block = document.createElement("div");
            block.classList.add("student-block");
            block.innerHTML = `
                <h3 class="student-title">Student #${i}</h3>

                <div class="compact-row">
                    <label>First Name</label>
                    <input type="text" id="studentFirstName_${i}" required>
                </div>

                <div class="compact-row">
                    <label>Last Name</label>
                    <input type="text" id="studentLastName_${i}" required>
                </div>

                <div class="compact-row">
                    <label>Start Date</label>
                    <input type="date" id="studentStartDate_${i}" required>
                </div>

                <div class="compact-row">
                    <label>Program</label>
                    <select id="studentProgramChoice_${i}" required>
                        ${getProgramOptionsMarkup()}
                    </select>
                </div>

                <div class="compact-row">
                    <label>Returning Student</label>
                    <select id="studentReturning_${i}" required>
                        <option value="">Select</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                    </select>
                </div>
            `;
            studentsContainer.appendChild(block);
        }
    }

    function getStudentYear(startDate) {
        const year = startDate ? new Date(startDate).getFullYear() : NaN;
        return Number.isNaN(year) ? null : year;
    }

    showStep(currentStep);
    prevStep.style.display = "none";
    backToStep2.style.display = "none";
    submitBtn.style.display = "none";

    ["morningStart", "morningEnd", "afternoonStart", "afternoonEnd", "eveningStart", "eveningEnd"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
    });

    if (document.getElementById("guardianName")) {
        document.getElementById("guardianName").focus();
    }

    studentCountSelect.addEventListener("change", () => {
        const count = parseInt(studentCountSelect.value, 10);
        if (!Number.isNaN(count) && count > 0) {
            generateStudentBlocks(count);
        }
    });

    next1.addEventListener("click", () => {
        clearErrors();

        const guardianFields = ["guardianName", "guardianEmail", "guardianPhone", "country", "city", "studentCount"];
        for (const id of guardianFields) {
            const field = document.getElementById(id);
            if (!field || !field.value.trim()) {
                alert("Please fill out all guardian fields.");
                markError(id);
                return;
            }
        }

        const email = document.getElementById("guardianEmail").value.trim();
        if (!validateEmail(email)) {
            alert("Please enter a valid email format.");
            markError("guardianEmail");
            return;
        }

        const count = parseInt(studentCountSelect.value, 10);
        if (Number.isNaN(count) || count < 1) {
            alert("Please select how many students you are registering.");
            markError("studentCount");
            return;
        }

        if (studentsContainer.children.length === 0) {
            generateStudentBlocks(count);
        }

        const detectedTargets = [];
        let selectedReturningCount = 0;

        for (let i = 1; i <= count; i++) {
            const fn = document.getElementById(`studentFirstName_${i}`);
            const ln = document.getElementById(`studentLastName_${i}`);
            const sd = document.getElementById(`studentStartDate_${i}`);
            const sp = document.getElementById(`studentProgramChoice_${i}`);
            const ret = document.getElementById(`studentReturning_${i}`);

            if (!fn.value.trim()) { alert("Please fill all student fields."); markError(fn.id); return; }
            if (!ln.value.trim()) { alert("Please fill all student fields."); markError(ln.id); return; }
            if (!sd.value.trim()) { alert("Please fill all student fields."); markError(sd.id); return; }
            if (!sp.value.trim()) { alert("Please select a program for each student."); markError(sp.id); return; }
            if (!ret.value.trim()) { alert("Please answer Yes/No for each student."); markError(ret.id); return; }

            const isReturning = ret.value.trim().toLowerCase() === "yes";
            if (isReturning) {
                selectedReturningCount += 1;
                const match = findExistingStudentTarget(fn.value, ln.value, email);
                if (match) detectedTargets.push({ ...match, formStudentIndex: i });
            }
        }

        isUpdateMode = selectedReturningCount > 0;
        matchedUpdateTargets = detectedTargets;

        currentStep = 2;
        showStep(currentStep);
        document.getElementById("progressFill").style.width = "50%";
        document.getElementById("progressBall").style.left = "50%";

        prevStep.style.display = "inline-block";
        next2.style.display = "inline-block";
        backToStep2.style.display = "none";
        submitBtn.style.display = "none";
    });

    next2.addEventListener("click", () => {
        clearErrors();

        const learningGoal = document.getElementById("learningGoal");
        if (!learningGoal || !learningGoal.value.trim()) {
            alert("Please select a learning goal.");
            markError("learningGoal");
            return;
        }

        currentStep = 3;
        showStep(currentStep);
        document.getElementById("progressFill").style.width = "100%";
        document.getElementById("progressBall").style.left = "100%";

        prevStep.style.display = "none";
        next2.style.display = "none";
        backToStep2.style.display = "inline-block";
        submitBtn.style.display = "inline-block";
        submitBtn.textContent = isUpdateMode ? "Update Information" : "Submit Registration";

        generateSummary();
    });

    prevStep.addEventListener("click", () => {
        currentStep = 1;
        showStep(currentStep);
        document.getElementById("progressFill").style.width = "0%";
        document.getElementById("progressBall").style.left = "0%";

        prevStep.style.display = "none";
        next2.style.display = "none";
        backToStep2.style.display = "none";
        submitBtn.style.display = "none";
    });

    backToStep2.addEventListener("click", () => {
        currentStep = 2;
        showStep(currentStep);

        prevStep.style.display = "inline-block";
        next2.style.display = "inline-block";
        backToStep2.style.display = "none";
        submitBtn.style.display = "none";
    });

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearErrors();

        const guardianName = document.getElementById("guardianName");
        const guardianEmail = document.getElementById("guardianEmail");
        const guardianPhone = document.getElementById("guardianPhone");
        const country = document.getElementById("country");
        const city = document.getElementById("city");
        const learningGoal = document.getElementById("learningGoal");

        const countValue = studentCountSelect.value;
        const count = parseInt(countValue, 10);
        if (!countValue || Number.isNaN(count) || count < 1) {
            alert("Please select how many students you are registering.");
            markError("studentCount");
            return;
        }

        const guardianData = {
            guardianName: guardianName.value.trim(),
            guardianEmail: guardianEmail.value.trim(),
            guardianPhone: guardianPhone.value.trim(),
            country: country.value.trim(),
            city: city.value.trim(),
            learningGoal: learningGoal.value.trim()
        };

        for (const [key, value] of Object.entries(guardianData)) {
            if (!value) {
                alert("Please complete all guardian fields.");
                markError(key);
                return;
            }
        }

        if (!validateEmail(guardianData.guardianEmail)) {
            alert("Please enter a valid email format.");
            markError("guardianEmail");
            return;
        }

        const students = [];
        for (let i = 1; i <= count; i++) {
            const fn = document.getElementById(`studentFirstName_${i}`);
            const ln = document.getElementById(`studentLastName_${i}`);
            const sd = document.getElementById(`studentStartDate_${i}`);
            const sp = document.getElementById(`studentProgramChoice_${i}`);
            const ret = document.getElementById(`studentReturning_${i}`);

            if (!fn.value.trim()) { alert("Please fill all student fields."); markError(fn.id); return; }
            if (!ln.value.trim()) { alert("Please fill all student fields."); markError(ln.id); return; }
            if (!sd.value.trim()) { alert("Please fill all student fields."); markError(sd.id); return; }
            if (!sp.value.trim()) { alert("Please select a program for each student."); markError(sp.id); return; }
            if (!ret.value.trim()) { alert("Please answer Yes/No for each student."); markError(ret.id); return; }

            const year = getStudentYear(sd.value.trim());
            students.push({
                firstName: fn.value.trim(),
                lastName: ln.value.trim(),
                startDate: sd.value.trim(),
                programChoice: sp.value.trim(),
                gradeLevel: sp.value.trim(),
                returningStudent: ret.value.trim().toLowerCase() === "yes",
                year,
                years: year ? [year] : []
            });
        }

        const scheduleData = {
            morningStart: document.getElementById("morningStart")?.value || "",
            morningEnd: document.getElementById("morningEnd")?.value || "",
            afternoonStart: document.getElementById("afternoonStart")?.value || "",
            afternoonEnd: document.getElementById("afternoonEnd")?.value || "",
            eveningStart: document.getElementById("eveningStart")?.value || "",
            eveningEnd: document.getElementById("eveningEnd")?.value || ""
        };

        const matchedByFormIndex = new Map();
        matchedUpdateTargets.forEach((target) => {
            const idx = Number(target.formStudentIndex);
            if (Number.isInteger(idx) && idx > 0) matchedByFormIndex.set(idx, target);
        });

        const remainingNewStudents = [];
        for (let i = 1; i <= count; i++) {
            const target = matchedByFormIndex.get(i);
            const studentData = students[i - 1];
            if (!studentData) continue;

            if (!target) {
                remainingNewStudents.push(studentData);
                continue;
            }

            const { error: applicantError } = await db.applicants.save({
                id: target.applicantId,
                ...guardianData,
                schedule: scheduleData,
                status: "ongoing"
            });

            if (applicantError) {
                remainingNewStudents.push(studentData);
                continue;
            }

            await db.students.save({
                id: target.studentId,
                firstName: studentData.firstName,
                lastName: studentData.lastName,
                startDate: studentData.startDate,
                programChoice: studentData.programChoice,
                gradeLevel: studentData.gradeLevel,
                status: "ongoing",
                year: studentData.year,
                years: studentData.years
            }, target.applicantId);
        }

        if (remainingNewStudents.length) {
            const applicantId = Date.now().toString();
            const { error: saveApplicantError } = await db.applicants.save({
                id: applicantId,
                ...guardianData,
                schedule: scheduleData,
                status: "new"
            });

            if (saveApplicantError) {
                alert("Failed to save registration. Please try again.");
                return;
            }

            for (let i = 0; i < remainingNewStudents.length; i++) {
                const student = remainingNewStudents[i];
                await db.students.save({
                    id: `${applicantId}-${i + 1}`,
                    _sid: i + 1,
                    firstName: student.firstName,
                    lastName: student.lastName,
                    startDate: student.startDate,
                    programChoice: student.programChoice,
                    gradeLevel: student.gradeLevel,
                    status: "new",
                    year: student.year,
                    years: student.years
                }, applicantId);
            }
        }

        setTimeout(() => {
            window.location.href = "thank-you.html";
        }, 120);
    });
});

/* =========================================================
   SUMMARY GENERATION
========================================================= */
function generateSummary() {
    const summary = document.getElementById("summaryBox");
    if (!summary) return;

    const count = parseInt(document.getElementById("studentCount")?.value || "0", 10);
    let studentSummary = "";

    for (let i = 1; i <= count; i++) {
        const fn = document.getElementById(`studentFirstName_${i}`)?.value || "";
        const ln = document.getElementById(`studentLastName_${i}`)?.value || "";
        const sd = document.getElementById(`studentStartDate_${i}`)?.value || "";
        const sp = document.getElementById(`studentProgramChoice_${i}`)?.value || "";
        const ret = document.getElementById(`studentReturning_${i}`)?.value || "";

        studentSummary += `
            <strong>Student #${i}:</strong> ${fn} ${ln} â€” Start: ${sd} â€” Program: ${sp || "--"} â€” Returning: ${ret || "--"}<br>
        `;
    }

    const data = {
        guardianName: document.getElementById("guardianName")?.value || "",
        guardianEmail: document.getElementById("guardianEmail")?.value || "",
        guardianPhone: document.getElementById("guardianPhone")?.value || "",
        country: document.getElementById("country")?.value || "",
        city: document.getElementById("city")?.value || "",
        learningGoal: document.getElementById("learningGoal")?.value || "",
        morningStart: document.getElementById("morningStart")?.value || "",
        morningEnd: document.getElementById("morningEnd")?.value || "",
        afternoonStart: document.getElementById("afternoonStart")?.value || "",
        afternoonEnd: document.getElementById("afternoonEnd")?.value || "",
        eveningStart: document.getElementById("eveningStart")?.value || "",
        eveningEnd: document.getElementById("eveningEnd")?.value || ""
    };

    summary.innerHTML = `
        <strong>Guardian:</strong> ${data.guardianName}<br>
        <strong>Email:</strong> ${data.guardianEmail}<br>
        <strong>Phone:</strong> ${data.guardianPhone}<br>
        <strong>Location:</strong> ${data.city}, ${data.country}<br><br>

        ${studentSummary}<br>

        <strong>Learning Goal:</strong> ${data.learningGoal || "--"}<br><br>

        <strong>Preferred Schedule:</strong><br>
        Morning: ${data.morningStart || "--"} to ${data.morningEnd || "--"}<br>
        Afternoon: ${data.afternoonStart || "--"} to ${data.afternoonEnd || "--"}<br>
        Evening: ${data.eveningStart || "--"} to ${data.eveningEnd || "--"}<br>
    `;
}


/* =========================================================
   5. LATEST POSTS ROTATOR
========================================================= */
let postIndex = 0;
const postCards = document.querySelectorAll(".post-card");

if (postCards.length > 0) {
    setInterval(() => {
        postCards[postIndex].classList.remove("active");
        postIndex = (postIndex + 1) % postCards.length;
        postCards[postIndex].classList.add("active");
    }, 3000);
}


/* =========================================================
   6. NAVIGATION ACTIVE STATE FIX
========================================================= */
const navLinks = document.querySelectorAll(".navbar nav a, .navbar .glass-nav a");

navLinks.forEach(link => {
    link.addEventListener("click", () => {
        navLinks.forEach(l => l.classList.remove("active"));
        link.classList.add("active");
        navLinks.forEach(l => l.blur());
    });
});


/* =========================================================
   7. SCROLL ANIMATION ENGINE
========================================================= */
const animatedEls = document.querySelectorAll(".animate");

function animateOnScroll() {
    animatedEls.forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.top < window.innerHeight - 100) {
            el.classList.add("visible");
        }
    });
}

window.addEventListener("scroll", animateOnScroll);
animateOnScroll();


/* =========================================================
   8. PROGRAM PRICE DATA
========================================================= */
async function saveProgramData(level) {
    const priceInput = document.getElementById(`admin-price-${level}`);
    const ratingInput = document.getElementById(`admin-rating-${level}`);
    if (!priceInput || !ratingInput) return;

    const { error } = await db.programPrices.save(level, Number(priceInput.value), Number(ratingInput.value) || 4.9);
    if (!error) {
        alert("Saved!");
    }
}

async function loadProgramData(level) {
    const { data } = await db.programPrices.getByLevel(level);
    if (!data) return;

    const priceEl = document.getElementById(`price-${level}`);
    const ratingEl = document.getElementById(`rating-${level}`);
    if (priceEl) priceEl.textContent = `$${data.price}`;
    if (ratingEl) ratingEl.textContent = `${data.rating}`;
}

function normalizeProgramLabel(value) {
    return String(value || "").trim().toLowerCase();
}

function resolveProgramLevelFromStudentRow(row) {
    const label = normalizeProgramLabel(row?.grade_level || row?.program_choice);
    if (!label) return "";

    if (label.includes("beginner") || label.includes("basic")) return "beginner";
    if (label.includes("intermediate")) return "intermediate";
    if (label.includes("advanced")) return "advanced";
    if (label.includes("after school") || label.includes("ast")) return "afterschool";
    if (label.includes("religious")) return "religious";
    return "";
}

async function renderPublicProgramCounts() {
    const boxes = document.querySelectorAll(".program-box[data-level]");
    if (!boxes.length || typeof db === "undefined" || !db.students?.getAll) return;

    const counts = {
        beginner: 0,
        intermediate: 0,
        advanced: 0,
        afterschool: 0,
        religious: 0
    };

    const { data } = await db.students.getAll();
    (data || []).forEach((row) => {
        if (String(row?.status || "").toLowerCase() !== "admitted") return;
        const level = resolveProgramLevelFromStudentRow(row);
        if (!level || typeof counts[level] !== "number") return;
        counts[level] += 1;
    });

    boxes.forEach((box) => {
        const level = String(box.getAttribute("data-level") || "").trim().toLowerCase();
        const countEl = box.querySelector(".program-count-value");
        if (!countEl) return;
        countEl.textContent = String(counts[level] || 0);
    });
}

async function getAdminUploadedUrls(storageKey, mediaKind) {
    const category = db.mediaUploads.categoryFromKey(storageKey);
    const { data } = await db.mediaUploads.getByCategory(category);
    return (data || []).filter((row) => String(row.file_type || "").toLowerCase().includes(mediaKind))
        .map((row) => row.file_url || row.file_data)
        .filter(Boolean);
}

async function injectImageSlides(selector, storageKey, className) {
    const container = document.querySelector(selector);
    if (!container) return;

    const urls = await getAdminUploadedUrls(storageKey, "image");
    if (!urls.length) return;

    container.innerHTML = urls.map((url, index) => `<img src="${url}" class="${className}${index === 0 ? " active" : ""}">`).join("");
}

const slideshowTimers = new Map();
let indexVideoAdvanceTimer = null;

function startManagedSlideshow(containerSelector, itemSelector, intervalMs = 3000) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    const timerKey = `${containerSelector}|${itemSelector}`;
    const existingTimer = slideshowTimers.get(timerKey);
    if (existingTimer) {
        clearInterval(existingTimer);
        slideshowTimers.delete(timerKey);
    }

    const slides = Array.from(container.querySelectorAll(itemSelector));
    if (slides.length <= 1) return;

    let index = slides.findIndex((slide) => slide.classList.contains("active"));
    if (index < 0) index = 0;

    const activate = (nextIndex) => {
        slides.forEach((slide, slideIndex) => {
            slide.classList.toggle("active", slideIndex === nextIndex);
        });
        index = nextIndex;
    };

    activate(index);
    const timerId = window.setInterval(() => {
        activate((index + 1) % slides.length);
    }, intervalMs);
    slideshowTimers.set(timerKey, timerId);
}

function initAllAutoSlideshows() {
    startManagedSlideshow(".gallery-wrapper", ".gallery-img", 3000);
    startManagedSlideshow("#customs-slideshow", ".slide", 3000);
    startManagedSlideshow("#dance-slideshow", ".slide", 3000);
    startManagedSlideshow("#graduation-slideshow .graduation-frame", ".graduation-slide", 3000);
    startManagedSlideshow(".member-slideshow", ".member-slide", 3000);
    startManagedSlideshow(".right-slideshow", ".slide-img", 3000);
}

function initIndexVideoPanelControls() {
    const video = document.getElementById("eventVideo");
    const thumbsHost = document.querySelector(".video-thumbs");
    const prevBtn = document.getElementById("eventVideoPrev");
    const nextBtn = document.getElementById("eventVideoNext");
    if (!video || !thumbsHost) return;

    if (indexVideoAdvanceTimer) {
        clearInterval(indexVideoAdvanceTimer);
        indexVideoAdvanceTimer = null;
    }

    const thumbs = Array.from(thumbsHost.querySelectorAll(".thumb"));
    if (!thumbs.length) {
        if (prevBtn) prevBtn.disabled = true;
        if (nextBtn) nextBtn.disabled = true;
        return;
    }

    let currentIndex = thumbs.findIndex((thumb) => thumb.classList.contains("active"));
    if (currentIndex < 0) currentIndex = 0;

    const restartAutoAdvance = () => {
        if (indexVideoAdvanceTimer) {
            clearInterval(indexVideoAdvanceTimer);
            indexVideoAdvanceTimer = null;
        }

        if (thumbs.length <= 1) return;

        indexVideoAdvanceTimer = window.setInterval(() => {
            activateVideo(currentIndex + 1, false);
        }, 3000);
    };

    const activateVideo = (index, shouldAutoplay = false) => {
        const normalizedIndex = ((index % thumbs.length) + thumbs.length) % thumbs.length;
        const activeThumb = thumbs[normalizedIndex];
        const src = String(activeThumb?.getAttribute("data-video") || "").trim();
        const type = String(activeThumb?.getAttribute("data-type") || "video/mp4").trim();
        if (!src) return;

        thumbs.forEach((thumb, thumbIndex) => {
            thumb.classList.toggle("active", thumbIndex === normalizedIndex);
        });

        video.innerHTML = `<source src="${src}" type="${type}">`;
        video.load();
        if (shouldAutoplay) {
            const playResult = video.play();
            if (playResult?.catch) playResult.catch(() => {});
        }
        currentIndex = normalizedIndex;
    };

    thumbs.forEach((thumb, index) => {
        thumb.addEventListener("click", () => {
            activateVideo(index, true);
            restartAutoAdvance();
        });
    });

    prevBtn?.addEventListener("click", () => {
        activateVideo(currentIndex - 1, true);
        restartAutoAdvance();
    });

    nextBtn?.addEventListener("click", () => {
        activateVideo(currentIndex + 1, true);
        restartAutoAdvance();
    });

    const multipleVideos = thumbs.length > 1;
    if (prevBtn) prevBtn.disabled = !multipleVideos;
    if (nextBtn) nextBtn.disabled = !multipleVideos;

    activateVideo(currentIndex, false);
    restartAutoAdvance();
}

async function injectIndexVideoPanelFromUploads() {
    const video = document.getElementById("eventVideo");
    const thumbs = document.querySelector(".video-thumbs");
    if (!video || !thumbs) return;

    const category = db.mediaUploads.categoryFromKey("adminUploadsIndexGraduationVideos");
    const { data } = await db.mediaUploads.getByCategory(category);
    const rows = (data || []).filter((row) => (row.file_url || row.file_data));
    if (!rows.length) return;

    thumbs.innerHTML = rows.map((row, index) => {
        const videoSrc = row.file_url || row.file_data;
        const title = row.file_name || `Video ${index + 1}`;
        return `<button type="button" data-video="${videoSrc}" data-type="${row.file_type || "video/mp4"}" class="thumb${index === 0 ? " active" : ""}">${title}</button>`;
    }).join("");

    initIndexVideoPanelControls();
}

async function injectGraduationFigureFromUploads() {
    const frame = document.querySelector("#graduation-slideshow .graduation-frame");
    if (!frame) return;

    const urls = await getAdminUploadedUrls("adminUploadsIndexGraduationFigure", "image");
    if (!urls.length) return;

    frame.innerHTML = urls.map((url, index) => `<img src="${url}" alt="Graduation Ceremony" class="graduation-slide${index === 0 ? " active" : ""}">`).join("");
}

async function initUploadedMediaFeeds() {
    await Promise.all([
        injectImageSlides(".gallery-wrapper", "adminUploadsIndexLatestSlides", "gallery-img"),
        injectImageSlides("#customs-slideshow", "adminUploadsIndexTraditionalSlides", "slide"),
        injectImageSlides("#dance-slideshow", "adminUploadsIndexTribesSlides", "slide"),
        injectImageSlides(".member-slideshow", "adminUploadsMemberLoginSlides", "member-slide"),
        injectImageSlides(".right-slideshow", "adminUploadsRegisterSlides", "slide-img"),
        injectIndexVideoPanelFromUploads(),
        injectGraduationFigureFromUploads()
    ]);
}

document.addEventListener("DOMContentLoaded", async () => {
    await Promise.all([
        initUploadedMediaFeeds(),
        ...["level1", "level2", "level3", "level4", "level5"].map(loadProgramData),
        renderPublicProgramCounts()
    ]);

    initAllAutoSlideshows();
    initIndexVideoPanelControls();

    if (document.querySelector(".program-box[data-level]")) {
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible") {
                renderPublicProgramCounts();
            }
        });
        window.addEventListener("focus", () => {
            renderPublicProgramCounts();
        });
    }
});


/* =========================================================
   MEMBER LOGIN SYSTEM
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    if (!loginForm) return;

    const roleSelect = document.getElementById("loginRole");
    const emailInput = document.getElementById("loginEmail");
    const passwordInput = document.getElementById("loginPassword");

    const adminCredentialForm = document.getElementById("adminCredentialForm");
    const adminCredentialEmail = document.getElementById("adminCredentialEmail");
    const adminCurrentPassword = document.getElementById("adminCurrentPassword");
    const adminNewPassword = document.getElementById("adminNewPassword");
    const adminConfirmPassword = document.getElementById("adminConfirmPassword");
    const adminRecoveryUsername = document.getElementById("adminRecoveryUsername");
    const adminRecoveryPassword = document.getElementById("adminRecoveryPassword");
    const adminCredentialStatus = document.getElementById("adminCredentialStatus");

    const normalizeText = (value) => String(value || "").trim().toLowerCase();
    const defaultAdminCredentials = {
        email: "daerofiltet@gmail.com",
        password: "password"
    };

    const getAdminCredentials = async () => {
        try {
            const { data } = await db.appSettings.get("adminCredentials");
            if (data?.value) {
                const saved = JSON.parse(data.value);
                return {
                    email: String(saved?.email || defaultAdminCredentials.email).trim().toLowerCase(),
                    password: String(saved?.password || defaultAdminCredentials.password)
                };
            }
        } catch (e) {}
        return { ...defaultAdminCredentials };
    };

    const saveAdminCredentials = async (payload) => {
        await db.appSettings.set("adminCredentials", JSON.stringify({
            email: normalizeText(payload?.email || defaultAdminCredentials.email),
            password: String(payload?.password || "")
        }));
    };

    const isValidItDevRecovery = (username, password) => {
        const user = normalizeText(username);
        const isDevUser = user === "it-dev" || user === "itdev" || user === "daerofiltet@gmail.com";
        return isDevUser && String(password || "") === "password";
    };

    const setAdminCredentialStatus = (message, ok) => {
        if (!adminCredentialStatus) return;
        adminCredentialStatus.textContent = message;
        adminCredentialStatus.style.color = ok ? "#0b7a34" : "#b32020";
    };

    const normalizeStatus = (value) => String(value || "").trim().toLowerCase();
    const blockedPortalStatuses = new Set(["suspended", "terminated", "completed"]);
    const canUseMemberPortal = (student) => {
        const lifecycleStatus = normalizeStatus(student?.status);
        const courseStatus = normalizeStatus(student?.course_status);

        if (blockedPortalStatuses.has(lifecycleStatus) || blockedPortalStatuses.has(courseStatus)) {
            return false;
        }

        return courseStatus === "ongoing" || lifecycleStatus === "ongoing";
    };

    const deniedStatusMessage = "Youd don't have access to portal, becuase of your status";

    const getExpectedMemberPassword = async (student, email) => {
        const { data: studentOverride } = await db.passwordOverrides.getByStudentId(String(student.id));
        const { data: emailOverride } = await db.passwordOverrides.getByEmail(normalizeText(email));
        const override = studentOverride?.temporary_password || emailOverride?.temporary_password;
        const defaultPassword = `daero${normalizeText(student.first_name || "")}`;
        return normalizeText(override || defaultPassword);
    };

    if (adminCredentialEmail) {
        getAdminCredentials().then((cred) => {
            adminCredentialEmail.value = cred.email;
        });
    }

    adminCredentialForm?.querySelectorAll(".admin-password-visibility-toggle").forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetId = String(btn.getAttribute("data-target") || "").trim();
            const input = targetId ? document.getElementById(targetId) : null;
            if (!input) return;

            const showing = input.type === "text";
            input.type = showing ? "password" : "text";
            btn.textContent = showing ? "Show" : "Hide";
            btn.setAttribute("aria-label", showing ? "Show password" : "Hide password");
        });
    });

    adminCredentialForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const email = normalizeText(adminCredentialEmail?.value || "");
        const currentPass = String(adminCurrentPassword?.value || "").trim();
        const newPass = String(adminNewPassword?.value || "").trim();
        const confirmPass = String(adminConfirmPassword?.value || "").trim();
        const recoveryUser = String(adminRecoveryUsername?.value || "").trim();
        const recoveryPass = String(adminRecoveryPassword?.value || "").trim();

        if (!email || !newPass || !confirmPass) {
            setAdminCredentialStatus("Email, new password, and confirm password are required.", false);
            return;
        }

        const current = await getAdminCredentials();
        if (email !== normalizeText(current.email)) {
            setAdminCredentialStatus("Admin email does not match the configured admin account.", false);
            return;
        }

        if (newPass.length < 6) {
            setAdminCredentialStatus("New admin password must be at least 6 characters.", false);
            return;
        }

        if (newPass !== confirmPass) {
            setAdminCredentialStatus("New password and confirmation do not match.", false);
            return;
        }

        const hasCurrentMatch = currentPass && currentPass === current.password;
        const hasRecoveryMatch = isValidItDevRecovery(recoveryUser, recoveryPass);
        if (!hasCurrentMatch && !hasRecoveryMatch) {
            setAdminCredentialStatus("Enter current admin password, or provide valid IT-Dev recovery credentials.", false);
            return;
        }

        await saveAdminCredentials({ email, password: newPass });
        adminCredentialForm.reset();
        if (adminCredentialEmail) adminCredentialEmail.value = email;
        setAdminCredentialStatus("Admin password updated successfully.", true);
    });

    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const role = roleSelect.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value.trim();
        if (!role || !email || !password) {
            alert("Please complete all fields.");
            return;
        }

        if (role === "itdev") {
            const user = normalizeText(email);
            const isDevUser = user === "it-dev" || user === "itdev" || user === "daerofiltet@gmail.com";
            if (isDevUser && password === "password") {
                sessionStorage.setItem("daeroUserRole", "itdev");
                window.location.href = "admin-dashboard.html";
            } else {
                alert("Invalid IT-Dev credentials.");
            }
            return;
        }

        if (role === "admin") {
            const adminCred = await getAdminCredentials();
            if (normalizeText(email) === normalizeText(adminCred.email) && password === adminCred.password) {
                sessionStorage.setItem("daeroUserRole", "admin");
                window.location.href = "admin-dashboard.html";
            } else {
                alert("Invalid Admin credentials.");
            }
            return;
        }

        const { data: applicants } = await db.applicants.getByEmail(normalizeText(email));
        const applicant = Array.isArray(applicants) ? applicants[0] : null;
        if (!applicant) {
            alert("No member found with this email.");
            return;
        }

        const { data: students } = await db.students.getByApplicantId(applicant.id);
        if (!students || !students.length) {
            alert("No students found for this account.");
            return;
        }

        const blockedStudents = students.filter((s) => !canUseMemberPortal(s));
        const allowedStudents = students.filter(canUseMemberPortal);
        if (!allowedStudents.length) {
            alert(deniedStatusMessage);
            return;
        }

        for (const student of blockedStudents) {
            const expectedPassword = await getExpectedMemberPassword(student, email);
            if (normalizeText(password) === expectedPassword) {
                alert(deniedStatusMessage);
                return;
            }
        }

        for (const student of allowedStudents) {
            const expectedPassword = await getExpectedMemberPassword(student, email);

            if (normalizeText(password) === expectedPassword) {
                sessionStorage.setItem("daeroUserRole", "member");
                sessionStorage.setItem("daeroMemberEmail", normalizeText(email));
                sessionStorage.setItem("daeroMemberStudentId", String(student.id));
                window.location.href = `member-portal.html?studentId=${encodeURIComponent(student.id)}`;
                return;
            }
        }

        alert("Incorrect member password.");
    });
});


/* =========================================================
   MEMBER PAGE â€” CINEMATIC SLIDESHOW (SUBTLE ZOOM)
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const slides = document.querySelectorAll(".member-slide");
    if (!slides.length) return;

    let index = 0;

    setInterval(() => {
        slides[index].classList.remove("active");
        index = (index + 1) % slides.length;
        slides[index].classList.add("active");
    }, 3000);
});


/* =========================================================
   MEMBER PAGE â€” NAV ACTIVE STATE FIX
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const navLinks = document.querySelectorAll(".navbar nav a");

    navLinks.forEach(link => {
        link.addEventListener("click", () => {
            navLinks.forEach(l => l.classList.remove("active"));
            link.classList.add("active");
        });
    });
});
/* =========================================================
   HELP PAGE â€” SEARCH FILTER
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const searchInput = document.getElementById("helpSearch");
    const helpCards = document.querySelectorAll(".help-card");

    if (!searchInput) return;

    searchInput.addEventListener("input", () => {
        const query = searchInput.value.toLowerCase();

        helpCards.forEach(card => {
            const text = card.innerText.toLowerCase();
            card.style.display = text.includes(query) ? "block" : "none";
        });
    });
});


/* =========================================================
   FLOATING â€œNEED HELP?â€ BUTTON â€” SCROLL TO TOP
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const helpBtn = document.getElementById("helpFloatingBtn");
    if (!helpBtn) return;

    helpBtn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
});

/* =========================================================
   HELP PAGE â€” EXPAND/COLLAPSE LOGIC
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const moreLinks = document.querySelectorAll(".help-more-link");

    moreLinks.forEach(link => {
        link.addEventListener("click", () => {
            const targetId = link.getAttribute("data-target");
            const details = document.getElementById(targetId);

            if (!details) return;

            const isOpen = details.classList.contains("open");

            // Close all other sections
            document.querySelectorAll(".help-details").forEach(d => d.classList.remove("open"));
            document.querySelectorAll(".help-more-link").forEach(l => l.textContent = "Show more â†’");

            // Toggle current section
            if (!isOpen) {
                details.classList.add("open");
                link.textContent = "Show less â†‘";
            } else {
                details.classList.remove("open");
                link.textContent = "Show more â†’";
            }
        });
    });
});

document.addEventListener("DOMContentLoaded", () => {
    const navLinks = document.querySelectorAll(".main-nav a");
    if (!navLinks.length) return;

    // Determine current page
    const currentPage = window.location.pathname.split("/").pop().replace(".html", "");

    navLinks.forEach(link => {
        const page = link.getAttribute("data-page");

        // Remove any old active states
        link.classList.remove("active");

        // Apply active state to the correct link
        if (page === currentPage) {
            link.classList.add("active");
        }

        // Ensure only one stays active when clicked
        link.addEventListener("click", () => {
            navLinks.forEach(l => l.classList.remove("active"));
            link.classList.add("active");
        });
    });
});

/* =========================================================
   PROGRAMS PAGE - GEEZ PLAYGROUND INTERACTIONS
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const board = document.getElementById("geezLetterBoard");
    const childRowsWrap = document.getElementById("geezChildRows");
    const preview = document.getElementById("geezChildPreview");
    const soundToggle = document.getElementById("geezSoundToggle");
    if (!board || !childRowsWrap || !preview) return;

    const mainButtons = Array.from(board.querySelectorAll(".geez-glyph-btn[data-letter-id]"));
    const childRows = Array.from(childRowsWrap.querySelectorAll(".geez-child-row[data-child-row]"));
    const geezAudioBasePath = "geez-audio/";
    const secondRowAudioByLetterId = {
        L01: "be.mp3",
        L02: "se1.mp3",
        L03: "se2.mp3",
        L04: "she.mp3",
        L05: "ve.mp3",
        L06: "ke.mp3",
        L07: "kke.mp3",
        L08: "a.mp3",
        L09: "le.mp3",
        L10: "ze.mp3",
        L11: "zhe.mp3",
        L12: "de.mp3",
        L13: "je.mp3",
        L14: "xe.mp3",
        L15: "xe.mp3",
        L16: "ppe.mp3",
        L17: "ge.mp3",
        L18: "ne.mp3",
        L19: "gne.mp3",
        L20: "te.mp3",
        L21: "che.mp3",
        L22: "qe.mp3",
        L23: "qqe.mp3",
        L24: "pe.mp3",
        L25: "ye.mp3",
        L26: "hhe.mp3",
        L27: "he.mp3",
        L28: "ea.mp3",
        L29: "re.mp3",
        L30: "fe.mp3",
        L31: "we.mp3",
        L32: "me.mp3",
        L33: "hhe.mp3",
        L34: "tte.mp3",
        L35: "chhe.mp3",
        L36: "qque.mp3",
        L37: "qqque.mp3",
        L38: "ggue.mp3",
        L39: "kkue.mp3",
        L40: "kkkue.mp3"
    };
    const secondRowAudioByGlyph = {
        "በ": "be.mp3",
        "ሠ": "se1.mp3",
        "ሰ": "se2.mp3",
        "ሸ": "she.mp3",
        "ቨ": "ve.mp3",
        "ከ": "ke.mp3",
        "ኸ": "kke.mp3",
        "አ": "a.mp3",
        "ለ": "le.mp3",
        "ዘ": "ze.mp3",
        "ዠ": "zhe.mp3",
        "ደ": "de.mp3",
        "ጀ": "je.mp3",
        "ፀ": "xe.mp3",
        "ጸ": "xe.mp3",
        "ጰ": "ppe.mp3",
        "ገ": "ge.mp3",
        "ነ": "ne.mp3",
        "ኘ": "gne.mp3",
        "ተ": "te.mp3",
        "ቸ": "che.mp3",
        "ቀ": "qe.mp3",
        "ቐ": "qqe.mp3",
        "ፐ": "pe.mp3",
        "የ": "ye.mp3",
        "ኀ": "hhe.mp3",
        "ሀ": "he.mp3",
        "ዐ": "ea.mp3",
        "ረ": "re.mp3",
        "ፈ": "fe.mp3",
        "ወ": "we.mp3",
        "መ": "me.mp3",
        "ሐ": "hhe.mp3",
        "ጠ": "tte.mp3",
        "ጨ": "chhe.mp3",
        "ቈ": "qque.mp3",
        "ቘ": "qqque.mp3",
        "ጐ": "ggue.mp3",
        "ኰ": "kkue.mp3",
        "ዀ": "kkkue.mp3"
    };
    const childAudioByGlyph = {
        "በ": "be.mp3",
        "ቡ": "bu.mp3",
        "ቢ": "bi.mp3",
        "ባ": "ba.mp3",
        "ቤ": "bie.mp3",
        "ብ": "b.mp3",
        "ቦ": "bo.mp3",
        "አ": "a.mp3",
        "ኡ": "u.mp3",
        "ኢ": "ee.mp3",
        "ኣ": "aaa.mp3",
        "ኤ": "aae.mp3",
        "እ": "ei.mp3",
        "ኦ": "o.mp3",
        "ጸ": "xe.mp3",
        "ጹ": "xu.mp3",
        "ጺ": "xi.mp3",
        "ጻ": "xa.mp3",
        "ጼ": "xie.mp3",
        "ጽ": "x.mp3",
        "ጾ": "xo.mp3",
        "ጰ": "ppe.mp3",
        "ጱ": "ppu.mp3",
        "ጲ": "ppi.mp3",
        "ጳ": "ppa.mp3",
        "ጴ": "ppie.mp3",
        "ጵ": "pp.mp3",
        "ጶ": "ppo.mp3",
        "ሠ": "se.mp3",
        "ሡ": "su.mp3",
        "ሢ": "si.mp3",
        "ሣ": "sa.mp3",
        "ሤ": "sie.mp3",
        "ሥ": "s.mp3",
        "ሦ": "so.mp3",
        "ሰ": "se.mp3",
        "ሱ": "su.mp3",
        "ሲ": "si.mp3",
        "ሳ": "sa.mp3",
        "ሴ": "sie.mp3",
        "ስ": "s.mp3",
        "ሶ": "so.mp3",
        "ሸ": "sshe.mp3",
        "ሹ": "shu.mp3",
        "ሺ": "shi.mp3",
        "ሻ": "sha.mp3",
        "ሼ": "shie.mp3",
        "ሽ": "sh.mp3",
        "ሾ": "sho.mp3",
        "ቨ": "ve.mp3",
        "ቩ": "vu.mp3",
        "ቪ": "vi.mp3",
        "ቫ": "va.mp3",
        "ቬ": "vie.mp3",
        "ቭ": "v.mp3",
        "ቮ": "vo.mp3",
        "ከ": "ke.mp3",
        "ኩ": "ku.mp3",
        "ኪ": "ki.mp3",
        "ካ": "ka.mp3",
        "ኬ": "kie.mp3",
        "ክ": "k.mp3",
        "ኮ": "ko.mp3",
        "ኸ": "kke.mp3",
        "ኹ": "kku.mp3",
        "ኺ": "kki.mp3",
        "ኻ": "kka.mp3",
        "ኼ": "kkie.mp3",
        "ኽ": "kk.mp3",
        "ኾ": "kko.mp3"
    };
    const childButtonPreviewCatalog = {
        "በ": [
            { image: "sheep.png", english: "Sheep", geez: "በጊዕ" },
            { image: "cactus.png", english: "Cactus", geez: "በለስ" },
            { image: "kettel.png", english: "Kettle", geez: "በራድ" },
            { image: "apron.png", english: "Apron", geez: "በጃ" }
        ],
        "ቡ": [
            { image: "sink.png", english: "Sink", geez: "ቡምባ" },
            { image: "coffee.png", english: "Coffee", geez: "ቡን" },
            { image: "sprout.png", english: "sprout", geez: "ቡቁልቶ" },
            { image: "compass.png", english: "Compass", geez: "ብሶላ" }
        ],
        "ቢ": [
            { image: "bridge.png", english: "Bridge", geez: "ቢንቶ" },
            { image: "pen.png", english: "Pen", geez: "ቢሮ" },
            { image: "horn.png", english: "Horn", geez: "ቢብ" },
            { image: "beer.png", english: "Beer", geez: "ቢራ" }
        ],
        "ባ": [
            { image: "train.png", english: "Train", geez: "ባቡር" },
            { image: "Flag.png", english: "Flag", geez: "ባንዴራ" },
            { image: "potty.png", english: "Potty", geez: "ባዞ" },
            { image: "packet.png", english: "Packet", geez: "ባኮ" }
        ],
        "ቤ": [
            { image: "house.png", english: "House", geez: "ቤት" },
            { image: "church.png", english: "Church", geez: "ቤተክርስትያን" },
            { image: "office.png", english: "Office", geez: "ቤት ጽሕፈት" },
            { image: "beja.png", english: "Tribe (Beja)", geez: "ቤጃ" }
        ],
        "ብ": [
            { image: "ox.png", english: "Ox", geez: "ብዕራይ" },
            { image: "knee.png", english: "Knee", geez: "ብርኪ" },
            { image: "buttermilk.png", english: "Butter Milk", geez: "ብራሕ" },
            { image: "culf.png", english: "Culf", geez: "ብተይ" }
        ],
        "ቦ": [
            { image: "packbag.png", english: "Packback", geez: "ቦርሳ" },
            { image: "board.png", english: "Board", geez: "ቦርድ" },
            { image: "teared.png", english: "Teared", geez: "ቦጃል" },
            { image: "bessoflour.png", english: "Bessoflour", geez: "ቦሶ" }
        ],
        "ሠ": [
            { image: "thiefer.png", english: "Thiefer", geez: "ሠራቒ" },
            { image: "seteta.png", english: "Seteta", geez: "ሠተታ" },
            { image: "money.png", english: "Money", geez: "ሠልዲ" },
            { image: "ostrich.png", english: "Ostrich", geez: "ሠገን" }
        ],
        "ሡ": [
            { image: "60.png", english: "Sixty", geez: "ሡሳ" },
            { image: "sun-flower.png", english: "Sun-Flower", geez: "ሡር" },
            { image: "greedy.png", english: "Greedy", geez: "ሡሡዕ" },
            { image: "root.png", english: "Root", geez: "ሡር" }
        ],
        "ሢ": [
            { image: "siso.png", english: "1/3", geez: "ሢሦ" },
            { image: "cd.png", english: "CD", geez: "ሢዲ" },
            { image: "ceramic.png", english: "Ceramic", geez: "ሢራሚክ" },
            { image: "singapore.png", english: "Singapore", geez: "ሢንጋፖር" }
        ],
        "ሣ": [
            { image: "clay-pot.png", english: "Clay-Pot", geez: "ሣርማ" },
            { image: "box-fotor.png", english: "Box", geez: "ሣንዱቕ" },
            { image: "soap.png", english: "Soap", geez: "ሣምና" },
            { image: "spider.png", english: "spider", geez: "ሣሬት" }
        ],
        "ሤ": [
            { image: "chair.png", english: "Chair", geez: "ሤዳ" },
            { image: "seiko.png", english: "Seiko", geez: "ሤኮ" },
            { image: "cedar.png", english: "Cedar", geez: "ሤዳር" },
            { image: "sward.png", english: "Sward", geez: "ሤፍ" }
        ],
        "ሥ": [
            { image: "pant.png", english: "Pant", geez: "ሥረ" },
            { image: "meat.png", english: "Meat", geez: "ሥጋ" },
            { image: "teeth.png", english: "Teeth", geez: "ሥኒ" },
            { image: "barely.png", english: "Barely", geez: "ሥገም" }
        ],
        "ሦ": [
            { image: "sofa.png", english: "SOFA", geez: "ሦፋ" },
            { image: "solar.png", english: "Solar", geez: "ሦላር" },
            { image: "chock.png", english: "Chock", geez: "ሦል" },
            { image: "empty.png", english: "N/A", geez: "የለን" }
        ],
        "ሰ": [
            { image: "ostrich.png", english: "Ostrich", geez: "ሰገን" },
            { image: "watch.png", english: "Watch", geez: "ሰዓት" },
            { image: "algae.png", english: "Algae", geez: "ሰበባ" },
            { image: "thigh.png", english: "Thigh", geez: "ሰለፍ" }
        ],
        "ሱ": [
            { image: "60.png", english: "Sixty", geez: "ሱሳ" },
            { image: "root.png", english: "Root", geez: "ሱር" },
            { image: "sun-flower.png", english: "Sunflower", geez: "ሱፍ" },
            { image: "suma.png", english: "Corn-core", geez: "ሱማ" }
        ],
        "ሲ": [
            { image: "siso.png", english: "1/3", geez: "ሲሶ" },
            { image: "cinema.png", english: "Cinema", geez: "ትያትር" },
            { image: "cd.png", english: "CD", geez: "ሲዲ" },
            { image: "singapore.png", english: "Singapore", geez: "ሲንጋፖር" }
        ],
        "ሳ": [
            { image: "cent.png", english: "Cent", geez: "ሳንቲም" },
            { image: "paste.png", english: "Salsa", geez: "ሳልሳ" },
            { image: "soap.png", english: "Soap", geez: "ሳምና" },
            { image: "spider.png", english: "spider", geez: "ሳሬት" }
        ],
        "ሴ": [
            { image: "sward.png", english: "Sward", geez: "ሴፍ" },
            { image: "seiko.png", english: "Seiko", geez: "ሴኮ" },
            { image: "chair.png", english: "Chair", geez: "ሴዳ" },
            { image: "cedar.png", english: "Cedar", geez: "ሴዳር" }
        ],
        "ስ": [
            { image: "pant.png", english: "Pant", geez: "ስረ" },
            { image: "meat.png", english: "Meat", geez: "ስጋ" },
            { image: "teeth.png", english: "Teeth", geez: "ስኒ" },
            { image: "barely.png", english: "Barely", geez: "ሰገም" }
        ],
        "ሶ": [
            { image: "sofa.png", english: "SOFA", geez: "ሶፋ" },
            { image: "solar.png", english: "Solar", geez: "ሶላር" },
            { image: "chock.png", english: "Chock", geez: "ሶል" },
            { image: "empty.png", english: "Sodom gomorom", geez: "ሶዶም" }
        ],
        "ሸ": [
            { image: "Slipper.png", english: "Slipper", geez: "ሸበጥ" },
            { image: "Bowl.png", english: "Bowl", geez: "ሸሓኒ" },
            { image: "shewit.png", english: "Corn", geez: "ሸዊት" },
            { image: "eyebrow.png", english: "Eyebrow", geez: "ሸፋሽፍቲ" }
        ],
        "ሹ": [
            { image: "ring.png", english: "Ring", geez: "ሹቦ" },
            { image: "gun.png", english: "Gun", geez: "ሹጉጥ" },
            { image: "shufon.png", english: "Grils Cloth", geez: "ሹፎን" },
            { image: "shuro.png", english: "Shuro", geez: "ሹሮ" }
        ],
        "ሺ": [
            { image: "herbal.png", english: "Herbal", geez: "ሺሻ" },
            { image: "empty.png", english: "Empty", geez: "የለን" },
            { image: "empty.png", english: "Empty", geez: "የለን" },
            { image: "empty.png", english: "Empty", geez: "የለን" }
        ],
        "ሻ": [
            { image: "tea.png", english: "Tea", geez: "ሻሂ" },
            { image: "flute.png", english: "Flute", geez: "ሻምቡቆ" },
            { image: "shash.png", english: "Shash", geez: "ሻሽ" },
            { image: "empty.png", english: "None", geez: "የለን" }
        ],
        "ሼ": [
            { image: "cloring.png", english: "Cloring", geez: "ሼፕ" },
            { image: "shefal.png", english: "Tilted Feet", geez: "ሼፋል" },
            { image: "empty.png", english: "None", geez: "የለን" },
            { image: "empty.png", english: "None", geez: "የለን" }
        ],
        "ሽ": [
            { image: "Candel.png", english: "Candle", geez: "ሽምዓ" },
            { image: "towel.png", english: "Towel", geez: "ሽጓማኒ" },
            { image: "restroom.png", english: "Restroom", geez: "ሽቓቕ" },
            { image: "shibaka.png", english: "Big tree", geez: "ሽባኻ" }
        ],
        "ሾ": [
            { image: "sholoka.png", english: "Pumkin Cup", geez: "ሾሎኻ" },
            { image: "diarrehea.png", english: "Diarrehea", geez: "ሾሮኽ" },
            { image: "empty.png", english: "None", geez: "የለን" },
            { image: "empty.png", english: "None", geez: "የለን" }
        ]
    };
    const geezAudio = new Audio();

    let soundEnabled = soundToggle ? String(soundToggle.getAttribute("aria-pressed")) !== "false" : true;

    function setToggleUI() {
        if (!soundToggle) return;
        soundToggle.textContent = soundEnabled ? "🔊" : "🔇";
        soundToggle.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
    }

    function speakText(text) {
        if (!soundEnabled || !text || !("speechSynthesis" in window)) return;
        try {
            window.speechSynthesis.cancel();
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = "am-ET";
            utterance.rate = 0.9;
            utterance.pitch = 1;
            window.speechSynthesis.speak(utterance);
        } catch (_) {
            // Keep UI responsive even if speech synthesis fails on this browser.
        }
    }

    function playMappedAudio(fileName) {
        if (!soundEnabled || !fileName) return false;
        try {
            geezAudio.pause();
            geezAudio.currentTime = 0;
            geezAudio.src = `${geezAudioBasePath}${fileName}`;
            geezAudio.play().catch(() => {
                // Ignore and let caller decide fallback behavior.
            });
            return true;
        } catch (_) {
            return false;
        }
    }

    function playGeezSound(letterId, glyph) {
        if (!soundEnabled) return;
        const mappedFile = childAudioByGlyph[glyph] || secondRowAudioByLetterId[letterId] || secondRowAudioByGlyph[glyph] || "";
        const played = mappedFile ? playMappedAudio(mappedFile) : false;
        if (!played) speakText(glyph);
    }

    function renderEmptyPreview(message) {
        preview.classList.add("is-empty");
        preview.innerHTML = `<p class="geez-preview-empty">${message}</p>`;
    }

    function renderPreview(activeLetter, childLetters) {
        const cards = (childLetters || []).map((glyph, index) => `
            <div class="geez-preview-card">
                <p class="geez-preview-card-geez">${glyph}</p>
                <p class="geez-preview-card-english">Child ${index + 1}</p>
            </div>
        `).join("");

        preview.classList.remove("is-empty");
        preview.innerHTML = `
            <div class="geez-preview-content">
                <p class="geez-preview-active-letter">${activeLetter}</p>
                <div class="geez-preview-cards-row">${cards}</div>
            </div>
        `;
    }

    function renderChildButtonPreview(childGlyph, cardsData) {
        const cards = (cardsData || []).map((item) => `
            <div class="geez-preview-card">
                <p class="geez-preview-card-geez">${item.geez}</p>
                <img class="geez-preview-card-image" src="assets/${item.image}" alt="${item.english}">
                <p class="geez-preview-card-english">${item.english}</p>
            </div>
        `).join("");

        preview.classList.remove("is-empty");
        preview.innerHTML = `
            <div class="geez-preview-content">
                <p class="geez-preview-active-letter">${childGlyph}</p>
                <div class="geez-preview-cards-row">${cards}</div>
            </div>
        `;
    }

    function clearChildButtonActiveStates() {
        childRowsWrap.querySelectorAll(".geez-child-btn").forEach((btn) => {
            btn.classList.remove("is-active");
            btn.setAttribute("aria-pressed", "false");
        });
    }

    function setActiveLetter(letterId, triggerSpeak) {
        clearChildButtonActiveStates();
        mainButtons.forEach((btn) => {
            const active = btn.dataset.letterId === letterId;
            btn.classList.toggle("is-active", active);
            btn.setAttribute("aria-pressed", active ? "true" : "false");
        });

        let activeRow = null;
        childRows.forEach((row) => {
            const active = row.dataset.childRow === letterId;
            row.classList.toggle("is-active", active);
            if (active) activeRow = row;
        });

        const activeButton = mainButtons.find((btn) => btn.dataset.letterId === letterId);
        if (!activeButton) {
            renderEmptyPreview("Select a Geez letter to view its child letters.");
            return;
        }

        const activeGlyph = activeButton.textContent.trim();

        // Show guidance until a child letter is selected for image cards.
        renderEmptyPreview("Click any letter above to see images");

        if (triggerSpeak) playGeezSound(letterId, activeGlyph);
    }

    board.addEventListener("click", (event) => {
        const button = event.target.closest(".geez-glyph-btn[data-letter-id]");
        if (!button) return;
        setActiveLetter(button.dataset.letterId, true);
    });

    childRowsWrap.addEventListener("click", (event) => {
        const childButton = event.target.closest(".geez-child-btn");
        if (!childButton) return;
        const glyph = childButton.textContent.trim();
        if (!glyph) return;

        clearChildButtonActiveStates();
        childButton.classList.add("is-active");
        childButton.setAttribute("aria-pressed", "true");

        const cardsData = childButtonPreviewCatalog[glyph];
        if (cardsData && cardsData.length) {
            renderChildButtonPreview(glyph, cardsData);
        }

        playGeezSound("", glyph);
    });

    if (soundToggle) {
        setToggleUI();
        soundToggle.addEventListener("click", () => {
            soundEnabled = !soundEnabled;
            if (!soundEnabled) {
                geezAudio.pause();
                geezAudio.currentTime = 0;
                if ("speechSynthesis" in window) window.speechSynthesis.cancel();
            }
            setToggleUI();
        });
    }

    renderEmptyPreview("Select a Geez letter to view its child letters.");
});
