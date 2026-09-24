/* ══════════════════════════════════════════════════════════════════════
   WCIB MATHS — SIGN-IN REQUIRED TO VIEW
   ----------------------------------------------------------------------
   Drop this into the <head> of any page that should be staff-only:

       <script src="./wcib-gate.js" data-subtitle="Department Hub"></script>

   It hides the page immediately, then asks Firebase whether the visitor's
   email is on the maths department teacher list (the same 'teachers' list
   the Scheme of Work tracker uses). Only then does the page appear.

   Note: this hides the page from ordinary visitors and from search
   engines. It is not a lock on the files themselves — anyone determined
   can still read the page source. Do not put anything here that would
   genuinely matter if it leaked.
   ══════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var CONFIG = {
    apiKey: "AIzaSyDJ2yimQL5wD-dh-QvXdBh7op8v8wFP9OI",
    authDomain: "wcib-sow.firebaseapp.com",
    projectId: "wcib-sow",
    storageBucket: "wcib-sow.firebasestorage.app",
    messagingSenderId: "738888595401",
    appId: "1:738888595401:web:720961c2af99f03b745a18"
  };

  var SDK = [
    'https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore-compat.js'
  ];

  var EMAIL_KEY = 'wcib_signin_email';
  var html = document.documentElement;
  var me = document.currentScript;
  var SUBTITLE = (me && me.getAttribute('data-subtitle')) || 'Maths Department';

  var auth = null, gate = null;

  /* ── Hide the page straight away, before anything renders ──────────── */

  html.classList.add('wcib-sealed');

  var css = document.createElement('style');
  css.id = 'wcib-seal';
  css.textContent =
    'html.wcib-sealed body > *:not(#wcib-gate){display:none !important;}' +
    'html.wcib-sealed,html.wcib-sealed body{overflow:hidden !important;background:#F4EFE7 !important;}' +
    '#wcib-gate{display:none;}' +
    'html.wcib-sealed #wcib-gate{display:flex;position:fixed;inset:0;z-index:2147483647;' +
      'align-items:center;justify-content:center;padding:24px;background:#F4EFE7;' +
      'font:500 14px/1.6 Poppins,system-ui,sans-serif;color:#2F3640;}' +
    '#wcib-gate .wcib-card{width:min(420px,100%);background:#fff;border:1px solid #E2DDD7;' +
      'border-radius:16px;padding:32px 28px;text-align:center;' +
      'box-shadow:0 2px 4px rgba(47,54,64,.05),0 18px 44px -20px rgba(47,54,64,.35);}' +
    '#wcib-gate h1{font:700 19px/1.3 Poppins,system-ui,sans-serif;margin:0 0 6px;color:#2F3640;}' +
    '#wcib-gate h2{font:600 14.5px/1.4 Poppins,system-ui,sans-serif;margin:0 0 12px;color:#6C7480;}' +
    '#wcib-gate p{margin:0 0 16px;color:#6C7480;font-size:13.5px;}' +
    '#wcib-gate form{display:flex;flex-direction:column;gap:10px;}' +
    '#wcib-gate input{width:100%;box-sizing:border-box;padding:11px 13px;border:1px solid #E2DDD7;' +
      'border-radius:9px;font:400 14px/1.4 Poppins,system-ui,sans-serif;color:#2F3640;background:#fff;}' +
    '#wcib-gate input:focus-visible{outline:2px solid #B47267;outline-offset:1px;border-color:#B47267;}' +
    '#wcib-gate button{border:none;border-radius:9px;padding:11px 16px;cursor:pointer;' +
      'font:600 14px/1.4 Poppins,system-ui,sans-serif;background:#B47267;color:#fff;}' +
    '#wcib-gate button:disabled{opacity:.6;cursor:default;}' +
    '#wcib-gate button.ghost{background:transparent;color:#6C7480;font-weight:500;padding:6px;}' +
    '#wcib-gate button.ghost:hover{color:#2F3640;text-decoration:underline;}' +
    '#wcib-gate .wcib-err{color:#B47267;font-size:12.5px;margin:12px 0 0;}';
  (document.head || html).appendChild(css);

  var robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, nofollow';
  (document.head || html).appendChild(robots);

  /* ── The sign-in screen ────────────────────────────────────────────── */

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function card(inner) {
    if (!gate) {
      gate = document.getElementById('wcib-gate');
      if (!gate) {
        gate = document.createElement('div');
        gate.id = 'wcib-gate';
        document.body.appendChild(gate);
      }
    }
    gate.innerHTML = '<div class="wcib-card">' + inner + '</div>';
  }

  function seal() { html.classList.add('wcib-sealed'); }
  function unseal() { html.classList.remove('wcib-sealed'); }

  function screenChecking() {
    card('<h1>WCIB Maths</h1><p>Checking your access…</p>');
  }

  function screenUnavailable() {
    card('<h1>WCIB Maths</h1><h2>Cannot check access right now</h2>' +
      '<p>The sign-in service did not load. Check your internet connection and try again. ' +
      'If this keeps happening, let the Head of Maths know.</p>' +
      '<button type="button" id="wcib-retry">Try again</button>');
    var b = document.getElementById('wcib-retry');
    if (b) b.onclick = function () { location.reload(); };
  }

  function screenSignIn(err) {
    card('<h1>WCIB Maths</h1><h2>' + esc(SUBTITLE) + '</h2>' +
      '<p>This site is for maths department staff. Enter your school email and we will send ' +
      'you a sign-in link — no password needed.</p>' +
      '<form id="wcib-form"><input id="wcib-email" type="email" required ' +
      'placeholder="your.name@wellingtoncollege.ac.th" autocomplete="email">' +
      '<button type="submit">Send sign-in link</button></form>' +
      (err ? '<p class="wcib-err">' + esc(err) + '</p>' : ''));

    document.getElementById('wcib-form').onsubmit = function (e) {
      e.preventDefault();
      var email = document.getElementById('wcib-email').value.trim();
      if (!email) return;
      var btn = gate.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Sending…';
      auth.sendSignInLinkToEmail(email, {
        url: window.location.origin + window.location.pathname,
        handleCodeInApp: true
      }).then(function () {
        try { localStorage.setItem(EMAIL_KEY, email); } catch (e2) {}
        screenSent(email);
      }).catch(function (e2) {
        screenSignIn(e2 && e2.code === 'auth/unauthorized-continue-uri'
          ? 'This web address has not been added to the Firebase authorised list yet.'
          : 'Could not send the link: ' + (e2 && e2.message ? e2.message : 'unknown error'));
      });
    };
  }

  function screenSent(email) {
    card('<h1>Check your inbox</h1>' +
      '<p>We sent a sign-in link to <strong>' + esc(email) + '</strong>. Open it on this device ' +
      'and you will stay signed in here.</p>' +
      '<button class="ghost" type="button" id="wcib-again">Use a different address</button>');
    document.getElementById('wcib-again').onclick = function () { screenSignIn(''); };
  }

  function screenDenied(email) {
    card('<h1>Not on the teacher list</h1>' +
      '<p>You are signed in as <strong>' + esc(email) + '</strong>, but that address is not on ' +
      'the maths department list. Ask the Head of Maths to add you.</p>' +
      '<button class="ghost" type="button" id="wcib-out">Sign out</button>');
    document.getElementById('wcib-out').onclick = function () {
      auth.signOut().then(function () {
        try { localStorage.removeItem(EMAIL_KEY); } catch (e) {}
      });
    };
  }

  /* ── Firebase ──────────────────────────────────────────────────────── */

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = reject;
      (document.head || html).appendChild(s);
    });
  }

  function loadSDK() {
    return SDK.reduce(function (chain, src) {
      return chain.then(function () { return loadScript(src); });
    }, Promise.resolve());
  }

  function allowed(u) {
    if (!u || !u.email) return Promise.resolve(null);
    return firebase.firestore().collection('teachers').doc(u.email.toLowerCase()).get()
      .then(function (d) {
        return d.exists ? { email: u.email.toLowerCase(), code: d.data().code || null } : null;
      })
      .catch(function () { return null; });
  }

  function completeLinkSignIn() {
    if (!auth.isSignInWithEmailLink(window.location.href)) return;
    var email = '';
    try { email = localStorage.getItem(EMAIL_KEY) || ''; } catch (e) {}
    if (!email) email = window.prompt('Please confirm the email address you asked for the link with:') || '';
    if (!email) return;
    auth.signInWithEmailLink(email, window.location.href).then(function () {
      try { localStorage.removeItem(EMAIL_KEY); } catch (e) {}
      history.replaceState(null, '', window.location.origin + window.location.pathname);
    }).catch(function (err) {
      alert('That sign-in link did not work (' + (err && err.code ? err.code : 'error') +
        '). Links expire and can only be used once — please request a new one.');
    });
  }

  function start() {
    screenChecking();
    loadSDK().then(function () {
      firebase.initializeApp(CONFIG);
      auth = firebase.auth();
      window.WCIB_AUTH = auth;
      completeLinkSignIn();
      auth.onAuthStateChanged(function (u) {
        window.WCIB_ME = null;
        if (!u) { seal(); screenSignIn(''); return; }
        screenChecking();
        allowed(u).then(function (person) {
          if (auth.currentUser && auth.currentUser.uid !== u.uid) return;
          window.WCIB_ME = person;
          if (!person) { seal(); screenDenied(u.email); return; }
          unseal();
        });
      });
    }).catch(function () {
      screenUnavailable();           // no sign-in service means the page stays shut
    });
  }

  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', start)
    : start();
})();
