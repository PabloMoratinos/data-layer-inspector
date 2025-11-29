chrome.devtools.panels.create(
  "DataLayer Inspector",
  "", // Icon path (optional)
  "src/panel.html",
  function (panel) {
    // Code to run when the panel is created
    console.log("Data Layer Inspector panel created");
  }
);
