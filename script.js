(function () {
  var items = document.querySelectorAll('.grid-item');

  items.forEach(function (item) {
    var trigger = item.querySelector('.grid-trigger');
    if (!trigger) return;

    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.setAttribute('aria-expanded', 'false');

    function toggle() {
      var expanded = item.classList.toggle('expanded');
      trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    trigger.addEventListener('click', toggle);
    trigger.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });
})();
