/* ==========================================================
   NEXUS AI — walking through the machine

   First person. Scrolling walks you FORWARD down a corridor
   (camera travels -Z), with a slow walking bob so it reads as
   moving on foot rather than sliding on rails.

   Along the corridor:
     - structural arches rushing past, which is what actually
       sells forward motion
     - four rails carrying data packets that never stop moving:
       the automation running whether you're watching or not
     - a processing station at each section's depth, where a
       packet is picked up, worked on, and handed onward

   Section depths are measured from the real DOM, so the
   stations stay lined up with the copy on the walls.
   ========================================================== */

(function () {
  "use strict";

  var prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function onReady(fn) {
    if (document.readyState !== "loading") fn();
    else document.addEventListener("DOMContentLoaded", fn);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* how far you actually walk, in world units */
  var CORRIDOR = 620;

  var INK = 0x2a3142, ACCENT = 0x5b4ae8, TEAL = 0x0e9e86, PALE = 0xc9cede;

  function initScene() {
    var canvas = document.getElementById("scene");
    if (!canvas) return;
    if (typeof THREE === "undefined") { canvas.style.display = "none"; return; }

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas, antialias: true, alpha: true, powerPreference: "high-performance"
      });
    } catch (e) { canvas.style.display = "none"; return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    var scene = new THREE.Scene();
    // haze so the corridor fades into the page instead of ending in a hard edge
    scene.fog = new THREE.Fog(0xfcfcfe, 40, 190);

    var camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

    scene.add(new THREE.AmbientLight(0xffffff, 0.82));
    var key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(5, 12, 6); scene.add(key);
    var fill = new THREE.DirectionalLight(0x8b7dff, 0.45);
    fill.position.set(-6, -3, -8); scene.add(fill);

    function matte(c, opts) {
      return new THREE.MeshStandardMaterial(Object.assign({
        color: c, roughness: 0.45, metalness: 0.1
      }, opts || {}));
    }

    /* =========================================================
       THE CORRIDOR — arches rushing past you
       ========================================================= */

    var ARCH_GAP = 13;
    var ARCH_COUNT = Math.ceil(CORRIDOR / ARCH_GAP) + 6;
    var archGeo = new THREE.TorusGeometry(13, 0.2, 8, 4); // 4 segments = square arch
    var archMesh = new THREE.InstancedMesh(archGeo, matte(PALE, { roughness: .6 }), ARCH_COUNT);
    archMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(archMesh);

    var archDummy = new THREE.Object3D();
    (function layoutArches() {
      var cAcc = new THREE.Color(ACCENT), cPale = new THREE.Color(PALE);
      for (var i = 0; i < ARCH_COUNT; i++) {
        archMesh.setColorAt(i, i % 5 === 0 ? cAcc : cPale);
      }
      if (archMesh.instanceColor) archMesh.instanceColor.needsUpdate = true;
    })();

    /* --- rails: four lines running the length, carrying packets --- */

    var RAIL_OFFSETS = [
      { x: -11, y: -7 }, { x: 11, y: -7 },
      { x: -11, y: 7.5 }, { x: 11, y: 7.5 }
    ];

    RAIL_OFFSETS.forEach(function (o) {
      var g = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(o.x, o.y, 30),
        new THREE.Vector3(o.x, o.y, -CORRIDOR - 40)
      ]);
      scene.add(new THREE.Line(g, new THREE.LineBasicMaterial({
        color: PALE, transparent: true, opacity: 0.85
      })));
    });

    // packets streaming along the rails — the automation, always running
    var PACKETS = window.innerWidth < 760 ? 90 : 190;
    var packetMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.5, 0.5, 1.8), matte(0xffffff), PACKETS
    );
    packetMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(packetMesh);

    var packets = [];
    (function seedPackets() {
      var cAcc = new THREE.Color(ACCENT), cTeal = new THREE.Color(TEAL), cInk = new THREE.Color(INK);
      for (var i = 0; i < PACKETS; i++) {
        var rail = RAIL_OFFSETS[i % RAIL_OFFSETS.length];
        packets.push({
          rail: rail,
          z: 30 - Math.random() * (CORRIDOR + 60),
          speed: 26 + Math.random() * 26
        });
        var r = Math.random();
        packetMesh.setColorAt(i, r > 0.72 ? cTeal : r > 0.3 ? cAcc : cInk);
      }
      if (packetMesh.instanceColor) packetMesh.instanceColor.needsUpdate = true;
    })();

    /* =========================================================
       STATIONS — one per section, mounted beside the walkway.
       Each shows a packet being taken in, worked, handed on.
       ========================================================= */

    var stations = [];

    function makeStation(side) {
      var g = new THREE.Group();

      // the working surface it all sits on
      var slab = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 11), matte(PALE, { roughness: .7 }));
      slab.position.y = -4.4;
      g.add(slab);

      // three processing nodes: in -> work -> out
      var nodes = [];
      var nodeDefs = [
        { x: -3.4, c: INK },
        { x: 0,    c: ACCENT },
        { x: 3.4,  c: TEAL }
      ];
      nodeDefs.forEach(function (d) {
        var n = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 2.1), matte(d.c));
        n.position.set(d.x, -2.6, 0);
        g.add(n);
        nodes.push(n);
        // wire cage so it reads as a machine, not a toy block
        var cage = new THREE.Mesh(
          new THREE.BoxGeometry(2.1, 2.1, 2.1),
          new THREE.MeshBasicMaterial({ color: d.c, wireframe: true, transparent: true, opacity: .35 })
        );
        cage.scale.setScalar(1.5);
        n.add(cage);
      });

      // the link between nodes
      var link = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 0.1), matte(ACCENT));
      link.position.set(0, -2.6, 0);
      g.add(link);

      // the job travelling between them
      var job = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), matte(TEAL));
      g.add(job);

      // a readout board angled toward the walkway
      var board = new THREE.Mesh(
        new THREE.BoxGeometry(9, 5.4, 0.22),
        matte(0xffffff, { roughness: .35 })
      );
      board.position.set(0, 2.4, -1.6);
      board.rotation.y = side * -0.34;
      g.add(board);

      // rows on the board, filling in as the station works
      var rows = [];
      for (var r = 0; r < 5; r++) {
        var row = new THREE.Mesh(
          new THREE.BoxGeometry(6.4, 0.34, 0.08),
          matte(r === 0 ? ACCENT : PALE)
        );
        row.position.set(-0.6, 1.6 - r * 0.82, 0.16);
        board.add(row);
        rows.push(row);
      }

      g.position.x = side * 15.5;
      g.rotation.y = side * 0.22;

      return {
        group: g,
        update: function (local, t) {
          // the job hops node to node as you walk past
          var seg = clamp01(local) * 2;
          var i0 = Math.min(Math.floor(seg), 1);
          var f = seg - i0;
          job.position.set(
            lerp(nodes[i0].position.x, nodes[i0 + 1].position.x, f),
            -2.6 + Math.sin(f * Math.PI) * 1.5,  // arcs as it hops
            0
          );

          nodes.forEach(function (n, i) {
            var active = clamp01(1 - Math.abs(seg - i));
            n.scale.setScalar(1 + active * 0.28);
            n.rotation.y = t * (0.3 + i * 0.15);
          });

          // rows light up in sequence — work being logged
          rows.forEach(function (row, i) {
            var on = clamp01(local * 5 - i);
            row.scale.x = 0.2 + on * 0.8;
            row.material.color.setHex(on > 0.5 ? ACCENT : PALE);
          });
        }
      };
    }

    function addStation(el, side) {
      if (!el) return;
      var st = makeStation(side);
      st.group.visible = false;
      scene.add(st.group);
      stations.push({ el: el, obj: st, start: 0, end: 1, centre: 0.5 });
    }

    // alternate sides so you're looking left, then right, as you walk
    addStation(document.querySelector("#services"), -1);
    addStation(document.querySelector("#process"), 1);
    addStation(document.querySelector("#why"), -1);
    addStation(document.querySelector("#faq"), 1);
    addStation(document.querySelector("#contact"), -1);

    /* =========================================================
       Measure: map each section to a depth down the corridor
       ========================================================= */

    function measure() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      stations.forEach(function (s) {
        var rect = s.el.getBoundingClientRect();
        var top = rect.top + window.scrollY;
        s.start = clamp01((top - window.innerHeight) / max);
        s.end = clamp01((top + rect.height) / max);
        s.centre = (s.start + s.end) / 2;
        s.obj.group.position.z = -s.centre * CORRIDOR;
      });
    }

    var progress = 0, targetP = 0;
    function readScroll() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      targetP = max > 0 ? clamp01(window.scrollY / max) : 0;
    }
    readScroll(); measure();
    window.addEventListener("scroll", readScroll, { passive: true });
    window.addEventListener("load", measure);

    // look around slightly with the cursor, like turning your head
    var look = { x: 0, y: 0 }, lookT = { x: 0, y: 0 };
    window.addEventListener("pointermove", function (e) {
      lookT.x = (e.clientX / window.innerWidth - 0.5) * 2;
      lookT.y = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });

    function resize() {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      readScroll(); measure();
    }
    resize();
    window.addEventListener("resize", resize);

    var clock = performance.now(), elapsed = 0;
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden) clock = performance.now();
    });

    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min((now - clock) / 1000, 0.05);
      clock = now;
      if (document.hidden) return;
      elapsed += dt;

      progress += (targetP - progress) * (prefersReduced ? 1 : 0.085);
      look.x += (lookT.x - look.x) * 0.05;
      look.y += (lookT.y - look.y) * 0.05;

      /* --- walk forward --- */
      var walkZ = -progress * CORRIDOR;
      var bob = prefersReduced ? 0 : Math.sin(elapsed * 2.2) * 0.22;   // footfall
      var sway = prefersReduced ? 0 : Math.sin(elapsed * 1.1) * 0.16;

      camera.position.set(sway + look.x * 3.2, bob - look.y * 2.2, walkZ + 24);
      camera.lookAt(look.x * 5, -look.y * 3.5, walkZ - 30);
      camera.rotation.z = (prefersReduced ? 0 : Math.sin(elapsed * 1.1) * 0.008); // slight roll

      /* --- recycle arches around the camera so they never run out --- */
      var span = ARCH_COUNT * ARCH_GAP;
      for (var i = 0; i < ARCH_COUNT; i++) {
        var z = -i * ARCH_GAP;
        // wrap relative to where the camera is
        var rel = z - walkZ;
        rel = ((rel % span) + span) % span;      // 0..span
        archDummy.position.set(0, 0, walkZ + 30 - rel);
        archDummy.rotation.z = Math.PI / 4;      // diamond -> reads as an arch
        archDummy.updateMatrix();
        archMesh.setMatrixAt(i, archDummy.matrix);
      }
      archMesh.instanceMatrix.needsUpdate = true;

      /* --- packets keep flowing regardless of scroll --- */
      var pd = new THREE.Object3D();
      for (var p = 0; p < PACKETS; p++) {
        var pk = packets[p];
        if (!prefersReduced) pk.z -= pk.speed * dt;
        // loop back to the far end once past the camera
        if (pk.z < walkZ - CORRIDOR * 0.15 - 60) pk.z = walkZ + 60;
        pd.position.set(pk.rail.x, pk.rail.y, pk.z);
        pd.updateMatrix();
        packetMesh.setMatrixAt(p, pd.matrix);
      }
      packetMesh.instanceMatrix.needsUpdate = true;

      /* --- stations only work when you're near them --- */
      stations.forEach(function (s) {
        var near = Math.abs(progress - s.centre) < 0.3;
        s.obj.group.visible = near;
        if (!near) return;
        var span2 = Math.max(0.0001, s.end - s.start);
        s.obj.update(clamp01((progress - s.start) / span2), elapsed);
      });

      renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);
  }

  /* ================= page chrome ================= */

  function initNav() {
    var nav = document.getElementById("nav");
    var toggle = document.getElementById("navToggle");
    if (!nav) return;
    function onScroll() { nav.classList.toggle("scrolled", window.scrollY > 12); }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    if (toggle) {
      toggle.addEventListener("click", function () {
        var open = nav.classList.toggle("open");
        toggle.setAttribute("aria-expanded", String(open));
      });
      nav.querySelectorAll(".nav-links a").forEach(function (a) {
        a.addEventListener("click", function () {
          nav.classList.remove("open");
          toggle.setAttribute("aria-expanded", "false");
        });
      });
    }
  }

  function initReveal() {
    var els = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -40px 0px" });
    els.forEach(function (el) { io.observe(el); });
  }

  function initStages() {
    var bar = document.getElementById("progressBar");
    var caps = Array.prototype.slice.call(document.querySelectorAll(".stage-cap"));
    function update() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? clamp01(window.scrollY / max) : 0;
      if (bar) bar.style.transform = "scaleX(" + p + ")";
      caps.forEach(function (el) {
        var r = el.getBoundingClientRect();
        var d = Math.abs((r.top + r.height / 2) - window.innerHeight / 2) / (window.innerHeight * 0.55);
        el.style.opacity = String(clamp01(1.15 - d));
      });
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
  }

  function initYear() {
    var y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());
  }

  function checkPlaceholders() {
    var unset = [];
    document.querySelectorAll("[data-placeholder]").forEach(function (el) {
      if (/__YOUR_(WHATSAPP|EMAIL)__/.test(el.getAttribute("href") || "")) {
        unset.push(el.getAttribute("data-placeholder"));
      }
    });
    if (unset.length) {
      console.warn("[NEXUS AI] Contact links are still placeholders: " + unset.join(", ") +
        ". Replace __YOUR_WHATSAPP__ / __YOUR_EMAIL__ in index.html before going live.");
    }
  }

  onReady(function () {
    initNav(); initReveal(); initStages(); initYear();
    checkPlaceholders(); initScene();
  });
})();
