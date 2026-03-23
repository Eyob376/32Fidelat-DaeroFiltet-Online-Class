/* =========================================================
   ADMIN DASHBOARD — CORE HELPERS
   One row per student (flattened model)
========================================================= */
function getAllApplicants() {
    // Synchronous wrapper — returns the pre-loaded cache.
    // Call refreshApplicantsCache() (async) to reload from Supabase.
    return allApplicantsCache;
}

async function refreshApplicantsCache() {
    if (typeof db === 'undefined') return;
    const { data, error } = await db.students.getAll();
    if (error) {
        console.error('[admin] refreshApplicantsCache error:', error.message);
        return;
    }
    allApplicantsCache = (data || []).map(row => {
        const app = row.applicants || {};
        const y = row.start_date ? new Date(row.start_date).getFullYear() : new Date().getFullYear();
        const yr = isNaN(y) ? new Date().getFullYear() : y;
        return {
            id: row.id,
            status: row.status || 'new',
            guardianName:  app.guardian_name  || '',
            guardianEmail: app.guardian_email || '',
            guardianPhone: app.guardian_phone || '',
            country: app.country || '',
            city:    app.city    || '',
            firstName:     row.first_name     || '',
            lastName:      row.last_name      || '',
            startDate:     row.start_date     || '',
            programChoice: row.program_choice || '',
            gradeLevel:    row.grade_level    || row.program_choice || '',
            courseStatus:  row.course_status  || 'ongoing',
            year:  yr,
            years: [yr]
        };
    });
}

function runOneTimeApplicantDataRepair() {
    // No-op: data is now managed entirely by Supabase.
}

/* =========================================================
   GLOBAL STATE
========================================================= */

let allApplicantsCache = [];
let currentNewPage = 1;
let currentAdPage = 1;
let currentNewData = [];
let currentAdData = [];

function getConfiguredUploadLimitBytes() {
    const raw = Number(window.DAERO_MEDIA_UPLOAD_MAX_BYTES);
    return raw > 0 ? raw : (50 * 1024 * 1024);
}

function buildVideoUploadLimitError(file) {
    const limitBytes = getConfiguredUploadLimitBytes();
    return new Error(
        `${file.name} is ${formatUploadSize(file?.size)}, but the current Supabase Storage upload limit is ${formatUploadSize(limitBytes)}. ` +
        `Increase Storage Settings > Global file size limit in Supabase or upload a smaller video.`
    );
}

function normalizeVideoUploadError(error, file) {
    const message = String(error?.message || "").trim();
    if (/maximum size exceeded/i.test(message)) {
        return buildVideoUploadLimitError(file);
    }
    return error;
}

async function uploadMediaWithTus(category, file, onProgress) {
    if (!window.tus) {
        return { data: null, error: new Error("tus-js-client is not loaded.") };
    }

    const supabaseUrl = window.DAERO_SUPABASE_URL;
    const storageUrl = window.DAERO_SUPABASE_STORAGE_URL || supabaseUrl;
    const supabaseAnonKey = window.DAERO_SUPABASE_ANON_KEY;
    const bucket = db.mediaUploads?.getStorageBucketName ? db.mediaUploads.getStorageBucketName() : "media-uploads";
    if (!supabaseUrl || !storageUrl || !supabaseAnonKey) {
        return { data: null, error: new Error("Supabase client configuration is missing.") };
    }

    const safeCategory = String(category || "misc").trim().toLowerCase();
    const safeName = String(file?.name || "upload")
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9._-]/g, "");
    const filePath = `${safeCategory}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
    const limitBytes = getConfiguredUploadLimitBytes();

    if (Number(file?.size || 0) > limitBytes) {
        return { data: null, error: buildVideoUploadLimitError(file) };
    }

    return new Promise((resolve) => {
        const upload = new window.tus.Upload(file, {
            endpoint: `${storageUrl}/storage/v1/upload/resumable`,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            chunkSize: 6 * 1024 * 1024,
            uploadDataDuringCreation: false,
            removeFingerprintOnSuccess: true,
            metadata: {
                bucketName: bucket,
                objectName: filePath,
                contentType: file.type || "application/octet-stream",
                cacheControl: "3600"
            },
            headers: {
                apikey: supabaseAnonKey,
                Authorization: `Bearer ${supabaseAnonKey}`,
                "x-upsert": "false"
            },
            onError: (error) => {
                resolve({ data: null, error: normalizeVideoUploadError(error, file) });
            },
            onProgress: (bytesUploaded, bytesTotal) => {
                if (!onProgress || !bytesTotal) return;
                const percent = Math.round((bytesUploaded / bytesTotal) * 100);
                onProgress(percent, bytesUploaded, bytesTotal);
            },
            onSuccess: () => {
                const publicRes = supabaseClient.storage.from(bucket).getPublicUrl(filePath);
                const publicUrl = publicRes?.data?.publicUrl || "";
                if (!publicUrl) {
                    resolve({ data: null, error: new Error("Resumable upload succeeded but no public URL was returned.") });
                    return;
                }
                resolve({ data: { bucket, path: filePath, publicUrl }, error: null });
            }
        });

        upload.start();
    });
}

function normalizeProgramLabel(value) {
    return String(value || "").trim().toLowerCase();
}

function resolveProgramLevelFromStudent(app) {
    const label = normalizeProgramLabel(app?.gradeLevel || app?.programChoice);
    if (!label) return "";

    if (label.includes("beginner") || label.includes("basic")) return "beginner";
    if (label.includes("intermediate")) return "intermediate";
    if (label.includes("advanced")) return "advanced";
    if (label.includes("after school") || label.includes("ast")) return "afterschool";
    if (label.includes("religious")) return "religious";
    return "";
}

function renderAdminProgramCounts() {
    const boxes = document.querySelectorAll(".program-box[data-level]");
    if (!boxes.length) return;

    const counts = {
        beginner: 0,
        intermediate: 0,
        advanced: 0,
        afterschool: 0,
        religious: 0
    };

    allApplicantsCache.forEach((app) => {
        if (String(app?.status || "").toLowerCase() !== "admitted") return;
        const level = resolveProgramLevelFromStudent(app);
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

/* =========================================================
   YEAR FILTER HELPERS
========================================================= */

function getYearsFromApplicants(apps) {
    const years = new Set();
    apps.forEach(app => {
        if (app.startDate) {
            const y = new Date(app.startDate).getFullYear();
            if (!isNaN(y)) years.add(y);
        }
    });
    return Array.from(years).sort();
}

function populateYearSelect(selectId, apps) {
    const sel = document.getElementById(selectId);
    if (!sel) return;
    sel.innerHTML = `<option value="">Year</option>`;
    getYearsFromApplicants(apps).forEach(y => {
        const opt = document.createElement("option");
        opt.value = String(y);
        opt.textContent = y;
        sel.appendChild(opt);
    });
}

/* =========================================================
   NEW APPLICANTS — FILTER + RENDER
   One row per student
========================================================= */

function applyNewFilters(apps) {
    const yearVal = document.getElementById("filterYearNew")?.value.trim() || "";
    const firstVal = document.getElementById("filterFirstNameNew")?.value.trim().toLowerCase() || "";
    const guardVal = document.getElementById("filterGuardianNew")?.value.trim().toLowerCase() || "";

    return apps.filter(app => {
        if (app.status !== "new") return false;

        if (yearVal) {
            if (!app.startDate) return false;
            const y = new Date(app.startDate).getFullYear();
            if (isNaN(y) || String(y) !== yearVal) return false;
        }

        if (firstVal) {
            const fn = (app.firstName || "").toLowerCase();
            if (!fn.includes(firstVal)) return false;
        }

        if (guardVal) {
            const gn = (app.guardianName || "").toLowerCase();
            if (!gn.includes(guardVal)) return false;
        }

        return true;
    });
}

function renderNewApplicantsTable() {
    const table = document.getElementById("newApplicantsTable");
    if (!table) return;

    const pageSizeVal = document.getElementById("pageSizeNew")?.value || "5";

    const filtered = applyNewFilters(allApplicantsCache);
    currentNewData = filtered;

    let pageSize = filtered.length;
    if (pageSizeVal !== "all") pageSize = parseInt(pageSizeVal, 10) || 5;

    const totalPages = pageSizeVal === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentNewPage > totalPages) currentNewPage = totalPages;

    const start = pageSizeVal === "all" ? 0 : (currentNewPage - 1) * pageSize;
    const pageData = filtered.slice(start, start + pageSize);

    table.innerHTML = `
        <thead>
            <tr>
                <th><input type="checkbox" id="selectAllNew"> Select</th>
                <th>Guardian Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Country</th>
                <th>City</th>
                <th>Student</th>
                <th>Start Date</th>
                <th>Grade Level</th>
                <th>Year</th>
                <th>Actions</th>
            </tr>
        </thead>
    `;

    const tbody = document.createElement("tbody");

    pageData.forEach(app => {
        let yearText = "";
        if (app.startDate) {
            const y = new Date(app.startDate).getFullYear();
            if (!isNaN(y)) yearText = String(y);
        }

        const row = document.createElement("tr");
        row.innerHTML = `
            <td><input type="checkbox" class="select-new" data-id="${app.id}"></td>
            <td>${app.guardianName || ""}</td>
            <td>${app.guardianEmail || ""}</td>
            <td>${app.guardianPhone || ""}</td>
            <td>${app.country || ""}</td>
            <td>${app.city || ""}</td>
            <td>${(app.firstName || "") + " " + (app.lastName || "")}</td>
            <td>${app.startDate || ""}</td>
            <td>${app.gradeLevel || app.programChoice || ""}</td>
            <td>${yearText}</td>
            <td><button class="glass-btn btn-primary btn-sm admit-btn" data-id="${app.id}">Admit</button></td>
        `;
        tbody.appendChild(row);
    });

    table.appendChild(tbody);

    const selectAllNew = table.querySelector("#selectAllNew");
    const rowChecksNew = Array.from(table.querySelectorAll(".select-new"));

    if (selectAllNew) {
        selectAllNew.addEventListener("change", () => {
            rowChecksNew.forEach(ch => {
                ch.checked = selectAllNew.checked;
            });
        });

        rowChecksNew.forEach(ch => {
            ch.addEventListener("change", () => {
                const selected = rowChecksNew.filter(x => x.checked).length;
                selectAllNew.checked = rowChecksNew.length > 0 && selected === rowChecksNew.length;
                selectAllNew.indeterminate = selected > 0 && selected < rowChecksNew.length;
            });
        });
    }

    renderPagination(
        "newPagination",
        currentNewPage,
        totalPages,
        pageSize,
        filtered.length
    );
}

/* =========================================================
   ADMITTED STUDENTS — COLUMN DROPDOWN WITH CHECKBOXES
========================================================= */

const admittedColumns = [
    { key: "guardianName", label: "Guardian Name" },
    { key: "guardianEmail", label: "Email" },
    { key: "guardianPhone", label: "Phone" },
    { key: "country", label: "Country" },
    { key: "city", label: "City" },
    { key: "studentName", label: "Student" },
    { key: "startDate", label: "Start Date" },
    { key: "gradeLevel", label: "Grade Level" },
    { key: "status", label: "Status" },
    { key: "year", label: "Year" }
];

let admittedVisibleCols = new Set(admittedColumns.map(c => c.key));

function resetAdmittedVisibleColumnsDefault() {
    admittedVisibleCols = new Set(
        admittedColumns
            .filter(col => col.key !== "country")
            .map(col => col.key)
    );
}

function buildColumnCheckboxMenu() {
    const menu = document.getElementById("columnDropdownMenu");
    if (!menu) return;

    menu.innerHTML = "";

    admittedColumns.forEach(col => {
        const row = document.createElement("label");
        row.innerHTML = `
            <input type="checkbox" value="${col.key}" ${admittedVisibleCols.has(col.key) ? "checked" : ""}>
            ${col.label}
        `;
        menu.appendChild(row);
    });

    menu.querySelectorAll("input[type='checkbox']").forEach(ch => {
        ch.addEventListener("change", () => {
            if (ch.checked) admittedVisibleCols.add(ch.value);
            else admittedVisibleCols.delete(ch.value);
            renderAdmittedTable();
        });
    });

    const btn = document.getElementById("columnDropdownBtn");
    if (btn && btn.dataset.menuBound !== "1") {
        btn.dataset.menuBound = "1";
        btn.addEventListener("click", () => {
            menu.style.display = menu.style.display === "block" ? "none" : "block";
        });
    }
}

/* =========================================================
   ADMITTED STUDENTS — FILTER + RENDER
   One row per student
========================================================= */

function applyAdmittedFilters(apps) {
    const yearVal = document.getElementById("filterYearAd")?.value.trim() || "";
    const statusVal = document.getElementById("filterStatusAd")?.value.trim() || "";
    const gradeVal = document.getElementById("filterGradeAd")?.value.trim() || "";
    const firstVal = document.getElementById("filterFirstNameAd")?.value.trim().toLowerCase() || "";
    const guardVal = document.getElementById("filterGuardianAd")?.value.trim().toLowerCase() || "";

    return apps.filter(app => {
        if (app.status !== "admitted") return false;

        if (yearVal) {
            if (!app.startDate) return false;
            const y = new Date(app.startDate).getFullYear();
            if (isNaN(y) || String(y) !== yearVal) return false;
        }

        if (statusVal) {
            const cs = (app.courseStatus || "ongoing").toLowerCase();
            if (cs !== statusVal.toLowerCase()) return false;
        }

        if (gradeVal) {
            const gl = (app.gradeLevel || app.programChoice || "").toLowerCase();
            if (gl !== gradeVal.toLowerCase()) return false;
        }

        if (firstVal) {
            const fn = (app.firstName || "").toLowerCase();
            if (!fn.includes(firstVal)) return false;
        }

        if (guardVal) {
            const gn = (app.guardianName || "").toLowerCase();
            if (!gn.includes(guardVal)) return false;
        }

        return true;
    });
}

function renderAdmittedTable() {
    const table = document.getElementById("admittedStudentsTable");
    if (!table) return;

    const pageSizeVal = document.getElementById("pageSizeAd")?.value || "5";

    const filtered = applyAdmittedFilters(allApplicantsCache);
    currentAdData = filtered;

    let pageSize = filtered.length;
    if (pageSizeVal !== "all") pageSize = parseInt(pageSizeVal, 10) || 5;

    const totalPages = pageSizeVal === "all" ? 1 : Math.max(1, Math.ceil(filtered.length / pageSize));
    if (currentAdPage > totalPages) currentAdPage = totalPages;

    const start = pageSizeVal === "all" ? 0 : (currentAdPage - 1) * pageSize;
    const pageData = filtered.slice(start, start + pageSize);

    table.innerHTML = `
        <thead>
            <tr>
                <th><input type="checkbox" id="selectAllAd"> Select</th>
                ${admittedColumns.map(col => `
                    <th data-col="${col.key}" style="${admittedVisibleCols.has(col.key) ? "" : "display:none"}">
                        ${col.label}
                    </th>
                `).join("")}
                <th>Actions</th>
            </tr>
        </thead>
    `;

    const tbody = document.createElement("tbody");

    pageData.forEach(app => {
        const studentName = `${app.firstName || ""} ${app.lastName || ""}`.trim();

        let yearText = "";
        if (app.startDate) {
            const y = new Date(app.startDate).getFullYear();
            if (!isNaN(y)) yearText = String(y);
        }

        const statusRaw = (app.courseStatus || "ongoing").toLowerCase();
        const statusLabel = statusRaw.charAt(0).toUpperCase() + statusRaw.slice(1);
        let statusClass = "status-pill status-ongoing";
        if (statusRaw === "suspended") statusClass = "status-pill status-suspended";
        else if (statusRaw === "terminated") statusClass = "status-pill status-terminated";
        else if (statusRaw === "completed") statusClass = "status-pill status-completed";

        const row = document.createElement("tr");

        row.innerHTML = `
            <td>
                <div class="ad-select-cell">
                    <button class="sp-btn open-student-portal" data-id="${app.id}" title="Open Student Portal">S-P</button>
                    <input type="checkbox" class="select-ad" data-id="${app.id}">
                </div>
            </td>
            ${admittedColumns.map(col => {
                let cellContent = "";
                if (col.key === "studentName") {
                    cellContent = studentName;
                } else if (col.key === "startDate") {
                    cellContent = app.startDate || "";
                } else if (col.key === "status") {
                    cellContent = `<span class="${statusClass}">${statusLabel}</span>`;
                } else if (col.key === "year") {
                    cellContent = yearText;
                } else if (col.key === "gradeLevel") {
                    cellContent = app.gradeLevel || app.programChoice || "";
                } else {
                    cellContent = app[col.key] || "";
                }
                return `
                    <td data-col="${col.key}" style="${admittedVisibleCols.has(col.key) ? "" : "display:none"}">
                        ${cellContent}
                    </td>
                `;
            }).join("")}
            <td>
                <div class="action-dropdown">
                    <button class="action-btn">Actions ▼</button>
                    <div class="action-menu">
                        <button class="action-item edit-ad" data-id="${app.id}">Edit</button>
                        <button class="action-item Ongoing-ad" data-id="${app.id}">Ongoing</button>
                        <button class="action-item suspend-ad" data-id="${app.id}">Suspend</button>
                        <button class="action-item terminate-ad" data-id="${app.id}">Terminate</button>
                        <button class="action-item complete-ad" data-id="${app.id}">Complete</button>
                    </div>
                </div>
            </td>
        `;

        tbody.appendChild(row);
    });

    table.appendChild(tbody);

    const selectAllAd = table.querySelector("#selectAllAd");
    const rowChecksAd = Array.from(table.querySelectorAll(".select-ad"));

    if (selectAllAd) {
        selectAllAd.addEventListener("change", () => {
            rowChecksAd.forEach(ch => {
                ch.checked = selectAllAd.checked;
            });
        });

        rowChecksAd.forEach(ch => {
            ch.addEventListener("change", () => {
                const selected = rowChecksAd.filter(x => x.checked).length;
                selectAllAd.checked = rowChecksAd.length > 0 && selected === rowChecksAd.length;
                selectAllAd.indeterminate = selected > 0 && selected < rowChecksAd.length;
            });
        });
    }

    renderPagination(
        "admittedPagination",
        currentAdPage,
        totalPages,
        pageSize,
        filtered.length
    );

    // Edit
    table.querySelectorAll(".edit-ad").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            window.open(
                `editpanel.html?id=${id}`,
                "_blank",
                "width=1100,height=800"
            );
        });
    });

    // Status actions
    table.querySelectorAll(".Ongoing-ad").forEach(btn => {
        btn.addEventListener("click", () => updateStatus(btn.dataset.id, "ongoing"));
    });

    table.querySelectorAll(".suspend-ad").forEach(btn => {
        btn.addEventListener("click", () => updateStatus(btn.dataset.id, "suspended"));
    });

    table.querySelectorAll(".terminate-ad").forEach(btn => {
        btn.addEventListener("click", () => updateStatus(btn.dataset.id, "terminated"));
    });

    table.querySelectorAll(".complete-ad").forEach(btn => {
        btn.addEventListener("click", () => updateStatus(btn.dataset.id, "completed"));
    });

    table.querySelectorAll(".open-student-portal").forEach(btn => {
        btn.addEventListener("click", () => {
            const studentId = (btn.dataset.id || "").trim();
            if (!studentId) return;
            window.open(`member-portal.html?studentId=${encodeURIComponent(studentId)}`, "_blank");
        });
    });
}

/*-----------------------------------Pagination rule---------------------------*/

function renderPagination(containerId, currentPage, totalPages, pageSize, totalItems) {
    const el = document.getElementById(containerId);
    if (!el) return;

    const start = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalItems);

    el.innerHTML = `
        <button class="page-btn prev-btn" data-action="prev" ${currentPage === 1 ? "disabled" : ""}>
            Previous
        </button>

        <div class="page-info">
            Showing ${start}–${end} of ${totalItems}
        </div>

        <button class="page-btn next-btn" data-action="next" ${currentPage === totalPages ? "disabled" : ""}>
            Next
        </button>
    `;

    el.querySelectorAll("button").forEach(btn => {
        btn.addEventListener("click", () => {
            const action = btn.dataset.action;

            if (action === "prev" && currentPage > 1) {
                if (containerId === "newPagination") currentNewPage--;
                else currentAdPage--;
            }

            if (action === "next" && currentPage < totalPages) {
                if (containerId === "newPagination") currentNewPage++;
                else currentAdPage++;
            }

            renderNewApplicantsTable();
            renderAdmittedTable();
        });
    });
}

/*-----------------------------------Status update----------------------------*/

async function updateStatus(id, newStatus) {
    if (typeof db !== 'undefined' && db.students?.updateStatus) {
        await db.students.updateStatus(id, newStatus);
    }
    await refreshApplicantsCache();
    renderAdminProgramCounts();
    renderAdmittedTable();
}

/* =========================================================
   ADMIT LOGIC
   One student per record (A1 IDs)
========================================================= */

async function admitApplicant(id) {
    if (typeof db === 'undefined' || !db.students?.admit) {
        alert('Database not available.');
        return;
    }
    const { error } = await db.students.admit(id);
    if (error) {
        alert('Could not admit student: ' + (error.message || 'Unknown error'));
        return;
    }
    await refreshApplicantsCache();
    renderAdminProgramCounts();
    renderNewApplicantsTable();
    renderAdmittedTable();
}

function printSelectedAdmitted() {
    const checks = Array.from(document.querySelectorAll(".select-ad:checked"));
    if (!checks.length) {
        alert("Select at least one admitted student to print.");
        return;
    }

    const selectedIds = new Set(checks.map(ch => ch.dataset.id));
    const selectedRows = allApplicantsCache.filter(app => app.status === "admitted" && selectedIds.has(String(app.id)));

    if (!selectedRows.length) {
        alert("Selected records could not be loaded. Please refresh and try again.");
        return;
    }

    const trHtml = selectedRows.map((app, index) => {
        const year = app.startDate ? new Date(app.startDate).getFullYear() : "";
        const yearText = Number.isNaN(year) ? "" : String(year);
        const studentName = `${app.firstName || ""} ${app.lastName || ""}`.trim();
        const statusLabel = (app.courseStatus || "ongoing").replace(/^./, c => c.toUpperCase());

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${app.guardianName || ""}</td>
                <td>${studentName}</td>
                <td>${app.startDate || ""}</td>
                <td>${app.gradeLevel || app.programChoice || ""}</td>
                <td>${statusLabel}</td>
                <td>${yearText}</td>
            </tr>
        `;
    }).join("");

    const popup = window.open("", "_blank", "width=1100,height=800");
    if (!popup) {
        alert("Please allow pop-ups for printing.");
        return;
    }

    popup.document.write(`
        <!doctype html>
        <html>
        <head>
            <meta charset="utf-8" />
            <title>Admitted Students</title>
            <style>
                body { font-family: Arial, sans-serif; margin: 24px; color: #111; }
                h1 { text-align: center; margin: 0 0 18px; font-size: 28px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #999; padding: 8px 10px; text-align: left; font-size: 14px; }
                th { background: #f2f2f2; }
                @media print {
                    @page { margin: 14mm; }
                    body { margin: 0; }
                }
            </style>
        </head>
        <body>
            <h1>Admitted Students</h1>
            <table>
                <thead>
                    <tr>
                        <th>No.</th>
                        <th>Guardian Name</th>
                        <th>Student</th>
                        <th>Start Date</th>
                        <th>Grade Level</th>
                        <th>Status</th>
                        <th>Year</th>
                    </tr>
                </thead>
                <tbody>${trHtml}</tbody>
            </table>
            <script>
                window.onload = function () { window.print(); };
            <\/script>
        </body>
        </html>
    `);
    popup.document.close();
}

/* =========================================================
   DELETE, EXPORT, PRINT
========================================================= */

async function deleteSelectedNew() {
    const checks = document.querySelectorAll(".select-new:checked");
    if (!checks.length) {
        alert('No applicants selected.');
        return;
    }

    if (!confirm("Delete selected new applicants?")) return;

    for (const ch of checks) {
        const id = ch.dataset.id;
        if (typeof db !== 'undefined' && db.students?.delete) {
            await db.students.delete(id);
        }
        const tr = ch.closest('tr');
        if (tr && tr.parentNode) tr.parentNode.removeChild(tr);
    }

    await refreshApplicantsCache();
    renderAdminProgramCounts();
    renderNewApplicantsTable();
    renderAdmittedTable();
}

async function deleteSelectedAdmitted() {
    const checks = document.querySelectorAll(".select-ad:checked");
    if (!checks.length) return;

    if (!confirm("Move selected admitted students back to New Applicants?")) return;

    for (const ch of checks) {
        if (typeof db !== 'undefined' && db.students?.setLifecycleStatus) {
            await db.students.setLifecycleStatus(ch.dataset.id, 'new', 'ongoing');
        } else if (typeof db !== 'undefined' && db.students?.updateStatus) {
            // Fallback for older db helper: at least reset course status.
            await db.students.updateStatus(ch.dataset.id, 'ongoing');
        }
    }

    await refreshApplicantsCache();
    currentAdPage = 1;
    currentNewPage = 1;
    renderAdminProgramCounts();
    renderNewApplicantsTable();
    renderAdmittedTable();
}

function exportToCsv(data, filename) {
    const header = ["Guardian Name","Email","Phone","Country","City","Student","Start Date","Grade Level","Status","Year"];

    const escapeCsv = (value) => {
        const text = String(value ?? "");
        if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
        return text;
    };

    const lines = [header.join(",")];

    data.forEach(app => {
        let yearText = "";
        if (app.startDate) {
            const y = new Date(app.startDate).getFullYear();
            if (!isNaN(y)) yearText = String(y);
        }

        const studentName = `${app.firstName || ""} ${app.lastName || ""}`.trim();
        const row = [
            app.guardianName || "",
            app.guardianEmail || "",
            app.guardianPhone || "",
            app.country || "",
            app.city || "",
            studentName,
            app.startDate || "",
            app.gradeLevel || app.programChoice || "",
            app.courseStatus || app.status || "",
            yearText
        ];

        lines.push(row.map(escapeCsv).join(","));
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function exportToXlsx(data, filename) {
    if (typeof XLSX === "undefined") {
        const csvName = filename.replace(/\.xlsx$/i, ".csv");
        exportToCsv(data, csvName);
        return;
    }

    const rows = [
        ["Guardian Name","Email","Phone","Country","City","Student","Start Date","Grade Level","Status","Year"]
    ];

    data.forEach(app => {
        let yearText = "";
        if (app.startDate) {
            const y = new Date(app.startDate).getFullYear();
            if (!isNaN(y)) yearText = String(y);
        }

        const studentName = `${app.firstName || ""} ${app.lastName || ""}`.trim();

        rows.push([
            app.guardianName || "",
            app.guardianEmail || "",
            app.guardianPhone || "",
            app.country || "",
            app.city || "",
            studentName,
            app.startDate || "",
            app.gradeLevel || app.programChoice || "",
            app.courseStatus || app.status || "",
            yearText
        ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, filename);
}

function updateExportButtonLabels() {
    const hasXlsx = typeof XLSX !== "undefined";
    const label = hasXlsx ? "Export XLSX" : "Export CSV";

    const newBtn = document.getElementById("exportNewApplicants");
    const adBtn = document.getElementById("exportAdmitted");

    if (newBtn) newBtn.textContent = label;
    if (adBtn) adBtn.textContent = label;
}

async function getPasswordOverrideByStudentId(studentId) {
    if (typeof db === 'undefined' || !db.passwordOverrides?.getByStudentId) return null;
    const { data } = await db.passwordOverrides.getByStudentId(studentId);
    return data?.temporary_password || null;
}

async function getPasswordOverrideByEmail(email) {
    if (typeof db === 'undefined' || !db.passwordOverrides?.getByEmail) return null;
    const { data } = await db.passwordOverrides.getByEmail(email);
    return data?.temporary_password || null;
}

async function savePasswordOverrideByStudentId(studentId, newPassword) {
    if (typeof db === 'undefined' || !db.passwordOverrides?.setByStudentId) return { error: { message: 'db unavailable' } };
    return db.passwordOverrides.setByStudentId(studentId, newPassword);
}

async function clearPasswordOverrideByStudentId(studentId) {
    if (typeof db === 'undefined' || !db.passwordOverrides?.clearByEmail) return;
    // clear by fetching the record first to get its email, then deleting
    const { data } = await db.passwordOverrides.getByStudentId(studentId);
    if (data?.guardian_email) await db.passwordOverrides.clearByEmail(data.guardian_email);
}

async function getPasswordChangeAlerts() {
    if (typeof db === 'undefined' || !db.passwordChangeAlerts?.getAll) return [];
    const { data } = await db.passwordChangeAlerts.getAll();
    return Array.isArray(data) ? data : [];
}

async function getContactMessages() {
    if (typeof db === 'undefined' || !db.contactMessages?.getAll) return [];
    const { data } = await db.contactMessages.getAll();
    return Array.isArray(data) ? data : [];
}

async function renderContactMessages() {
    const listEl = document.getElementById("contactMessagesList");
    if (!listEl) return;

    const messages = await getContactMessages();
    if (!messages.length) {
        listEl.innerHTML = `<div class="message-item">No messages yet.</div>`;
        return;
    }

    listEl.innerHTML = messages
        .map(msg => {
            const when = (msg.submitted_at || msg.createdAt)
                ? new Date(msg.submitted_at || msg.createdAt).toLocaleString()
                : "";
            return `
                <div class="message-item">
                    <div><strong>${msg.name || "Unknown"}</strong> (${msg.email || "No email"})</div>
                    <div>${msg.message || ""}</div>
                    <div class="message-time">${when}</div>
                </div>
            `;
        })
        .join("");
}

function mapProgramNameToLevelForDebug(programName) {
    const name = String(programName || "").toLowerCase();
    if (name.includes("beginner") || name.includes("basic")) return "beginner";
    if (name.includes("intermediate")) return "intermediate";
    if (name.includes("advanced")) return "advanced";
    if (name.includes("after school") || name.includes("tutorial")) return "afterschool";
    if (name.includes("religious")) return "religious";
    return null;
}

function collectBeginnerDebugRecords() {
    const rows = [];

    allApplicantsCache.forEach((row) => {
        const level = mapProgramNameToLevelForDebug(row.programChoice || row.program || row.gradeLevel);
        if (level !== "beginner") return;
        rows.push({
            key: `student-${row.id}`,
            type: "supabase",
            index: -1,
            sid: row.id,
            studentName: `${row.firstName || ""} ${row.lastName || ""}`.trim() || "(no name)",
            program: row.programChoice || row.program || row.gradeLevel || "",
            guardianEmail: row.guardianEmail || ""
        });
    });

    return rows;
}

function renderBeginnerDebugList() {
    const listEl = document.getElementById("beginnerDebugList");
    if (!listEl) return;

    const records = collectBeginnerDebugRecords();
    if (!records.length) {
        listEl.innerHTML = `<div class="debug-item">No Beginner records found.</div>`;
        return;
    }

    listEl.innerHTML = records.map((row, i) => `
        <div class="debug-item">
            <div><strong>${row.studentName}</strong> — ${row.program}</div>
            <div class="debug-item-meta">${row.guardianEmail || "No guardian email"}</div>
            <div class="debug-item-meta">Source: ${row.type} | Key: ${row.key}${row.sid ? ` | SID: ${row.sid}` : ""}</div>
            <button class="debug-remove-btn" data-debug-index="${i}">Remove This Record</button>
        </div>
    `).join("");

    listEl.querySelectorAll(".debug-remove-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const idx = parseInt(btn.dataset.debugIndex, 10);
            const target = records[idx];
            if (!target) return;
            if (!confirm(`Remove ${target.studentName} from Beginner records?`)) return;

            if (target.sid && typeof db !== 'undefined' && db.students?.delete) {
                await db.students.delete(target.sid);
            }
            await refreshApplicantsCache();
            renderNewApplicantsTable();
            renderAdmittedTable();
            renderBeginnerDebugList();
        });
    });
}

function getGuardianDirectory() {
    const byEmail = new Map();

    allApplicantsCache.forEach((row) => {
        const email = String(row.guardianEmail || "").trim().toLowerCase();
        if (!email) return;

        const existing = byEmail.get(email) || {
            email,
            name: ""
        };

        const incomingName = String(row.guardianName || "").trim();
        if (!existing.name && incomingName) existing.name = incomingName;
        byEmail.set(email, existing);
    });

    return Array.from(byEmail.values()).sort((a, b) => a.email.localeCompare(b.email));
}

function populateGuardianSelect(selectEl, placeholderLabel = "Select Guardian") {
    if (!selectEl) return;
    const options = getGuardianDirectory();
    selectEl.innerHTML = `<option value="">${placeholderLabel}</option>`;
    options.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.email;
        opt.textContent = item.name ? `${item.name} (${item.email})` : item.email;
        selectEl.appendChild(opt);
    });
}

function initAdminSupportPage() {
    const maintenanceToggle = document.getElementById("maintenanceModeToggle");
    const maintenanceStatus = document.getElementById("maintenanceModeStatus");

    const resetStudentTarget = document.getElementById("resetStudentTarget");
    const resetPassword = document.getElementById("resetPassword");
    const saveResetBtn = document.getElementById("saveCredentialReset");
    const clearResetBtn = document.getElementById("clearCredentialReset");
    const resetStatus = document.getElementById("resetCredentialStatus");
    const resetCurrentPasswordPreview = document.getElementById("resetCurrentPasswordPreview");
    const resetPasswordAlertInfo = document.getElementById("resetPasswordAlertInfo");

    const portalLinkField = document.getElementById("portalLinkField");
    const copyPortalLink = document.getElementById("copyPortalLink");
    const openPortalLink = document.getElementById("openPortalLink");
    const portalStatus = document.getElementById("portalLinkStatus");

    const refreshMessagesBtn = document.getElementById("refreshContactMessages");
    const clearMessagesBtn = document.getElementById("clearContactMessages");
    const refreshBeginnerDebugBtn = document.getElementById("refreshBeginnerDebug");

    const publishAssignmentForm = document.getElementById("publishAssignmentForm");
    const assignmentProgramLevel = document.getElementById("assignmentProgramLevel");
    const assignmentTargetEmail = document.getElementById("assignmentTargetEmail");
    const assignmentTitle = document.getElementById("assignmentTitle");
    const assignmentDueDate = document.getElementById("assignmentDueDate");
    const assignmentDownloadUrl = document.getElementById("assignmentDownloadUrl");
    const assignmentPublishStatus = document.getElementById("assignmentPublishStatus");

    const publishAnnouncementForm = document.getElementById("publishAnnouncementForm");
    const announcementProgramLevel = document.getElementById("announcementProgramLevel");
    const announcementTitle = document.getElementById("announcementTitle");
    const announcementMessage = document.getElementById("announcementMessage");
    const announcementPublishStatus = document.getElementById("announcementPublishStatus");

    const publishReminderForm = document.getElementById("publishReminderForm");
    const reminderGuardianPicker = document.getElementById("reminderGuardianPicker");
    const reminderSelectAllGuardians = document.getElementById("reminderSelectAllGuardians");
    const reminderClearGuardians = document.getElementById("reminderClearGuardians");
    const reminderTitle = document.getElementById("reminderTitle");
    const reminderDueDate = document.getElementById("reminderDueDate");
    const reminderMessage = document.getElementById("reminderMessage");
    const reminderAttachmentFile = document.getElementById("reminderAttachmentFile");
    const reminderPublishStatus = document.getElementById("reminderPublishStatus");

    const collectSelectedReminderGuardianEmails = () => {
        if (!reminderGuardianPicker) return [];
        return Array.from(reminderGuardianPicker.querySelectorAll('input[type="checkbox"][data-guardian-email]:checked'))
            .map((el) => String(el.getAttribute("data-guardian-email") || "").trim().toLowerCase())
            .filter(Boolean);
    };

    const renderReminderGuardianPicker = () => {
        if (!reminderGuardianPicker) return;
        const guardians = getGuardianDirectory();

        if (!guardians.length) {
            reminderGuardianPicker.innerHTML = '<div class="guardian-picker-empty">No guardians available yet.</div>';
            return;
        }

        reminderGuardianPicker.innerHTML = guardians.map((item, index) => {
            const safeEmail = String(item.email || "").trim().toLowerCase();
            const safeName = String(item.name || "").trim() || "(No Name)";
            const id = `reminderGuardian_${index}`;
            return `
                <label class="guardian-picker-row" for="${id}">
                    <input type="checkbox" id="${id}" data-guardian-email="${safeEmail}">
                    <span>${safeName}</span>
                    <span>${safeEmail}</span>
                </label>
            `;
        }).join("");
    };

    const syncMaintenanceStatus = () => {
        if (!maintenanceStatus || !maintenanceToggle) return;
        maintenanceStatus.textContent = maintenanceToggle.checked ? "Maintenance: ON" : "Maintenance: OFF";
    };

    const normalizeText = (value) => String(value || "").trim().toLowerCase();
    const normalizeId = (value) => String(value || "").trim();

    const getMapValueNormalized = (mapObj, wantedKey) => {
        const wanted = normalizeText(wantedKey);
        if (!wanted || !mapObj || typeof mapObj !== "object") return "";
        if (Object.prototype.hasOwnProperty.call(mapObj, wantedKey)) {
            return String(mapObj[wantedKey] || "");
        }
        const matchedKey = Object.keys(mapObj).find((k) => normalizeText(k) === wanted);
        return matchedKey ? String(mapObj[matchedKey] || "") : "";
    };

    const getCurrentStudentPassword = async (studentRow) => {
        if (!studentRow) return "—";
        const studentOverride = await getPasswordOverrideByStudentId(normalizeId(studentRow.id));
        if (studentOverride) return studentOverride;
        const emailOverride = await getPasswordOverrideByEmail(normalizeText(studentRow.guardianEmail));
        if (emailOverride) return emailOverride;
        return `daero${normalizeText(studentRow.firstName)}`;
    };

    const refreshResetCurrentPasswordPreview = async () => {
        if (!resetCurrentPasswordPreview) return;

        const selected = resolveSelectedStudent();
        if (!selected) {
            resetCurrentPasswordPreview.textContent = "Current password: —";
            return;
        }

        const displayName = `${selected.firstName} ${selected.lastName}`.trim() || selected.id;
        const email = selected.guardianEmail || "No email";
        const password = await getCurrentStudentPassword(selected);
        resetCurrentPasswordPreview.textContent = `Selected: ${displayName} (${email}) | Current password: ${password}`;
    };

    const notifyUnreadPasswordChangeAlerts = async () => {
        const alerts = await getPasswordChangeAlerts();
        if (!alerts.length) {
            if (resetPasswordAlertInfo) resetPasswordAlertInfo.textContent = "";
            return;
        }

        const latest = alerts[0] || {};
        const latestWhen = latest.changed_at ? new Date(latest.changed_at).toLocaleString() : "";
        if (resetPasswordAlertInfo) {
            resetPasswordAlertInfo.textContent = `Latest password change: Student ID ${latest.student_id || '?'}${latestWhen ? ` (${latestWhen})` : ""}. `;
        }

        const unseen = alerts.filter(row => !row.seen_at);
        if (!unseen.length) return;

        const lines = unseen.map((row) => {
            return `Student (${row.student_id || 'unknown'}) changed password!`;
        });

        alert(lines.join("\n"));
        if (typeof db !== 'undefined' && db.passwordChangeAlerts?.markAllSeen) {
            await db.passwordChangeAlerts.markAllSeen();
        }
    };

    const getResetStudents = () => {
        const rows = getAllApplicants();
        const seen = new Set();

        return rows
            .filter((row) => row && row.id && (row.firstName || row.lastName))
            .map((row) => ({
                id: String(row.id || "").trim(),
                firstName: String(row.firstName || "").trim(),
                lastName: String(row.lastName || "").trim(),
                guardianEmail: String(row.guardianEmail || "").trim().toLowerCase()
            }))
            .filter((row) => {
                if (!row.id) return false;
                if (seen.has(row.id)) return false;
                seen.add(row.id);
                return true;
            })
            .sort((a, b) => {
                const an = `${a.firstName} ${a.lastName}`.trim().toLowerCase();
                const bn = `${b.firstName} ${b.lastName}`.trim().toLowerCase();
                return an.localeCompare(bn) || a.id.localeCompare(b.id);
            });
    };

    const renderResetStudentTargets = () => {
        if (!resetStudentTarget) return;
        const rows = getResetStudents();

        resetStudentTarget.innerHTML = `
            <option value="">Select Student (Name / ID)</option>
        `;

        rows.forEach((row) => {
            const option = document.createElement("option");
            option.value = row.id;
            const name = `${row.firstName} ${row.lastName}`.trim() || "(No Name)";
            option.textContent = `${name} — ${row.id}${row.guardianEmail ? ` — ${row.guardianEmail}` : ""}`;
            resetStudentTarget.appendChild(option);
        });
    };

    const resolveSelectedStudent = () => {
        const studentId = String(resetStudentTarget?.value || "").trim();
        if (!studentId) return null;

        const rows = getResetStudents();
        return rows.find((row) => normalizeText(row.id) === normalizeText(studentId)) || null;
    };

    if (maintenanceToggle) {
        (async () => {
            if (typeof db !== 'undefined' && db.appSettings?.getMaintenanceMode) {
                const { data: maintenanceValue } = await db.appSettings.getMaintenanceMode();
                maintenanceToggle.checked = maintenanceValue === "on";
            } else {
                maintenanceToggle.checked = false;
            }
            syncMaintenanceStatus();
        })();
        maintenanceToggle.addEventListener("change", async () => {
            if (typeof db !== 'undefined' && db.appSettings?.setMaintenanceMode) {
                await db.appSettings.setMaintenanceMode(maintenanceToggle.checked, "AdminSupportToggle");
            }
            syncMaintenanceStatus();
        });
    }

    if (portalLinkField) {
        portalLinkField.value = `${window.location.origin}/member-portal.html`;
    }

    renderResetStudentTargets();
    refreshResetCurrentPasswordPreview();
    notifyUnreadPasswordChangeAlerts();

    resetStudentTarget?.addEventListener("change", async () => {
        await refreshResetCurrentPasswordPreview();
    });

    saveResetBtn?.addEventListener("click", async () => {
        const selected = resolveSelectedStudent();
        const newPass = (resetPassword?.value || "").trim();

        if (!selected || !newPass) {
            if (resetStatus) resetStatus.textContent = "Select a student and enter new password.";
            return;
        }

        await savePasswordOverrideByStudentId(selected.id, newPass.toLowerCase());

        if (resetStatus) {
            const displayName = `${selected.firstName} ${selected.lastName}`.trim() || selected.id;
            resetStatus.textContent = `Reset saved for ${displayName} (${selected.id}).`;
        }
        if (resetPassword) resetPassword.value = "";
        await refreshResetCurrentPasswordPreview();
    });

    clearResetBtn?.addEventListener("click", async () => {
        const selected = resolveSelectedStudent();
        if (!selected) {
            if (resetStatus) resetStatus.textContent = "Select a student to clear reset.";
            return;
        }

        await clearPasswordOverrideByStudentId(selected.id);

        if (resetStatus) {
            const displayName = `${selected.firstName} ${selected.lastName}`.trim() || selected.id;
            resetStatus.textContent = `Reset cleared for ${displayName} (${selected.id}).`;
        }
        await refreshResetCurrentPasswordPreview();
    });

    copyPortalLink?.addEventListener("click", async () => {
        if (!portalLinkField) return;
        try {
            await navigator.clipboard.writeText(portalLinkField.value);
            if (portalStatus) portalStatus.textContent = "Portal link copied.";
        } catch (e) {
            portalLinkField.select();
            document.execCommand("copy");
            if (portalStatus) portalStatus.textContent = "Portal link copied.";
        }
    });

    openPortalLink?.addEventListener("click", () => {
        window.open("member-portal.html", "_blank");
    });

    refreshMessagesBtn?.addEventListener("click", renderContactMessages);
    refreshBeginnerDebugBtn?.addEventListener("click", renderBeginnerDebugList);
    clearMessagesBtn?.addEventListener("click", async () => {
        if (!confirm("Clear all customer messages?")) return;
        if (typeof db !== "undefined" && db.contactMessages?.deleteAll) {
            await db.contactMessages.deleteAll();
        }
        renderContactMessages();
    });

    publishAssignmentForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const program = (assignmentProgramLevel?.value || "").trim().toLowerCase();
        const targetEmail = (assignmentTargetEmail?.value || "").trim().toLowerCase();
        const title = (assignmentTitle?.value || "").trim();
        const dueDate = (assignmentDueDate?.value || "").trim();
        const downloadUrl = (assignmentDownloadUrl?.value || "").trim();

        if (!program || !title || !dueDate) {
            if (assignmentPublishStatus) assignmentPublishStatus.textContent = "Program, title, and due date are required.";
            return;
        }

        const assignmentItem = {
            id: `asg_${Date.now()}`,
            title,
            dueDate,
            program,
            targetEmail,
            downloadUrl,
            postedAt: new Date().toISOString()
        };

        if (typeof db === "undefined" || !db.assignments?.publish) {
            if (assignmentPublishStatus) assignmentPublishStatus.textContent = "Supabase is not configured for assignments.";
            return;
        }

        const { error } = await db.assignments.publish(assignmentItem);
        if (error) {
            if (assignmentPublishStatus) assignmentPublishStatus.textContent = `Could not publish assignment: ${error.message}`;
            return;
        }

        if (assignmentPublishStatus) {
            assignmentPublishStatus.textContent = targetEmail
                ? `Assignment published for ${program} and ${targetEmail}.`
                : `Assignment published for ${program}.`;
        }

        publishAssignmentForm.reset();
    });

    publishAnnouncementForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const program = (announcementProgramLevel?.value || "").trim().toLowerCase();
        const title = (announcementTitle?.value || "").trim();
        const message = (announcementMessage?.value || "").trim();

        if (!program || !title || !message) {
            if (announcementPublishStatus) announcementPublishStatus.textContent = "Program, title, and message are required.";
            return;
        }

        if (typeof db === "undefined" || !db.announcements?.publish) {
            if (announcementPublishStatus) announcementPublishStatus.textContent = "Supabase is not configured for announcements.";
            return;
        }

        const { error } = await db.announcements.publish({
            id: `ann_${Date.now()}`,
            title,
            message,
            program,
            date: new Date().toISOString()
        });
        if (error) {
            if (announcementPublishStatus) announcementPublishStatus.textContent = `Could not publish announcement: ${error.message}`;
            return;
        }

        if (announcementPublishStatus) announcementPublishStatus.textContent = `Announcement published for ${program}.`;
        publishAnnouncementForm.reset();
    });

    reminderSelectAllGuardians?.addEventListener("click", () => {
        reminderGuardianPicker?.querySelectorAll('input[type="checkbox"][data-guardian-email]').forEach((el) => {
            el.checked = true;
        });
    });

    reminderClearGuardians?.addEventListener("click", () => {
        reminderGuardianPicker?.querySelectorAll('input[type="checkbox"][data-guardian-email]').forEach((el) => {
            el.checked = false;
        });
    });

    publishReminderForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const selectedEmails = collectSelectedReminderGuardianEmails();
        const title = (reminderTitle?.value || "").trim();
        const dueDate = (reminderDueDate?.value || "").trim();
        const message = (reminderMessage?.value || "").trim();
        const files = Array.from(reminderAttachmentFile?.files || []);

        if (!selectedEmails.length || !title || !dueDate || !message) {
            if (reminderPublishStatus) reminderPublishStatus.textContent = "Select at least one guardian, then enter title, due date, and message.";
            return;
        }

        const attachments = [];
        for (const file of files) {
            const dataUrl = await readFileAsDataUrlAdmin(file);
            attachments.push({
                id: `rem_file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                name: file.name,
                type: file.type,
                size: file.size,
                downloadUrl: dataUrl || "",
                legacyNoDownload: !dataUrl
            });
        }

        const postedAt = new Date().toISOString();
        if (typeof db === "undefined" || !db.reminders?.publish) {
            if (reminderPublishStatus) reminderPublishStatus.textContent = "Supabase is not configured for reminders.";
            return;
        }

        for (const email of selectedEmails) {
            const { error } = await db.reminders.publish({
                id: `rem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                guardianEmail: email,
                title,
                dueDate,
                message,
                postedAt,
                attachments
            });
            if (error) {
                if (reminderPublishStatus) reminderPublishStatus.textContent = `Could not publish reminder: ${error.message}`;
                return;
            }
        }

        if (reminderPublishStatus) {
            reminderPublishStatus.textContent = `Reminder published for ${selectedEmails.length} guardian${selectedEmails.length > 1 ? "s" : ""}${attachments.length ? ` with ${attachments.length} attachment${attachments.length > 1 ? "s" : ""}` : ""}.`;
        }
        publishReminderForm.reset();
        renderReminderGuardianPicker();
    });

    renderReminderGuardianPicker();

    renderContactMessages();
    if (window.__daeroContactMessagesAutoRefreshTimer) {
        clearInterval(window.__daeroContactMessagesAutoRefreshTimer);
    }
    window.__daeroContactMessagesAutoRefreshTimer = setInterval(() => {
        renderContactMessages();
    }, 10000);
    renderBeginnerDebugList();
}

function readFileAsDataUrlAdmin(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result || "");
        reader.onerror = () => resolve("");
        reader.readAsDataURL(file);
    });
}

function formatUploadSize(size) {
    const n = Number(size || 0);
    if (!n || n < 1024) return `${n || 0} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

async function renderUploadList(listId, storageKey) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;

    const category = db.mediaUploads.categoryFromKey(storageKey);
    const { data: rows, error } = await db.mediaUploads.getByCategory(category);
    if (error || !rows?.length) {
        listEl.innerHTML = `<div class="message-item">No files uploaded yet.</div>`;
        return;
    }

    listEl.innerHTML = [...rows]
        .reverse()
        .map((row) => {
            const href = row.file_url || row.file_data || "";
            const hasDownload = !!href;
            const when = row.uploaded_at ? new Date(row.uploaded_at).toLocaleString() : "";
            const downloadHtml = hasDownload
                ? `<a href="${href}" download="${row.file_name || "file"}" target="_blank" rel="noopener">Download</a>`
                : `<span class="legacy-file-badge" title="Stored as metadata only.">Legacy file</span>`;

            return `
                <div class="message-item">
                    <div><strong>${row.file_name || "Unnamed file"}</strong></div>
                    <div class="message-time">${when}</div>
                    <div class="support-actions">
                        ${downloadHtml}
                        <button class="glass-btn btn-primary delete-upload-item" data-row-id="${row.id}" data-file-url="${href}" data-list-id="${listId}" data-storage-key="${storageKey}">Delete</button>
                    </div>
                </div>
            `;
        })
        .join("");

    listEl.querySelectorAll(".delete-upload-item").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const rowId = btn.dataset.rowId;
            if (!rowId) return;
            if (btn.dataset.fileUrl && typeof db !== "undefined" && db.mediaUploads?.deleteFromStorageByUrl) {
                await db.mediaUploads.deleteFromStorageByUrl(btn.dataset.fileUrl);
            }
            await db.mediaUploads.delete(rowId);
            await renderUploadList(btn.dataset.listId, btn.dataset.storageKey);
        });
    });
}

function initUploadInput(inputId, listId, storageKey) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const category = db.mediaUploads.categoryFromKey(storageKey);
    const listEl = document.getElementById(listId);

    const setInlineStatus = (message) => {
        if (!listEl || !message) return;
        listEl.innerHTML = `<div class="message-item">${message}</div>`;
    };

    input.addEventListener("change", async () => {
        const files = Array.from(input.files || []);
        if (!files.length) return;

        let successCount = 0;
        const failedMessages = [];
        setInlineStatus(`Uploading ${files.length} file(s)...`);

        for (const file of files) {
            const isVideo = String(file.type || "").toLowerCase().startsWith("video/");
            const limitBytes = getConfiguredUploadLimitBytes();
            let error = null;

            // Pre-check: reject anything over the Storage limit before touching the network
            if (Number(file.size || 0) > limitBytes) {
                failedMessages.push(
                    `${file.name} is ${formatUploadSize(file.size)} — the maximum file size allowed is ${formatUploadSize(limitBytes)}. ` +
                    `Please reduce the file size or upgrade the Supabase plan to raise the Storage limit.`
                );
                continue;
            }

            // All files (images and videos) go to Supabase Storage — never base64 in the database
            let uploadRes;
            if (isVideo) {
                uploadRes = await uploadMediaWithTus(category, file, (percent) => {
                    setInlineStatus(`Uploading ${file.name}… ${percent}%`);
                });
            } else {
                setInlineStatus(`Uploading ${file.name}…`);
                uploadRes = await db.mediaUploads.uploadToStorage(category, file);
            }

            if (uploadRes.error) {
                error = isVideo ? normalizeVideoUploadError(uploadRes.error, file) : uploadRes.error;
            } else {
                const saveRes = await db.mediaUploads.add(category, {
                    name: file.name,
                    type: file.type,
                    url: uploadRes.data?.publicUrl || ""
                });
                error = saveRes.error;
                if (error && uploadRes.data?.publicUrl && db.mediaUploads?.deleteFromStorageByUrl) {
                    await db.mediaUploads.deleteFromStorageByUrl(uploadRes.data.publicUrl);
                }
            }

            if (error) {
                const errMsg = String(error.message || "Unknown error.");
                failedMessages.push(`Upload failed for ${file.name}: ${errMsg}`);
                continue;
            }

            successCount += 1;
        }

        if (successCount > 0) {
            await renderUploadList(listId, storageKey);
        }

        if (failedMessages.length > 0 && successCount === 0) {
            setInlineStatus(failedMessages.join("<br>"));
        } else if (failedMessages.length > 0) {
            alert(failedMessages.join("\n"));
        }

        input.value = "";
    });

    renderUploadList(listId, storageKey);
}

function initClearUploadButton(buttonId, listId, storageKey, label) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;

    const category = db.mediaUploads.categoryFromKey(storageKey);

    btn.addEventListener("click", async () => {
        if (!confirm(`Clear all uploaded files for ${label}?`)) return;
        const { data: rows } = await db.mediaUploads.getByCategory(category);
        for (const row of rows || []) {
            if (row?.file_url && typeof db !== "undefined" && db.mediaUploads?.deleteFromStorageByUrl) {
                await db.mediaUploads.deleteFromStorageByUrl(row.file_url);
            }
        }
        await db.mediaUploads.clearCategory(category);
        await renderUploadList(listId, storageKey);
    });
}

function initClearAllPostsUploadsButton() {
    const btn = document.getElementById("clearAllPostsUploads");
    if (!btn || btn.dataset.bound === "1") return;
    btn.dataset.bound = "1";

    const uploadPanels = [
        { listId: "uploadIndexLatestList", storageKey: "adminUploadsIndexLatestSlides" },
        { listId: "uploadIndexTraditionalList", storageKey: "adminUploadsIndexTraditionalSlides" },
        { listId: "uploadIndexGraduationVideosList", storageKey: "adminUploadsIndexGraduationVideos" },
        { listId: "uploadIndexTribesList", storageKey: "adminUploadsIndexTribesSlides" },
        { listId: "uploadMemberSlidesList", storageKey: "adminUploadsMemberLoginSlides" },
        { listId: "uploadRegisterSlidesList", storageKey: "adminUploadsRegisterSlides" },
        { listId: "uploadIndexGraduationFigureList", storageKey: "adminUploadsIndexGraduationFigure" }
    ];

    btn.addEventListener("click", async () => {
        const ok = confirm(
            "This will delete all uploaded files from Storage that are tracked by media_uploads and clear all rows in media_uploads. Continue?"
        );
        if (!ok) return;

        btn.disabled = true;
        const originalText = btn.textContent;
        btn.textContent = "Clearing...";

        try {
            const { data: rows, error: getError } = await db.mediaUploads.getAll();
            if (getError) {
                alert(`Could not read uploaded files: ${getError.message}`);
                return;
            }

            let storageDeleteFailures = 0;
            for (const row of rows || []) {
                const fileUrl = String(row?.file_url || "").trim();
                if (!fileUrl || !db.mediaUploads?.deleteFromStorageByUrl) continue;
                const res = await db.mediaUploads.deleteFromStorageByUrl(fileUrl);
                if (res?.error) storageDeleteFailures += 1;
            }

            const { error: clearError } = await db.mediaUploads.clearAll();
            if (clearError) {
                alert(`Could not clear media_uploads table: ${clearError.message}`);
                return;
            }

            await Promise.all(uploadPanels.map((panel) => renderUploadList(panel.listId, panel.storageKey)));
            await Promise.all((PROGRAM_RESOURCE_LEVELS || []).map((level) => renderProgramResourceList(level)));

            const totalRows = Array.isArray(rows) ? rows.length : 0;
            const failureNote = storageDeleteFailures > 0
                ? ` (${storageDeleteFailures} storage object(s) could not be removed automatically.)`
                : "";
            alert(`Cleared ${totalRows} media record(s) from media_uploads.${failureNote}`);
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    });
}

function initSidebarUploadSystems() {
    initUploadInput("uploadIndexLatestInput", "uploadIndexLatestList", "adminUploadsIndexLatestSlides");
    initUploadInput("uploadIndexTraditionalInput", "uploadIndexTraditionalList", "adminUploadsIndexTraditionalSlides");
    initUploadInput("uploadIndexGraduationVideosInput", "uploadIndexGraduationVideosList", "adminUploadsIndexGraduationVideos");
    initUploadInput("uploadIndexTribesInput", "uploadIndexTribesList", "adminUploadsIndexTribesSlides");
    initUploadInput("uploadMemberSlidesInput", "uploadMemberSlidesList", "adminUploadsMemberLoginSlides");
    initUploadInput("uploadRegisterSlidesInput", "uploadRegisterSlidesList", "adminUploadsRegisterSlides");
    initUploadInput("uploadIndexGraduationFigureInput", "uploadIndexGraduationFigureList", "adminUploadsIndexGraduationFigure");

    initClearUploadButton("clearUploadIndexLatest", "uploadIndexLatestList", "adminUploadsIndexLatestSlides", "Uploading Latest posts");
    initClearUploadButton("clearUploadIndexTraditional", "uploadIndexTraditionalList", "adminUploadsIndexTraditionalSlides", "Uploading Traditional Practices");
    initClearUploadButton("clearUploadIndexGraduationVideos", "uploadIndexGraduationVideosList", "adminUploadsIndexGraduationVideos", "Uploading Graduations and Class Events");
    initClearUploadButton("clearUploadIndexTribes", "uploadIndexTribesList", "adminUploadsIndexTribesSlides", "Uploading Tribes & Their Practices");
    initClearUploadButton("clearUploadMemberSlides", "uploadMemberSlidesList", "adminUploadsMemberLoginSlides", "Uploading Member login Page slides");
    initClearUploadButton("clearUploadRegisterSlides", "uploadRegisterSlidesList", "adminUploadsRegisterSlides", "Uploading Registration page slides");
    initClearUploadButton("clearUploadIndexGraduationFigure", "uploadIndexGraduationFigureList", "adminUploadsIndexGraduationFigure", "Uploading Graduation Figure");

    initClearAllPostsUploadsButton();

    initLessonPlanDocumentUploader();
}

const PROGRAM_RESOURCE_LEVELS = ["beginner", "intermediate", "advanced", "afterschool", "religious"];

function getProgramResourceCategory(level) {
    return `program-resources-${String(level || "").trim().toLowerCase()}`;
}

async function renderProgramResourceList(level) {
    const safeLevel = String(level || "").trim().toLowerCase();
    const listEl = document.getElementById(`resources-${safeLevel}`);
    if (!listEl) return;

    const category = getProgramResourceCategory(safeLevel);
    const { data: rows, error } = await db.mediaUploads.getByCategory(category);

    if (error || !rows?.length) {
        listEl.innerHTML = `<div class="message-item">No resources uploaded yet.</div>`;
        return;
    }

    listEl.innerHTML = [...rows]
        .reverse()
        .map((row) => {
            const href = row.file_url || row.file_data || "";
            const hasDownload = !!href;
            const when = row.uploaded_at ? new Date(row.uploaded_at).toLocaleString() : "";
            const downloadHtml = hasDownload
                ? `<a href="${href}" download="${row.file_name || "resource"}" target="_blank" rel="noopener">Download</a>`
                : `<span class="legacy-file-badge" title="Stored as metadata only.">Legacy file</span>`;

            return `
                <div class="message-item">
                    <div><strong>${row.file_name || "Unnamed file"}</strong> (${formatUploadSize(row.file_size || 0)})</div>
                    <div class="message-time">${when}</div>
                    <div class="support-actions">
                        ${downloadHtml}
                        <button class="glass-btn btn-primary delete-program-resource" data-row-id="${row.id}" data-level="${safeLevel}">Delete</button>
                    </div>
                </div>
            `;
        })
        .join("");

    listEl.querySelectorAll(".delete-program-resource").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const rowId = btn.dataset.rowId;
            const rowLevel = btn.dataset.level;
            if (!rowId || !rowLevel) return;
            await db.mediaUploads.delete(rowId);
            await renderProgramResourceList(rowLevel);
        });
    });
}

function initProgramResourceUploadSystems() {
    const uploadButtons = document.querySelectorAll(".upload-btn[data-level]");
    const fileInputs = document.querySelectorAll(".file-input[data-level]");

    uploadButtons.forEach((btn) => {
        if (btn.dataset.bound === "1") return;
        btn.dataset.bound = "1";

        btn.addEventListener("click", () => {
            const level = String(btn.getAttribute("data-level") || "").trim().toLowerCase();
            if (!level) return;
            const input = document.querySelector(`.file-input[data-level="${level}"]`);
            input?.click();
        });
    });

    fileInputs.forEach((input) => {
        if (input.dataset.bound === "1") return;
        input.dataset.bound = "1";

        input.addEventListener("change", async () => {
            const level = String(input.getAttribute("data-level") || "").trim().toLowerCase();
            if (!level) return;

            const files = Array.from(input.files || []);
            if (!files.length) return;

            const category = getProgramResourceCategory(level);
            for (const file of files) {
                const dataUrl = await readFileAsDataUrlAdmin(file);
                await db.mediaUploads.add(category, {
                    name: file.name,
                    type: file.type,
                    dataUrl
                });
            }

            input.value = "";
            await renderProgramResourceList(level);
        });
    });

    PROGRAM_RESOURCE_LEVELS.forEach((level) => {
        renderProgramResourceList(level);
    });
}


const TEACHERS_TASK_LEVELS = ["Basic Class", "Intermediate", "Advanced", "Cultural"];
const TEACHERS_TASK_ATTENDANCE_SLOTS = [
    "week1Wed", "week1Sat",
    "week2Wed", "week2Sat",
    "week3Wed", "week3Sat",
    "week4Wed", "week4Sat"
];

let lessonPlanDocsCache = [];

async function refreshLessonPlanDocs() {
    const { data } = await db.lessonPlanDocs.getAll();
    lessonPlanDocsCache = data || [];
}

function refreshCurrentLessonPlanPanel() {
    const levelSelect = document.getElementById("lessonPlanClassSelect");
    if (!levelSelect) return;
    const selected = TEACHERS_TASK_LEVELS.includes(levelSelect.value) ? levelSelect.value : "Basic Class";
    renderTeachersTaskLessonPlan(selected);
}

async function renderLessonDocumentUploadList() {
    const listEl = document.getElementById("lessonDocsUploadList");
    if (!listEl) return;

    await refreshLessonPlanDocs();
    const docs = lessonPlanDocsCache;

    if (!docs.length) {
        listEl.innerHTML = `<div class="message-item">No lesson documents uploaded yet.</div>`;
        return;
    }

    listEl.innerHTML = [...docs].map((row) => {
        const when = row.uploaded_at ? new Date(row.uploaded_at).toLocaleString() : "";
        const href = row.file_url || row.file_data || "";
        const hasDownload = !!href;
        return `
            <div class="message-item">
                <div><strong>${row.file_name || "Unnamed file"}</strong> (${formatUploadSize(row.file_size || 0)})</div>
                <div>${row.class_level || ""} / ${row.week || ""} / ${row.day || ""}</div>
                <div class="message-time">${when}</div>
                <div class="support-actions">
                    ${hasDownload ? `<a href="${href}" download="${row.file_name || "file"}" target="_blank" rel="noopener">Download</a>` : `<span class="legacy-file-badge">Legacy file</span>`}
                    <button class="glass-btn btn-primary lesson-doc-delete" data-doc-id="${row.id}">Delete</button>
                </div>
            </div>
        `;
    }).join("");

    listEl.querySelectorAll(".lesson-doc-delete").forEach(btn => {
        btn.addEventListener("click", async () => {
            const docId = btn.dataset.docId;
            if (!docId) return;
            await db.lessonPlanDocs.delete(docId);
            await renderLessonDocumentUploadList();
            refreshCurrentLessonPlanPanel();
        });
    });
}

function getLessonDocumentsBySlot(program, week, day) {
    const p = String(program || "").trim().toLowerCase();
    const w = String(week || "").trim().toLowerCase();
    const d = String(day || "").trim().toLowerCase();
    return lessonPlanDocsCache.filter(row =>
        String(row.class_level || "").trim().toLowerCase() === p &&
        String(row.week || "").trim().toLowerCase() === w &&
        String(row.day || "").trim().toLowerCase() === d
    );
}

function fillLessonWeekDownloadIcons(weekCard, level, weekKey) {
    const days = ["Wednesday", "Saturday"];
    days.forEach(day => {
        const host = weekCard.querySelector(`[data-doc-host="${day}"]`);
        if (!host) return;

        const docs = getLessonDocumentsBySlot(level, weekKey, day);
        host.innerHTML = docs
            .map(doc => {
                const href = doc.file_url || doc.file_data || "";
                if (!href) return "";
                const safeName = doc.file_name || "document";
                return `<a class="lesson-doc-icon-link" href="${href}" download="${safeName}" target="_blank" rel="noopener" title="${safeName}">⭳</a>`;
            })
            .join("");
    });
}

function initLessonPlanDocumentUploader() {
    const programSelect = document.getElementById("lessonDocsProgramSelect");
    const weekSelect = document.getElementById("lessonDocsWeekSelect");
    const daySelect = document.getElementById("lessonDocsDaySelect");
    const fileInput = document.getElementById("lessonDocsFileInput");
    const uploadBtn = document.getElementById("lessonDocsUploadBtn");
    const clearBtn = document.getElementById("clearLessonDocsBtn");
    const statusEl = document.getElementById("lessonDocsUploadStatus");

    if (!programSelect || !weekSelect || !daySelect || !fileInput || !uploadBtn || !clearBtn) return;

    renderLessonDocumentUploadList();

    uploadBtn.addEventListener("click", async () => {
        const program = programSelect.value;
        const week = weekSelect.value;
        const day = daySelect.value;
        const files = Array.from(fileInput.files || []);

        if (!program || !week || !day) {
            if (statusEl) statusEl.textContent = "Please select class, week, and day.";
            return;
        }
        if (!files.length) {
            if (statusEl) statusEl.textContent = "Please choose at least one file.";
            return;
        }

        for (const file of files) {
            const dataUrl = await readFileAsDataUrlAdmin(file);
            await db.lessonPlanDocs.add({
                id: `lpd_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                program,
                week,
                day,
                name: file.name,
                type: file.type,
                size: file.size,
                dataUrl
            });
        }

        fileInput.value = "";
        await renderLessonDocumentUploadList();
        refreshCurrentLessonPlanPanel();
        if (statusEl) statusEl.textContent = "Lesson document uploaded.";
    });

    clearBtn.addEventListener("click", async () => {
        if (!confirm("Clear all uploaded lesson documents?")) return;
        await db.lessonPlanDocs.clearAll();
        await renderLessonDocumentUploadList();
        refreshCurrentLessonPlanPanel();
        if (statusEl) statusEl.textContent = "All lesson documents cleared.";
    });
}

function getDefaultLessonList(isSaturday = false) {
    return [
        "- Lesson topic",
        "- Reading & Writing practice",
        isSaturday ? "- Next week topic" : "- Q&A session",
        "- Additional assignment"
    ].join("\n");
}

function getDefaultLessonPlanData() {
    const data = {};
    TEACHERS_TASK_LEVELS.forEach(level => {
        data[level] = {};
        for (let week = 1; week <= 11; week += 1) {
            data[level][`Week-${week}`] = {
                Wednesday: getDefaultLessonList(false),
                Saturday: getDefaultLessonList(true)
            };
        }
    });
    return data;
}

let lessonPlanCache = {};

async function loadLessonPlanForLevel(level) {
    const { data } = await db.lessonPlans.getByClass(level);
    const defaults = getDefaultLessonPlanData()[level] || {};
    const plansByWeek = {};

    (data || []).forEach(row => {
        const weekKey = `Week-${row.week_number}`;
        if (!plansByWeek[weekKey]) plansByWeek[weekKey] = { ...defaults[weekKey] };
        plansByWeek[weekKey][row.day] = row.content || "";
    });

    for (let week = 1; week <= 11; week += 1) {
        const weekKey = `Week-${week}`;
        if (!plansByWeek[weekKey]) {
            plansByWeek[weekKey] = defaults[weekKey] || {
                Wednesday: getDefaultLessonList(false),
                Saturday: getDefaultLessonList(true)
            };
        }
    }

    lessonPlanCache[level] = plansByWeek;
}

function createLessonWeekCard(level, weekNumber, plansByWeek) {
    const weekKey = `Week-${weekNumber}`;
    const weekPayload = plansByWeek?.[weekKey] || {
        Wednesday: getDefaultLessonList(false),
        Saturday: getDefaultLessonList(true)
    };

    const weekCard = document.createElement("article");
    weekCard.className = "lesson-week-card";
    weekCard.dataset.level = level;
    weekCard.dataset.week = weekKey;

    weekCard.innerHTML = `
        <div class="lesson-week-title">${weekKey}</div>
        <div class="lesson-week-days">
            <div class="lesson-day-column lesson-day-wednesday">
                <div class="lesson-day-header-row">
                    <h4>Wednesday</h4>
                    <div class="lesson-day-doc-host" data-doc-host="Wednesday"></div>
                </div>
                <textarea class="lesson-day-editor" data-day="Wednesday" readonly>${weekPayload.Wednesday}</textarea>
            </div>
            <div class="lesson-day-column lesson-day-saturday">
                <div class="lesson-day-header-row">
                    <h4>Saturday</h4>
                    <div class="lesson-day-doc-host" data-doc-host="Saturday"></div>
                </div>
                <textarea class="lesson-day-editor" data-day="Saturday" readonly>${weekPayload.Saturday}</textarea>
            </div>
        </div>
        <div class="lesson-week-actions">
            <button type="button" class="glass-btn btn-secondary lesson-edit-btn">Edit</button>
            <button type="button" class="glass-btn btn-primary lesson-save-btn" disabled>Save</button>
        </div>
    `;

    const editBtn = weekCard.querySelector(".lesson-edit-btn");
    const saveBtn = weekCard.querySelector(".lesson-save-btn");
    const editors = Array.from(weekCard.querySelectorAll(".lesson-day-editor"));

    if (editBtn && saveBtn && editors.length) {
        editBtn.addEventListener("click", () => {
            editors.forEach(editor => editor.removeAttribute("readonly"));
            saveBtn.disabled = false;
            editBtn.disabled = true;
            editors[0].focus();
        });

        saveBtn.addEventListener("click", async () => {
            const wedContent = editors.find(e => e.dataset.day === "Wednesday")?.value || "";
            const satContent = editors.find(e => e.dataset.day === "Saturday")?.value || "";
            await db.lessonPlans.save(level, weekNumber, "Wednesday", wedContent);
            await db.lessonPlans.save(level, weekNumber, "Saturday", satContent);

            editors.forEach(editor => editor.setAttribute("readonly", "readonly"));
            saveBtn.disabled = true;
            editBtn.disabled = false;
        });
    }

    fillLessonWeekDownloadIcons(weekCard, level, weekKey);

    return weekCard;
}

async function renderTeachersTaskLessonPlan(level) {
    const container = document.getElementById("lessonPlanWeeksContainer");
    if (!container) return;

    await loadLessonPlanForLevel(level);
    const plansByWeek = lessonPlanCache[level] || {};
    container.innerHTML = "";

    for (let week = 1; week <= 11; week += 1) {
        container.appendChild(createLessonWeekCard(level, week, plansByWeek));
    }
}

function normalizeTeachersProgramLabel(programName) {
    const value = String(programName || "").trim().toLowerCase();
    if (value.includes("basic") || value.includes("beginner")) return "Basic Class";
    if (value.includes("intermediate")) return "Intermediate";
    if (value.includes("advanced")) return "Advanced";
    if (value.includes("after school") || value.includes("tutorial")) return "After School Tutorial";
    if (value.includes("religious")) return "Religious Study";
    return "";
}

function getTeachersTaskStudentsByProgram(programLabel) {
    const normalizedRequested = String(programLabel || "").trim().toLowerCase();
    const showAllClasses = normalizedRequested === "all class list";
    const target = normalizeTeachersProgramLabel(programLabel);
    const admittedRows = getAllApplicants().filter(row => String(row.status || "").toLowerCase() === "admitted");

    return admittedRows
        .filter(row => {
            if (showAllClasses) return true;
            return normalizeTeachersProgramLabel(row.gradeLevel || row.programChoice || row.program) === target;
        })
        .sort((a, b) => {
            if (showAllClasses) {
                const programA = normalizeTeachersProgramLabel(a.gradeLevel || a.programChoice || a.program);
                const programB = normalizeTeachersProgramLabel(b.gradeLevel || b.programChoice || b.program);
                const compareProgram = String(programA).localeCompare(String(programB));
                if (compareProgram !== 0) return compareProgram;
            }
            const fullA = `${a.firstName || ""} ${a.lastName || ""}`.trim().toLowerCase();
            const fullB = `${b.firstName || ""} ${b.lastName || ""}`.trim().toLowerCase();
            return fullA.localeCompare(fullB);
        })
        .map((row, index) => ({
            serial: index + 1,
            studentId: String(row.id || ""),
            guardianName: String(row.guardianName || "").trim(),
            guardianEmail: String(row.guardianEmail || "").trim().toLowerCase(),
            guardianKey: (() => {
                const email = String(row.guardianEmail || "").trim().toLowerCase();
                const name = String(row.guardianName || "").trim().toLowerCase();
                return email || `name:${name}`;
            })(),
            studentName: (() => {
                const base = `${row.firstName || ""} ${row.lastName || ""}`.trim() || "Unnamed Student";
                if (!showAllClasses) return base;
                const cls = normalizeTeachersProgramLabel(row.gradeLevel || row.programChoice || row.program) || "Unassigned";
                return `${base} (${cls})`;
            })()
        }));
}

// Map camelCase slot key to Supabase column name
function slotToColumn(slotKey) {
    const map = {
        week1Wed: "week1_wed", week1Sat: "week1_sat",
        week2Wed: "week2_wed", week2Sat: "week2_sat",
        week3Wed: "week3_wed", week3Sat: "week3_sat",
        week4Wed: "week4_wed", week4Sat: "week4_sat"
    };
    return map[slotKey] || slotKey;
}

function getAttendanceMark(rows, studentId, slotKey) {
    const col = slotToColumn(slotKey);
    const found = rows.find(r => String(r.student_id || "") === String(studentId));
    return !!(found?.[col]);
}

function buildAttendancePeriod(monthLabel, yearLabel) {
    const month = String(monthLabel || "").trim();
    const year = String(yearLabel || "").trim();
    return year ? `${month} ${year}` : month;
}

function populateAttendanceGuardianSelect(programLabel, selectedKey = "") {
    const guardianSelect = document.getElementById("attendanceGuardianSelect");
    if (!guardianSelect) return "";

    const rows = getTeachersTaskStudentsByProgram(programLabel);
    const unique = new Map();
    rows.forEach((row) => {
        const key = String(row.guardianKey || "").trim().toLowerCase();
        if (!key || unique.has(key)) return;
        unique.set(key, {
            key,
            name: row.guardianName || "Unknown Guardian",
            email: row.guardianEmail || ""
        });
    });

    const options = Array.from(unique.values()).sort((a, b) => {
        const nameCmp = String(a.name).localeCompare(String(b.name));
        if (nameCmp !== 0) return nameCmp;
        return String(a.email).localeCompare(String(b.email));
    });

    guardianSelect.innerHTML = `<option value="">All guardians</option>`;
    options.forEach((item) => {
        const opt = document.createElement("option");
        opt.value = item.key;
        opt.textContent = item.name;
        guardianSelect.appendChild(opt);
    });

    const normalizedSelected = String(selectedKey || "").trim().toLowerCase();
    if (normalizedSelected && options.some((item) => item.key === normalizedSelected)) {
        guardianSelect.value = normalizedSelected;
    } else {
        guardianSelect.value = "";
    }

    return guardianSelect.value;
}

async function renderTeachersAttendanceTable(programLabel, monthLabel, yearLabel, guardianKey = "") {
    const wrap = document.getElementById("attendanceSheetWrap");
    if (!wrap) return;

    const allRows = getTeachersTaskStudentsByProgram(programLabel);
    const targetGuardian = String(guardianKey || "").trim().toLowerCase();
    const rows = targetGuardian
        ? allRows.filter((row) => String(row.guardianKey || "").trim().toLowerCase() === targetGuardian)
        : allRows;

    if (!rows.length) {
        const guardianSuffix = targetGuardian ? " for selected guardian" : "";
        wrap.innerHTML = `<div class="attendance-empty">No admitted students found in ${programLabel}${guardianSuffix}.</div>`;
        return;
    }

    const periodLabel = buildAttendancePeriod(monthLabel, yearLabel);
    let { data: attendanceRows } = await db.attendance.getByClassMonth(programLabel, periodLabel);

    // Backward compatibility: legacy rows may still use month-only keys.
    if ((!attendanceRows || !attendanceRows.length) && periodLabel !== monthLabel) {
        const legacy = await db.attendance.getByClassMonth(programLabel, monthLabel);
        attendanceRows = legacy?.data || [];
    }

    const bodyRows = rows.map(row => {
        const cells = TEACHERS_TASK_ATTENDANCE_SLOTS.map(slot => {
            const checked = getAttendanceMark(attendanceRows || [], row.studentId, slot);
            return `
                <td class="attendance-mark-cell">
                    <input
                        type="checkbox"
                        class="attendance-mark"
                        data-student-id="${row.studentId}"
                        data-student-name="${row.studentName}"
                        data-slot="${slot}"
                        ${checked ? "checked" : ""}
                        disabled
                    >
                </td>
            `;
        }).join("");

        return `
            <tr>
                <td class="attendance-serial">${row.serial}</td>
                <td class="attendance-name">${row.studentName}</td>
                ${cells}
            </tr>
        `;
    }).join("");

    wrap.innerHTML = `
        <div id="attendancePrintableArea" class="attendance-sheet">
            <table class="attendance-table">
                <thead>
                    <tr>
                        <th colspan="2" class="attendance-left-title">${programLabel}</th>
                        <th colspan="8" class="attendance-main-title">Students Attendance For The Month ${periodLabel}</th>
                    </tr>
                    <tr>
                        <th rowspan="2" class="attendance-col-sn">No</th>
                        <th rowspan="2" class="attendance-col-student">Student Name</th>
                        <th colspan="2">WEEK-1</th>
                        <th colspan="2">WEEK-2</th>
                        <th colspan="2">WEEK-3</th>
                        <th colspan="2">WEEK-4</th>
                    </tr>
                    <tr>
                        <th>WED</th><th>SAT</th>
                        <th>WED</th><th>SAT</th>
                        <th>WED</th><th>SAT</th>
                        <th>WED</th><th>SAT</th>
                    </tr>
                </thead>
                <tbody>
                    ${bodyRows}
                </tbody>
            </table>
        </div>
    `;
}

function setAttendanceEditMode(isEditing) {
    const saveBtn = document.getElementById("attendanceSaveBtn");
    const editBtn = document.getElementById("attendanceEditBtn");
    document.querySelectorAll("#attendanceSheetWrap .attendance-mark").forEach(control => {
        control.disabled = !isEditing;
    });
    if (saveBtn) saveBtn.disabled = !isEditing;
    if (editBtn) editBtn.disabled = isEditing;
}

async function saveAttendanceFromSheet(programLabel, monthLabel, yearLabel) {
    const marks = document.querySelectorAll("#attendanceSheetWrap .attendance-mark");
    const byStudent = {};
    const periodLabel = buildAttendancePeriod(monthLabel, yearLabel);

    marks.forEach(mark => {
        const studentId = mark.dataset.studentId || "";
        const studentName = mark.dataset.studentName || "";
        const slot = mark.dataset.slot || "";
        if (!studentId || !slot) return;
        if (!byStudent[studentId]) byStudent[studentId] = { studentId, studentName, slots: {} };
        byStudent[studentId].slots[slot] = mark.checked ? "P" : "";
    });

    for (const entry of Object.values(byStudent)) {
        const { error } = await db.attendance.saveRow(
            programLabel,
            periodLabel,
            entry.studentId,
            entry.studentName,
            entry.slots
        );
        if (error) {
            throw error;
        }
    }
    return true;
}

function printAttendanceSheet() {
    const printable = document.getElementById("attendancePrintableArea");
    if (!printable) return;

    const printWin = window.open("", "_blank", "width=1200,height=850");
    if (!printWin) {
        alert("Please allow popups to print attendance.");
        return;
    }

    printWin.document.write(`
        <!doctype html>
        <html>
        <head>
            <title>Student Attendance</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 14px; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1.5px solid #000; padding: 4px; font-size: 14px; }
                .attendance-main-title, .attendance-left-title { font-size: 26px; font-weight: 900; }
                .attendance-left-title { text-align: left; }
                .attendance-main-title { text-align: center; }
                .attendance-name { text-align: left; font-weight: 700; }
                .attendance-serial, .attendance-mark-cell { text-align: center; }
                input[type=checkbox] { width: 17px; height: 17px; accent-color: #1b67b0; }
            </style>
        </head>
        <body>${printable.outerHTML}</body>
        </html>
    `);
    printWin.document.close();
    printWin.focus();
    printWin.print();
}

function initTeachersTaskAttendancePanel() {
    const programSelect = document.getElementById("attendanceProgramSelect");
    const yearSelect = document.getElementById("attendanceYearSelect");
    const monthSelect = document.getElementById("attendanceMonthSelect");
    const guardianSelect = document.getElementById("attendanceGuardianSelect");
    const editBtn = document.getElementById("attendanceEditBtn");
    const saveBtn = document.getElementById("attendanceSaveBtn");
    const printBtn = document.getElementById("attendancePrintBtn");
    const status = document.getElementById("attendanceStatus");

    if (!programSelect || !yearSelect || !monthSelect || !guardianSelect || !editBtn || !saveBtn || !printBtn) return;

    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = "";
    for (let year = currentYear - 2; year <= currentYear + 5; year += 1) {
        const opt = document.createElement("option");
        opt.value = String(year);
        opt.textContent = String(year);
        if (year === currentYear) opt.selected = true;
        yearSelect.appendChild(opt);
    }

    const rerender = async () => {
        const selectedGuardian = populateAttendanceGuardianSelect(programSelect.value, guardianSelect.value);
        await renderTeachersAttendanceTable(
            programSelect.value,
            monthSelect.value,
            yearSelect.value,
            selectedGuardian
        );
        setAttendanceEditMode(false);
        if (status) status.textContent = "";
    };

    rerender();

    programSelect.addEventListener("change", rerender);
    yearSelect.addEventListener("change", rerender);
    monthSelect.addEventListener("change", rerender);
    guardianSelect.addEventListener("change", rerender);

    editBtn.addEventListener("click", () => {
        setAttendanceEditMode(true);
        if (status) status.textContent = "Editing attendance...";
    });

    saveBtn.addEventListener("click", async () => {
        try {
            await saveAttendanceFromSheet(programSelect.value, monthSelect.value, yearSelect.value);
            setAttendanceEditMode(false);
            if (status) status.textContent = "Attendance saved.";
        } catch (error) {
            if (status) status.textContent = `Failed to save attendance: ${error.message || error}`;
        }
    });

    printBtn.addEventListener("click", () => {
        printAttendanceSheet();
    });
}

function initTeachersTaskPage() {
    const levelSelect = document.getElementById("lessonPlanClassSelect");
    const lessonContainer = document.getElementById("lessonPlanWeeksContainer");
    if (!levelSelect || !lessonContainer) return;

    if (!TEACHERS_TASK_LEVELS.includes(levelSelect.value)) {
        levelSelect.value = "Basic Class";
    }

    renderTeachersTaskLessonPlan(levelSelect.value);

    levelSelect.addEventListener("change", () => {
        const selected = TEACHERS_TASK_LEVELS.includes(levelSelect.value)
            ? levelSelect.value
            : "Basic Class";
        renderTeachersTaskLessonPlan(selected);
    });

    initTeachersTaskAttendancePanel();
}

async function initPriceSettingsPage() {
    const priceStatus = document.getElementById("priceSettingsStatus");
    const specialOfferForm = document.getElementById("specialOfferForm");
    const specialOfferPrice = document.getElementById("specialOfferPrice");
    const specialOfferGuardianEmail = document.getElementById("specialOfferGuardianEmail");
    const specialOfferStartDate = document.getElementById("specialOfferStartDate");
    const specialOfferEndDate = document.getElementById("specialOfferEndDate");
    const specialOfferReason = document.getElementById("specialOfferReason");
    const specialOfferStatus = document.getElementById("specialOfferStatus");

    const defaults = {
        level1: { price: "30", rating: "4.9" },
        level2: { price: "35", rating: "4.9" },
        level3: { price: "40", rating: "4.9" },
        level4: { price: "25", rating: "4.9" },
        level5: { price: "20", rating: "4.9" }
    };

    const levels = ["level1", "level2", "level3", "level4", "level5"];

    // Load prices from Supabase into local cache
    const pricesCache = {};
    if (typeof db !== 'undefined' && db.programPrices?.getAll) {
        const { data: allPrices } = await db.programPrices.getAll();
        (allPrices || []).forEach(row => {
            pricesCache[row.level] = {
                price: String(row.price ?? defaults[row.level]?.price ?? "0"),
                rating: String(row.rating ?? "4.9")
            };
        });
    }

    const getProgramData = (level) => {
        if (pricesCache[level]) return pricesCache[level];
        return defaults[level] || { price: "0", rating: "4.9" };
    };

    const loadPriceInputs = () => {
        levels.forEach((level) => {
            const input = document.getElementById(`admin-price-${level}`);
            if (!input) return;
            const data = getProgramData(level);
            input.value = data.price;
        });
    };

    const renderProgramCardPrices = () => {
        document.querySelectorAll(".admin-program-price-value").forEach((el) => {
            const level = el.getAttribute("data-level");
            if (!level) return;
            const data = getProgramData(level);
            el.textContent = `$${data.price}`;
        });
    };

    const savePrice = async (level) => {
        const input = document.getElementById(`admin-price-${level}`);
        if (!input) return;

        const value = String(input.value || "").trim();
        if (!value || isNaN(Number(value)) || Number(value) < 0) {
            if (priceStatus) priceStatus.textContent = "Enter a valid price (0 or higher).";
            return;
        }

        const existing = getProgramData(level);
        const rating = existing.rating || (defaults[level]?.rating || "4.9");

        if (typeof db !== 'undefined' && db.programPrices?.save) {
            await db.programPrices.save(level, Number(value), Number(rating));
        }
        pricesCache[level] = { price: value, rating };
        renderProgramCardPrices();
        if (priceStatus) priceStatus.textContent = `Saved ${level} price: $${value}`;
    };

    document.querySelectorAll(".save-program-price").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const level = btn.dataset.level;
            if (!level) return;
            await savePrice(level);
        });
    });

    levels.forEach((level) => {
        const input = document.getElementById(`admin-price-${level}`);
        input?.addEventListener("keydown", async (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                await savePrice(level);
            }
        });
    });

    specialOfferForm?.addEventListener("submit", async (e) => {
        e.preventDefault();

        const offerPrice = String(specialOfferPrice?.value || "").trim();
        const guardianEmail = String(specialOfferGuardianEmail?.value || "").trim().toLowerCase();
        const startDate = String(specialOfferStartDate?.value || "").trim();
        const endDate = String(specialOfferEndDate?.value || "").trim();
        const reason = String(specialOfferReason?.value || "").trim();

        if (!offerPrice || isNaN(Number(offerPrice)) || Number(offerPrice) < 0 || !guardianEmail || !startDate || !endDate || !reason) {
            if (specialOfferStatus) specialOfferStatus.textContent = "Complete all offer fields with valid values.";
            return;
        }

        if (new Date(endDate) < new Date(startDate)) {
            if (specialOfferStatus) specialOfferStatus.textContent = "Offer end date must be after start date.";
            return;
        }

        if (typeof db !== 'undefined' && db.familyOffers?.save) {
            await db.familyOffers.save(guardianEmail, { offerPrice, startDate, endDate, reason });
        }

        if (specialOfferStatus) specialOfferStatus.textContent = `Special offer saved for ${guardianEmail}.`;
        specialOfferForm.reset();
        populateGuardianSelect(specialOfferGuardianEmail, "Select guardian");
    });

    populateGuardianSelect(specialOfferGuardianEmail, "Select guardian");

    loadPriceInputs();
    renderProgramCardPrices();
}

/* =========================================================
   NAV ACTIVE STATE
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
    const existingRole = (sessionStorage.getItem("daeroUserRole") || "").toLowerCase();
    if (existingRole !== "itdev") {
        sessionStorage.setItem("daeroUserRole", "admin");
    }

    const navLinks = document.querySelectorAll(".navbar nav a");

    navLinks.forEach(link => {
        link.addEventListener("click", () => {
            const role = (sessionStorage.getItem("daeroUserRole") || "admin").toLowerCase();
            if (role === "itdev") {
                sessionStorage.setItem("daeroUserRole", "itdev");
            } else {
                sessionStorage.setItem("daeroUserRole", "admin");
            }

            navLinks.forEach(l => l.classList.remove("active"));
            link.classList.add("active");
        });
    });
});

/* =========================================================
   CLOSE MENUS ON OUTSIDE CLICK
========================================================= */

document.addEventListener("click", (e) => {
    const columnMenu = document.getElementById("columnDropdownMenu");
    const columnBtn = document.getElementById("columnDropdownBtn");

    if (columnMenu && columnBtn) {
        if (!columnBtn.contains(e.target) && !columnMenu.contains(e.target)) {
            columnMenu.style.display = "none";
        }
    }

    const isActionButton = e.target.classList.contains("action-btn");
    const dropdown = e.target.closest(".action-dropdown");

    document.querySelectorAll(".action-menu").forEach(menu => {
        if (!menu.contains(e.target) && !menu.previousElementSibling?.contains(e.target)) {
            menu.style.display = "none";
        }
    });

    if (isActionButton && dropdown) {
        const menu = dropdown.querySelector(".action-menu");
        const btn = dropdown.querySelector(".action-btn");
        if (menu && btn) {
            const isVisible = menu.style.display === "block";
            menu.style.display = isVisible ? "none" : "block";
            
            // Position the fixed menu based on button's screen coords
            if (!isVisible) {
                const btnRect = btn.getBoundingClientRect();
                menu.style.top = (btnRect.bottom + 4) + "px";
                menu.style.left = (btnRect.right - 150) + "px"; // align right edge with button
                menu.style.position = "fixed";
            }
        }
    }
});

/* =========================================================
   DATABASE BACKUP & RESTORE
========================================================= */

function initBackupRestoreSystem() {
    const backupBtn           = document.getElementById("backupDbBtn");
    const restoreBtn          = document.getElementById("restoreDbBtn");
    const restoreInput        = document.getElementById("restoreFileInput");
    const schedulePlanSelect  = document.getElementById("backupSchedulePlan");
    const scheduleToggleBtn   = document.getElementById("backupScheduleToggle");
    const statusEl            = document.getElementById("backupRestoreStatus");
    const scheduleInfoEl      = document.getElementById("backupScheduleInfo");
    if (!backupBtn || !restoreBtn) return;

    const TABLES = [
        "applicants", "students", "program_prices",
        "assignments", "announcements", "reminders",
        "reminder_reads", "family_offers", "password_overrides", "media_uploads"
    ];

    const CONFLICT_COL = {
        applicants:         "id",
        students:           "id",
        program_prices:     "level",
        assignments:        "id",
        announcements:      "id",
        reminders:          "id",
        reminder_reads:     "id",
        family_offers:      "id",
        password_overrides: "id",
        media_uploads:      "id"
    };

    const BACKUP_PLAN_KEY = "daero-backup-plan";
    const BACKUP_NEXT_KEY = "daero-backup-next-run";
    let isBusy = false;
    let scheduleTimer = null;

    function setStatus(msg, spinning) {
        if (!statusEl) return;
        if (!msg) { statusEl.innerHTML = ""; statusEl.style.display = "none"; return; }
        statusEl.innerHTML = spinning
            ? `<span class="backup-spinner"></span>${msg}`
            : msg;
        statusEl.style.display = "inline-flex";
    }

    function setScheduleInfo(msg) {
        if (!scheduleInfoEl) return;
        if (!msg) {
            scheduleInfoEl.textContent = "";
            scheduleInfoEl.style.display = "none";
            return;
        }
        scheduleInfoEl.textContent = msg;
        scheduleInfoEl.style.display = "inline-flex";
    }

    function formatDateTime(dt) {
        try {
            return dt.toLocaleString();
        } catch (_) {
            return String(dt);
        }
    }

    function getPlanMs(plan) {
        if (plan === "3days") return 3 * 24 * 60 * 60 * 1000;
        if (plan === "weekly") return 7 * 24 * 60 * 60 * 1000;
        return 0;
    }

    function nextRunFrom(plan, fromDate = new Date()) {
        const base = new Date(fromDate);
        if (plan === "monthly") {
            base.setMonth(base.getMonth() + 1);
            return base;
        }
        const stepMs = getPlanMs(plan);
        if (!stepMs) return null;
        return new Date(base.getTime() + stepMs);
    }

    function saveSchedule(plan, nextIso) {
        if (!plan || !nextIso) {
            localStorage.removeItem(BACKUP_PLAN_KEY);
            localStorage.removeItem(BACKUP_NEXT_KEY);
            return;
        }
        localStorage.setItem(BACKUP_PLAN_KEY, plan);
        localStorage.setItem(BACKUP_NEXT_KEY, nextIso);
    }

    function loadSchedule() {
        return {
            plan: (localStorage.getItem(BACKUP_PLAN_KEY) || "").trim(),
            nextRunIso: (localStorage.getItem(BACKUP_NEXT_KEY) || "").trim()
        };
    }

    function refreshScheduleUi() {
        if (!scheduleToggleBtn) return;
        const { plan, nextRunIso } = loadSchedule();
        const enabled = !!plan;

        if (schedulePlanSelect) {
            schedulePlanSelect.value = plan || "";
        }

        scheduleToggleBtn.textContent = enabled ? "Disable Schedule" : "Enable Schedule";
        scheduleToggleBtn.classList.toggle("btn-secondary", enabled);

        if (enabled && nextRunIso) {
            const nextDate = new Date(nextRunIso);
            setScheduleInfo(`Scheduled (${plan}) • Next: ${formatDateTime(nextDate)} • Keep this admin page open.`);
        } else {
            setScheduleInfo("Schedule is OFF");
        }
    }

    function setBusy(busy) {
        isBusy = busy;
        backupBtn.disabled  = busy;
        restoreBtn.disabled = busy;
        if (schedulePlanSelect) schedulePlanSelect.disabled = busy;
        if (scheduleToggleBtn) scheduleToggleBtn.disabled = busy;
    }

    async function runBackup(triggerLabel = "manual") {
        setBusy(true);
        setStatus(
            triggerLabel === "scheduled"
                ? "Running scheduled backup…"
                : "Backing up database…",
            true
        );
        try {
            const backup = { version: 1, created_at: new Date().toISOString(), trigger: triggerLabel, tables: {} };

            for (const table of TABLES) {
                const { data, error } = await sb().from(table).select("*");
                if (error) throw new Error(`Error reading ${table}: ${error.message}`);
                backup.tables[table] = data || [];
                setStatus(`Backing up… reading ${table}`, true);
            }

            const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
            const filename = `daero-backup-${ts}.json`;
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            setStatus("✅ Database backed up successfully", false);
            return { ok: true };
        } catch (e) {
            setStatus("❌ Backup failed: " + e.message, false);
            return { ok: false, error: e };
        } finally {
            setBusy(false);
        }
    }

    async function runScheduledBackupIfDue() {
        if (isBusy) return;
        const { plan, nextRunIso } = loadSchedule();
        if (!plan || !nextRunIso) return;

        const nextRun = new Date(nextRunIso);
        if (Number.isNaN(nextRun.getTime())) {
            saveSchedule("", "");
            refreshScheduleUi();
            return;
        }

        if (Date.now() < nextRun.getTime()) return;

        const result = await runBackup("scheduled");
        if (!result.ok) return;

        const afterRun = loadSchedule();
        if (!afterRun.plan) return; // user may disable during operation
        const newNextRun = nextRunFrom(afterRun.plan, new Date());
        if (!newNextRun) {
            saveSchedule("", "");
            refreshScheduleUi();
            return;
        }
        saveSchedule(afterRun.plan, newNextRun.toISOString());
        refreshScheduleUi();
    }

    // ── BACKUP ──────────────────────────────────────────────
    backupBtn.addEventListener("click", async () => {
        await runBackup("manual");
    });

    // ── RESTORE ─────────────────────────────────────────────
    restoreBtn.addEventListener("click", () => {
        restoreInput.value = "";
        restoreInput.click();
    });

    restoreInput.addEventListener("change", async () => {
        const file = restoreInput.files?.[0];
        if (!file) return;

        const ok = confirm(
            "⚠️ Restore will overwrite existing records that match backup IDs.\n" +
            "Records not in the backup file will NOT be deleted.\n\n" +
            `File: ${file.name}\n\nContinue?`
        );
        if (!ok) return;

        setBusy(true);
        setStatus("Restoring database…", true);
        try {
            const text   = await file.text();
            const backup = JSON.parse(text);
            if (!backup?.tables || typeof backup.tables !== "object") {
                throw new Error("Invalid backup file — missing tables object.");
            }

            let totalRecords = 0;
            for (const [table, rows] of Object.entries(backup.tables)) {
                if (!Array.isArray(rows) || rows.length === 0) continue;
                const conflictCol = CONFLICT_COL[table] || "id";
                setStatus(`Restoring… ${table} (${rows.length} rows)`, true);
                // Batch in chunks of 100 to avoid payload limits
                for (let i = 0; i < rows.length; i += 100) {
                    const chunk = rows.slice(i, i + 100);
                    const { error } = await sb().from(table).upsert(chunk, { onConflict: conflictCol });
                    if (error) throw new Error(`Error in ${table}: ${error.message}`);
                }
                totalRecords += rows.length;
            }

            setStatus(`✅ Database restored successfully — ${totalRecords} records`, false);
        } catch (e) {
            setStatus("❌ Restore failed: " + e.message, false);
        } finally {
            setBusy(false);
        }
    });

    if (scheduleToggleBtn) {
        scheduleToggleBtn.addEventListener("click", () => {
            const current = loadSchedule();
            if (current.plan) {
                saveSchedule("", "");
                refreshScheduleUi();
                setStatus("Scheduled backup disabled", false);
                return;
            }

            const plan = (schedulePlanSelect?.value || "").trim();
            if (!plan) {
                setStatus("Pick a schedule plan first", false);
                return;
            }

            const nextRun = nextRunFrom(plan, new Date());
            if (!nextRun) {
                setStatus("Invalid schedule plan", false);
                return;
            }

            saveSchedule(plan, nextRun.toISOString());
            refreshScheduleUi();
            setStatus(`Scheduled backup enabled (${plan})`, false);
        });
    }

    refreshScheduleUi();
    if (scheduleTimer) clearInterval(scheduleTimer);
    scheduleTimer = window.setInterval(() => {
        runScheduledBackupIfDue();
    }, 60 * 1000);
    runScheduledBackupIfDue();
}

/* =========================================================
   MAIN INITIALIZATION
========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
    updateExportButtonLabels();
    await refreshApplicantsCache();
    initAdminSupportPage();
    initBackupRestoreSystem();
    initSidebarUploadSystems();
    initProgramResourceUploadSystems();
    initPriceSettingsPage();
    initTeachersTaskPage();
    runOneTimeApplicantDataRepair();

    populateYearSelect("filterYearNew", allApplicantsCache);
    populateYearSelect("filterYearAd", allApplicantsCache);

    const gradeSel = document.getElementById("filterGradeAd");
    if (gradeSel) {
        gradeSel.innerHTML = `
            <option value="">Grade level</option>
            <option value="Beginner Class">Beginner Class</option>
            <option value="Intermediate Class">Intermediate Class</option>
            <option value="Advanced Class">Advanced Class</option>
            <option value="After School Tutorial">After School Tutorial</option>
            <option value="Religious Study">Religious Study</option>
        `;
    }

    resetAdmittedVisibleColumnsDefault();
    buildColumnCheckboxMenu();

    renderNewApplicantsTable();
    renderAdmittedTable();
    renderAdminProgramCounts();

    const newFilters = [
        "filterYearNew",
        "filterFirstNameNew",
        "filterGuardianNew",
        "pageSizeNew"
    ];

    newFilters.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const handler = () => {
            currentNewPage = 1;
            renderNewApplicantsTable();
        };

        if (el.tagName === "INPUT") el.addEventListener("input", handler);
        else el.addEventListener("change", handler);
    });

    document.getElementById("deleteNewApplicants")?.addEventListener("click", deleteSelectedNew);
    document.getElementById("exportNewApplicants")?.addEventListener("click", () => {
        exportToXlsx(currentNewData, "new-applicants.xlsx");
    });

    const adFilters = [
        "filterYearAd",
        "filterStatusAd",
        "filterGradeAd",
        "filterFirstNameAd",
        "filterGuardianAd",
        "pageSizeAd"
    ];

    adFilters.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        const handler = () => {
            currentAdPage = 1;
            renderAdmittedTable();
        };

        if (el.tagName === "INPUT") el.addEventListener("input", handler);
        else el.addEventListener("change", handler);
    });

    document.getElementById("deleteAdmitted")?.addEventListener("click", deleteSelectedAdmitted);
    document.getElementById("exportAdmitted")?.addEventListener("click", () => {
        exportToXlsx(currentAdData, "admitted-students.xlsx");
    });
    document.getElementById("printAdmitted")?.addEventListener("click", () => {
        printSelectedAdmitted();
    });
 });

 /* =========================================================
   GLOBAL CLICK HANDLER — ADMIT BUTTON
 ========================================================= */
// Show an admin page section by id and update left sidebar active state
function showAdminPage(pageId) {
    document.querySelectorAll('.admin-page').forEach(s => {
        s.style.display = (s.id === pageId) ? 'block' : 'none';
    });

    document.querySelectorAll('.admin-link').forEach(link => {
        if (link.dataset.target === pageId) link.classList.add('active');
        else link.classList.remove('active');
    });

    window.scrollTo(0, 0);
}

// Delegate admit clicks: admit the applicant (stay on current page so user can continue)
document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.admit-btn');
    if (!btn) return;

    const id = btn.dataset.id;
    console.log('Admit clicked on DevTools page', id);

    admitApplicant(id);

    // no navigation; tables already updated by admitApplicant
});
// Sidebar page links — open admin pages and re-render tables
document.querySelectorAll('.admin-link').forEach(link => {
  link.addEventListener('click', async (ev) => {
    ev.preventDefault();
    const target = link.dataset.target;
    if (!target) return;
    showAdminPage(target);

    if (target === 'newApplicantsPage') {
      currentNewPage = 1;
      await refreshApplicantsCache();
            renderAdminProgramCounts();
      renderNewApplicantsTable();
    } else if (target === 'admittedStudentsPage') {
      currentAdPage = 1;
            resetAdmittedVisibleColumnsDefault();
            buildColumnCheckboxMenu();
      await refreshApplicantsCache();
            renderAdminProgramCounts();
      renderAdmittedTable();
        } else if (target === 'adminSupportPage') {
            renderContactMessages();
    }
  });
});

// Ensure initial page is visible on load
document.addEventListener('DOMContentLoaded', () => {
  // default to New Applicants if nothing already visible
  const anyVisible = Array.from(document.querySelectorAll('.admin-page')).some(s => getComputedStyle(s).display !== 'none');
  if (!anyVisible) {
    showAdminPage('newApplicantsPage');
  }
});
