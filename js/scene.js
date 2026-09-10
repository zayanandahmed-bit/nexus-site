/* ==========================================================
   NEXUS AI — walking the winding machine

   First person along a PATH, not a straight tunnel. The route
   is a Catmull-Rom curve that banks left, right, up and down,
   and everything is built in the curve's own local frame:

     - arches sit on the curve, square to whatever direction
       it's heading, so the corridor bends as a whole
     - four rails follow the same curve, offset in its local
       up/side axes, carrying packets that never stop
     - a station at each section's depth, mounted out to one
       side of the path and turned to face the walkway

   Positions and frames are baked into a lookup table once, so
   walking it costs an array read per object rather than a
   curve solve.
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
    // 2.0 on retina quadruples fragment work for a difference you can't
    // see on flat-shaded geometry; 1.5 is the honest sweet spot here.
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

    var scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xfcfcfe, 45, 200);

    var camera = new THREE.PerspectiveCamera(62, 1, 0.1, 400);

    scene.add(new THREE.AmbientLight(0xffffff, 0.82));
    var key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(5, 12, 6); scene.add(key);
    var fill = new THREE.DirectionalLight(0x8b7dff, 0.45);
    fill.position.set(-6, -3, -8); scene.add(fill);

    /* Lambert, not Standard: nothing here uses roughness/metalness maps,
       so PBR shading is pure cost. Looks the same on flat matte solids. */
    function matte(c) {
      return new THREE.MeshLambertMaterial({ color: c });
    }

    /* =========================================================
       THE ROUTE — a curve that actually goes somewhere
       ========================================================= */

    var pathPoints = [
      new THREE.Vector3(  0,   0,   30),
      new THREE.Vector3(  0,   0,  -40),
      new THREE.Vector3( 34,   6, -110),   // bank right and climb
      new THREE.Vector3( 20,  -4, -190),
      new THREE.Vector3(-30, -10, -260),   // swing left and drop
      new THREE.Vector3(-46,   4, -340),
      new THREE.Vector3(  4,  12, -410),   // back across, rising
      new THREE.Vector3( 40,   2, -480),
      new THREE.Vector3( 16, -10, -560),
      new THREE.Vector3(-26,  -2, -640),   // final sweep left
      new THREE.Vector3(-10,   6, -720)
    ];
    var path = new THREE.CatmullRomCurve3(pathPoints, false, "catmullrom", 0.5);

    /* Bake the curve once: position + local axes at every sample.
       Walking then costs an array lookup instead of solving the
       curve for every arch, rail packet and station each frame. */
    var SAMPLES = 700;
    var frames = path.computeFrenetFrames(SAMPLES, false);
    var table = [];
    for (var s = 0; s <= SAMPLES; s++) {
      var t = s / SAMPLES;
      var fi = Math.min(SAMPLES - 1, s);
      var tan = frames.tangents[fi], nrm = frames.normals[fi], bin = frames.binormals[fi];
      // Orientation for anything riding the path, baked now. Assembling the
      // basis directly is far cheaper than lookAt() per object per frame —
      // lookAt costs a matrix solve plus a quaternion each call.
      var mat = new THREE.Matrix4().makeBasis(bin, nrm, tan);
      table.push({
        pos: path.getPointAt(t),
        tan: tan,
        nrm: nrm,       // local "up"
        bin: bin,       // local "side"
        mat: mat
      });
    }

    function sampleAt(t) {
      var f = clamp01(t) * SAMPLES;
      return table[Math.min(SAMPLES, Math.max(0, Math.round(f)))];
    }

    // a point offset sideways/upward from the path, in ITS frame
    var _v = new THREE.Vector3();
    function offsetPoint(t, side, up, out) {
      var f = sampleAt(t);
      out = out || new THREE.Vector3();
      out.copy(f.pos);
      out.addScaledVector(f.bin, side);
      out.addScaledVector(f.nrm, up);
      return out;
    }

    /* --- arches, square to whatever way the path is heading --- */

    var ARCH_COUNT = 120;
    var archMesh = new THREE.InstancedMesh(
      new THREE.TorusGeometry(13, 0.2, 8, 4), matte(PALE, { roughness: .6 }), ARCH_COUNT
    );
    scene.add(archMesh);

    (function placeArches() {
      var d = new THREE.Object3D();
      var look = new THREE.Vector3();
      var cAcc = new THREE.Color(ACCENT), cPale = new THREE.Color(PALE);
      for (var i = 0; i < ARCH_COUNT; i++) {
        var t = i / (ARCH_COUNT - 1);
        var f = sampleAt(t);
        d.position.copy(f.pos);
        d.quaternion.setFromRotationMatrix(f.mat);
        d.rotateZ(Math.PI / 4);  // diamond reads as an arch
        d.updateMatrix();
        archMesh.setMatrixAt(i, d.matrix);
        archMesh.setColorAt(i, i % 5 === 0 ? cAcc : cPale);
      }
      archMesh.instanceMatrix.needsUpdate = true;
      if (archMesh.instanceColor) archMesh.instanceColor.needsUpdate = true;
    })();

    /* --- rails: the same curve, offset in its own frame --- */

    var RAILS = [
      { side: -11, up: -7 }, { side: 11, up: -7 },
      { side: -11, up: 7.5 }, { side: 11, up: 7.5 }
    ];

    RAILS.forEach(function (r) {
      var pts = [];
      for (var i = 0; i <= 260; i++) {
        pts.push(offsetPoint(i / 260, r.side, r.up));
      }
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineBasicMaterial({ color: PALE, transparent: true, opacity: 0.85 })
      ));
    });

    /* --- packets riding the rails --- */

    var PACKETS = window.innerWidth < 760 ? 80 : 170;
    var packetMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.55, 0.55, 1.9), matte(0xffffff), PACKETS
    );
    packetMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(packetMesh);

    var packets = [];
    (function seedPackets() {
      var cAcc = new THREE.Color(ACCENT), cTeal = new THREE.Color(TEAL), cInk = new THREE.Color(INK);
      for (var i = 0; i < PACKETS; i++) {
        packets.push({
          rail: RAILS[i % RAILS.length],
          t: Math.random(),
          speed: 0.012 + Math.random() * 0.016   // in curve-t per second
        });
        var r = Math.random();
        packetMesh.setColorAt(i, r > 0.72 ? cTeal : r > 0.3 ? cAcc : cInk);
      }
      if (packetMesh.instanceColor) packetMesh.instanceColor.needsUpdate = true;
    })();

    /* =========================================================
       STATIONS — mounted off the path, facing the walkway
       ========================================================= */

    var stations = [];

    function makeStation(side) {
      var g = new THREE.Group();
      var inner = new THREE.Group();   // everything local, so g can be posed on the curve
      g.add(inner);

      var slab = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 11), matte(PALE, { roughness: .7 }));
      slab.position.y = -4.4;
      inner.add(slab);

      var nodes = [];
      [{ x: -3.4, c: INK }, { x: 0, c: ACCENT }, { x: 3.4, c: TEAL }].forEach(function (d) {
        var n = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 2.1), matte(d.c));
        n.position.set(d.x, -2.6, 0);
        var cage = new THREE.Mesh(
          new THREE.BoxGeometry(2.1, 2.1, 2.1),
          new THREE.MeshBasicMaterial({ color: d.c, wireframe: true, transparent: true, opacity: .35 })
        );
        cage.scale.setScalar(1.5);
        n.add(cage);
        inner.add(n);
        nodes.push(n);
      });

      var link = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.1, 0.1), matte(ACCENT));
      link.position.set(0, -2.6, 0);
      inner.add(link);

      var job = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 16), matte(TEAL));
      inner.add(job);

      var board = new THREE.Mesh(new THREE.BoxGeometry(9, 5.4, 0.22), matte(0xffffff, { roughness: .35 }));
      board.position.set(0, 2.4, -1.6);
      inner.add(board);

      var rows = [];
      for (var r = 0; r < 5; r++) {
        var row = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.34, 0.08), matte(PALE));
        row.position.set(-0.6, 1.6 - r * 0.82, 0.16);
        board.add(row);
        rows.push(row);
      }

      // turn the whole rig to face back across the walkway
      inner.rotation.y = side * 0.5;

      return {
        group: g,
        update: function (local, t) {
          var seg = clamp01(local) * 2;
          var i0 = Math.min(Math.floor(seg), 1);
          var f = seg - i0;
          job.position.set(
            lerp(nodes[i0].position.x, nodes[i0 + 1].position.x, f),
            -2.6 + Math.sin(f * Math.PI) * 1.5,
            0
          );
          nodes.forEach(function (n, i) {
            var active = clamp01(1 - Math.abs(seg - i));
            n.scale.setScalar(1 + active * 0.28);
            n.rotation.y = t * (0.3 + i * 0.15);
          });
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
      stations.push({ el: el, obj: st, side: side, start: 0, end: 1, centre: 0.5 });
    }

    addStation(document.querySelector("#services"), -1);
    addStation(document.querySelector("#process"), 1);
    addStation(document.querySelector("#why"), -1);
    addStation(document.querySelector("#faq"), 1);
    addStation(document.querySelector("#contact"), -1);

    /* --- map sections onto the route, and pose each station on it --- */

    var _look = new THREE.Vector3();

    function measure() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      stations.forEach(function (s) {
        var rect = s.el.getBoundingClientRect();
        var top = rect.top + window.scrollY;
        s.start = clamp01((top - window.innerHeight) / max);
        s.end = clamp01((top + rect.height) / max);
        s.centre = (s.start + s.end) / 2;

        var f = sampleAt(s.centre);
        offsetPoint(s.centre, s.side * 16, -1, s.obj.group.position);
        s.obj.group.up.copy(f.nrm);
        _look.copy(s.obj.group.position).add(f.tan);
        s.obj.group.lookAt(_look);   // stand square to the path here
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

    var camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
    var _pkMat = new THREE.Matrix4(), _pkPos = new THREE.Vector3();

    function frame(now) {
      requestAnimationFrame(frame);
      var dt = Math.min((now - clock) / 1000, 0.05);
      clock = now;
      if (document.hidden) return;
      elapsed += dt;

      progress += (targetP - progress) * (prefersReduced ? 1 : 0.085);
      look.x += (lookT.x - look.x) * 0.05;
      look.y += (lookT.y - look.y) * 0.05;

      /* --- walk the curve --- */
      var walkT = clamp01(progress * 0.94);           // leave a little runway at the end
      var here = sampleAt(walkT);
      var bob = prefersReduced ? 0 : Math.sin(elapsed * 2.2) * 0.22;
      var sway = prefersReduced ? 0 : Math.sin(elapsed * 1.1) * 0.5;

      // stand on the path, offset by footfall + where you're looking
      camPos.copy(here.pos)
        .addScaledVector(here.bin, sway + look.x * 3.4)
        .addScaledVector(here.nrm, bob - look.y * 2.2);
      camera.position.copy(camPos);

      // look further along the route, so corners come at you naturally
      var ahead = sampleAt(Math.min(1, walkT + 0.02));
      camTarget.copy(ahead.pos)
        .addScaledVector(ahead.bin, look.x * 7)
        .addScaledVector(ahead.nrm, -look.y * 5);
      camera.up.copy(here.nrm);
      camera.lookAt(camTarget);
      // bank slightly into the turn
      var turn = ahead.tan.dot(here.bin);
      // gentle bank only — a strong roll makes the copy hard to read
      camera.rotation.z += turn * 0.3 + (prefersReduced ? 0 : Math.sin(elapsed * 1.1) * 0.008);

      /* --- packets keep flowing --- */
      for (var p = 0; p < PACKETS; p++) {
        var pk = packets[p];
        if (!prefersReduced) {
          pk.t -= pk.speed * dt;
          if (pk.t < 0) pk.t += 1;         // loop the route
        }
        var pf = sampleAt(pk.t);
        offsetPoint(pk.t, pk.rail.side, pk.rail.up, _pkPos);
        _pkMat.copy(pf.mat).setPosition(_pkPos);
        packetMesh.setMatrixAt(p, _pkMat);
      }
      packetMesh.instanceMatrix.needsUpdate = true;

      /* --- stations work only while you're beside them --- */
      stations.forEach(function (s) {
        var near = Math.abs(progress - s.centre) < 0.3;
        s.obj.group.visible = near;
        if (!near) return;
        var span = Math.max(0.0001, s.end - s.start);
        s.obj.update(clamp01((progress - s.start) / span), elapsed);
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
