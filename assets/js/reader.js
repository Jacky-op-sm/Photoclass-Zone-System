// reader.js — Clean reading view with left sidebar navigation

(function () {
  'use strict';

  var DIR_BASE = '';

  // ── URL resolver ────────────────────────────────────────────
  function resolveUrl(relativeUrl, baseDir) {
    // baseDir: e.g. "book/OEBPS/xhtml/"
    // relativeUrl: e.g. "../Images/fig4_1.jpg" or "Ch04.xhtml#fig4_1"
    // Returns absolute path from project root

    // Strip fragment
    var fragment = '';
    var fragIdx = relativeUrl.indexOf('#');
    if (fragIdx >= 0) {
      fragment = relativeUrl.substring(fragIdx);
      relativeUrl = relativeUrl.substring(0, fragIdx);
    }

    // If already absolute (starts with /), return as-is
    if (relativeUrl.indexOf('/') === 0) {
      return relativeUrl + fragment;
    }

    // Combine base + relative
    var combined = baseDir + relativeUrl;
    var parts = combined.split('/');
    var result = [];

    for (var i = 0; i < parts.length; i++) {
      if (parts[i] === '' || parts[i] === '.') continue;
      if (parts[i] === '..') {
        if (result.length > 0) result.pop();
      } else {
        result.push(parts[i]);
      }
    }

    return '/' + result.join('/') + fragment;
  }

  // ── Init ────────────────────────────────────────────────────
  async function init() {
    var params = new URLSearchParams(window.location.search);
    var src = params.get('src');
    var title = params.get('title') || '';

    if (!src) {
      document.querySelector('.reader-layout').innerHTML =
        '<div class="reader-error" style="padding:4rem"><p>No chapter source specified.</p><p><a href="./">← Back to Dashboard</a></p></div>';
      return;
    }

    DIR_BASE = src.substring(0, src.lastIndexOf('/') + 1); // e.g. book/OEBPS/xhtml/

    document.title = title ? title + ' — PhotoClass' : 'PhotoClass Reader';

    // Load units.json to find current unit and its checkpoints
    var units = [];
    try {
      var resp = await fetch('data/units.json');
      if (resp.ok) units = await resp.json();
    } catch (e) { /* ok, sidebar will just show nothing */ }

    // Find matching unit
    var currentUnit = null;
    for (var i = 0; i < units.length; i++) {
      if (units[i].href === src) {
        currentUnit = units[i];
        break;
      }
    }

    // Build sidebar
    buildSidebar(currentUnit, src);

    // Fetch and render the chapter content
    try {
      var resp2 = await fetch(src);
      if (!resp2.ok) throw new Error('HTTP ' + resp2.status);
      var html = await resp2.text();
      renderContent(html, title, units, currentUnit, src);
    } catch (e) {
      document.querySelector('.reader-main').innerHTML =
        '<div class="reader-error" style="padding:4rem"><p>Failed to load chapter: ' + e.message + '</p>' +
        '<p><a href="./">← Back to Dashboard</a></p></div>';
    }
  }

  // ── Sidebar ─────────────────────────────────────────────────
  function buildSidebar(currentUnit, src) {
    var sidebar = document.querySelector('.reader-sidebar');
    if (!sidebar) return;

    sidebar.innerHTML = '';

    // Navigation label
    var navLabel = document.createElement('div');
    navLabel.className = 'sidebar-label';
    navLabel.textContent = 'CONTENTS';
    sidebar.appendChild(navLabel);

    // All units list with expandable checkpoints
    var unitList = document.createElement('div');
    unitList.className = 'sidebar-unit-list';

    fetch('data/units.json').then(function (r) { return r.json(); }).then(function (units) {
      for (var i = 0; i < units.length; i++) {
        (function (u) {
          var isCurrent = u.href === src;

          // Unit item container
          var unitWrap = document.createElement('div');
          unitWrap.className = 'sidebar-unit-wrap';
          if (isCurrent) unitWrap.classList.add('is-current');

          // Unit header (clickable)
          var unitHeader = document.createElement('div');
          unitHeader.className = 'sidebar-unit-header';

          // If not current, clicking goes to that unit
          if (!isCurrent) {
            unitHeader.style.cursor = 'pointer';
            unitHeader.addEventListener('click', function () {
              window.location.href = 'reader.html?src=' + encodeURIComponent(u.href) +
                                     '&title=' + encodeURIComponent('Unit ' + u.number + ': ' + u.title);
            });
          }

          var num = document.createElement('span');
          num.className = 'sidebar-unit-num';
          if (u.type === 'core') {
            num.textContent = u.number;
          } else {
            num.textContent = 'R';
          }
          unitHeader.appendChild(num);

          var label = document.createElement('span');
          label.className = 'sidebar-unit-label';
          label.textContent = u.title;
          unitHeader.appendChild(label);

          // Expand/collapse toggle for current unit
          if (isCurrent && u.checkpoints && u.checkpoints.length > 0) {
            var toggle = document.createElement('span');
            toggle.className = 'sidebar-unit-toggle';
            toggle.textContent = '−';
            unitHeader.appendChild(toggle);

            unitHeader.addEventListener('click', function () {
              var cpList = unitWrap.querySelector('.sidebar-cp-list');
              if (cpList) {
                var isHidden = cpList.style.display === 'none';
                cpList.style.display = isHidden ? 'block' : 'none';
                toggle.textContent = isHidden ? '−' : '+';
              }
            });
          }

          unitWrap.appendChild(unitHeader);

          // Checkpoints list (only for current unit, expanded by default)
          if (isCurrent && u.checkpoints && u.checkpoints.length > 0) {
            var cpList = document.createElement('div');
            cpList.className = 'sidebar-cp-list';

            for (var j = 0; j < u.checkpoints.length; j++) {
              var cp = u.checkpoints[j];
              var cpItem = document.createElement('a');
              cpItem.className = 'sidebar-cp';
              var fragment = cp.href.indexOf('#') !== -1 ? cp.href.substring(cp.href.indexOf('#')) : '';
              if (fragment) {
                cpItem.href = 'javascript:void(0)';
                cpItem.setAttribute('data-anchor', fragment.substring(1));
                cpItem.addEventListener('click', function (ev) {
                  ev.stopPropagation();
                  var id = this.getAttribute('data-anchor');
                  var el = document.getElementById(id);
                  if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                });
              }
              cpItem.textContent = cp.title;
              cpList.appendChild(cpItem);
            }
            unitWrap.appendChild(cpList);
          }

          unitList.appendChild(unitWrap);
        })(units[i]);
      }
      sidebar.appendChild(unitList);
    });
  }

  // ── Render content ──────────────────────────────────────────
  function renderContent(html, title, units, currentUnit, src) {
    var main = document.querySelector('.reader-main');

    var parser = new DOMParser();
    var doc = parser.parseFromString(html, 'text/html');
    var body = doc.body;

    if (!body || !body.innerHTML.trim()) {
      var xmlDoc = parser.parseFromString(html, 'application/xhtml+xml');
      body = xmlDoc.body;
    }
    if (!body || !body.innerHTML.trim()) {
      main.innerHTML = '<div class="reader-error" style="padding:4rem"><p>Could not parse chapter content.</p></div>';
      return;
    }

    // ── Fix image paths: resolve relative to the XHTML file's directory ──
    var imgs = body.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      var imgSrc = imgs[i].getAttribute('src');
      if (imgSrc) {
        // Compute absolute URL: book/OEBPS/xhtml/ + ../Images/fig4_1.jpg → /book/OEBPS/Images/fig4_1.jpg
        var resolved = resolveUrl(imgSrc, DIR_BASE);
        imgs[i].setAttribute('src', resolved);
      }
    }

    // ── Fix internal links ──
    // The XHTML body is rendered inline, so cross-file links won't work.
    // Links to fragments (#...) stay; cross-file links are removed or made inert.
    var links = body.querySelectorAll('a');
    for (var j = 0; j < links.length; j++) {
      var href = links[j].getAttribute('href');
      if (!href) continue;
      
      // Page anchors (noise) — remove the <a> entirely
      if (links[j].getAttribute('id') && links[j].getAttribute('id').indexOf('page_') === 0) {
        if (links[j].parentNode) links[j].parentNode.removeChild(links[j]);
        continue;
      }

      if (href.indexOf('#') === 0) {
        // Fragment-only link (e.g. "#sec4_1") → keep as-is, will scroll within the page
        continue;
      } else if (href.indexOf('#') > 0) {
        // Cross-file link with fragment (e.g. "Ch04.xhtml#fig4_1") → extract fragment only
        var fragIdx = href.indexOf('#');
        var fragment = href.substring(fragIdx); // => "#fig4_1"
        links[j].setAttribute('href', fragment);
        // Remove the href entirely if no valid fragment
        if (fragment === '#') {
          links[j].removeAttribute('href');
        }
      } else {
        // Cross-file link without fragment → remove
        links[j].removeAttribute('href');
      }
    }

    // Remove page anchors that are plain <a id="page_24"> (not links)
    var pageAnchors = body.querySelectorAll('a[id^="page_"]');
    for (var k = 0; k < pageAnchors.length; k++) {
      if (pageAnchors[k].parentNode) {
        pageAnchors[k].parentNode.removeChild(pageAnchors[k]);
      }
    }

    // Remove the first h1 to avoid duplicate title
    var firstH1 = body.querySelector('h1');
    if (firstH1) {
      firstH1.parentNode.removeChild(firstH1);
    }

    // Title
    if (title) {
      var h1 = document.createElement('h1');
      h1.className = 'reader-title';
      h1.textContent = title;
      main.appendChild(h1);
    }

    // Content
    var content = document.createElement('div');
    content.className = 'reader-content';
    content.innerHTML = body.innerHTML;
    main.appendChild(content);

    buildMobileReaderNav(main, content, units, currentUnit, src);
  }

  function buildMobileReaderNav(main, content, units, currentUnit, src) {
    var nav = document.createElement('div');
    nav.className = 'reader-mobile-nav';

    var unitGroup = document.createElement('label');
    unitGroup.className = 'mobile-select-group';
    var unitLabel = document.createElement('span');
    unitLabel.textContent = 'Unit';
    unitGroup.appendChild(unitLabel);

    var unitSelect = document.createElement('select');
    unitSelect.className = 'mobile-select';
    unitSelect.setAttribute('aria-label', 'Choose unit');

    for (var i = 0; i < units.length; i++) {
      var option = document.createElement('option');
      option.value = units[i].href;
      option.textContent = units[i].type === 'core'
        ? units[i].number + '. ' + units[i].title
        : units[i].title;
      option.selected = units[i].href === src;
      unitSelect.appendChild(option);
    }

    unitSelect.addEventListener('change', function () {
      for (var j = 0; j < units.length; j++) {
        if (units[j].href === unitSelect.value) {
          window.location.href = 'reader.html?src=' + encodeURIComponent(units[j].href) +
            '&title=' + encodeURIComponent('Unit ' + units[j].number + ': ' + units[j].title);
          return;
        }
      }
    });
    unitGroup.appendChild(unitSelect);
    nav.appendChild(unitGroup);

    var headings = content.querySelectorAll('h2');
    if (headings.length > 1) {
      var sectionGroup = document.createElement('label');
      sectionGroup.className = 'mobile-select-group';
      var sectionLabel = document.createElement('span');
      sectionLabel.textContent = 'Section';
      sectionGroup.appendChild(sectionLabel);

      var sectionSelect = document.createElement('select');
      sectionSelect.className = 'mobile-select';
      sectionSelect.setAttribute('aria-label', 'Jump to section');

      var prompt = document.createElement('option');
      prompt.value = '';
      prompt.textContent = 'Jump to section';
      sectionSelect.appendChild(prompt);

      for (var k = 0; k < headings.length; k++) {
        var heading = headings[k];
        var anchor = heading.id;
        var nestedLink = heading.querySelector('a[href^="#"]');
        if (!anchor && nestedLink) anchor = nestedLink.getAttribute('href').substring(1);
        if (!anchor) {
          anchor = 'reader-section-' + k;
        }
        if (!heading.id) heading.id = anchor;

        var sectionOption = document.createElement('option');
        sectionOption.value = anchor;
        sectionOption.textContent = heading.textContent.trim();
        sectionSelect.appendChild(sectionOption);
      }

      sectionSelect.addEventListener('change', function () {
        if (!sectionSelect.value) return;
        var target = document.getElementById(sectionSelect.value);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        sectionSelect.value = '';
      });
      sectionGroup.appendChild(sectionSelect);
      nav.appendChild(sectionGroup);
    }

    var title = main.querySelector('.reader-title');
    main.insertBefore(nav, title || content);
  }

  // ── Start ───────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
