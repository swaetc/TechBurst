// ============================================================
// The 3D digital twin.
//
// Everything here is built from Three.js primitives, so there are
// no model files to download. One world unit equals one centimetre,
// which means the tank really is 15 units tall and the water height
// can be used directly from the telemetry.
//
// The scene mirrors the physical prototype:
//   - 3D printed frame around a clear container
//   - L bracket sensor arm holding the HC-SR04, pointing down
//   - servo and gate next to the spillway opening
//   - relay driven pump with a tube into a catch cup
//   - buzzer, green LED and red LED on the electronics tray
//
// Public interface:
//   new Twin(containerElement)
//   twin.update(reading)     // called for every telemetry message
//   twin.setLinkState(bool)  // dims the scene when telemetry stops
// ============================================================

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { FIRMWARE, COLORS } from "../config.js";

// Inner size of the clear container, in centimetres.
const TANK = {
  width: 12,
  depth: 9,
  height: FIRMWARE.TANK_HEIGHT_CM, // 15
  wall: 0.35
};

export class Twin {
  constructor(mount) {
    this.mount = mount;

    // ---------- renderer ----------
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(this.renderer.domElement);

    // ---------- scene and camera ----------
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x080b0f, 60, 140);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    this.camera.position.set(20, 16.5, 27);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(-3.0, 8.0, 0);
    this.controls.minDistance = 16;
    this.controls.maxDistance = 90;
    this.controls.maxPolarAngle = Math.PI * 0.49; // do not go under the floor

    this.buildLights();
    this.buildFloor();
    this.buildTray();
    this.buildFrame();
    this.buildTank();
    this.buildSensorArm();
    this.buildSpillwayAndGate();
    this.buildPump();
    this.buildIndicators();

    // ---------- animated state ----------
    // Targets are set by update(), the render loop eases towards them
    // so the twin moves smoothly instead of jumping once per second.
    this.target = { level: 0, gate: 0, critical: false, pump: false };
    this.current = { level: 0, gate: 0 };
    this.linkUp = true;
    this.clock = new THREE.Clock();

    // ---------- sizing ----------
    this.resize();
    new ResizeObserver(() => this.resize()).observe(mount);

    this.renderer.setAnimationLoop(() => this.render());
  }

  // ============================================================
  // Scene building
  // ============================================================

  buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x8fa8c0, 0x121820, 1.0));

    const key = new THREE.DirectionalLight(0xffffff, 1.9);
    key.position.set(18, 30, 20);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 90;
    key.shadow.camera.left = -30;
    key.shadow.camera.right = 30;
    key.shadow.camera.top = 30;
    key.shadow.camera.bottom = -30;
    this.scene.add(key);

    // Cool rim light from behind, keeps the silhouette readable.
    const rim = new THREE.DirectionalLight(0x4ec9d9, 0.5);
    rim.position.set(-20, 12, -18);
    this.scene.add(rim);
  }

  buildFloor() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(46, 64),
      new THREE.MeshStandardMaterial({ color: 0x0d141c, roughness: 0.95, metalness: 0 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.02;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(80, 40, 0x223140, 0x16202b);
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    this.scene.add(grid);
  }

  // The electronics tray: a printed plate carrying the ESP32 and breadboard.
  buildTray() {
    const trayMat = new THREE.MeshStandardMaterial({
      color: 0x2b3440, roughness: 0.8, metalness: 0.1
    });

    const tray = new THREE.Mesh(new THREE.BoxGeometry(11, 0.6, 8), trayMat);
    tray.position.set(-13.5, 0.3, 0);
    tray.castShadow = true;
    tray.receiveShadow = true;
    this.scene.add(tray);

    // ESP32 dev board: dark blue PCB with a silver shield can.
    const pcb = new THREE.Mesh(
      new THREE.BoxGeometry(5.2, 0.25, 2.6),
      new THREE.MeshStandardMaterial({ color: 0x14314f, roughness: 0.6 })
    );
    pcb.position.set(-14.6, 0.73, -1.6);
    pcb.castShadow = true;
    this.scene.add(pcb);

    const shield = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.3, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xb9c3cc, roughness: 0.35, metalness: 0.8 })
    );
    shield.position.set(-15.8, 1.0, -1.6);
    this.scene.add(shield);

    // Breadboard: white block with a centre channel.
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.5, 3.2),
      new THREE.MeshStandardMaterial({ color: 0xdfe4e8, roughness: 0.85 })
    );
    board.position.set(-13.8, 0.85, 2.2);
    board.castShadow = true;
    this.scene.add(board);

    // Relay module: blue board with a black relay can on top.
    const relay = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.2, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x1f4f8a, roughness: 0.6 })
    );
    relay.position.set(-10.6, 0.7, -1.8);
    this.scene.add(relay);

    this.relayCan = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.0, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x1b1f24, roughness: 0.7 })
    );
    this.relayCan.position.set(-10.6, 1.3, -1.8);
    this.relayCan.castShadow = true;
    this.scene.add(this.relayCan);
  }

  // The printed frame: four corner posts and a top ring.
  buildFrame() {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.frame, roughness: 0.75, metalness: 0.15
    });
    this.frameGroup = new THREE.Group();

    const postH = TANK.height + 4;
    const dx = TANK.width / 2 + 0.9;
    const dz = TANK.depth / 2 + 0.9;

    [[-dx, -dz], [dx, -dz], [-dx, dz], [dx, dz]].forEach(([x, z]) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.8, postH, 0.8), mat);
      post.position.set(x, postH / 2, z);
      post.castShadow = true;
      this.frameGroup.add(post);
    });

    // Base rails and top rails.
    [0.4, postH].forEach((y) => {
      const railX = new THREE.Mesh(new THREE.BoxGeometry(dx * 2 + 0.8, 0.7, 0.7), mat);
      railX.position.set(0, y, -dz);
      const railX2 = railX.clone();
      railX2.position.z = dz;
      const railZ = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, dz * 2 + 0.8), mat);
      railZ.position.set(-dx, y, 0);
      const railZ2 = railZ.clone();
      railZ2.position.x = dx;
      [railX, railX2, railZ, railZ2].forEach((r) => { r.castShadow = true; this.frameGroup.add(r); });
    });

    this.scene.add(this.frameGroup);
  }

  // The clear plastic container plus the water inside it.
  buildTank() {
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0xa9d6e8,
      transparent: true,
      opacity: 0.16,
      roughness: 0.05,
      metalness: 0,
      transmission: 0.6,
      side: THREE.DoubleSide
    });

    // Four walls and a floor, built separately so we can see inside.
    const w = TANK.width, d = TANK.depth, h = TANK.height, t = TANK.wall;

    const base = new THREE.Mesh(new THREE.BoxGeometry(w + t * 2, t, d + t * 2), glass);
    base.position.y = t / 2;
    this.scene.add(base);

    const wallFB = new THREE.BoxGeometry(w + t * 2, h, t);
    const wallLR = new THREE.BoxGeometry(t, h, d + t * 2);
    [[0, h / 2, -d / 2 - t / 2, wallFB], [0, h / 2, d / 2 + t / 2, wallFB],
     [-w / 2 - t / 2, h / 2, 0, wallLR], [w / 2 + t / 2, h / 2, 0, wallLR]]
      .forEach(([x, y, z, geo]) => {
        const wall = new THREE.Mesh(geo, glass);
        wall.position.set(x, y, z);
        this.scene.add(wall);
      });

    // Centimetre ticks etched up the front left corner.
    const tickMat = new THREE.LineBasicMaterial({ color: 0x3d5468 });
    for (let cm = 1; cm < h; cm++) {
      const long = cm % 5 === 0;
      const pts = [
        new THREE.Vector3(-w / 2, cm, d / 2 + t),
        new THREE.Vector3(-w / 2 + (long ? 1.6 : 0.8), cm, d / 2 + t)
      ];
      this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), tickMat));
    }

    // The water. A box we scale on Y, so height equals the level in cm.
    this.waterMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(COLORS.water),
      transparent: true,
      opacity: 0.72,
      roughness: 0.15,
      metalness: 0.05,
      transmission: 0.25
    });
    this.water = new THREE.Mesh(new THREE.BoxGeometry(w - 0.1, 1, d - 0.1), this.waterMat);
    this.water.position.y = 0.5;
    this.scene.add(this.water);

    // A brighter plane sitting on the surface, so the level line reads
    // clearly from any angle.
    this.surface = new THREE.Mesh(
      new THREE.PlaneGeometry(w - 0.1, d - 0.1),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(COLORS.water), transparent: true, opacity: 0.55,
        side: THREE.DoubleSide
      })
    );
    this.surface.rotation.x = -Math.PI / 2;
    this.scene.add(this.surface);

    // Threshold rings: critical at 10 cm, safe reset at 7 cm.
    this.scene.add(this.thresholdRing(FIRMWARE.CRITICAL_LEVEL_CM, COLORS.critical));
    this.scene.add(this.thresholdRing(FIRMWARE.SAFE_RESET_LEVEL_CM, COLORS.ok));
  }

  // A flat rectangle outline drawn at a given height inside the tank.
  thresholdRing(height, color) {
    const w = TANK.width / 2, d = TANK.depth / 2;
    const pts = [
      new THREE.Vector3(-w, height, -d), new THREE.Vector3(w, height, -d),
      new THREE.Vector3(w, height, d), new THREE.Vector3(-w, height, d),
      new THREE.Vector3(-w, height, -d)
    ];
    return new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color, dashSize: 0.6, gapSize: 0.4 })
    ).computeLineDistances();
  }

  // The L bracket arm holding the HC-SR04 above the water, pointing down.
  buildSensorArm() {
    const mat = new THREE.MeshStandardMaterial({
      color: COLORS.metal, roughness: 0.5, metalness: 0.6
    });
    const armY = TANK.height + 4;

    // Horizontal part of the L, reaching in over the middle of the tank.
    const arm = new THREE.Mesh(new THREE.BoxGeometry(TANK.width / 2 + 2, 0.5, 1.6), mat);
    arm.position.set(-(TANK.width / 4) + 0.4, armY + 0.6, 0);
    arm.castShadow = true;
    this.scene.add(arm);

    // Vertical part bolted to the frame post.
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 1.6), mat);
    upright.position.set(-TANK.width / 2 - 0.9, armY - 0.2, 0);
    this.scene.add(upright);

    // HC-SR04: blue PCB with two silver cans looking down.
    this.sensorGroup = new THREE.Group();
    this.sensorGroup.position.set(0, armY + 0.1, 0);

    const pcb = new THREE.Mesh(
      new THREE.BoxGeometry(4.5, 0.25, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x1b4f7a, roughness: 0.6 })
    );
    pcb.castShadow = true;
    this.sensorGroup.add(pcb);

    const canGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.9, 24);
    const canMat = new THREE.MeshStandardMaterial({
      color: 0xa8b4bf, roughness: 0.4, metalness: 0.7
    });
    [-1.3, 1.3].forEach((x) => {
      const can = new THREE.Mesh(canGeo, canMat);
      can.position.set(x, -0.55, 0);
      can.castShadow = true;
      this.sensorGroup.add(can);
    });
    this.scene.add(this.sensorGroup);

    // The measuring beam: a cone from the sensor down to the water.
    // Its length is the distance the HC-SR04 reports.
    this.beamMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.accent), transparent: true, opacity: 0.1,
      side: THREE.DoubleSide, depthWrite: false
    });
    this.beam = new THREE.Mesh(new THREE.ConeGeometry(1.6, 1, 20, 1, true), this.beamMat);
    this.scene.add(this.beam);

    // A hairline down the centre of the beam, easier to read than the cone.
    this.beamLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)
      ]),
      new THREE.LineBasicMaterial({ color: new THREE.Color(COLORS.accent), transparent: true, opacity: 0.5 })
    );
    this.scene.add(this.beamLine);

    // Floating label showing the live level in cm.
    this.label = makeLabel();
    this.label.position.set(TANK.width / 2 + 6.5, 10, 0);
    this.scene.add(this.label);
  }

  // The spillway notch and the servo driven bypass gate in front of it.
  buildSpillwayAndGate() {
    const printed = new THREE.MeshStandardMaterial({
      color: COLORS.frame, roughness: 0.75, metalness: 0.15
    });

    // The spillway: a short chute sticking out of the right hand wall,
    // sitting at the critical height so the story reads clearly.
    const chute = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.4, 4.0), printed);
    chute.position.set(TANK.width / 2 + 1.7, FIRMWARE.CRITICAL_LEVEL_CM - 1.2, 0);
    chute.rotation.z = -0.12;
    chute.castShadow = true;
    this.scene.add(chute);

    [-2.0, 2.0].forEach((z) => {
      const cheek = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 0.3), printed);
      cheek.position.set(TANK.width / 2 + 1.7, FIRMWARE.CRITICAL_LEVEL_CM - 0.5, z);
      this.scene.add(cheek);
    });

    // FS90 micro servo: small blue body with a white horn.
    const servo = new THREE.Mesh(
      new THREE.BoxGeometry(2.3, 2.2, 1.2),
      new THREE.MeshStandardMaterial({ color: 0x2a6fb5, roughness: 0.55 })
    );
    servo.position.set(TANK.width / 2 + 3.6, FIRMWARE.CRITICAL_LEVEL_CM + 1.3, 2.6);
    servo.castShadow = true;
    this.scene.add(servo);

    const horn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.45, 0.5, 16),
      new THREE.MeshStandardMaterial({ color: 0xe8edf1, roughness: 0.5 })
    );
    horn.position.set(TANK.width / 2 + 3.6, FIRMWARE.CRITICAL_LEVEL_CM + 2.5, 2.6);
    this.scene.add(horn);

    // The gate itself. It hangs from a hinge group, so rotating the
    // group by 0 to 90 degrees swings the gate open, like the servo does.
    this.gateHinge = new THREE.Group();
    this.gateHinge.position.set(TANK.width / 2 + 0.4, FIRMWARE.CRITICAL_LEVEL_CM + 2.5, 0);
    this.scene.add(this.gateHinge);

    this.gateMat = new THREE.MeshStandardMaterial({
      color: 0x93a2b1, roughness: 0.45, metalness: 0.5
    });
    this.gate = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.4, 3.8), this.gateMat);
    this.gate.position.set(0, -1.7, 0); // hangs below the hinge when closed
    this.gate.castShadow = true;
    this.gateHinge.add(this.gate);

    // Linkage rod from the servo horn to the gate, so the mechanism
    // looks driven rather than magic.
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xc0c9d2, metalness: 0.8, roughness: 0.3 })
    );
    rod.rotation.x = Math.PI / 2;
    rod.position.set(TANK.width / 2 + 2.0, FIRMWARE.CRITICAL_LEVEL_CM + 2.5, 1.3);
    this.scene.add(rod);

    // Water pouring through the open gate into the spillway.
    this.spill = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 3.0, 3.0),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(COLORS.water), transparent: true, opacity: 0, depthWrite: false
      })
    );
    this.spill.position.set(TANK.width / 2 + 1.2, FIRMWARE.CRITICAL_LEVEL_CM, 0);
    this.scene.add(this.spill);
  }

  // Relay driven 3V pump, its tube, and the catch cup it empties into.
  buildPump() {
    // Pump body, sitting low inside the tank.
    this.pumpBody = new THREE.Mesh(
      new THREE.CylinderGeometry(1.1, 1.1, 1.8, 20),
      new THREE.MeshStandardMaterial({ color: 0x1d242c, roughness: 0.6, metalness: 0.3 })
    );
    this.pumpBody.position.set(-TANK.width / 2 + 2.0, 1.0, -TANK.depth / 2 + 2.0);
    this.pumpBody.castShadow = true;
    this.scene.add(this.pumpBody);

    // Tube: a curved pipe from the pump over the wall to the cup.
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-TANK.width / 2 + 2.0, 2.0, -TANK.depth / 2 + 2.0),
      new THREE.Vector3(-TANK.width / 2 + 1.0, 12.0, -TANK.depth / 2 + 1.0),
      new THREE.Vector3(-TANK.width / 2 - 3.0, 14.0, -TANK.depth / 2 - 1.0),
      new THREE.Vector3(-TANK.width / 2 - 6.5, 9.0, -TANK.depth / 2 - 1.5),
      new THREE.Vector3(-TANK.width / 2 - 7.0, 5.2, -TANK.depth / 2 - 1.5)
    ]);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, 0.28, 10, false),
      new THREE.MeshStandardMaterial({
        color: 0xd7dde3, roughness: 0.35, transparent: true, opacity: 0.55
      })
    );
    tube.castShadow = true;
    this.scene.add(tube);

    // Catch cup.
    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(2.4, 1.9, 4.5, 28, 1, true),
      new THREE.MeshPhysicalMaterial({
        color: 0xa9d6e8, transparent: true, opacity: 0.2, roughness: 0.1,
        side: THREE.DoubleSide
      })
    );
    cup.position.set(-TANK.width / 2 - 7.0, 2.25, -TANK.depth / 2 - 1.5);
    this.scene.add(cup);

    // The jet of water leaving the tube when the pump is on.
    this.jet = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.16, 3.0, 10),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(COLORS.water), transparent: true, opacity: 0, depthWrite: false
      })
    );
    this.jet.position.set(-TANK.width / 2 - 7.0, 3.6, -TANK.depth / 2 - 1.5);
    this.scene.add(this.jet);
  }

  // Buzzer, green LED, red LED. These follow the firmware exactly.
  buildIndicators() {
    // Buzzer: black cylinder on the tray.
    this.buzzer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 0.9, 20),
      new THREE.MeshStandardMaterial({ color: 0x15191e, roughness: 0.8 })
    );
    this.buzzer.position.set(-10.6, 1.05, 2.2);
    this.buzzer.castShadow = true;
    this.scene.add(this.buzzer);

    // Expanding rings that show the siren sounding.
    this.sirenRings = [0, 1, 2].map((i) => {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.0, 1.15, 32),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(COLORS.critical), transparent: true, opacity: 0,
          side: THREE.DoubleSide, depthWrite: false
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.copy(this.buzzer.position);
      ring.position.y += 0.6;
      ring.userData.phase = i / 3;
      this.scene.add(ring);
      return ring;
    });

    // The two LEDs, each with a small point light so they glow on the tray.
    this.greenLed = this.makeLed(COLORS.ok, -8.4, 2.2);
    this.redLed = this.makeLed(COLORS.critical, -8.4, 3.4);
  }

  makeLed(hex, x, z) {
    const color = new THREE.Color(hex);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 18, 14),
      new THREE.MeshStandardMaterial({
        color, emissive: color, emissiveIntensity: 0, roughness: 0.25
      })
    );
    dome.position.set(x, 0.95, z);
    this.scene.add(dome);

    const light = new THREE.PointLight(color, 0, 9);
    light.position.copy(dome.position);
    light.position.y += 0.4;
    this.scene.add(light);

    return { dome, light };
  }

  // ============================================================
  // Telemetry in, motion out
  // ============================================================

  // Called once per telemetry message. Only fields from the data
  // contract are used here.
  update(reading) {
    this.target.level = reading.level;
    this.target.gate = reading.gate === "OPEN" ? Math.PI / 2 : 0; // 90 or 0 degrees
    this.target.critical = reading.state === "CRITICAL";
    this.target.pump = reading.pump === "ON";
    this.labelText = reading.level.toFixed(2) + " cm  " + reading.pct.toFixed(0) + "%";
    this.labelState = reading.state;
  }

  // Telemetry stopped or resumed. The device keeps working, we just
  // cannot see it, so the twin desaturates instead of freezing.
  setLinkState(connected) {
    this.linkUp = connected;
  }

  render() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;

    // --- ease the water level ---
    this.current.level += (this.target.level - this.current.level) * Math.min(1, dt * 4);
    const level = Math.max(0.001, this.current.level);

    this.water.scale.y = level;
    this.water.position.y = level / 2;
    // A gentle ripple on the surface plane.
    this.surface.position.y = level + 0.02 + Math.sin(t * 2) * 0.015;
    this.surface.visible = level > 0.05;

    // Water turns red as it approaches the critical line.
    const heat = THREE.MathUtils.clamp(
      (level - FIRMWARE.SAFE_RESET_LEVEL_CM) /
      (FIRMWARE.CRITICAL_LEVEL_CM - FIRMWARE.SAFE_RESET_LEVEL_CM), 0, 1
    );
    const waterColor = new THREE.Color(COLORS.water).lerp(new THREE.Color(COLORS.waterHigh), heat);
    this.waterMat.color.copy(waterColor);
    this.surface.material.color.copy(waterColor);

    // --- the ultrasonic beam reaches from the sensor to the surface ---
    const sensorY = this.sensorGroup.position.y - 1.0;
    const distance = Math.max(0.2, sensorY - level);
    this.beam.geometry.dispose();
    this.beam.geometry = new THREE.ConeGeometry(1.5, distance, 20, 1, true);
    this.beam.position.set(0, level + distance / 2, 0);
    this.beamMat.opacity = 0.07 + Math.sin(t * 6) * 0.02; // soft pulse, like pinging
    this.beamLine.scale.y = distance;
    this.beamLine.position.y = level;

    // --- servo gate ---
    this.current.gate += (this.target.gate - this.current.gate) * Math.min(1, dt * 5);
    this.gateHinge.rotation.z = -this.current.gate;
    const openness = this.current.gate / (Math.PI / 2);
    this.gateMat.emissive = new THREE.Color(COLORS.critical);
    this.gateMat.emissiveIntensity = openness * 0.25;

    // Water pours out while the gate is open and there is water to pour.
    const pouring = openness > 0.3 && level > FIRMWARE.SAFE_RESET_LEVEL_CM;
    this.spill.material.opacity += ((pouring ? 0.45 : 0) - this.spill.material.opacity) * dt * 5;
    this.spill.position.y = Math.min(level, FIRMWARE.CRITICAL_LEVEL_CM + 1) - 1.5;

    // --- pump and its jet ---
    const jetTarget = this.target.pump ? 0.6 : 0;
    this.jet.material.opacity += (jetTarget - this.jet.material.opacity) * dt * 6;
    if (this.target.pump) {
      // A little vibration on the pump body sells that it is running.
      this.pumpBody.position.x += Math.sin(t * 40) * 0.006;
      this.jet.scale.y = 1 + Math.sin(t * 18) * 0.08;
    }
    this.relayCan.material.emissive = new THREE.Color(COLORS.ok);
    this.relayCan.material.emissiveIntensity = this.target.pump ? 0.35 : 0;

    // --- LEDs, exactly as the firmware drives them ---
    const critical = this.target.critical;
    const blink = critical ? (Math.sin(t * 9) > 0 ? 1 : 0.25) : 0;
    this.redLed.dome.material.emissiveIntensity = blink * 2.2;
    this.redLed.light.intensity = blink * 7;
    this.greenLed.dome.material.emissiveIntensity = critical ? 0 : 1.6;
    this.greenLed.light.intensity = critical ? 0 : 4;

    // --- buzzer rings ---
    this.sirenRings.forEach((ring) => {
      if (!critical) { ring.material.opacity = 0; return; }
      const phase = (t * 1.6 + ring.userData.phase) % 1;
      const scale = 1 + phase * 4;
      ring.scale.set(scale, scale, scale);
      ring.material.opacity = 0.5 * (1 - phase);
    });

    // --- floating label ---
    if (this.labelText) {
      drawLabel(this.label, this.labelText, this.labelState, this.linkUp);
      // Floats beside the water line, but never so low that it falls off
      // the bottom of the viewport. depthTest is off on this sprite, so
      // the frame and the servo never hide it.
      this.label.position.y = THREE.MathUtils.clamp(this.current.level, 5, 13) + 3.5;
      this.label.quaternion.copy(this.camera.quaternion); // always face the camera
    }

    // --- offline look: drop the lights so it is obvious we lost the feed ---
    const dim = this.linkUp ? 1 : 0.35;
    this.scene.traverse((obj) => {
      if (obj.isDirectionalLight || obj.isHemisphereLight) {
        if (obj.userData.baseIntensity === undefined) obj.userData.baseIntensity = obj.intensity;
        obj.intensity = obj.userData.baseIntensity * dim;
      }
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const w = this.mount.clientWidth || 1;
    const h = this.mount.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

// ============================================================
// Floating text label, drawn on a 2D canvas and used as a texture.
// This avoids loading a font file.
// ============================================================

function makeLabel() {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture, transparent: true, depthWrite: false, depthTest: false
    })
  );
  sprite.scale.set(9, 2.25, 1);
  sprite.renderOrder = 999; // draw last, on top of everything
  sprite.userData = { canvas, texture, last: "" };
  return sprite;
}

function drawLabel(sprite, text, state, linkUp) {
  const key = text + state + linkUp;
  if (sprite.userData.last === key) return; // only redraw when it changed
  sprite.userData.last = key;

  const { canvas, texture } = sprite.userData;
  const ctx = canvas.getContext("2d");
  const accent = state === "CRITICAL" ? COLORS.critical : COLORS.accent;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(10, 16, 23, 0.85)";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  roundRect(ctx, 6, 6, canvas.width - 12, canvas.height - 12, 14);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = linkUp ? "#dbe7f1" : "#6b7d90";
  ctx.font = "600 46px Consolas, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 - 8);

  ctx.fillStyle = accent;
  ctx.font = "600 22px Consolas, monospace";
  ctx.fillText(linkUp ? state : "NO TELEMETRY", canvas.width / 2, canvas.height - 28);

  texture.needsUpdate = true;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
