
/* =============================================================
   db.js  —  Daero Filitet Data Access Layer
   Wraps all Supabase table operations with the same domain
   concepts previously stored in localStorage.

   Every function is async and returns { data, error }.
   When an operation succeeds, 'error' is null.
   When it fails, 'data' is null and 'error' is an Error object.

   DEPENDS ON: supabase-client.js (must be loaded first)
   ============================================================= */

/* ----------------------------------------------------------
   Internal helper — normalise Supabase responses
   ---------------------------------------------------------- */
function _ok(data)  { return { data, error: null }; }
function _err(e, context) {
    const msg = (e && e.message) ? e.message : String(e);
    console.error(`[db.js ${context}]`, msg);
    return { data: null, error: new Error(msg) };
}
async function _query(fn, context) {
    try {
        const res = await fn();
        if (res.error) throw res.error;
        return _ok(res.data);
    } catch (e) {
        return _err(e, context);
    }
}

// Short alias
const sb = () => supabaseClient;

const db = {
    /* =============================================================
       db.additionalAssignments
       Maps to the 'additional_assignments' table.
       ============================================================= */
    additionalAssignments: {
        // Get all files for a class type
        getByClassType: (classType) => _query(
            () => sb().from("additional_assignments").select("*").eq("class_type", classType).order("uploaded_at", { ascending: true }),
            "additionalAssignments.getByClassType"
        ),
        // Add a new assignment file
        add: (classType, file) => _query(
            () => sb().from("additional_assignments").insert({
                class_type: classType,
                file_name: file.name || file.fileName || "",
                file_type: file.type || file.fileType || "",
                file_url: file.url || file.fileUrl || null,
                file_data: file.dataUrl || file.fileData || null,
                uploaded_at: new Date().toISOString()
            }),
            "additionalAssignments.add"
        ),
        // Delete by id
        delete: (id) => _query(
            () => sb().from("additional_assignments").delete().eq("id", id),
            "additionalAssignments.delete"
        ),
        // Clear all for a class type
        clearByClassType: (classType) => _query(
            () => sb().from("additional_assignments").delete().eq("class_type", classType),
            "additionalAssignments.clearByClassType"
        )
    },

    applicants: {

        /** Fetch all applicant (guardian) records. */
        getAll: () => _query(
            () => sb().from("applicants").select("*").order("created_at", { ascending: false }),
            "applicants.getAll"
        ),


        getById: (id) => _query(
            () => sb().from("applicants").select("*").eq("id", id).single(),
            "applicants.getById"
        ),

        /** Fetch all applicants whose guardian_email matches. */
        getByEmail: (email) => _query(
            () => sb().from("applicants").select("*").eq("guardian_email", email.toLowerCase().trim()),
            "applicants.getByEmail"
        ),

        /**
         * Insert or update an applicant record.
         * Pass the full object; 'id' is required.
         */
        save: (applicant) => _query(
            () => sb().from("applicants").upsert({
                id:             applicant.id,
                status:         applicant.status         || "new",
                guardian_name:  applicant.guardianName   || "",
                guardian_email: (applicant.guardianEmail || "").toLowerCase().trim(),
                guardian_phone: applicant.guardianPhone  || "",
                country:        applicant.country        || "",
                city:           applicant.city           || "",
                learning_goal:  applicant.learningGoal   || "",
                schedule:       applicant.schedule       || null,
                updated_at:     new Date().toISOString()
            }),
            "applicants.save"
        ),

        /** Remove an applicant (and its students via CASCADE). */
        delete: (id) => _query(
            () => sb().from("applicants").delete().eq("id", id),
            "applicants.delete"
        )
    },


    /* =============================================================
       db.students
       Maps to the 'students' table.
       Legacy localStorage keys: applicant-{baseId}-{sid}  (flattened)
       ============================================================= */
    students: {

        /** All students. */
        getAll: () => _query(
            () => sb().from("students").select("*, applicants(guardian_name, guardian_email, guardian_phone, country, city, schedule)").order("updated_at", { ascending: false }),
            "students.getAll"
        ),

        /** Students that belong to one guardian record. */
        getByApplicantId: (applicantId) => _query(
            () => sb().from("students").select("*").eq("applicant_id", applicantId),
            "students.getByApplicantId"
        ),

        /** Single student by their flattened id. */
        getById: (id) => _query(
            () => sb().from("students").select("*, applicants(guardian_name, guardian_email, guardian_phone, country, city, schedule)").eq("id", id).single(),
            "students.getById"
        ),

        /**
         * Insert or update a student.
         * 'applicantId' is the parent applicants.id.
         */
        save: (student, applicantId) => _query(
            () => sb().from("students").upsert({
                id:             student.id,
                applicant_id:   applicantId,
                sid:            student._sid          || student.sid || 1,
                first_name:     student.firstName     || "",
                last_name:      student.lastName      || "",
                start_date:     student.startDate     || null,
                program_choice: student.programChoice || "",
                grade_level:    student.gradeLevel    || student.programChoice || "",
                learning_goal:  student.learningGoal  || "",
                schedule:       student.schedule      || null,
                status:         student.status        || "new",
                course_status:  student.courseStatus  || "ongoing",
                year:           student.year          || null,
                years:          student.years         || [],
                updated_at:     new Date().toISOString()
            }),
            "students.save"
        ),

        /** Update only the course_status of a student. */
        updateStatus: (id, courseStatus) => _query(
            () => sb().from("students").update({ course_status: courseStatus, updated_at: new Date().toISOString() }).eq("id", id),
            "students.updateStatus"
        ),

        /** Update lifecycle status (e.g. admitted <-> new) and optionally course status. */
        setLifecycleStatus: (id, status, courseStatus) => {
            const payload = {
                status,
                updated_at: new Date().toISOString()
            };
            if (typeof courseStatus === "string" && courseStatus.trim()) {
                payload.course_status = courseStatus;
            }
            return _query(
                () => sb().from("students").update(payload).eq("id", id),
                "students.setLifecycleStatus"
            );
        },

        /** Admit a student (set status='admitted' and course_status='ongoing'). */
        admit: (id) => _query(
            () => sb().from("students").update({
                status:        "admitted",
                course_status: "ongoing",
                updated_at:    new Date().toISOString()
            }).eq("id", id),
            "students.admit"
        ),

        delete: (id) => _query(
            () => sb().from("students").delete().eq("id", id),
            "students.delete"
        )
    },


    /* =============================================================
       db.programPrices
       Maps to the 'program_prices' table.
       Legacy key: program-{level}
       ============================================================= */
    programPrices: {

        /** Fetch all five price rows. */
        getAll: () => _query(
            () => sb().from("program_prices").select("*"),
            "programPrices.getAll"
        ),

        /** Fetch one level. level = 'level1' … 'level5'. */
        getByLevel: (level) => _query(
            () => sb().from("program_prices").select("*").eq("level", level).single(),
            "programPrices.getByLevel"
        ),

        /** Save (upsert) price and/or rating for a level. */
        save: (level, price, rating) => _query(
            () => sb().from("program_prices").upsert({
                level,
                price:      Number(price),
                rating:     Number(rating) || 4.9,
                updated_at: new Date().toISOString()
            }),
            "programPrices.save"
        )
    },


    /* =============================================================
       db.assignments
       Maps to the 'assignments' table.
       Legacy keys: portalAssignmentsByProgram / portalAssignmentsByEmail
       ============================================================= */
    assignments: {

        /** All assignments for a program (and optionally a specific guardian). */
        getByProgram: (program, targetEmail) => {
            let q = sb().from("assignments").select("*").eq("program", program).order("posted_at", { ascending: false });
            if (targetEmail) q = q.or(`target_email.is.null,target_email.eq.${targetEmail.toLowerCase().trim()}`);
            else             q = q.is("target_email", null);
            return _query(() => q, "assignments.getByProgram");
        },

        /** All assignments for one guardian email (personalised + their program). */
        getByEmail: (email) => _query(
            () => sb().from("assignments").select("*").eq("target_email", email.toLowerCase().trim()).order("posted_at", { ascending: false }),
            "assignments.getByEmail"
        ),

        /** Publish a new assignment. */
        publish: (item) => _query(
            () => sb().from("assignments").insert({
                id:           item.id           || `asg_${Date.now()}`,
                title:        item.title,
                due_date:     item.dueDate,
                program:      item.program,
                target_email: item.targetEmail  || null,
                download_url: item.downloadUrl  || null,
                posted_at:    item.postedAt     || new Date().toISOString()
            }),
            "assignments.publish"
        ),

        delete: (id) => _query(
            () => sb().from("assignments").delete().eq("id", id),
            "assignments.delete"
        )
    },


    /* =============================================================
       db.announcements
       Maps to the 'announcements' table.
       Legacy key: portalAnnouncementsByProgram
       ============================================================= */
    announcements: {

        getByProgram: (program) => _query(
            () => sb().from("announcements").select("*").eq("program", program).order("posted_at", { ascending: false }),
            "announcements.getByProgram"
        ),

        publish: (item) => _query(
            () => sb().from("announcements").insert({
                id:       item.id      || `ann_${Date.now()}`,
                title:    item.title,
                message:  item.message,
                program:  item.program,
                posted_at: item.date  || new Date().toISOString()
            }),
            "announcements.publish"
        ),

        delete: (id) => _query(
            () => sb().from("announcements").delete().eq("id", id),
            "announcements.delete"
        )
    },


    /* =============================================================
       db.reminders
       Maps to the 'reminders' table.
       Legacy key: portalRemindersByEmail
       ============================================================= */
    reminders: {

        getByEmail: (email) => _query(
            () => sb().from("reminders").select("*").eq("guardian_email", email.toLowerCase().trim()).order("posted_at", { ascending: false }),
            "reminders.getByEmail"
        ),

        /** Publish one reminder to one guardian. */
        publish: (item) => _query(
            () => sb().from("reminders").insert({
                id:             item.id             || `rem_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,
                guardian_email: item.guardianEmail.toLowerCase().trim(),
                title:          item.title,
                due_date:       item.dueDate,
                message:        item.message,
                attachments:    item.attachments    || [],
                posted_at:      item.postedAt       || new Date().toISOString()
            }),
            "reminders.publish"
        ),

        delete: (id) => _query(
            () => sb().from("reminders").delete().eq("id", id),
            "reminders.delete"
        )
    },


    /* =============================================================
       db.reminderReads
       Maps to the 'reminder_reads' table.
       Legacy key: readReminderIds_{email}
       ============================================================= */
    reminderReads: {

        /** IDs of reminders already seen by this guardian. */
        getReadIds: async (guardianEmail) => {
            const { data, error } = await _query(
                () => sb().from("reminder_reads").select("reminder_id").eq("guardian_email", guardianEmail.toLowerCase().trim()),
                "reminderReads.getReadIds"
            );
            if (error) return { data: [], error };
            return { data: (data || []).map(r => r.reminder_id), error: null };
        },

        /** Mark a reminder as read for this guardian. */
        markRead: (guardianEmail, reminderId) => _query(
            () => sb().from("reminder_reads").upsert({
                guardian_email: guardianEmail.toLowerCase().trim(),
                reminder_id:    reminderId,
                read_at:        new Date().toISOString()
            }),
            "reminderReads.markRead"
        )
    },


    /* =============================================================
       db.familyOffers
       Maps to the 'family_offers' table.
       Legacy key: portalFamilyOffersByEmail
       ============================================================= */
    familyOffers: {

        getByEmail: (email) => _query(
            () => sb().from("family_offers").select("*").eq("guardian_email", email.toLowerCase().trim()).maybeSingle(),
            "familyOffers.getByEmail"
        ),

        /** Upsert (create or replace) an offer for one guardian. */
        save: (email, offer) => _query(
            () => sb().from("family_offers").upsert({
                guardian_email: email.toLowerCase().trim(),
                offer_price:    Number(offer.offerPrice),
                start_date:     offer.startDate,
                end_date:       offer.endDate,
                reason:         offer.reason || "",
                updated_at:     new Date().toISOString()
            }),
            "familyOffers.save"
        ),

        delete: (email) => _query(
            () => sb().from("family_offers").delete().eq("guardian_email", email.toLowerCase().trim()),
            "familyOffers.delete"
        )
    },


    /* =============================================================
       db.passwordOverrides
       Maps to the 'password_overrides' table.
       Legacy keys: memberPasswordOverrides / memberPasswordOverridesByStudent
       SECURITY: Use bcrypt or Supabase Auth in production.
       ============================================================= */
    passwordOverrides: {

        getByEmail: (email) => _query(
            () => sb().from("password_overrides").select("*").eq("guardian_email", email.toLowerCase().trim()).maybeSingle(),
            "passwordOverrides.getByEmail"
        ),

        getByStudentId: (studentId) => _query(
            () => sb().from("password_overrides").select("*").eq("student_id", studentId).maybeSingle(),
            "passwordOverrides.getByStudentId"
        ),

        /** Set or replace a temporary password for a guardian email. */
        setByEmail: (email, temporaryPassword) => _query(
            () => sb().from("password_overrides").upsert({
                guardian_email:     email.toLowerCase().trim(),
                temporary_password: temporaryPassword,
                set_by:             "admin",
                updated_at:         new Date().toISOString()
            }, { onConflict: "guardian_email" }),
            "passwordOverrides.setByEmail"
        ),

        /** Set or replace a temporary password for a student id. */
        setByStudentId: (studentId, temporaryPassword) => _query(
            () => sb().from("password_overrides").upsert({
                student_id:         studentId,
                temporary_password: temporaryPassword,
                set_by:             "admin",
                updated_at:         new Date().toISOString()
            }, { onConflict: "student_id" }),
            "passwordOverrides.setByStudentId"
        ),

        clearByEmail: (email) => _query(
            () => sb().from("password_overrides").delete().eq("guardian_email", email.toLowerCase().trim()),
            "passwordOverrides.clearByEmail"
        )
    },


    /* =============================================================
       db.passwordChangeAlerts
       Maps to the 'password_change_alerts' table.
       Legacy key: adminPasswordChangeAlerts
       ============================================================= */
    passwordChangeAlerts: {

        getAll: () => _query(
            () => sb().from("password_change_alerts").select("*").order("changed_at", { ascending: false }),
            "passwordChangeAlerts.getAll"
        ),

        /** Get only alerts the admin hasn't seen yet. */
        getUnseen: () => _query(
            () => sb().from("password_change_alerts").select("*").is("seen_at", null).order("changed_at", { ascending: false }),
            "passwordChangeAlerts.getUnseen"
        ),

        add: (studentId, guardianEmail) => _query(
            () => sb().from("password_change_alerts").insert({
                student_id:    studentId,
                guardian_email: (guardianEmail || "").toLowerCase().trim(),
                changed_at:    new Date().toISOString()
            }),
            "passwordChangeAlerts.add"
        ),

        /** Mark all unseen alerts as seen. */
        markAllSeen: () => _query(
            () => sb().from("password_change_alerts").update({ seen_at: new Date().toISOString() }).is("seen_at", null),
            "passwordChangeAlerts.markAllSeen"
        )
    },


    /* =============================================================
       db.contactMessages
       Maps to the 'contact_messages' table.
       Legacy key: contactMessages
       ============================================================= */
    contactMessages: {

        getAll: () => _query(
            () => sb().from("contact_messages").select("*").order("submitted_at", { ascending: false }),
            "contactMessages.getAll"
        ),

        add: (name, email, message) => _query(
            () => sb().from("contact_messages").insert({
                name,
                email:        email.toLowerCase().trim(),
                message,
                submitted_at: new Date().toISOString()
            }),
            "contactMessages.add"
        ),

        markRead: (id) => _query(
            () => sb().from("contact_messages").update({ is_read: true }).eq("id", id),
            "contactMessages.markRead"
        ),

        deleteAll: () => _query(
            () => sb().from("contact_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
            "contactMessages.deleteAll"
        )
    },


    /* =============================================================
       db.appSettings
       Maps to the 'app_settings' table.
       Legacy keys: daeroMaintenanceMode, daeroMaintenanceBy
       ============================================================= */
    appSettings: {

        get: (key) => _query(
            () => sb().from("app_settings").select("value").eq("key", key).single(),
            "appSettings.get"
        ),

        set: (key, value) => _query(
            () => sb().from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }),
            "appSettings.set"
        ),

        /** Convenience: get maintenance mode status ('on' or 'off'). */
        getMaintenanceMode: async () => {
            const { data, error } = await _query(
                () => sb().from("app_settings").select("value").eq("key", "maintenanceMode").single(),
                "appSettings.getMaintenanceMode"
            );
            if (error) return { data: "off", error };
            return { data: (data && data.value) || "off", error: null };
        },

        setMaintenanceMode: (isOn, triggeredBy) => {
            const p1 = _query(
                () => sb().from("app_settings").upsert({ key: "maintenanceMode", value: isOn ? "on" : "off", updated_at: new Date().toISOString() }),
                "appSettings.setMaintenanceMode"
            );
            const p2 = _query(
                () => sb().from("app_settings").upsert({ key: "maintenanceBy", value: triggeredBy || "", updated_at: new Date().toISOString() }),
                "appSettings.setMaintenanceMode_by"
            );
            return Promise.all([p1, p2]);
        }
    },


    /* =============================================================
       db.mediaUploads
       Maps to the 'media_uploads' table.
       Legacy keys: adminUploadsIndexLatestSlides, adminUploadsMemberLoginSlides, …

       Category name mapping (localStorage key → db category):
         adminUploadsIndexLatestSlides      → 'index-latest'
         adminUploadsIndexTraditionalSlides → 'index-traditional'
         adminUploadsIndexGraduationVideos  → 'index-graduation-videos'
         adminUploadsIndexTribesSlides      → 'index-tribes'
         adminUploadsMemberLoginSlides      → 'member-login-slides'
         adminUploadsRegisterSlides         → 'register-slides'
         adminUploadsIndexGraduationFigure  → 'index-graduation-figure'
       ============================================================= */
    mediaUploads: {

        getStorageBucketName: () => window.DAERO_MEDIA_UPLOADS_BUCKET || "media-uploads",

        uploadToStorage: async (category, file) => {
            try {
                if (!sb()?.storage) {
                    throw new Error("Supabase Storage client is not available.");
                }

                const bucket = db.mediaUploads.getStorageBucketName();
                const safeCategory = String(category || "misc").trim().toLowerCase();
                const safeName = String(file?.name || file?.fileName || "upload")
                    .replace(/\s+/g, "-")
                    .replace(/[^a-zA-Z0-9._-]/g, "");
                const filePath = `${safeCategory}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;

                const uploadRes = await sb().storage.from(bucket).upload(filePath, file, {
                    cacheControl: "3600",
                    upsert: false,
                    contentType: file?.type || file?.fileType || "application/octet-stream"
                });

                if (uploadRes.error) throw uploadRes.error;

                const publicRes = sb().storage.from(bucket).getPublicUrl(filePath);
                const publicUrl = publicRes?.data?.publicUrl || "";
                if (!publicUrl) {
                    throw new Error(`Storage upload succeeded but no public URL was returned for bucket '${bucket}'.`);
                }

                return _ok({ bucket, path: filePath, publicUrl });
            } catch (e) {
                return _err(e, "mediaUploads.uploadToStorage");
            }
        },

        deleteFromStorageByUrl: async (fileUrl) => {
            try {
                const rawUrl = String(fileUrl || "").trim();
                if (!rawUrl) return _ok(null);
                if (!sb()?.storage) throw new Error("Supabase Storage client is not available.");

                const bucket = db.mediaUploads.getStorageBucketName();
                const marker = `/storage/v1/object/public/${bucket}/`;
                const markerIndex = rawUrl.indexOf(marker);
                if (markerIndex === -1) return _ok(null);

                const path = decodeURIComponent(rawUrl.slice(markerIndex + marker.length));
                if (!path) return _ok(null);

                const removeRes = await sb().storage.from(bucket).remove([path]);
                if (removeRes.error) throw removeRes.error;
                return _ok({ path });
            } catch (e) {
                return _err(e, "mediaUploads.deleteFromStorageByUrl");
            }
        },

        /** Map legacy localStorage key to a clean category slug. */
        categoryFromKey: (storageKey) => {
            const map = {
                adminUploadsIndexLatestSlides:      "index-latest",
                adminUploadsIndexTraditionalSlides: "index-traditional",
                adminUploadsIndexGraduationVideos:  "index-graduation-videos",
                adminUploadsIndexTribesSlides:      "index-tribes",
                adminUploadsMemberLoginSlides:      "member-login-slides",
                adminUploadsRegisterSlides:         "register-slides",
                adminUploadsIndexGraduationFigure:  "index-graduation-figure"
            };
            return map[storageKey] || storageKey;
        },

        getByCategory: (category) => _query(
            () => sb().from("media_uploads").select("*").eq("category", category).order("uploaded_at", { ascending: true }),
            "mediaUploads.getByCategory"
        ),

        getAll: () => _query(
            () => sb().from("media_uploads").select("*").order("uploaded_at", { ascending: true }),
            "mediaUploads.getAll"
        ),

        add: (category, file) => _query(
            () => sb().from("media_uploads").insert({
                category,
                file_name:   file.name     || file.fileName   || "",
                file_type:   file.type     || file.fileType   || "",
                file_url:    file.url      || file.fileUrl    || null,
                file_data:   file.dataUrl  || file.fileData   || null,
                uploaded_at: new Date().toISOString()
            }),
            "mediaUploads.add"
        ),

        clearCategory: (category) => _query(
            () => sb().from("media_uploads").delete().eq("category", category),
            "mediaUploads.clearCategory"
        ),

        clearAll: () => _query(
            () => sb().from("media_uploads").delete().neq("id", "__never__"),
            "mediaUploads.clearAll"
        ),

        delete: (id) => _query(
            () => sb().from("media_uploads").delete().eq("id", id),
            "mediaUploads.delete"
        )
    },


    /* =============================================================
       db.lessonPlans
       Maps to the 'lesson_plans' table.
       Legacy key: teachersTaskLessonPlans
       ============================================================= */
    lessonPlans: {

        getByClass: (classLevel) => _query(
            () => sb().from("lesson_plans").select("*").eq("class_level", classLevel).order("week_number").order("day"),
            "lessonPlans.getByClass"
        ),

        /** Save (upsert) a single lesson box. */
        save: (classLevel, weekNumber, day, content) => _query(
            () => sb().from("lesson_plans").upsert({
                class_level:  classLevel,
                week_number:  weekNumber,
                day,
                content,
                updated_at:   new Date().toISOString()
            }, { onConflict: "class_level,week_number,day" }),
            "lessonPlans.save"
        )
    },


    /* =============================================================
       db.lessonPlanDocs
       Maps to the 'lesson_plan_docs' table.
       Legacy key: teachersTaskLessonDocs
       ============================================================= */
    lessonPlanDocs: {

        getAll: async () => {
            const primary = await _query(
                () => sb().from("lesson_plan_docs").select("*").order("uploaded_at", { ascending: false }),
                "lessonPlanDocs.getAll.uploaded_at"
            );
            if (!primary.error) return primary;

            return _query(
                () => sb().from("lesson_plan_docs").select("*").order("updated_at", { ascending: false }),
                "lessonPlanDocs.getAll.updated_at"
            );
        },

        getByClassWeekDay: (classLevel, week, day) => _query(
            () => sb().from("lesson_plan_docs").select("*")
                .eq("class_level", classLevel)
                .eq("week", week)
                .eq("day", day),
            "lessonPlanDocs.getByClassWeekDay"
        ),

        add: (doc) => _query(
            () => sb().from("lesson_plan_docs").insert({
                id:          doc.id        || `ldoc_${Date.now()}`,
                class_level: doc.program   || doc.classLevel,
                week:        doc.week,
                day:         doc.day,
                file_name:   doc.name      || doc.fileName,
                file_type:   doc.type      || doc.fileType,
                file_size:   doc.size      || doc.fileSize  || null,
                file_url:    doc.fileUrl   || null,
                file_data:   doc.dataUrl   || doc.fileData  || null,
                uploaded_at: new Date().toISOString()
            }),
            "lessonPlanDocs.add"
        ),

        delete: (id) => _query(
            () => sb().from("lesson_plan_docs").delete().eq("id", id),
            "lessonPlanDocs.delete"
        ),

        clearAll: () => _query(
            () => sb().from("lesson_plan_docs").delete().neq("id", "__never__"),
            "lessonPlanDocs.clearAll"
        )
    },


    /* =============================================================
       db.attendance
       Maps to the 'attendance' table.
       Legacy key: teachersTaskAttendanceByProgramMonth
       ============================================================= */
    attendance: {

        getByClassMonth: (classLevel, month) => _query(
            () => sb().from("attendance").select("*").eq("class_level", classLevel).eq("month", month),
            "attendance.getByClassMonth"
        ),

        /** Upsert one student's row. */
        saveRow: (classLevel, month, studentId, studentName, slots) => _query(
            () => sb().from("attendance").upsert({
                class_level:  classLevel,
                month,
                student_id:   studentId  || null,
                student_name: studentName,
                week1_wed:    slots.week1Wed || "",
                week1_sat:    slots.week1Sat || "",
                week2_wed:    slots.week2Wed || "",
                week2_sat:    slots.week2Sat || "",
                week3_wed:    slots.week3Wed || "",
                week3_sat:    slots.week3Sat || "",
                week4_wed:    slots.week4Wed || "",
                week4_sat:    slots.week4Sat || "",
                updated_at:   new Date().toISOString()
            }, { onConflict: "class_level,month,student_id" }),
            "attendance.saveRow"
        )
    },


    /* =============================================================
       db.studentUploads
       Maps to the 'student_uploads' table.
       Legacy key: portalUploadsByEmail
       ============================================================= */
    studentUploads: {

        getByEmail: (email) => _query(
            () => sb().from("student_uploads").select("*").eq("guardian_email", email.toLowerCase().trim()).order("uploaded_at", { ascending: false }),
            "studentUploads.getByEmail"
        ),

        getByStudentId: (studentId) => _query(
            () => sb().from("student_uploads").select("*").eq("student_id", studentId).order("uploaded_at", { ascending: false }),
            "studentUploads.getByStudentId"
        ),

        deleteById: (uploadId) => _query(
            () => sb().from("student_uploads").delete().eq("id", uploadId),
            "studentUploads.deleteById"
        ),

        add: (email, studentId, file) => _query(
            () => sb().from("student_uploads").insert({
                guardian_email: email.toLowerCase().trim(),
                student_id:     studentId  || null,
                file_name:      file.name  || file.fileName,
                file_type:      file.type  || file.fileType,
                file_url:       file.url   || file.fileUrl  || null,
                file_data:      file.dataUrl || file.fileData || null,
                context:        file.context || null,
                uploaded_at:    new Date().toISOString()
            }),
            "studentUploads.add"
        )
    },


    /* =============================================================
       db.payments
       Maps to the 'payments' table.
       Legacy key: portalPaymentsByEmail
       ============================================================= */
    payments: {

        getByEmail: (email) => _query(
            () => sb().from("payments").select("*").eq("guardian_email", email.toLowerCase().trim()).order("paid_at", { ascending: false }),
            "payments.getByEmail"
        ),

        getByMonth: (monthKey) => _query(
            () => sb().from("payments").select("*").eq("month_key", monthKey),
            "payments.getByMonth"
        ),

        add: (email, studentId, amount, monthKey, notes) => _query(
            () => sb().from("payments").insert({
                guardian_email: email.toLowerCase().trim(),
                student_id:     studentId || null,
                amount:         Number(amount),
                month_key:      monthKey,
                paid_at:        new Date().toISOString(),
                notes:          notes || null
            }),
            "payments.add"
        )
    },

    /* =============================================================
       db.liveChat
       Maps to the 'live_chat_messages' and 'live_chat_sessions' tables.
       Manages real-time student-teacher chat interactions.
       ============================================================= */
    liveChat: {

        /** Create or get a chat session for a student. Uses student_email as UNIQUE key. */
        createChatSession: (studentEmail, studentName) => _query(
            () => sb().from("live_chat_sessions").upsert({
                student_email: studentEmail?.toLowerCase().trim() || "anonymous",
                student_name: studentName || "Anonymous",
                status: "waiting",
                updated_at: new Date().toISOString()
            }, { onConflict: "student_email" }).select().single(),
            "liveChat.createChatSession"
        ),

        /** Save a chat message for a student. Uses student_email to track conversation. */
        saveChatMessage: (studentEmail, studentName, message, senderType, senderName) => _query(
            () => sb().from("live_chat_messages").insert({
                student_email: studentEmail?.toLowerCase().trim() || "anonymous",
                student_name: studentName || "Anonymous",
                message: message || "",
                sender_type: senderType || "student",
                sender_name: senderName || null,
                sent_at: new Date().toISOString()
            }).select().single(),
            "liveChat.saveChatMessage"
        ),

        /** Fetch all messages for a specific student. */
        getMessagesByStudent: (studentEmail) => _query(
            () => sb().from("live_chat_messages")
                .select("*")
                .eq("student_email", studentEmail?.toLowerCase().trim())
                .order("sent_at", { ascending: true }),
            "liveChat.getMessagesByStudent"
        ),

        /** Fetch all active chat sessions (for teacher dashboard). */
        getActiveSessions: () => _query(
            () => sb().from("live_chat_sessions")
                .select("*")
                .neq("status", "ended")
                .order("created_at", { ascending: false }),
            "liveChat.getActiveSessions"
        ),

        /** Update session status (e.g., waiting -> active, active -> ended). */
        updateSessionStatus: (sessionId, status) => _query(
            () => sb().from("live_chat_sessions")
                .update({ status, updated_at: new Date().toISOString() })
                .eq("id", sessionId),
            "liveChat.updateSessionStatus"
        ),

        /** Update session status by student email. */
        updateSessionStatusByEmail: (studentEmail, status) => _query(
            () => sb().from("live_chat_sessions")
                .update({ status, updated_at: new Date().toISOString() })
                .eq("student_email", studentEmail?.toLowerCase().trim()),
            "liveChat.updateSessionStatusByEmail"
        ),

        /**
         * Subscribe to new teacher messages for a specific student email (real-time updates).
         * Calls the callback with the new message object when a new teacher message arrives.
         * Returns the channel subscription so it can be unsubscribed if needed.
         */
        onNewMessage: function(studentEmail, callback) {
            if (!supabaseClient || !studentEmail) return null;
            // Unsubscribe previous channel if needed (caller responsibility)
            const channel = supabaseClient
                .channel('live_chat_messages_' + studentEmail)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'live_chat_messages',
                        filter: `student_email=eq.${studentEmail.toLowerCase().trim()}`
                    },
                    (payload) => {
                        if (payload?.new?.sender_type === 'teacher') {
                            callback(payload.new);
                        }
                    }
                )
                .subscribe();
            return channel;
        }
    }

};

// Expose the Supabase client for direct queries if needed
db.supabase = supabaseClient;

// end db

// Ensure db is globally available
window.db = db;

/* =============================================================
   MIGRATION HELPERS
   One-off utilities for bulk-importing data that currently
   lives in localStorage into the Supabase tables.
   Call these from the browser console: await migrateAll()
   ============================================================= */

/**
 * Migrate all applicant (group-format) records from localStorage → Supabase.
 * Flattened (admitted) records are migrated as part of their parent.
 */
async function migrateApplicantsFromLocalStorage() {
    const results = { inserted: 0, skipped: 0, errors: [] };
    const keys = Object.keys(localStorage).filter(k => k.startsWith("applicant-"));

    for (const key of keys) {
        let raw;
        try { raw = JSON.parse(localStorage.getItem(key)); } catch { continue; }
        if (!raw) continue;

        const id = raw.id || key.replace("applicant-", "");

        // Save the applicant (guardian) row
        const { error: appErr } = await db.applicants.save({ ...raw, id });
        if (appErr) { results.errors.push({ key, error: appErr.message }); continue; }
        results.inserted++;

        // If it's a group record, save each student
        if (Array.isArray(raw.students)) {
            for (const s of raw.students) {
                const sid   = s._sid || 1;
                const stuId = `${id}-${sid}`;
                await db.students.save({ ...s, id: stuId, _sid: sid }, id);
            }
        } else if (raw.firstName) {
            // Flattened single student
            const stuId = id;
            await db.students.save({ ...raw, id: stuId, _sid: 1 }, id);
        }
    }

    console.log("[migrateApplicants] Done:", results);
    return results;
}

/**
 * Migrate contact messages from localStorage → Supabase.
 */
async function migrateContactMessages() {
    let msgs;
    try { msgs = JSON.parse(localStorage.getItem("contactMessages") || "[]"); } catch { msgs = []; }
    let inserted = 0, errors = [];
    for (const m of msgs) {
        const { error } = await db.contactMessages.add(m.name || "", m.email || "", m.message || "");
        if (error) errors.push(error.message);
        else inserted++;
    }
    console.log(`[migrateContactMessages] inserted:${inserted} errors:${errors.length}`);
    return { inserted, errors };
}

/**
 * Migrate reminders from localStorage → Supabase.
 */
async function migrateReminders() {
    let byEmail;
    try { byEmail = JSON.parse(localStorage.getItem("portalRemindersByEmail") || "{}"); } catch { byEmail = {}; }
    let inserted = 0, errors = [];
    for (const [email, remList] of Object.entries(byEmail)) {
        if (!Array.isArray(remList)) continue;
        for (const r of remList) {
            const { error } = await db.reminders.publish({ ...r, guardianEmail: email });
            if (error) errors.push(error.message);
            else inserted++;
        }
    }
    console.log(`[migrateReminders] inserted:${inserted} errors:${errors.length}`);
    return { inserted, errors };
}

/**
 * Migrate assignments from localStorage → Supabase.
 */
async function migrateAssignments() {
    let byProgram, byEmail;
    try { byProgram = JSON.parse(localStorage.getItem("portalAssignmentsByProgram") || "{}"); } catch { byProgram = {}; }
    try { byEmail   = JSON.parse(localStorage.getItem("portalAssignmentsByEmail")   || "{}"); } catch { byEmail   = {}; }

    let inserted = 0, errors = [];
    const seen = new Set();

    for (const [program, list] of Object.entries(byProgram)) {
        if (!Array.isArray(list)) continue;
        for (const a of list) {
            if (seen.has(a.id)) continue;
            seen.add(a.id);
            const { error } = await db.assignments.publish({ ...a, program });
            if (error) errors.push(error.message);
            else inserted++;
        }
    }
    for (const [email, list] of Object.entries(byEmail)) {
        if (!Array.isArray(list)) continue;
        for (const a of list) {
            if (seen.has(a.id)) continue;
            seen.add(a.id);
            const { error } = await db.assignments.publish({ ...a, targetEmail: email });
            if (error) errors.push(error.message);
            else inserted++;
        }
    }

    console.log(`[migrateAssignments] inserted:${inserted} errors:${errors.length}`);
    return { inserted, errors };
}

/**
 * Migrate announcements from localStorage → Supabase.
 */
async function migrateAnnouncements() {
    let byProgram;
    try { byProgram = JSON.parse(localStorage.getItem("portalAnnouncementsByProgram") || "{}"); } catch { byProgram = {}; }
    let inserted = 0, errors = [];
    for (const [program, list] of Object.entries(byProgram)) {
        if (!Array.isArray(list)) continue;
        for (const a of list) {
            const { error } = await db.announcements.publish({ ...a, program });
            if (error) errors.push(error.message);
            else inserted++;
        }
    }
    console.log(`[migrateAnnouncements] inserted:${inserted} errors:${errors.length}`);
    return { inserted, errors };
}

/**
 * Migrate family offers from localStorage → Supabase.
 */
async function migrateFamilyOffers() {
    let byEmail;
    try { byEmail = JSON.parse(localStorage.getItem("portalFamilyOffersByEmail") || "{}"); } catch { byEmail = {}; }
    let inserted = 0, errors = [];
    for (const [email, offer] of Object.entries(byEmail)) {
        const { error } = await db.familyOffers.save(email, offer);
        if (error) errors.push(error.message);
        else inserted++;
    }
    console.log(`[migrateFamilyOffers] inserted:${inserted} errors:${errors.length}`);
    return { inserted, errors };
}

/**
 * Migrate program prices from localStorage → Supabase.
 */
async function migrateProgramPrices() {
    const levels = ["level1","level2","level3","level4","level5"];
    let inserted = 0, errors = [];
    for (const level of levels) {
        let data;
        try { data = JSON.parse(localStorage.getItem(`program-${level}`) || "{}"); } catch { data = {}; }
        if (!data.price) continue;
        const { error } = await db.programPrices.save(level, data.price, data.rating || 4.9);
        if (error) errors.push(error.message);
        else inserted++;
    }
    console.log(`[migrateProgramPrices] inserted:${inserted} errors:${errors.length}`);
    return { inserted, errors };
}

/**
 * Run ALL migration helpers in sequence.
 * Usage from browser console:  await migrateAll()
 */
async function migrateAll() {
    console.log("[migrateAll] Starting full localStorage → Supabase migration …");
    const results = {};
    results.applicants     = await migrateApplicantsFromLocalStorage();
    results.contactMessages= await migrateContactMessages();
    results.reminders      = await migrateReminders();
    results.assignments    = await migrateAssignments();
    results.announcements  = await migrateAnnouncements();
    results.familyOffers   = await migrateFamilyOffers();
    results.programPrices  = await migrateProgramPrices();
    console.log("[migrateAll] Complete:", results);
    return results;
}
