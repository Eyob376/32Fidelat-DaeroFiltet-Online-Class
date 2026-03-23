// js/loader.js
(function () {
  const VERSION = window.APP_VERSION || "1.0.1";

  const TARGET = document.head || document.documentElement;

  // ✅ Load CSS
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `css/app.css?v=${encodeURIComponent(VERSION)}`;
  TARGET.appendChild(link);

  // ✅ Load main JS
  const script = document.createElement("script");
  script.src = `js/app.js?v=${encodeURIComponent(VERSION)}`;
  script.defer = true;
  TARGET.appendChild(script);

  // ✅ Detect current page
  const page = location.pathname.split("/").pop().toLowerCase();

  // ✅ Load admin scripts ONLY for admin-dashboard.html
  if (window.IS_ADMIN_DASHBOARD) {
  const admin = document.createElement("script");
  admin.src = `js/admin-dashboard.js?v=${encodeURIComponent(VERSION)}`;
  admin.defer = true;
  TARGET.appendChild(admin);

    const editpanel = document.createElement("script");
    editpanel.src = `js/editpanel.js?v=${encodeURIComponent(VERSION)}`;
    editpanel.defer = true;
    TARGET.appendChild(editpanel);
  }

  console.log("Loader OK →", page, "version:", VERSION);
})();
