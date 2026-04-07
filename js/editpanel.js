// ===============================
// editpanel.js
// ===============================

// Get applicant ID from URL
const params = new URLSearchParams(window.location.search);
const applicantId = params.get("id");

if (!applicantId) {
    alert("Invalid record.");
    window.close();
}

// Working state - populated async from Supabase
let applicant = null;    // guardian/applicant record
let students = [];       // student rows belonging to this applicant
let loadedApplicantId = null;  // Supabase applicants.id

// -------------------------------
// DOM references
// -------------------------------

const guardianNameInput   = document.getElementById("guardianName");
const guardianEmailInput  = document.getElementById("guardianEmail");
const guardianPhoneInput  = document.getElementById("guardianPhone");
const countryInput        = document.getElementById("country");
const cityInput           = document.getElementById("city");

const studentsContainer   = document.getElementById("studentsContainer");
const saveBtn             = document.getElementById("saveBtn");
const cancelBtn           = document.getElementById("cancelBtn");
const addStudentBtn       = document.getElementById("addStudentBtn");
const successBox          = document.getElementById("successBox");

// -------------------------------
async function init() {
    if (typeof db === 'undefined') {
        alert('Database not available. Cannot load record.');
        return;
    }

    // Try loading as a student first, then as an applicant
    const { data: studentRow } = await db.students.getById(applicantId);
    if (studentRow) {
        loadedApplicantId = studentRow.applicant_id;
        const { data: appRow } = await db.applicants.getById(loadedApplicantId);
        applicant = appRow || {};
        const { data: sibs } = await db.students.getByApplicantId(loadedApplicantId);
        students = Array.isArray(sibs) ? sibs : [studentRow];
    } else {
        const { data: appRow } = await db.applicants.getById(applicantId);
        if (!appRow) {
            alert('Record not found.');
            window.close();
            return;
        }
        applicant = appRow;
        loadedApplicantId = appRow.id;
        const { data: sibs } = await db.students.getByApplicantId(loadedApplicantId);
        students = Array.isArray(sibs) ? sibs : [];
    }


    // Fill guardian fields
    guardianNameInput.value  = applicant.guardian_name  || "";
    guardianEmailInput.value = applicant.guardian_email || "";
    guardianPhoneInput.value = applicant.guardian_phone || "";
    countryInput.value       = applicant.country        || "";
    cityInput.value          = applicant.city           || "";


    renderStudents();
}

// Build a display-friendly student object for createStudentBlock
function toStudentDisplay(row) {
    const schedule = row.schedule || {};
    return {
        id: row.id || null,
        firstName: row.first_name || "",
        lastName: row.last_name || "",
        startDate: row.start_date || "",
        programChoice: row.program_choice || row.grade_level || "",
        learningGoal: row.learning_goal || "",
        status: row.course_status
            ? (row.course_status.charAt(0).toUpperCase() + row.course_status.slice(1))
            : "Ongoing",
        morningStart: schedule.morningStart || "",
        morningEnd: schedule.morningEnd || "",
        afternoonStart: schedule.afternoonStart || "",
        afternoonEnd: schedule.afternoonEnd || "",
        eveningStart: schedule.eveningStart || "",
        eveningEnd: schedule.eveningEnd || ""
    };
}

// -------------------------------
// Helper: create one student block
// -------------------------------
function createStudentBlock(student, index) {
    const block = document.createElement("div");
    block.classList.add("student-block");

    // Ensure new fields exist
    student.status          = student.status          || "Ongoing";
    student.morningStart    = student.morningStart    || "";
    student.morningEnd      = student.morningEnd      || "";
    student.afternoonStart  = student.afternoonStart  || "";
    student.afternoonEnd    = student.afternoonEnd    || "";
    student.eveningStart    = student.eveningStart    || "";
    student.eveningEnd      = student.eveningEnd      || "";

    block.innerHTML = `
        <h3>Student #${index + 1}</h3>

        <div class="field">
            <label>First Name</label>
            <input type="text" id="fn_${index}" value="${student.firstName || ""}">
        </div>

        <div class="field">
            <label>Last Name</label>
            <input type="text" id="ln_${index}" value="${student.lastName || ""}">
        </div>

        <div class="field">
            <label>Start Date</label>
            <input type="date" id="sd_${index}" value="${student.startDate || ""}">
        </div>

        <div class="field">
            <label>Program</label>
            <select id="program_${index}">
                <option value="">-- Select Program --</option>
                <option value="Beginner Class">Beginner Class</option>
                <option value="Intermediate Class">Intermediate Class</option>
                <option value="Advanced Class">Advanced Class</option>
                <option value="After School Tutorial">After School Tutorial</option>
                <option value="Religious Study">Religious Study</option>
            </select>
        </div>

        <div class="field">
            <label>Learning Goal</label>
            <select id="goal_${index}">
                <option value="">-- Select Goal --</option>
                <option value="Connect with Heritage/Culture">Connect with Heritage/Culture</option>
                <option value="Language Practice">Language Practice</option>
                <option value="Credit Advancement">Credit Advancement</option>
                <option value="College Requirement">College Requirement</option>
            </select>
        </div>

        <div class="field">
            <label>Status</label>
            <select id="status_${index}">
                <option value="Ongoing">Ongoing</option>
                <option value="Suspended">Suspended</option>
                <option value="Terminated">Terminated</option>
                <option value="Completed">Completed</option>
            </select>
        </div>

        <div class="field">
            <label>Schedule</label>

            <div class="schedule-row">
                <span style="width:80px;display:inline-block;">Morning</span>
                <input type="time" id="mStart_${index}" value="${student.morningStart}">
                <span>to</span>
                <input type="time" id="mEnd_${index}" value="${student.morningEnd}">
            </div>

            <div class="schedule-row">
                <span style="width:80px;display:inline-block;">Afternoon</span>
                <input type="time" id="aStart_${index}" value="${student.afternoonStart}">
                <span>to</span>
                <input type="time" id="aEnd_${index}" value="${student.afternoonEnd}">
            </div>

            <div class="schedule-row">
                <span style="width:80px;display:inline-block;">Evening</span>
                <input type="time" id="eStart_${index}" value="${student.eveningStart}">
                <span>to</span>
                <input type="time" id="eEnd_${index}" value="${student.eveningEnd}">
            </div>
        </div>
    `;

    // Set selects after innerHTML
    const programSelect = block.querySelector(`#program_${index}`);
    const goalSelect    = block.querySelector(`#goal_${index}`);
    const statusSelect  = block.querySelector(`#status_${index}`);

    programSelect.value = student.programChoice || "";
    goalSelect.value    = student.learningGoal  || "";
    statusSelect.value  = student.status        || "Ongoing";

    return block;
}

// -------------------------------
// Render all students
// -------------------------------
function renderStudents() {
    studentsContainer.innerHTML = "";


    students.forEach((row, index) => {
        const student = toStudentDisplay(row);
        const block = createStudentBlock(student, index);
        studentsContainer.appendChild(block);
    });
}

// -------------------------------
// Add New Student (floating button)
// -------------------------------
addStudentBtn.addEventListener("click", () => {

    students.push({
        id: null,
        firstName: "",
        lastName: "",
        startDate: "",
        programChoice: "",
        learningGoal: "",
        status: "Ongoing",
        morningStart: "",
        morningEnd: "",
        afternoonStart: "",
        afternoonEnd: "",
        eveningStart: "",
        eveningEnd: ""
    });

    renderStudents();

    // Scroll to bottom to show new student
    setTimeout(() => {
        studentsContainer.scrollTop = studentsContainer.scrollHeight;
    }, 50);
});

// -------------------------------
// SAVE BUTTON
// -------------------------------
// SAVE BUTTON
saveBtn.addEventListener("click", async () => {
    if (typeof db === 'undefined') {
        alert('Database not available.');
        return;
    }

    // Guardian
    const guardianName  = guardianNameInput.value.trim();
    const guardianEmail = guardianEmailInput.value.trim();
    const guardianPhone = guardianPhoneInput.value.trim();
    const country       = countryInput.value.trim();
    const city          = cityInput.value.trim();
    // Save guardian (applicant) record
    const { error: appErr } = await db.applicants.save({
        id: loadedApplicantId,
        status: applicant.status || 'admitted',
        guardianName,
        guardianEmail,
        guardianPhone,
        country,
        city
    });
    if (appErr) {
        alert('Could not save guardian: ' + (appErr.message || 'Unknown error'));
        return;
    }

    // Save each student row
    for (let index = 0; index < students.length; index++) {
        const row = students[index];
        const firstName     = document.getElementById(`fn_${index}`)?.value.trim() || "";
        const lastName      = document.getElementById(`ln_${index}`)?.value.trim() || "";
        const startDate     = document.getElementById(`sd_${index}`)?.value || "";
        const programChoice = document.getElementById(`program_${index}`)?.value || "";
        const learningGoal  = document.getElementById(`goal_${index}`)?.value || "";
        const status        = (document.getElementById(`status_${index}`)?.value || "Ongoing").toLowerCase();

        // Collect schedule fields
        const morningStart    = document.getElementById(`mStart_${index}`)?.value || "";
        const morningEnd      = document.getElementById(`mEnd_${index}`)?.value || "";
        const afternoonStart  = document.getElementById(`aStart_${index}`)?.value || "";
        const afternoonEnd    = document.getElementById(`aEnd_${index}`)?.value || "";
        const eveningStart    = document.getElementById(`eStart_${index}`)?.value || "";
        const eveningEnd      = document.getElementById(`eEnd_${index}`)?.value || "";

        // Build schedule object for JSONB
        const schedule = {
            morningStart,
            morningEnd,
            afternoonStart,
            afternoonEnd,
            eveningStart,
            eveningEnd
        };

        const { error: stuErr } = await db.students.save({
            id: row.id || null,
            sid: row.sid || (index + 1),
            firstName,
            lastName,
            startDate,
            programChoice,
            gradeLevel: programChoice,
            learningGoal,
            schedule,
            status: applicant.status || 'admitted',
            courseStatus: status
        }, loadedApplicantId);
        if (stuErr) {
            alert(`Could not save student #${index + 1}: ` + (stuErr.message || 'Unknown error'));
            return;
        }
    }

    // Show success message
    successBox.style.display = "block";

    // SAFE CLOSE + REFRESH
    setTimeout(() => {
        try {
            if (window.opener && !window.opener.closed) {
                window.opener.location.reload();
            }
        } catch (e) {
            console.log("Opener refresh blocked:", e);
        }

        window.close();
    }, 800);
});


// -------------------------------
// CANCEL BUTTON
// -------------------------------
cancelBtn.addEventListener("click", () => {
    // Bootstrap
    init();
    window.close();
});

// Ensure data loads on page open
document.addEventListener("DOMContentLoaded", () => {
    init();
});
