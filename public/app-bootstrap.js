// Keep the static SEO fallback available without JS or when the app cannot start.
// This small classic script executes before the body and the application's modules.
(function () {
  var html = document.documentElement;
  var observer;
  var timeout;

  function finish() {
    html.removeAttribute("data-tok-booting");
    if (observer) observer.disconnect();
    window.clearTimeout(timeout);
  }

  try {
    observer = new MutationObserver(function () {
      var root = document.getElementById("root");
      // Parsing the empty root is not an application commit. Wait for React to
      // replace the prerendered section (or render the first loading/error UI).
      if (root && root.hasChildNodes() && !root.querySelector("#tok-prerendered-content")) {
        finish();
      }
    });
    observer.observe(html, { childList: true, subtree: true });
    timeout = window.setTimeout(finish, 10000);
    html.setAttribute("data-tok-booting", "");
  } catch {
    finish();
  }
})();
